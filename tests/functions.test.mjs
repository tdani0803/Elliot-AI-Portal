import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import calendar from '../netlify/functions/calendar.mjs';
import pushTest from '../netlify/functions/push-test.mjs';

process.env.SUPABASE_URL = 'https://abc.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

function fake(routes) {
  globalThis.fetch = async (url) => {
    const key = Object.keys(routes).find((k) => String(url).includes(k));
    const [status, body] = key ? routes[key](String(url)) : [404, {}];
    return new Response(JSON.stringify(body), { status });
  };
}

const TOKEN = '3f2c1d9e-0b8a-4c7d-9e6f-5a4b3c2d1e0f';

test('calendar feed: valid token returns the business jobs as .ics', async () => {
  fake({
    [`clients?select=id,business_name&calendar_token=eq.${TOKEN}`]: () => [200, [{ id: 'k1', business_name: 'Acme' }]],
    'bookings?': (u) => [200, u.includes('client_id=eq.k1') ? [{ id: 'b1', job: 'Gutters', starts_at: '2030-01-07T00:00:00Z', status: 'booked' }] : []],
  });
  const res = await calendar(new Request(`https://site/api/calendar/${TOKEN}.ics`), { params: { file: `${TOKEN}.ics` } });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/calendar/);
  assert.match(await res.text(), /SUMMARY:Gutters/);
});

test('calendar feed: junk or unknown tokens get 404 without a database lookup for junk', async () => {
  let called = false;
  globalThis.fetch = async () => ((called = true), new Response('[]', { status: 200 }));
  assert.equal((await calendar(new Request('https://site/x'), { params: { file: 'not-a-token.ics' } })).status, 404);
  assert.equal(called, false);
  assert.equal((await calendar(new Request('https://site/x'), { params: { file: `${TOKEN}.ics` } })).status, 404);
});

test('push-test refuses people who are not logged in', async () => {
  fake({ '/auth/v1/user': () => [401, { message: 'bad jwt' }] });
  const res = await pushTest(new Request('https://site/api/push-test', { method: 'POST', headers: { Authorization: 'Bearer nope' } }));
  assert.equal(res.status, 401);
});

test('new sb_secret keys are sent as apikey only; legacy JWT keys also as Bearer', async () => {
  const { serviceHeaders } = await import('../netlify/lib/rest.mjs');
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_abc';
  assert.deepEqual(serviceHeaders(), { apikey: 'sb_secret_abc' });
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'eyJhbGciOi.legacy.jwt';
  assert.deepEqual(serviceHeaders(), { apikey: 'eyJhbGciOi.legacy.jwt', Authorization: 'Bearer eyJhbGciOi.legacy.jwt' });
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
});

test('webhook accepts the secret on the URL (for Vapi screens without a secret box)', async () => {
  const { default: webhook } = await import('../netlify/functions/vapi-webhook.mjs');
  process.env.VAPI_WEBHOOK_SECRET = 'url-secret';
  const body = JSON.stringify({ message: { type: 'status-update' } });
  const ok = await webhook(new Request('https://site/api/vapi-webhook?secret=url-secret', { method: 'POST', body }));
  const bad = await webhook(new Request('https://site/api/vapi-webhook?secret=nope', { method: 'POST', body }));
  assert.equal(ok.status, 200);
  assert.equal(bad.status, 401);
});

test('push-config explains why notifications are not ready', async () => {
  const { default: pushConfig } = await import('../netlify/functions/push-config.mjs');
  globalThis.fetch = async () => new Response(JSON.stringify({ message: 'relation "public.app_secrets" does not exist' }), { status: 404 });
  const res = await pushConfig(new Request('https://site/api/push-config'));
  assert.equal(res.status, 503);
  assert.match((await res.json()).reason, /20260925000000_alerts\.sql/);
});

test('end-of-call Structured Data becomes a lead (no Send Text tool needed)', async () => {
  const { parseWebhook } = await import('../netlify/lib/parse-call.mjs');
  const { row } = parseWebhook({
    message: {
      type: 'end-of-call-report',
      call: { id: 'c1', assistantId: 'a1', customer: { number: '+61400000000' } },
      analysis: {
        summary: 'Leaking roof',
        structuredData: { name: 'Sam', address: '1 A St, Ryde', issue: 'Roof leak', urgency: 'Somewhat Urgent', job_type: 'Roof leak' },
      },
    },
  });
  assert.equal(row.caller_name, 'Sam');
  assert.equal(row.urgency, 'somewhat_urgent');
  assert.equal(row.callback_number, '+61400000000'); // falls back to caller ID
});

test('newer Vapi "Structured Outputs" are read too', async () => {
  const { parseWebhook } = await import('../netlify/lib/parse-call.mjs');
  const { row } = parseWebhook({
    message: {
      type: 'end-of-call-report',
      call: { id: 'c2', assistantId: 'a1' },
      artifact: { structuredOutputs: { 'so-1': { name: 'Lead details', result: { name: 'Jo', urgency: 'Urgent', issue: 'Burst pipe' } } } },
    },
  });
  assert.equal(row.caller_name, 'Jo');
  assert.equal(row.urgency, 'urgent');
});

test('service key is tidied and fingerprinted without revealing it', async () => {
  const { serviceKey, keyFingerprint } = await import('../netlify/lib/rest.mjs');
  process.env.SUPABASE_SERVICE_ROLE_KEY = ' "sb_secret_abcdefghijklmnop" \n';
  assert.equal(serviceKey(), 'sb_secret_abcdefghijklmnop');
  assert.equal(keyFingerprint(), 'the key in Netlify is a secret key, starts "sb_secret_abc…" and is 26 characters long');
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'SUPABASE_SERVICE_ROLE_KEY=sb_publishable_xyz';
  assert.match(keyFingerprint(), /PUBLISHABLE key/);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
});

test('rest retries with the other header style after a 401', async () => {
  const { rest } = await import('../netlify/lib/rest.mjs');
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_abc';
  const seen = [];
  globalThis.fetch = async (url, init) => {
    seen.push(Boolean(init.headers.Authorization));
    return new Response('[]', { status: seen.length === 1 ? 401 : 200 });
  };
  await rest('clients?select=id');
  assert.deepEqual(seen, [false, true]);
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
});
