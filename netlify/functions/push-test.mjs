// "Send me a test notification" — pushes to the logged-in person's own phones only.
import { hasSupabaseEnv, restJson, userFromToken } from '../lib/rest.mjs';
import { sendPush } from '../lib/alerts.mjs';

export default async (req) => {
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405 });
  if (!hasSupabaseEnv()) return Response.json({ error: 'Server not configured' }, { status: 500 });
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const user = await userFromToken(token);
  if (!user?.id) return Response.json({ error: 'Please log in again' }, { status: 401 });

  const subs = await restJson(`push_subscriptions?select=id,endpoint,p256dh,auth&user_id=eq.${user.id}`);
  let delivered = 0;
  for (const sub of subs) {
    try {
      await sendPush(sub, {
        title: 'Test notification',
        body: "It's working. New jobs will show up like this.",
        url: '/dashboard.html#home',
        tag: 'elliot-test',
      });
      delivered += 1;
    } catch (err) {
      console.error('push-test:', err?.statusCode ?? '', err?.body ?? err?.message);
    }
  }
  return Response.json({ phones: subs.length, delivered });
};

export const config = { path: '/api/push-test' };
