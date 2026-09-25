// A client taps "Payment details" in Settings: send them to Stripe's page for their account.
import { restJson, userFromToken } from '../lib/rest.mjs';
import { billingPortalUrl, stripeConfigured } from '../lib/stripe.mjs';

const json = (status, body) => Response.json(body, { status });

export default async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
  const user = await userFromToken((req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, ''));
  if (!user?.id) return json(401, { error: 'Please log in again.' });
  if (!stripeConfigured()) return json(400, { error: "Payments aren't set up yet. Contact ElliotAI." });
  try {
    const [client] = await restJson(`clients?user_id=eq.${user.id}&select=stripe_customer_id`);
    if (!client?.stripe_customer_id) return json(404, { error: "There's no payment set up for your account yet. Contact ElliotAI." });
    return json(200, { url: await billingPortalUrl(client.stripe_customer_id) });
  } catch (err) {
    console.error('billing-portal', err.message);
    return json(500, { error: "Couldn't open the payment page. Try again soon." });
  }
};

export const config = { path: '/api/billing-portal' };
