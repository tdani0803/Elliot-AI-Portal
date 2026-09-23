import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import handler from '../netlify/functions/vapi-webhook.mjs';

process.env.VAPI_WEBHOOK_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://abc.supabase.co/rest/v1/'; // pasted with extra path on purpose
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';

const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

// Tiny fake of the Supabase REST API. `routes` maps a URL prefix to a responder.
function fakeSupabase(routes) {
  const log = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = String(url).replace('https://abc.supabase.co/rest/v1/', '');
    log.push({ method: init.method ?? 'GET', path, body: init.body ? JSON.parse(init.body) : undefined });
    const key = Object.keys(routes).find((k) => path.startsWith(k));
    const [status, body] = key ? routes[key](path, init) : [404, {}];
    return new Response(JSON.stringify(body), { status });
  };
  return log;
}

const post = (body) =>
  handler(new Request('https://site/api/vapi-webhook', { method: 'POST', headers: { 'x-vapi-secret': 'test-secret' }, body: JSON.stringify(body) }));

const report = {
  message: {
    type: 'end-of-call-report',
    call: { id: 'call_1', assistantId: 'asst_1' },
    durationSeconds: 90,
    artifact: { recordingUrl: 'https://rec/1.wav', transcript: 'hi' },
    analysis: { summary: 'Roof leak', structuredData: { name: 'Sarah', urgency: 'Urgent' } },
  },
};

test('end-of-call report is saved with recording and summary', async () => {
  const log = fakeSupabase({ clients: () => [200, [{ id: 'k1' }]], calls: () => [201, {}] });
  const res = await post(report);
  assert.equal(res.status, 200);
  const save = log.find((l) => l.method === 'POST');
  assert.equal(save.path, 'calls?on_conflict=vapi_call_id');
  assert.equal(save.body.recording_url, 'https://rec/1.wav');
  assert.equal(save.body.client_id, 'k1');
});

test('before the database upgrade, calls still save (without the new columns)', async () => {
  const log = fakeSupabase({
    clients: () => [200, [{ id: 'k1' }]],
    calls: (path, init) =>
      JSON.parse(init.body).recording_url ? [400, { message: "Could not find the 'recording_url' column of 'calls'" }] : [201, {}],
  });
  const res = await post(report);
  assert.equal(res.status, 200);
  const saves = log.filter((l) => l.method === 'POST');
  assert.equal(saves.length, 2);
  assert.equal(saves[1].body.recording_url, undefined);
  assert.equal(saves[1].body.caller_name, 'Sarah');
});

test('Elliot books a job during a call', async () => {
  const log = fakeSupabase({
    clients: () => [200, [{ id: 'k1', timezone: 'Australia/Sydney', business_hours: { mon: ['07:00', '17:00'], tue: ['07:00', '17:00'], wed: ['07:00', '17:00'], thu: ['07:00', '17:00'], fri: ['07:00', '17:00'] } }]],
    bookings: (path, init) => (init.method === 'POST' ? [201, {}] : [200, []]),
  });
  const res = await post({
    message: {
      type: 'tool-calls',
      call: { id: 'call_2', assistantId: 'asst_1', customer: { number: '+61400000000' } },
      toolCallList: [{ id: 'tc1', function: { name: 'book_job', arguments: { name: 'Sam', job: 'Gutters', start_time: '2030-01-07T09:00' } } }],
    },
  });
  const body = await res.json();
  assert.deepEqual(body, { results: [{ toolCallId: 'tc1', result: 'Booked for Monday 7 January at 9am.' }] });
  const insert = log.find((l) => l.method === 'POST' && l.path === 'bookings');
  assert.equal(insert.body.source, 'elliot');
  assert.equal(insert.body.phone, '+61400000000');
});

test('unknown tools get a harmless reply', async () => {
  fakeSupabase({ clients: () => [200, [{ id: 'k1' }]] });
  const res = await post({ message: { type: 'tool-calls', call: { assistantId: 'asst_1' }, toolCallList: [{ id: 't', function: { name: 'send_text', arguments: {} } }] } });
  assert.deepEqual(await res.json(), { results: [{ toolCallId: 't', result: 'Noted.' }] });
});
