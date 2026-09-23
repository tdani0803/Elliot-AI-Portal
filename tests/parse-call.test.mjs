import assert from 'node:assert/strict';
import { test } from 'node:test';
import { findSendTextArgs, normaliseUrgency, parseWebhook } from '../netlify/lib/parse-call.mjs';

test('normaliseUrgency maps the prompt labels and rejects anything else', () => {
  assert.equal(normaliseUrgency('Urgent'), 'urgent');
  assert.equal(normaliseUrgency('Somewhat Urgent'), 'somewhat_urgent');
  assert.equal(normaliseUrgency('Non-Urgent'), 'non_urgent');
  assert.equal(normaliseUrgency('non urgent'), 'non_urgent');
  assert.equal(normaliseUrgency('Irrelevant'), 'irrelevant');
  assert.equal(normaliseUrgency('very'), null);
  assert.equal(normaliseUrgency(undefined), null);
});

const endOfCall = {
  message: {
    type: 'end-of-call-report',
    endedReason: 'customer-ended-call',
    startedAt: '2026-09-22T01:00:00.000Z',
    endedAt: '2026-09-22T01:03:30.000Z',
    call: { id: 'call_123', assistantId: 'asst_abc', customer: { number: '+61412345678' } },
    artifact: {
      messages: [
        { role: 'user', message: 'My roof is leaking' },
        {
          role: 'tool_calls',
          toolCalls: [
            {
              function: {
                name: 'Send_Text',
                arguments: JSON.stringify({
                  name: 'Sarah',
                  callback_number: '0412 345 678',
                  address: '14 Banksia St',
                  issue: 'Roof leak',
                  details: 'Over the kitchen',
                  urgency: 'Somewhat Urgent',
                  job_value: '$2,000',
                }),
              },
            },
          ],
        },
      ],
    },
  },
};

test('end-of-call report: pulls details from the Send Text tool call', () => {
  const parsed = parseWebhook(endOfCall);
  assert.equal(parsed.vapiCallId, 'call_123');
  assert.equal(parsed.assistantId, 'asst_abc');
  assert.deepEqual(parsed.row, {
    caller_name: 'Sarah',
    callback_number: '0412 345 678',
    address: '14 Banksia St',
    issue: 'Roof leak',
    details: 'Over the kitchen',
    urgency: 'somewhat_urgent',
    job_value: '$2,000',
    call_started_at: '2026-09-22T01:00:00.000Z',
    duration_seconds: 210,
    ended_reason: 'customer-ended-call',
  });
});

test('end-of-call report without tool call falls back to structured data and caller ID', () => {
  const body = structuredClone(endOfCall);
  delete body.message.artifact;
  body.message.durationSeconds = 95.4;
  body.message.analysis = { structuredData: { name: 'Dave', urgency: 'Urgent' } };
  const { row } = parseWebhook(body);
  assert.equal(row.caller_name, 'Dave');
  assert.equal(row.urgency, 'urgent');
  assert.equal(row.callback_number, '+61412345678');
  assert.equal(row.duration_seconds, 95);
});

test('end-of-call report with no details still records the call (not a lead)', () => {
  const body = structuredClone(endOfCall);
  delete body.message.artifact;
  const { row } = parseWebhook(body);
  assert.equal(row.urgency, undefined);
  assert.equal(row.duration_seconds, 210);
});

test('other Vapi message types are ignored', () => {
  assert.deepEqual(parseWebhook({ message: { type: 'status-update' } }), { ignored: 'status-update' });
});

test('flat payload is accepted and empty values are dropped', () => {
  const parsed = parseWebhook({
    call_id: 'call_9',
    assistant_id: 'asst_abc',
    name: 'Priya',
    address: '   ',
    urgency: 'Non-Urgent',
    duration_seconds: '120',
  });
  assert.deepEqual(parsed, {
    vapiCallId: 'call_9',
    assistantId: 'asst_abc',
    row: { caller_name: 'Priya', urgency: 'non_urgent', duration_seconds: 120 },
  });
});

test('unknown urgency is dropped rather than stored', () => {
  const { row } = parseWebhook({ call_id: 'c', assistant_id: 'a', urgency: 'meh' });
  assert.equal('urgency' in row, false);
});

test('rejects payloads missing ids', () => {
  assert.deepEqual(parseWebhook({ assistant_id: 'a' }), { error: 'Missing call id' });
  assert.deepEqual(parseWebhook({ call_id: 'c' }), { error: 'Missing assistant id' });
  assert.deepEqual(parseWebhook(null), { error: 'Body must be a JSON object' });
});

test('findSendTextArgs prefers the send-text tool over other tools', () => {
  const args = findSendTextArgs([
    { toolCalls: [{ function: { name: 'lookup', arguments: { urgency: 'Urgent', name: 'wrong' } } }] },
    { toolCalls: [{ function: { name: 'sendText', arguments: { urgency: 'Urgent', name: 'right' } } }] },
  ]);
  assert.equal(args.name, 'right');
});
