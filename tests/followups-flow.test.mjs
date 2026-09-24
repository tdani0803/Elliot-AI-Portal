// End-to-end checks of the follow-ups against a fake Supabase and a fake Twilio.
import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import handler from '../netlify/functions/vapi-webhook.mjs';
import { sendReminders, sendWeeklySummaries } from '../netlify/lib/followups.mjs';

process.env.VAPI_WEBHOOK_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://abc.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
process.env.TWILIO_ACCOUNT_SID = 'AC1';
process.env.TWILIO_AUTH_TOKEN = 'tok';
process.env.TWILIO_FROM_NUMBER = '+61400000000';

const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

function fake(routes) {
  const log = [];
  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.startsWith('https://api.twilio.com/')) {
      const body = Object.fromEntries(new URLSearchParams(String(init.body)));
      log.push({ sms: body });
      return new Response('{}', { status: 201 });
    }
    const path = u.replace('https://abc.supabase.co/rest/v1/', '');
    log.push({ method: init.method ?? 'GET', path: decodeURIComponent(path), body: init.body ? JSON.parse(init.body) : undefined });
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    const [status, body] = key ? routes[key](path, init) : [404, {}];
    return new Response(JSON.stringify(body), { status });
  };
  return log;
}

const client = {
  id: 'k1',
  business_name: 'Tysons Roofing',
  timezone: 'Australia/Brisbane',
  business_hours: { mon: ['08:00', '17:00'], tue: ['08:00', '17:00'], wed: ['08:00', '17:00'], thu: ['08:00', '17:00'], fri: ['08:00', '17:00'], sat: null, sun: null },
  callback_urgent_minutes: 60,
  callback_standard_minutes: 240,
  alert_phone: '0412 000 111',
  business_phone: null,
  text_callers: true,
  remind_customers: true,
};

const post = (body) =>
  handler(new Request('https://site/api/vapi-webhook', { method: 'POST', headers: { 'x-vapi-secret': 'test-secret' }, body: JSON.stringify(body) }));

test('after a call: saved, then the caller gets one thank-you text', async () => {
  const log = fake({
    'clients?select=': () => [200, [{ id: 'k1' }]],
    'calls?on_conflict': () => [201, {}],
    // alert claim (not a lead for alerts in this fake) and caller-text claim
    'calls?vapi_call_id': (path) =>
      path.includes('caller_texted_at')
        ? [200, [{ id: 'c1', client_id: 'k1', caller_name: 'Dani Smith', callback_number: '0412 345 678', urgency: 'non_urgent', issue: 'Roof repair', clients: client }]]
        : [200, []],
    'bookings?': () => [200, []],
  });
  const res = await post({
    message: {
      type: 'end-of-call-report',
      call: { id: 'call_1', assistantId: 'asst_1' },
      durationSeconds: 90,
      analysis: { summary: 'Roof repair', structuredData: { name: 'Dani Smith', urgency: 'Non-Urgent', callback_number: '0412 345 678' } },
    },
  });
  assert.equal(res.status, 200);
  const texts = log.filter((l) => l.sms);
  assert.equal(texts.length, 1);
  assert.equal(texts[0].sms.To, '+61412345678');
  assert.match(texts[0].sms.Body, /^Hi Dani, thanks for calling Tysons Roofing\. We've got your roof repair request/);
  const claim = log.find((l) => l.path?.includes('caller_texted_at=is.null'));
  assert.equal(claim.method, 'PATCH');
});

test('book_job: saves the booking, tells the tradie, and Elliot hears the confirmation', async () => {
  const log = fake({
    'clients?select=': () => [200, [client]],
    'bookings?select=': () => [200, []],
    bookings: () => [201, {}],
    'push_subscriptions?': () => [200, []],
  });
  const res = await post({
    message: {
      type: 'tool-calls',
      call: { id: 'call_2', assistantId: 'asst_1', customer: { number: '+61412345678' } },
      toolCallList: [{ id: 't1', function: { name: 'book_job', arguments: { name: 'Dani', job: 'Roof repair', start_time: '2031-09-30T09:00:00.000Z' } } }],
    },
  });
  const body = await res.json();
  assert.match(body.results[0].result, /^Booked for Tuesday 30 September at 9am\.$/);
  const insert = log.find((l) => l.method === 'POST' && l.path === 'bookings');
  assert.equal(insert.body.source, 'elliot');
  assert.equal(insert.body.vapi_call_id, 'call_2');
  assert.ok(log.some((l) => l.path?.startsWith('push_subscriptions?')), 'looked for phones to notify');
});

test('reminders: the afternoon before, one text per booking', async () => {
  const now = new Date('2026-09-28T06:30:00Z'); // Mon 4:30pm Brisbane
  const booking = { id: 'b1', customer_name: 'Dani', phone: '0412 345 678', address: '12 Smith St, Ipswich', job: 'Roof repair', starts_at: '2026-09-28T23:00:00Z', clients: client };
  const log = fake({
    'bookings?select=': () => [200, [booking, { ...booking, id: 'b2', phone: '07 3000 0000' }]],
    'bookings?id=eq.b1': () => [200, [{ id: 'b1' }]],
  });
  const result = await sendReminders(now);
  assert.deepEqual(result, { sent: 1 }); // the landline isn't texted
  const text = log.find((l) => l.sms);
  assert.match(text.sms.Body, /we're coming tomorrow \(Tuesday 29 September\) at 9am for your roof repair/);
  assert.match(text.sms.Body, /Call us on 0412 000 111\./); // falls back to their mobile
});

test('weekly summary: Monday morning, once, with last week’s numbers', async () => {
  const now = new Date('2026-09-27T21:30:00Z'); // Mon 7:30am Brisbane
  fake({
    'clients?select=': () => [200, [{ id: 'k1', timezone: 'Australia/Brisbane', weekly_summary: true, weekly_summary_sent_on: null }]],
    'clients?id=eq.k1': () => [200, [{ id: 'k1' }]],
    'calls?select=urgency,duration_seconds,caller_name,issue&': () => [200, [{ urgency: 'urgent' }, { urgency: 'irrelevant' }]],
    'calls?select=won_value': () => [200, [{ won_value: 4000 }]],
    'calls?select=urgency,duration_seconds,caller_name,issue,lead_status': () => [200, [{ urgency: 'urgent', lead_status: 'new' }]],
  });
  const pushed = [];
  const result = await sendWeeklySummaries(now, { push: async (id, n) => pushed.push([id, n]) });
  assert.deepEqual(result, { sent: 1 });
  assert.equal(pushed[0][0], 'k1');
  assert.match(pushed[0][1].body, /^Last week Elliot took 2 calls, 1 lead and 1 job won \(\$4,000\)\. 1 person is still waiting/);
});
