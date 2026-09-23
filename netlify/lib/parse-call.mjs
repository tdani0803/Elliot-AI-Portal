// Turns whatever arrives at the webhook into one flat `calls` row.
//
// Two payload shapes are accepted:
//   1. Vapi's own server message: { message: { type: "end-of-call-report", call, ... } }
//      The caller details are read from the Send Text tool call in the transcript,
//      falling back to the analysis structured data if you have that configured.
//   2. A flat JSON object (e.g. forwarded from Make/Zapier or the Send Text step):
//      { call_id, assistant_id, name, callback_number, address, issue, details,
//        urgency, job_value, duration_seconds, started_at }

const FIELD_ALIASES = {
  caller_name: ['name', 'caller_name', 'callerName', 'customer_name', 'customerName'],
  callback_number: ['callback_number', 'callbackNumber', 'phone', 'phone_number', 'phoneNumber'],
  address: ['address', 'job_address', 'jobAddress'],
  issue: ['issue', 'problem', 'reason'],
  details: ['details', 'notes', 'description'],
  urgency: ['urgency', 'urgency_level', 'urgencyLevel'],
  job_value: ['job_value', 'jobValue'],
  job_type: ['job_type', 'jobType', 'service', 'category', 'job'],
};

export function normaliseUrgency(value) {
  if (value == null) return null;
  const key = String(value).toLowerCase().replace(/[^a-z]/g, '');
  if (key === 'urgent') return 'urgent';
  if (key === 'somewhaturgent') return 'somewhat_urgent';
  if (key === 'nonurgent' || key === 'noturgent') return 'non_urgent';
  if (key === 'irrelevant') return 'irrelevant';
  return null;
}

function clean(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === '' ? null : text;
}

// Caller details from a Send Text tool call's arguments -> call row fields (urgency normalised).
export function leadFieldsFromArgs(args) {
  const row = pickFields(args);
  if ('urgency' in row) {
    row.urgency = normaliseUrgency(row.urgency);
    if (row.urgency == null) delete row.urgency;
  }
  return row;
}

function pickFields(source) {
  const out = {};
  if (!source || typeof source !== 'object') return out;
  for (const [column, aliases] of Object.entries(FIELD_ALIASES)) {
    const alias = aliases.find((a) => clean(source[a]) != null);
    if (alias) out[column] = clean(source[alias]);
  }
  return out;
}

function parseArgs(args) {
  if (typeof args !== 'string') return args;
  try {
    return JSON.parse(args);
  } catch {
    return null;
  }
}

// Finds the arguments of the Send Text tool call in a Vapi transcript. Prefers a tool
// whose name looks like send-text / sms; otherwise takes any tool call carrying an urgency.
export function findSendTextArgs(messages) {
  if (!Array.isArray(messages)) return null;
  const calls = messages.flatMap((m) => m?.toolCalls ?? m?.tool_calls ?? []);
  const candidates = calls
    .map((c) => ({ name: c?.function?.name ?? '', args: parseArgs(c?.function?.arguments) }))
    .filter((c) => c.args && typeof c.args === 'object');
  const named = candidates.filter((c) => /send.?text|sms/i.test(c.name));
  const pool = named.length ? named : candidates.filter((c) => 'urgency' in c.args);
  return pool.length ? pool[pool.length - 1].args : null;
}

function toSeconds(value) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

function toIso(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function fromEndOfCallReport(msg) {
  const call = msg.call ?? {};
  const toolArgs = findSendTextArgs(msg.artifact?.messages ?? msg.messages);
  const fields = { ...pickFields(msg.analysis?.structuredData), ...pickFields(toolArgs) };

  const startedAt = msg.startedAt ?? call.startedAt ?? call.createdAt;
  const endedAt = msg.endedAt ?? call.endedAt;
  let duration = toSeconds(msg.durationSeconds);
  if (duration == null && startedAt && endedAt) {
    duration = toSeconds((new Date(endedAt) - new Date(startedAt)) / 1000);
  }

  const artifact = msg.artifact ?? {};
  const recording = artifact.recording ?? {};

  return {
    vapiCallId: clean(call.id),
    assistantId: clean(call.assistantId ?? msg.assistant?.id),
    row: {
      ...fields,
      callback_number: fields.callback_number ?? clean(call.customer?.number),
      call_started_at: toIso(startedAt),
      duration_seconds: duration,
      ended_reason: clean(msg.endedReason),
      recording_url: clean(
        artifact.recordingUrl ?? recording.mono?.combinedUrl ?? recording.url ?? msg.recordingUrl ?? msg.stereoRecordingUrl,
      ),
      transcript: clean(artifact.transcript ?? msg.transcript),
      summary: clean(msg.analysis?.summary ?? msg.summary),
    },
  };
}

function fromFlat(body) {
  const fields = pickFields(body);
  return {
    vapiCallId: clean(body.call_id ?? body.callId),
    assistantId: clean(body.assistant_id ?? body.assistantId),
    row: {
      ...fields,
      call_started_at: toIso(body.started_at ?? body.startedAt),
      duration_seconds: toSeconds(body.duration_seconds ?? body.durationSeconds),
      recording_url: clean(body.recording_url ?? body.recordingUrl),
      transcript: clean(body.transcript),
      summary: clean(body.summary),
    },
  };
}

// Vapi "tool-calls" message -> { assistantId, vapiCallId, calls: [{ id, name, args }] }
export function parseToolCalls(msg) {
  const list = msg.toolCallList ?? msg.toolCalls ?? msg.toolWithToolCallList?.map((t) => t.toolCall) ?? [];
  return {
    assistantId: clean(msg.call?.assistantId ?? msg.assistant?.id),
    vapiCallId: clean(msg.call?.id),
    customerNumber: clean(msg.call?.customer?.number),
    calls: list
      .map((c) => ({ id: c?.id, name: c?.function?.name ?? c?.name ?? '', args: parseArgs(c?.function?.arguments ?? c?.arguments) ?? {} }))
      .filter((c) => c.id),
  };
}

// Returns { toolCalls } for Vapi tool calls, { ignored } for Vapi message types we don't store, { error } for unusable
// payloads, or { vapiCallId, assistantId, row } where row holds only known values
// (so an upsert never blanks out data another message already filled in).
export function parseWebhook(body) {
  if (!body || typeof body !== 'object') return { error: 'Body must be a JSON object' };

  let parsed;
  if (body.message && typeof body.message === 'object' && body.message.type) {
    if (body.message.type === 'tool-calls') return { toolCalls: parseToolCalls(body.message) };
    if (body.message.type !== 'end-of-call-report') return { ignored: body.message.type };
    parsed = fromEndOfCallReport(body.message);
  } else {
    parsed = fromFlat(body);
  }

  if (!parsed.vapiCallId) return { error: 'Missing call id' };
  if (!parsed.assistantId) return { error: 'Missing assistant id' };

  const row = {};
  for (const [key, value] of Object.entries(parsed.row)) {
    if (value != null) row[key] = value;
  }
  if ('urgency' in row) {
    row.urgency = normaliseUrgency(row.urgency);
    if (row.urgency == null) delete row.urgency;
  }
  return { vapiCallId: parsed.vapiCallId, assistantId: parsed.assistantId, row };
}
