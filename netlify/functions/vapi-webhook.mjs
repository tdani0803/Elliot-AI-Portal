// Receives Vapi's end-of-call report (or a flat forwarded payload) and writes the call
// into Supabase, tagged to the client whose assistant took the call.
//
// Point Vapi's Server URL at:  https://<your-site>/api/vapi-webhook
// and set the server secret to the same value as VAPI_WEBHOOK_SECRET.

import { createHash, timingSafeEqual } from 'node:crypto';
import { parseWebhook } from '../lib/parse-call.mjs';

const json = (status, body) => Response.json(body, { status });

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
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
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
  if (parsed.ignored) return json(200, { ok: true, ignored: parsed.ignored });
  if (parsed.error) return json(400, { error: parsed.error });

  try {
    const lookup = await supabase(
      `clients?select=id&vapi_assistant_id=eq.${encodeURIComponent(parsed.assistantId)}`,
    );
    const [client] = await lookup.json();
    if (!client) {
      console.warn(`vapi-webhook: no client for assistant ${parsed.assistantId}`);
      // 200 so Vapi doesn't retry forever; the call simply isn't attributed to anyone.
      return json(200, { ok: false, error: 'Unknown assistant' });
    }

    // Upsert on the Vapi call id: the Send Text data and the end-of-call report can
    // arrive separately and merge into one row. Only known values are sent, so a later
    // message never wipes out an earlier one.
    await supabase('calls?on_conflict=vapi_call_id', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({ ...parsed.row, client_id: client.id, vapi_call_id: parsed.vapiCallId }),
    });
    return json(200, { ok: true });
  } catch (err) {
    console.error('vapi-webhook:', err);
    return json(502, { error: 'Could not save call' });
  }
};

export const config = { path: '/api/vapi-webhook' };
