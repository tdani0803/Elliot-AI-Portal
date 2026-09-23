import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { alertIfNewLead, buildNotification, buildSms, pushToClient, toE164 } from '../netlify/lib/alerts.mjs';
import { buildIcs, fold } from '../netlify/lib/ics.mjs';
import { dueAt, promiseMinutes, promisePhrase } from '../src/lib/promise.js';

process.env.SUPABASE_URL = 'https://abc.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.URL = 'https://portal.example.com';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.TWILIO_ACCOUNT_SID;
  delete process.env.TWILIO_AUTH_TOKEN;
  delete process.env.TWILIO_FROM_NUMBER;
});

function fake(routes) {
  const log = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    log.push({ url: u, method: init.method ?? 'GET', body: init.body });
    const key = Object.keys(routes).find((k) => u.includes(k));
    const [status, body] = key ? routes[key](u, init) : [404, {}];
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return log;
}

const client = { business_name: 'Acme Roofing', callback_urgent_minutes: 60, callback_standard_minutes: 240, alert_phone: '0412 345 678', sms_backup: true };
const call = { id: 'call-1', client_id: 'k1', caller_name: 'Sarah Mitchell', issue: 'Roof leak over kitchen', address: '14 Banksia St, Newtown NSW 2042', urgency: 'urgent', callback_number: '0400 111 222', call_started_at: '2026-09-25T00:00:00Z' };

test('promise phrases read naturally and drive due times', () => {
  assert.equal(promisePhrase(30), 'within 30 minutes');
  assert.equal(promisePhrase(60), 'within 1 hour');
  assert.equal(promisePhrase(90), 'within 90 minutes');
  assert.equal(promisePhrase(240), 'within 4 hours');
  assert.equal(promiseMinutes('urgent', {}), 60);
  assert.equal(promiseMinutes('non_urgent', { callback_standard_minutes: 120 }), 120);
  assert.equal(dueAt(call, client).toISOString(), '2026-09-25T01:00:00.000Z');
});

test('notification: urgency first, suburb not full address, the promise, no emojis', () => {
  const n = buildNotification(call, client);
  assert.equal(n.title, 'URGENT – New lead: Sarah Mitchell');
  assert.equal(n.body, "Elliot just answered a call. Roof leak over kitchen, Newtown. We told them you'd call back within 1 hour.");
  assert.equal(n.url, '/dashboard.html#leads/call-1');
  assert.ok(!/Banksia/.test(n.body));
  assert.equal(buildNotification({ ...call, urgency: 'non_urgent', caller_name: null, address: null }, client).title, 'New lead (not urgent): Unknown caller');
  assert.match(buildNotification({ ...call, urgency: 'non_urgent' }, client).body, /within 4 hours\.$/);
});

test('backup text includes the number to call and a link to the lead', () => {
  const sms = buildSms(call, client);
  assert.match(sms, /^URGENT – New lead: Sarah Mitchell\. Roof leak over kitchen, Newtown\./);
  assert.match(sms, /Call them: 0400 111 222\./);
  assert.match(sms, /Open: https:\/\/portal\.example\.com\/dashboard\.html#leads\/call-1$/);
});

test('toE164 handles Australian mobile formats', () => {
  assert.equal(toE164('0412 345 678'), '+61412345678');
  assert.equal(toE164('+61 412 345 678'), '+61412345678');
  assert.equal(toE164('61412345678'), '+61412345678');
  assert.equal(toE164(''), null);
});

test('pushToClient sends to every phone and forgets dead ones', async () => {
  const log = fake({
    push_subscriptions: (u, init) => (init.method === 'DELETE' ? [204, ''] : [200, [{ id: 's1', endpoint: 'a' }, { id: 's2', endpoint: 'b' }]]),
  });
  const sent = [];
  const send = async (sub) => {
    if (sub.id === 's2') throw Object.assign(new Error('gone'), { statusCode: 410 });
    sent.push(sub.id);
  };
  const result = await pushToClient('k1', { title: 't' }, { send });
  assert.deepEqual(result, { phones: 2, delivered: 1 });
  assert.deepEqual(sent, ['s1']);
  assert.ok(log.some((l) => l.method === 'DELETE' && l.url.includes('id=eq.s2')));
});

test('alertIfNewLead: claims once, pushes, and texts only when no phone got it', async () => {
  process.env.TWILIO_ACCOUNT_SID = 'AC1';
  process.env.TWILIO_AUTH_TOKEN = 'tok';
  process.env.TWILIO_FROM_NUMBER = '+61400000000';
  const log = fake({
    'calls?vapi_call_id': () => [200, [call]],
    'clients?id=eq.k1': () => [200, [client]],
    push_subscriptions: () => [200, []], // nobody has notifications on
    'calls?id=eq.call-1&sms_sent_at=is.null': () => [200, [{ id: 'call-1' }]],
    'api.twilio.com': () => [201, {}],
  });
  const result = await alertIfNewLead('vapi-1');
  assert.deepEqual(result, { phones: 0, delivered: 0, texted: true });
  const twilio = log.find((l) => l.url.includes('api.twilio.com'));
  const params = new URLSearchParams(String(twilio.body));
  assert.equal(params.get('To'), '+61412345678');
  assert.match(params.get('Body'), /^URGENT – New lead: Sarah Mitchell/);
  const claim = log.find((l) => l.url.includes('calls?vapi_call_id'));
  assert.match(decodeURIComponent(claim.url), /notified_at=is\.null&or=\(urgency\.in\.\(urgent,somewhat_urgent,non_urgent\),and\(urgency\.is\.null,duration_seconds\.gte\.15\)\)/);
});

test('alertIfNewLead skips spam / already-alerted calls and old databases', async () => {
  fake({ 'calls?vapi_call_id': () => [200, []] });
  assert.match((await alertIfNewLead('vapi-1')).skipped, /^not a new lead/);
  fake({ 'calls?vapi_call_id': () => [400, { message: 'column calls.notified_at does not exist' }] });
  assert.deepEqual(await alertIfNewLead('vapi-1'), { skipped: 'alerts migration not run' });
});

test('buildIcs makes a valid, escaped calendar feed', () => {
  const ics = buildIcs({
    businessName: 'Acme, Roofing',
    now: new Date('2026-09-20T00:00:00Z'),
    bookings: [
      { id: 'b1', job: 'Fix leak; kitchen', customer_name: 'Sarah', starts_at: '2026-09-25T00:00:00Z', duration_minutes: 90, address: '14 Banksia St, Newtown', phone: '0412', status: 'booked', source: 'elliot' },
      { id: 'b2', job: 'Old job', starts_at: '2026-09-21T00:00:00Z', status: 'cancelled' },
    ],
  });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
  assert.match(ics, /X-WR-CALNAME:ElliotAI jobs – Acme\\, Roofing/);
  assert.match(ics, /DTSTART:20260925T000000Z\r\nDTEND:20260925T013000Z/);
  assert.match(ics, /SUMMARY:Fix leak\; kitchen – Sarah/);
  assert.match(ics, /LOCATION:14 Banksia St\\, Newtown/);
  assert.match(ics, /DESCRIPTION:Phone: 0412\\nBooked by Elliot/);
  assert.match(ics, /UID:b2@elliotai[\s\S]*STATUS:CANCELLED/);
  const long = fold(`DESCRIPTION:${'x'.repeat(200)}`);
  assert.ok(long.split('\r\n').every((line) => Buffer.byteLength(line) <= 75));
});

test('calls without an urgency still get a notification titled "New call"', () => {
  assert.equal(buildNotification({ ...call, urgency: null }, client).title, 'New call: Sarah Mitchell');
});
