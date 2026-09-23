// Notification ("VAPID") keys. If they aren't set as Netlify env vars, they're created
// once and kept in the server-only app_secrets table — nothing to set up by hand.
import webPush from 'web-push';
import { rest, restJson } from './rest.mjs';

let cached = null;

export async function getVapidKeys() {
  if (cached) return cached;
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    cached = { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY };
    return cached;
  }
  const read = async () => {
    const rows = await restJson('app_secrets?select=name,value&name=in.(vapid_public_key,vapid_private_key)');
    const map = Object.fromEntries(rows.map((r) => [r.name, r.value]));
    return map.vapid_public_key && map.vapid_private_key ? { publicKey: map.vapid_public_key, privateKey: map.vapid_private_key } : null;
  };
  let keys = await read();
  if (!keys) {
    const fresh = webPush.generateVAPIDKeys();
    // ignore-duplicates: if two requests race, the first pair wins and both re-read it.
    await rest('app_secrets?on_conflict=name', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify([
        { name: 'vapid_public_key', value: fresh.publicKey },
        { name: 'vapid_private_key', value: fresh.privateKey },
      ]),
    });
    keys = await read();
  }
  cached = keys;
  return keys;
}

export function vapidSubject() {
  return process.env.VAPID_SUBJECT || `mailto:${process.env.ALERTS_EMAIL || 'alerts@elliotai.com.au'}`;
}
