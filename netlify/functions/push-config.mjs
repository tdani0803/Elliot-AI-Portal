// Gives the browser the public key it needs to turn on notifications.
import { hasSupabaseEnv } from '../lib/rest.mjs';
import { getVapidKeys } from '../lib/vapid.mjs';

export default async () => {
  if (!hasSupabaseEnv()) return Response.json({ error: 'Server not configured' }, { status: 500 });
  try {
    const { publicKey } = await getVapidKeys();
    return Response.json({ publicKey }, { headers: { 'Cache-Control': 'public, max-age=300' } });
  } catch (err) {
    console.error('push-config:', err);
    // Say why (no secrets in these messages) so setup problems can be fixed from a screenshot.
    const message = String(err?.message ?? err);
    const reason = /app_secrets/.test(message) && /does not exist|not find/i.test(message)
      ? 'The alerts database update (20260925000000_alerts.sql) has not been run yet.'
      : /401|403|Invalid API key|JWT/i.test(message)
        ? 'The server could not log in to Supabase. Check SUPABASE_SERVICE_ROLE_KEY in Netlify.'
        : message.slice(0, 200);
    return Response.json({ error: 'Notifications are not set up yet', reason }, { status: 503 });
  }
};

export const config = { path: '/api/push-config' };
