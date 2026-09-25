// Stripe billing without the Stripe SDK: a monthly subscription per client, paid through a
// Stripe payment page, kept in sync by Stripe's webhook.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { rest, restJson } from './rest.mjs';
import { notifyOwner } from './owner.mjs';

export const stripeConfigured = () => Boolean(process.env.STRIPE_SECRET_KEY);
const siteUrl = () => (process.env.PORTAL_URL || process.env.URL || '').replace(/\/$/, '');

// {a:{b:1}, c:[{d:2}]} -> "a[b]=1&c[0][d]=2" (Stripe's form format)
export function toForm(params, prefix = '', out = new URLSearchParams()) {
  for (const [key, value] of Object.entries(params)) {
    if (value == null) continue;
    const name = prefix ? `${prefix}[${key}]` : key;
    if (typeof value === 'object') toForm(value, name, out);
    else out.append(name, String(value));
  }
  return out;
}

export async function stripe(path, params = {}, { method = 'POST' } = {}) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: method === 'GET' ? undefined : toForm(params),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`Stripe: ${body?.error?.message ?? res.status}`);
  return body;
}

// The payment page for a client's monthly fee. Returns the link to send them.
export function checkoutParams(client, site = siteUrl()) {
  const cents = Math.round((Number(client.monthly_fee) || 0) * 100);
  return {
    mode: 'subscription',
    ...(client.stripe_customer_id ? { customer: client.stripe_customer_id } : { customer_email: client.owner_email ?? undefined }),
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: 'aud',
          unit_amount: cents,
          recurring: { interval: 'month' },
          product_data: { name: `ElliotAI receptionist – ${client.business_name}` },
        },
      },
    ],
    metadata: { client_id: client.id },
    subscription_data: { metadata: { client_id: client.id } },
    success_url: `${site}/dashboard.html#settings`,
    cancel_url: `${site}/dashboard.html#settings`,
  };
}

export async function createPaymentLink(client) {
  if (!(Number(client.monthly_fee) > 0)) throw new Error('Set their monthly fee first.');
  const session = await stripe('checkout/sessions', checkoutParams(client));
  if (client.billing_status === 'none' || !client.billing_status) {
    await rest(`clients?id=eq.${client.id}`, { method: 'PATCH', body: JSON.stringify({ billing_status: 'invited' }) });
  }
  return session.url;
}

// Stripe signs every webhook: "t=<time>,v1=<hmac>". Reject anything not signed with our secret
// or older than 5 minutes (so an old message can't be replayed).
export function verifySignature(payload, header, secret, now = Date.now(), toleranceSeconds = 300) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    String(header)
      .split(',')
      .map((p) => p.split('='))
      .filter(([k]) => k === 't' || k === 'v1'),
  );
  const t = Number(parts.t);
  if (!t || !parts.v1 || Math.abs(now / 1000 - t) > toleranceSeconds) return false;
  const expected = createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex');
  const given = String(parts.v1);
  return given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

const STATUS = { active: 'active', trialing: 'active', past_due: 'past_due', unpaid: 'past_due', canceled: 'cancelled', incomplete_expired: 'cancelled' };

// What to change on the client row for a Stripe event. Pure, so it's easy to test.
export function billingUpdate(event, now = new Date()) {
  const obj = event?.data?.object ?? {};
  switch (event?.type) {
    case 'checkout.session.completed':
      return {
        match: { id: obj.metadata?.client_id },
        patch: { stripe_customer_id: obj.customer ?? null, stripe_subscription_id: obj.subscription ?? null, billing_status: 'active', last_paid_at: now.toISOString() },
      };
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      return { match: { stripe_customer_id: obj.customer }, patch: { billing_status: 'active', last_paid_at: now.toISOString() } };
    case 'invoice.payment_failed':
      return { match: { stripe_customer_id: obj.customer }, patch: { billing_status: 'past_due' }, alert: 'A payment failed. Stripe will retry; you may want to give them a call.' };
    case 'customer.subscription.updated':
      return STATUS[obj.status] ? { match: { stripe_customer_id: obj.customer }, patch: { billing_status: STATUS[obj.status] } } : null;
    case 'customer.subscription.deleted':
      return { match: { stripe_customer_id: obj.customer }, patch: { billing_status: 'cancelled' }, alert: 'Their subscription was cancelled.' };
    default:
      return null;
  }
}

export async function applyStripeEvent(event, deps = {}) {
  const update = billingUpdate(event);
  if (!update) return { ignored: event?.type };
  const [[column, value]] = Object.entries(update.match);
  if (!value) return { ignored: 'no client to match' };
  const rows = await restJson(`clients?${column}=eq.${encodeURIComponent(value)}&select=id`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(update.patch),
  });
  const clientId = rows?.[0]?.id;
  if (update.alert && clientId) await notifyOwner({ clientId, kind: 'billing', message: update.alert }, deps);
  return { updated: rows?.length ?? 0 };
}

// Lets a client update their card or see invoices on Stripe's own page.
export async function billingPortalUrl(customerId) {
  const session = await stripe('billing_portal/sessions', { customer: customerId, return_url: `${siteUrl()}/dashboard.html#settings` });
  return session.url;
}
