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
    return Response.json({ error: 'Notifications are not set up yet' }, { status: 503 });
  }
};

export const config = { path: '/api/push-config' };
