// Receives Vapi server messages:
//   * end-of-call-report  -> saves the call (tagged to the client whose assistant took it)
//   * tool-calls          -> check_availability / book_job / Send Text (save_lead)
// and sends the new-lead alert (phone notification, text as backup) once per lead.
//
// Point Vapi's Server URL at:  https://<your-site>/api/vapi-webhook
// and set the server secret to the same value as VAPI_WEBHOOK_SECRET.

import { createHash, timingSafeEqual } from 'node:crypto';
import { leadFieldsFromArgs, parseWebhook } from '../lib/parse-call.mjs';
import { checkAvailability, dayWindow, planBooking, readStartTime, toolDate, toolName } from '../lib/tools.mjs';
import { alertIfNewLead, pushToClient } from '../lib/alerts.mjs';
import { announceBooking, textCaller } from '../lib/followups.mjs';
import { rest, restJson } from '../lib/rest.mjs';
import { DEFAULT_TZ, formatDayInZone, formatTimeInZone } from '../../src/lib/time.js';

const json = (status, body) => Response.json(body, { status });
const PRO_COLUMNS = ['recording_url', 'transcript', 'summary', 'job_type'];

function sameSecret(given, expected) {
  // Hash both so the comparison is constant-time regardless of length.
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function isAuthorised(req, expected) {
  const header = req.headers.get('x-vapi-secret') ?? '';
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  // Some Vapi screens have no secret box, so the secret can also ride on the URL: ?secret=…
  const query = new URL(req.url).searchParams.get('secret') ?? '';
  return [header, bearer, query].some((given) => given && sameSecret(given, expected));
}

async function findClient(assistantId, columns = 'id') {
  if (!assistantId) return null;
  const [client] = await restJson(`clients?select=${columns}&vapi_assistant_id=eq.${encodeURIComponent(assistantId)}`);
  return client ?? null;
}

// Upsert on the Vapi call id: the Send Text data and the end-of-call report arrive
// separately and merge into one row. Only known values are sent, so a later message
// never wipes out an earlier one.
async function saveCall(clientId, vapiCallId, row) {
  const save = (fields) =>
    rest('calls?on_conflict=vapi_call_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ ...fields, client_id: clientId, vapi_call_id: vapiCallId }),
    });
  try {
    await save(row);
  } catch (err) {
    // Database not upgraded yet (pro_features migration not run): save the basics.
    if (!/column/i.test(err.message)) throw err;
    console.warn('vapi-webhook: newer columns missing, saving basic call details only');
    await save(Object.fromEntries(Object.entries(row).filter(([key]) => !PRO_COLUMNS.includes(key))));
  }
}

// The caller's thank-you text. Like alerts, it must never break saving a call.
async function textCallerSafely(vapiCallId) {
  try {
    console.log('vapi-webhook: caller text', JSON.stringify(await textCaller(vapiCallId)));
  } catch (err) {
    console.error('vapi-webhook: caller text failed', err?.message ?? err);
  }
}

// Alerts must never break saving a call — log and move on.
async function alertSafely(vapiCallId) {
  try {
    const result = await alertIfNewLead(vapiCallId);
    // e.g. {"phones":1,"delivered":1,"texted":false} or {"skipped":"..."} — check this line when a buzz doesn't arrive.
    console.log('vapi-webhook: lead alert', JSON.stringify(result));
  } catch (err) {
    console.error('vapi-webhook: lead alert failed', err);
  }
}

async function bookingsAround(client, args) {
  const tz = client.timezone ?? DEFAULT_TZ;
  const date = toolDate(args, tz);
  if (!date) return [];
  const { from, to } = dayWindow(date, tz);
  return restJson(
    `bookings?select=starts_at,duration_minutes,status&client_id=eq.${client.id}&status=eq.booked` +
      `&starts_at=gte.${encodeURIComponent(from.toISOString())}&starts_at=lt.${encodeURIComponent(to.toISOString())}`,
  );
}

// If a booking can't be saved, write the time the caller wanted on their call, so the tradie
// still sees it in the portal and can book it by hand.
async function rememberWantedTime(client, vapiCallId, args) {
  try {
    const tz = client.timezone ?? DEFAULT_TZ;
    const start = readStartTime(args, tz);
    const when = start ? `${formatDayInZone(start, tz)} at ${formatTimeInZone(start, tz)}` : String(args.start_time ?? args.date ?? 'a time');
    await saveCall(client.id, vapiCallId, { notes: `Wanted a booking: ${when}. Elliot couldn't save it, so please book it in.` });
  } catch (err) {
    console.error('vapi-webhook: could not note the wanted time', err?.message ?? err);
  }
}

