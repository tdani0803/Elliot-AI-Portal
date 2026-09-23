// Receives Vapi's end-of-call report (or a flat forwarded payload) and writes the call
// into Supabase, tagged to the client whose assistant took the call.
//
// Point Vapi's Server URL at:  https://<your-site>/api/vapi-webhook
// and set the server secret to the same value as VAPI_WEBHOOK_SECRET.

import { createHash, timingSafeEqual } from 'node:crypto';
import { parseWebhook } from '../lib/parse-call.mjs';
import { checkAvailability, dayWindow, planBooking, toolName } from '../lib/tools.mjs';
import { DEFAULT_TZ, parseDateOnly, parseLocalDateTime, zonedParts } from '../../src/lib/time.js';
import { normaliseSupabaseUrl } from '../../src/lib/supabase-url.js';

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
  return [header, bearer].some((given) => given && sameSecret(given, expected));
}

async function supabase(path, init = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  const res = await fetch(`${normaliseSupabaseUrl(process.env.SUPABASE_URL)}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res;
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

    // Upsert on the Vapi call id: the Send Text data and the end-of-call report can
    // arrive separately and merge into one row. Only known values are sent, so a later
    // message never wipes out an earlier one.
    const save = (row) =>
      supabase('calls?on_conflict=vapi_call_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ ...row, client_id: client.id, vapi_call_id: parsed.vapiCallId }),
      });
    try {
      await save(parsed.row);
    } catch (err) {
      // Database not upgraded yet (pro_features migration not run): save the basics.
      if (!/column/i.test(err.message)) throw err;
      console.warn('vapi-webhook: newer columns missing, saving basic call details only');
      const basic = Object.fromEntries(Object.entries(parsed.row).filter(([key]) => !PRO_COLUMNS.includes(key)));
      await save(basic);
    }
    return json(200, { ok: true });
  } catch (err) {
    console.error('vapi-webhook:', err);
    return json(502, { error: 'Could not save call' });
  }
};

async function findClient(assistantId, columns = 'id') {
  if (!assistantId) return null;
  const res = await supabase(`clients?select=${columns}&vapi_assistant_id=eq.${encodeURIComponent(assistantId)}`);
  const [client] = await res.json();
  return client ?? null;
}

async function bookingsAround(client, dateLike) {
  const tz = client.timezone ?? DEFAULT_TZ;
  const date = parseDateOnly(dateLike) ?? (() => {
    const start = parseLocalDateTime(dateLike, tz);
    if (!start) return null;
    const p = zonedParts(start, tz);
    return { year: p.year, month: p.month, day: p.day };
  })();
  if (!date) return [];
  const { from, to } = dayWindow(date, tz);
  const res = await supabase(
    `bookings?select=starts_at,duration_minutes,status&client_id=eq.${client.id}&status=eq.booked` +
      `&starts_at=gte.${encodeURIComponent(from.toISOString())}&starts_at=lt.${encodeURIComponent(to.toISOString())}`,
  );
  return res.json();
}

// Elliot asking "when are you free?" / "book this in" during a live call.
// Vapi expects { results: [{ toolCallId, result }] } and reads `result` out loud.
async function handleToolCalls({ assistantId, vapiCallId, customerNumber, calls }) {
  const results = [];
  let client = null;
  try {
    client = await findClient(assistantId, 'id,timezone,business_hours');
  } catch (err) {
    console.error('vapi-webhook tools: client lookup failed', err);
  }
  for (const call of calls) {
    const name = toolName(call.name);
    let result;
    try {
      if (!name) {
        console.warn(`vapi-webhook: tool "${call.name}" isn't handled here`);
        result = 'Noted.';
      } else if (!client) {
        result = "Sorry, I can't reach the booking system right now. I'll pass your details on and someone will call you back to book.";
      } else if (name === 'check_availability') {
        const bookings = await bookingsAround(client, call.args.date ?? call.args.day ?? call.args.start_time);
        result = checkAvailability({ args: call.args, client, bookings });
      } else if (name === 'book_job') {
        const bookings = await bookingsAround(client, call.args.start_time ?? call.args.startTime ?? call.args.time);
        const plan = planBooking({ args: call.args, client, bookings, vapiCallId, customerNumber });
        if (plan.booking) {
          await supabase('bookings', {
            method: 'POST',
            headers: { Prefer: 'return=minimal' },
            body: JSON.stringify(plan.booking),
          });
        }
        result = plan.reply;
      }
    } catch (err) {
      console.error(`vapi-webhook tool ${call.name}:`, err);
      result = "Sorry, the booking system had a problem. I'll pass your details on and someone will call you back to book.";
    }
    results.push({ toolCallId: call.id, result });
  }
  return json(200, { results });
}

export const config = { path: '/api/vapi-webhook' };
