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