// Tools Elliot uses during a live call. Vapi expects { results: [{ toolCallId, result }] }.
async function handleToolCalls({ assistantId, vapiCallId, customerNumber, calls }) {
  const results = [];
  let client = null;
  try {
    client = await findClient(assistantId, 'id,timezone,business_hours');
  } catch (err) {
    // Before the pro_features migration there's no timezone/business_hours: fall back to id only.
    client = await findClient(assistantId).catch(() => null);
    if (!client) console.error('vapi-webhook tools: client lookup failed', err);
  }
  // Check this line when a booking fails: it shows which tools Vapi called and whether we knew the business.
  console.log(
    'vapi-webhook: tools',
    JSON.stringify({ tools: calls.map((c) => c.name), assistantId: assistantId ?? null, clientFound: Boolean(client) }),
  );
  for (const call of calls) {
    const name = toolName(call.name);
    let result;
    try {
      if (!name) {
        console.warn(`vapi-webhook: tool "${call.name}" isn't handled here`);
        result = 'Noted.';
      } else if (!client) {
        result = "Sorry, I can't reach the system right now. I'll pass your details on and someone will call you back.";
      } else if (name === 'save_lead') {
        const fields = leadFieldsFromArgs(call.args);
        if (!fields.callback_number && customerNumber) fields.callback_number = customerNumber;
        if (vapiCallId) {
          await saveCall(client.id, vapiCallId, fields);
          await alertSafely(vapiCallId);
        }
        result = 'Details sent.';
      } else if (name === 'check_availability') {
        const bookings = await bookingsAround(client, call.args);
        result = checkAvailability({ args: call.args, client, bookings });
        console.log('vapi-webhook: check_availability', JSON.stringify({ date: call.args.date ?? null, reply: result }));
      } else if (name === 'book_job') {
        const bookings = await bookingsAround(client, call.args);
        const plan = planBooking({ args: call.args, client, bookings, vapiCallId, customerNumber });
        console.log(
          'vapi-webhook: book_job',
          JSON.stringify({ start_time: call.args.start_time ?? null, date: call.args.date ?? null, time: call.args.time ?? null, reply: plan.reply }),
        );
        if (plan.booking) {
          await rest('bookings', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: JSON.stringify(plan.booking) });
          await announceBooking(plan.booking, client, pushToClient);
        }
        result = plan.reply;
      }
    } catch (err) {
      console.error(`vapi-webhook: ${name ?? call.name} failed:`, err?.message ?? err);
      if (name === 'book_job' && client && vapiCallId) await rememberWantedTime(client, vapiCallId, call.args);
      result =
        name === 'save_lead'
          ? 'Details sent.'
          : "Sorry, the booking system had a problem. I'll pass your details on and someone will call you back to book.";
    }
    results.push({ toolCallId: call.id, result });
  }
  return json(200, { results });
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const secret = process.env.VAPI_WEBHOOK_SECRET;
  if (!secret || !process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('vapi-webhook: missing server environment variables');
    return json(500, { error: 'Server not configured' });
  }
  if (!isAuthorised(req, secret)) return json(401, { error: 'Unauthorised' });

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON' });
  }

  const parsed = parseWebhook(body);
  if (parsed.toolCalls) return handleToolCalls(parsed.toolCalls);
  if (parsed.ignored) return json(200, { ok: true, ignored: parsed.ignored });
  if (parsed.error) return json(400, { error: parsed.error });

  try {
    const client = await findClient(parsed.assistantId);
    if (!client) {
      console.warn(`vapi-webhook: no client for assistant ${parsed.assistantId}`);
      // 200 so Vapi doesn't retry forever; the call simply isn't attributed to anyone.
      return json(200, { ok: false, error: 'Unknown assistant' });
    }
    await saveCall(client.id, parsed.vapiCallId, parsed.row);
    await alertSafely(parsed.vapiCallId);
    await textCallerSafely(parsed.vapiCallId);
    return json(200, { ok: true });
  } catch (err) {
    console.error('vapi-webhook:', err);
    return json(502, { error: 'Could not save call' });
  }
};

export const config = { path: '/api/vapi-webhook' };
