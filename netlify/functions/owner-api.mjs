// The owner page's back end. Only logins listed in ADMIN_EMAILS get in.
//   GET  /api/owner/overview      every client with this month's numbers, problems, system check
//   POST /api/owner/save-client   add or edit a client (no SQL needed)
//   POST /api/owner/payment-link  a Stripe payment page for a client's monthly fee
import { hasSupabaseEnv, rest, restJson } from '../lib/rest.mjs';
import { smsConfigured } from '../lib/alerts.mjs';
import { checkClientForm, clientStats, monthStart, requireOwner } from '../lib/owner.mjs';
import { createPaymentLink, stripeConfigured } from '../lib/stripe.mjs';

const json = (status, body) => Response.json(body, { status });
const DAY = 86400000;

function systemCheck() {
  return [
    { name: 'Vapi secret', ok: Boolean(process.env.VAPI_WEBHOOK_SECRET), fix: 'Add VAPI_WEBHOOK_SECRET in Netlify.' },
    { name: 'Texts (Twilio)', ok: smsConfigured(), fix: 'Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER in Netlify.' },
    { name: 'Your mobile for problem texts', ok: Boolean(process.env.OWNER_PHONE), fix: 'Add OWNER_PHONE in Netlify (optional: you also get phone notifications).' },
    { name: 'Payments (Stripe)', ok: stripeConfigured(), fix: 'Add STRIPE_SECRET_KEY in Netlify.' },
    { name: 'Stripe updates', ok: Boolean(process.env.STRIPE_WEBHOOK_SECRET), fix: 'Add the Stripe webhook and STRIPE_WEBHOOK_SECRET (see the owner guide).' },
  ];
}

async function overview() {
  const now = new Date();
  const since = new Date(Math.min(monthStart(now).getTime(), now.getTime() - 30 * DAY)).toISOString();
  const weekAgo = new Date(now.getTime() - 7 * DAY).toISOString();
  const [clients, calls, bookings, events] = await Promise.all([
    restJson('clients?select=*&order=business_name.asc'),
    restJson(
      'calls?select=client_id,call_started_at,duration_seconds,urgency,caller_name,issue,lead_status,won_value,status_updated_at,cost_usd,caller_texted_at,sms_sent_at' +
        `&call_started_at=gte.${encodeURIComponent(since)}&limit=50000`,
    ),
    restJson(`bookings?select=client_id,reminder_sent_at&reminder_sent_at=gte.${encodeURIComponent(since)}&limit=20000`),
    restJson(`system_events?select=client_id,kind,message,created_at&created_at=gte.${encodeURIComponent(weekAgo)}&order=created_at.desc&limit=50`),
  ]);
  const names = Object.fromEntries(clients.map((c) => [c.id, c.business_name]));
  return {
    ...clientStats({ clients, calls, bookings, events, now }),
    events: events.map((e) => ({ ...e, business_name: names[e.client_id] ?? null })),
    system: systemCheck(),
  };
}

async function saveClient(body) {
  const { row, errors, ok } = checkClientForm(body);
  if (!ok) return json(400, { errors });
  // Link their login now if they've already signed up (otherwise it links itself when they do).
  const users = await restJson('rpc/admin_user_id', { method: 'POST', body: JSON.stringify({ p_email: row.owner_email }) });
  const userId = typeof users === 'string' ? users : null;
  try {
    if (body.id) {
      const [existing] = await restJson(`clients?id=eq.${encodeURIComponent(body.id)}&select=user_id`);
      if (!existing) return json(404, { error: 'That client no longer exists.' });
      const patch = { ...row, ...(existing.user_id ? {} : { user_id: userId }) };
      const [saved] = await restJson(`clients?id=eq.${encodeURIComponent(body.id)}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify(patch),
      });
      return json(200, { client: saved });
    }
    const [saved] = await restJson('clients', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ ...row, user_id: userId }),
    });
    return json(201, { client: saved });
  } catch (err) {
    const msg = String(err.message);
    if (/vapi_assistant_id/.test(msg)) return json(409, { errors: { vapi_assistant_id: 'Another business already uses this assistant ID.' } });
    if (/owner_email/.test(msg)) return json(409, { errors: { owner_email: 'Another business already uses this email.' } });
    if (/user_id/.test(msg)) return json(409, { errors: { owner_email: 'That login is already linked to another business.' } });
    throw err;
  }
}

export default async (req, context) => {
  if (!hasSupabaseEnv()) return json(500, { error: 'Supabase settings are missing in Netlify.' });
  const { response } = await requireOwner(req);
  if (response) return response;
  const action = context?.params?.action ?? new URL(req.url).pathname.split('/').pop();
  try {
    if (req.method === 'GET' && action === 'overview') return json(200, await overview());
    if (req.method !== 'POST') return json(405, { error: 'Method not allowed' });
    const body = await req.json().catch(() => ({}));
    if (action === 'save-client') return await saveClient(body);
    if (action === 'payment-link') {
      if (!stripeConfigured()) return json(400, { error: 'Payments are not set up yet. Add STRIPE_SECRET_KEY in Netlify.' });
      const [client] = await restJson(`clients?id=eq.${encodeURIComponent(body.id ?? '')}&select=*`);
      if (!client) return json(404, { error: 'Client not found.' });
      return json(200, { url: await createPaymentLink(client) });
    }
    return json(404, { error: 'Unknown action' });
  } catch (err) {
    console.error(`owner-api ${action}:`, err.message);
    const missing = /column|relation|function .* does not exist|schema cache/i.test(err.message);
    return json(missing ? 409 : 500, {
      error: missing ? 'Run the owner update (20260929000000_owner.sql) in Supabase first.' : err.message.replace(/^Supabase \d+: /, ''),
    });
  }
};

export const config = { path: '/api/owner/:action' };
