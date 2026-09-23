// New-lead alerts: a phone notification for every lead, with a text message as backup.
//   * No phone has notifications turned on  -> text straight away (if set up)
//   * Urgent lead not opened within 10 min  -> text (see alert-backup scheduled function)
import webPush from 'web-push';
import { rest, restJson } from './rest.mjs';
import { getVapidKeys, vapidSubject } from './vapid.mjs';
import { promiseMinutes, promisePhrase } from '../../src/lib/promise.js';
import { suburbOf } from '../../src/lib/insights.js';

export const LEAD_URGENCIES = ['urgent', 'somewhat_urgent', 'non_urgent'];
export const BACKUP_AFTER_MINUTES = 10;
const CALL_FIELDS = 'id,client_id,caller_name,issue,address,urgency,callback_number,call_started_at';

const siteUrl = () => (process.env.PORTAL_URL || process.env.URL || '').replace(/\/$/, '');
export const leadLink = (callId) => `${siteUrl()}/dashboard.html#leads/${callId}`;

const URGENCY_TITLE = {
  urgent: 'URGENT – New lead',
  somewhat_urgent: 'New lead (somewhat urgent)',
  non_urgent: 'New lead (not urgent)',
};

// The lock-screen notification. Suburb only (not the full address) — lock screens are public.
export function buildNotification(call, client) {
  const name = call.caller_name?.trim() || 'Unknown caller';
  const suburb = suburbOf(call.address);
  const what = [call.issue?.trim() || 'No reason given', suburb].filter(Boolean).join(', ');
  const promise = promisePhrase(promiseMinutes(call.urgency, client));
  return {
    title: `${URGENCY_TITLE[call.urgency] ?? 'New lead'}: ${name}`,
    body: `Elliot just answered a call. ${what}. We told them you'd call back ${promise}.`,
    url: `/dashboard.html#leads/${call.id}`,
    tag: `lead-${call.id}`,
    urgent: call.urgency === 'urgent',
    callId: call.id,
  };
}

export function buildSms(call, client) {
  const n = buildNotification(call, client);
  const phone = call.callback_number ? ` Call them: ${call.callback_number}.` : '';
  return `${n.title}. ${n.body.replace('Elliot just answered a call. ', '')}${phone} Open: ${leadLink(call.id)}`;
}

// "0412 345 678" / "61412345678" / "+61 412 345 678" -> "+61412345678"
export function toE164(phone) {
  const raw = String(phone ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('61')) return `+${digits}`;
  if (digits.startsWith('0') && digits.length === 10) return `+61${digits.slice(1)}`;
  return `+${digits}`;
}

export function smsConfigured() {
  return Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_FROM_NUMBER);
}

export async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${sid}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ To: toE164(to), From: process.env.TWILIO_FROM_NUMBER, Body: body }),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
}

export async function sendPush(subscription, notification) {
  const keys = await getVapidKeys();
  webPush.setVapidDetails(vapidSubject(), keys.publicKey, keys.privateKey);
  await webPush.sendNotification(
    { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
    JSON.stringify(notification),
    { TTL: 60 * 60 * 24, urgency: notification.urgent ? 'high' : 'normal' },
  );
}

// Push to every phone for the business. Returns how many phones got it.
export async function pushToClient(clientId, notification, { send = sendPush } = {}) {
  const subs = await restJson(`push_subscriptions?select=id,endpoint,p256dh,auth&client_id=eq.${clientId}`);
  let delivered = 0;
  for (const sub of subs) {
    try {
      await send(sub, notification);
      delivered += 1;
    } catch (err) {
      // 404/410 = that phone unsubscribed or reinstalled: forget it.
      if (err?.statusCode === 404 || err?.statusCode === 410) {
        await rest(`push_subscriptions?id=eq.${sub.id}`, { method: 'DELETE' }).catch(() => {});
      } else {
        console.error('push failed', err?.statusCode ?? '', err?.body ?? err?.message);
      }
    }
  }
  return { phones: subs.length, delivered };
}

export async function textClient(call, client, { sms = sendSms } = {}) {
  if (!client.sms_backup || !client.alert_phone || !smsConfigured()) return false;
  // Claim first so two processes can never both text about the same call.
  const claimed = await restJson(`calls?id=eq.${call.id}&sms_sent_at=is.null`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ sms_sent_at: new Date().toISOString() }),
  });
  if (!claimed?.length) return false;
  await sms(client.alert_phone, buildSms(call, client));
  return true;
}

// Called after every save from the webhook. Alerts once per call, as soon as we know it's a lead.
export async function alertIfNewLead(vapiCallId, deps = {}) {
  let claimed;
  try {
    claimed = await restJson(
      `calls?vapi_call_id=eq.${encodeURIComponent(vapiCallId)}&notified_at=is.null&urgency=in.(${LEAD_URGENCIES.join(',')})&select=${CALL_FIELDS}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ notified_at: new Date().toISOString() }) },
    );
  } catch (err) {
    if (/column/i.test(err.message)) return { skipped: 'alerts migration not run' };
    throw err;
  }
  const call = claimed?.[0];
  if (!call) return { skipped: 'not a new lead' };

  const [client] = await restJson(
    `clients?id=eq.${call.client_id}&select=business_name,callback_urgent_minutes,callback_standard_minutes,alert_phone,sms_backup`,
  );
  const result = await pushToClient(call.client_id, buildNotification(call, client), deps);
  // Nobody has notifications on (yet): don't leave them in the dark — text instead.
  const texted = result.delivered === 0 ? await textClient(call, client, deps) : false;
  return { ...result, texted };
}
