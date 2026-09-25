import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createHmac } from 'node:crypto';
import { checkClientForm } from '../src/lib/client-form.js';
import { clientStats, costRates, monthStart, notifyOwner, requireOwner } from '../netlify/lib/owner.mjs';
import { billingUpdate, checkoutParams, toForm, verifySignature } from '../netlify/lib/stripe.mjs';

process.env.SUPABASE_URL = 'https://abc.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-key';
const realFetch = globalThis.fetch;
afterEach(() => (globalThis.fetch = realFetch));

const hours = { mon: ['07:00', '17:00'], tue: ['07:00', '17:00'], wed: ['07:00', '17:00'], thu: ['07:00', '17:00'], fri: ['07:00', '17:00'], sat: null, sun: null };

test('client form: tidies good input, explains bad input', () => {
  const good = checkClientForm({ business_name: ' Smith Plumbing ', owner_email: 'Owner@Smith.com.au', state: 'wa', business_hours: hours, monthly_fee: '1000', callback_urgent_minutes: '60' });
  assert.equal(good.ok, true);
  assert.equal(good.row.business_name, 'Smith Plumbing');
  assert.equal(good.row.owner_email, 'owner@smith.com.au');
  assert.equal(good.row.state, 'WA');
  assert.equal(good.row.monthly_fee, 1000);
  assert.equal(good.row.business_hours.sat, null);

  const bad = checkClientForm({ owner_email: 'nope', state: 'XX', review_url: 'g.page/x', business_hours: { ...hours, mon: ['17:00', '07:00'] } });
  assert.equal(bad.ok, false);
  assert.deepEqual(Object.keys(bad.errors).sort(), ['business_hours', 'business_name', 'owner_email', 'review_url', 'state']);
  assert.match(bad.errors.business_hours, /Mon/);
});

test('owner stats: this month only, real Vapi cost when given, health flags', () => {
  const now = new Date('2026-09-25T02:00:00Z');
  const clients = [
    { id: 'a', business_name: 'Alpha', vapi_assistant_id: 'x', user_id: 'u1', monthly_fee: 1000, billing_status: 'active' },
    { id: 'b', business_name: 'Bravo', vapi_assistant_id: 'y', user_id: 'u2', monthly_fee: 800, billing_status: 'invited' },
    { id: 'c', business_name: 'Charlie', vapi_assistant_id: null, user_id: null, monthly_fee: 900 },
  ];
  const calls = [
    { client_id: 'a', call_started_at: '2026-09-24T00:00:00Z', duration_seconds: 120, urgency: 'urgent', cost_usd: 0.5, caller_texted_at: 'x' },
    { client_id: 'a', call_started_at: '2026-09-20T00:00:00Z', duration_seconds: 60, urgency: 'irrelevant' }, // no cost: estimated
    { client_id: 'a', call_started_at: '2026-08-30T00:00:00Z', duration_seconds: 600, urgency: 'urgent', cost_usd: 9 }, // last month
    { client_id: 'b', call_started_at: '2026-09-18T00:00:00Z', duration_seconds: 60, urgency: 'non_urgent', lead_status: 'won', won_value: 3000, status_updated_at: '2026-09-19T00:00:00Z' },
  ];
  const rates = { usdToAud: 1.5, vapiUsdPerMinute: 0.2, smsAud: 0.1, numberAudPerMonth: 5 };
  const { rows, totals } = clientStats({ clients, calls, now, rates, since: monthStart(now, 'Australia/Brisbane') });
  const [a, b, c] = rows;
  assert.equal(a.calls, 2);
  assert.equal(a.leads, 1);
  assert.equal(a.texts, 1);
  // (0.5 + 1min*0.2) USD * 1.5 + 1 text * 0.1 + number 5 = 1.05 + 0.1 + 5
  assert.equal(a.cost, 6.15);
  assert.equal(a.profit, 993.85);
  assert.equal(a.health.level, 'ok');
  assert.equal(b.wonValue, 3000);
  assert.equal(b.health.level, 'quiet'); // last call 7 days ago
  assert.equal(c.health.text, 'No Vapi assistant ID yet');
  assert.equal(totals.paying, 1);
  assert.equal(totals.mrr, 1000);
  assert.equal(totals.fees, 2700);
  assert.deepEqual(costRates({}), { usdToAud: 1.55, vapiUsdPerMinute: 0.15, smsAud: 0.08, numberAudPerMonth: 7 });
});

