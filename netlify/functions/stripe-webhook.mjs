// Stripe tells us when a client pays, a payment fails, or a subscription ends.
// In Stripe: Developers -> Webhooks -> endpoint https://<site>/api/stripe-webhook, then put its
// signing secret in Netlify as STRIPE_WEBHOOK_SECRET.
import { hasSupabaseEnv } from '../lib/rest.mjs';
import { applyStripeEvent, verifySignature } from '../lib/stripe.mjs';

export default async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!hasSupabaseEnv() || !process.env.STRIPE_WEBHOOK_SECRET) return new Response('Not configured', { status: 500 });
  const payload = await req.text();
  if (!verifySignature(payload, req.headers.get('stripe-signature'), process.env.STRIPE_WEBHOOK_SECRET)) {
    return new Response('Bad signature', { status: 400 });
  }
  try {
    const result = await applyStripeEvent(JSON.parse(payload));
    console.log('stripe-webhook', JSON.stringify(result));
    return Response.json({ received: true });
  } catch (err) {
    console.error('stripe-webhook failed', err.message);
    return new Response('Error', { status: 500 }); // Stripe will retry
  }
};

export const config = { path: '/api/stripe-webhook' };
