// Private calendar feed: /api/calendar/<token>.ics — subscribe to it in Apple, Google
// or Outlook calendar and ElliotAI jobs show up there (one-way: portal -> phone calendar).
import { hasSupabaseEnv, restJson } from '../lib/rest.mjs';
import { buildIcs } from '../lib/ics.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async (req, context) => {
  if (!hasSupabaseEnv()) return new Response('Not configured', { status: 500 });
  const token = String(context.params?.file ?? '').replace(/\.ics$/i, '');
  if (!UUID.test(token)) return new Response('Not found', { status: 404 });

  const [client] = await restJson(`clients?select=id,business_name&calendar_token=eq.${token}`);
  if (!client) return new Response('Not found', { status: 404 });

  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const bookings = await restJson(
    `bookings?select=id,job,customer_name,phone,address,notes,assigned_to,starts_at,duration_minutes,status,source` +
      `&client_id=eq.${client.id}&starts_at=gte.${encodeURIComponent(since)}&order=starts_at.asc&limit=1000`,
  );
  return new Response(buildIcs({ businessName: client.business_name, bookings }), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'inline; filename="elliotai-jobs.ics"',
      'Cache-Control': 'private, max-age=300',
    },
  });
};

export const config = { path: '/api/calendar/:file' };