test('requireOwner: only emails in ADMIN_EMAILS get in', async () => {
  const req = (token) => new Request('https://x/api/owner/overview', { headers: { authorization: `Bearer ${token}` } });
  const lookup = async (t) => (t === 'boss' ? { email: 'Boss@ElliotAI.com.au' } : t === 'tradie' ? { email: 'tradie@x.com' } : null);
  process.env.ADMIN_EMAILS = '';
  assert.equal((await requireOwner(req('boss'), { lookup })).response.status, 503);
  process.env.ADMIN_EMAILS = 'boss@elliotai.com.au, other@x.com';
  assert.equal((await requireOwner(req('boss'), { lookup })).user.email, 'Boss@ElliotAI.com.au');
  assert.equal((await requireOwner(req('tradie'), { lookup })).response.status, 403);
  assert.equal((await requireOwner(req('nobody'), { lookup })).response.status, 401);
});

test('notifyOwner: logs every problem but only alerts once an hour per kind', async () => {
  process.env.ADMIN_EMAILS = 'boss@elliotai.com.au';
  let recent = [];
  const inserted = [];
  globalThis.fetch = async (url, init = {}) => {
    const path = decodeURIComponent(String(url).replace('https://abc.supabase.co/rest/v1/', ''));
    if (path.startsWith('system_events?')) return Response.json(recent);
    if (path === 'system_events') {
      inserted.push(JSON.parse(init.body));
      return new Response(null, { status: 201 });
    }
    if (path.startsWith('clients?')) return Response.json([{ business_name: 'Alpha' }]);
    if (path === 'rpc/admin_user_ids') return Response.json(['u-boss']);
    if (path.startsWith('push_subscriptions?')) return Response.json([{ endpoint: 'e' }]);
    return new Response('{}', { status: 404 });
  };
  const pushed = [];
  const first = await notifyOwner({ clientId: 'a', kind: 'tool_failed', message: 'Booking failed' }, { push: async (s, n) => pushed.push(n) });
  assert.deepEqual({ alerted: first.alerted, pushed: first.pushed }, { alerted: true, pushed: 1 });
  assert.equal(pushed[0].body, 'Alpha: Booking failed');
  recent = [{ id: 'x' }];
  const second = await notifyOwner({ clientId: 'a', kind: 'tool_failed', message: 'Booking failed again' }, { push: async (s, n) => pushed.push(n) });
  assert.equal(second.alerted, false);
  assert.equal(inserted.length, 2); // both logged
  assert.equal(pushed.length, 1); // one buzz
});

test('stripe: form encoding, checkout for the monthly fee, signed webhooks, status changes', () => {
  assert.equal(toForm({ a: { b: 1 }, c: [{ d: 2 }], e: null }).toString(), 'a%5Bb%5D=1&c%5B0%5D%5Bd%5D=2');
  const params = checkoutParams({ id: 'k1', business_name: 'Smith Plumbing', monthly_fee: 1000, owner_email: 'o@x.com' }, 'https://site');
  assert.equal(params.line_items[0].price_data.unit_amount, 100000);
  assert.equal(params.line_items[0].price_data.currency, 'aud');
  assert.equal(params.customer_email, 'o@x.com');
  assert.equal(params.metadata.client_id, 'k1');

  const secret = 'whsec_test';
  const payload = '{"type":"invoice.paid"}';
  const t = 1_800_000_000;
  const sig = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  assert.equal(verifySignature(payload, `t=${t},v1=${sig}`, secret, t * 1000), true);
  assert.equal(verifySignature(payload, `t=${t},v1=${sig}`, 'wrong', t * 1000), false);
  assert.equal(verifySignature(payload, `t=${t},v1=${sig}`, secret, (t + 3600) * 1000), false); // too old
  assert.equal(verifySignature('{"tampered":1}', `t=${t},v1=${sig}`, secret, t * 1000), false);

  const done = billingUpdate({ type: 'checkout.session.completed', data: { object: { customer: 'cus_1', subscription: 'sub_1', metadata: { client_id: 'k1' } } } });
  assert.deepEqual(done.match, { id: 'k1' });
  assert.equal(done.patch.billing_status, 'active');
  assert.equal(billingUpdate({ type: 'invoice.payment_failed', data: { object: { customer: 'cus_1' } } }).patch.billing_status, 'past_due');
  assert.equal(billingUpdate({ type: 'customer.subscription.deleted', data: { object: { customer: 'cus_1' } } }).patch.billing_status, 'cancelled');
  assert.equal(billingUpdate({ type: 'something.else', data: { object: {} } }), null);
});
