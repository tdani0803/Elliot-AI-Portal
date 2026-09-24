// Automatic follow-ups. The texts go to the tradie's customers; the summary goes to the tradie.
//   * Thank-you text to the caller right after the call          (textCaller)
//   * "Job booked" notification to the tradie when Elliot books  (bookedNotification)
//   * Reminder text to the customer the afternoon before a job    (dueReminders + remindCustomer)
//   * Monday-morning "your week with Elliot" notification         (weeklySummary)
// All texts are short, plain, and signed with the business name so customers know who it is.
import { restJson } from './rest.mjs';
import { LEAD_URGENCIES, sendSms, smsConfigured } from './alerts.mjs';
import { promiseMinutes, promisePhrase } from '../../src/lib/promise.js';
import { isLead, statusOf, suburbOf } from '../../src/lib/insights.js';
import { OTHER_JOB, jobLabel } from '../../src/lib/jobs.js';
import { DEFAULT_TZ, formatDayInZone, formatTimeInZone, zonedParts, zonedToUtc } from '../../src/lib/time.js';

const MIN_SECONDS_WITHOUT_URGENCY = 15;
export const REMINDER_FROM_HOUR = 16; // reminders go out from 4pm the day before…
export const REMINDER_TO_HOUR = 20; //   …until 8pm, never at night

const firstName = (name) => String(name ?? '').trim().split(/\s+/)[0] || '';
const hi = (name) => (firstName(name) ? `Hi ${firstName(name)}` : 'Hi');
const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('en-AU')}`;

// Texts only go to Australian mobiles (landlines can't receive them).
export function isAuMobile(phone) {
  const digits = String(phone ?? '').replace(/\D/g, '');
  return /^(04\d{8}|614\d{8})$/.test(digits);
}

// "roof repair" / "job" — for use inside a sentence.
function jobWords(thing) {
  const label = typeof thing === 'string' ? thing : jobLabel(thing);
  return label && label !== OTHER_JOB ? label.toLowerCase().replace(' / ', ' or ') : null;
}

const ringBack = (client) => {
  const phone = client.business_phone || client.alert_phone;
  return phone ? ` Need to change anything? Call us on ${phone}.` : '';
};

// ---------------------------------------------------------------------------
// Thank-you text to the caller
// ---------------------------------------------------------------------------
export function buildCallerText(call, client, booking = null) {
  const tz = client.timezone ?? DEFAULT_TZ;
  const job = jobWords(call);
  const name = client.business_name;
  if (booking) {
    const when = `${formatDayInZone(booking.starts_at, tz)} at ${formatTimeInZone(booking.starts_at, tz)}`;
    return `${hi(call.caller_name)}, thanks for calling ${name}. You're booked in for ${when}${job ? ` for your ${job}` : ''}. We'll text you a reminder the day before.${ringBack(client)}`;
  }
  const promise = promisePhrase(promiseMinutes(call.urgency, client));
  return `${hi(call.caller_name)}, thanks for calling ${name}. We've got your ${job ? `${job} ` : ''}request and the team will call you back ${promise}.`;
}

// After the end-of-call report: text the caller once, if it's a real enquiry with a mobile number.
export async function textCaller(vapiCallId, { sms = sendSms } = {}) {
  if (!smsConfigured()) return { skipped: 'texts not set up' };
  let claimed;
  try {
    claimed = await restJson(
      `calls?vapi_call_id=eq.${encodeURIComponent(vapiCallId)}&caller_texted_at=is.null` +
        `&or=(urgency.in.(${LEAD_URGENCIES.join(',')}),and(urgency.is.null,duration_seconds.gte.${MIN_SECONDS_WITHOUT_URGENCY}))` +
        '&select=id,client_id,caller_name,callback_number,urgency,issue,details,job_type,summary,' +
        'clients(business_name,timezone,callback_urgent_minutes,callback_standard_minutes,business_phone,alert_phone,text_callers)',
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ caller_texted_at: new Date().toISOString() }) },
    );
  } catch (err) {
    if (/column/i.test(err.message)) return { skipped: 'follow-ups migration not run' };
    throw err;
  }
  const call = claimed?.[0];
  if (!call) return { skipped: 'not a lead, or already texted' };
  const client = call.clients ?? {};
  if (!client.text_callers) return { skipped: 'caller texts turned off' };
  if (!isAuMobile(call.callback_number)) return { skipped: 'no mobile number' };
  const [booking] = await restJson(
    `bookings?select=starts_at&vapi_call_id=eq.${encodeURIComponent(vapiCallId)}&status=eq.booked&order=starts_at.asc&limit=1`,
  ).catch(() => []);
  await sms(call.callback_number, buildCallerText(call, client, booking ?? null));
  return { texted: true, booked: Boolean(booking) };
}

// ---------------------------------------------------------------------------
// "Job booked" notification for the tradie
// ---------------------------------------------------------------------------
export function bookedNotification(booking, client) {
  const tz = client.timezone ?? DEFAULT_TZ;
  const where = suburbOf(booking.address);
  return {
    title: 'New job booked',
    body: `${booking.job}${where ? ` in ${where}` : ''}, ${formatDayInZone(booking.starts_at, tz)} at ${formatTimeInZone(booking.starts_at, tz)}. Elliot booked it in.`,
    url: '/dashboard.html#jobs',
    tag: `booking-${booking.starts_at}`,
  };
}

// ---------------------------------------------------------------------------
// Reminder text to the customer the afternoon before
// ---------------------------------------------------------------------------
export function buildReminderText(booking, client) {
  const tz = client.timezone ?? DEFAULT_TZ;
  const job = jobWords(booking.job);
  const where = booking.address ? ` at ${booking.address}` : '';
  return `${hi(booking.customer_name)}, a reminder from ${client.business_name}: we're coming tomorrow (${formatDayInZone(booking.starts_at, tz)}) at ${formatTimeInZone(booking.starts_at, tz)}${job ? ` for your ${job}` : ''}${where}.${ringBack(client)}`;
}

const dayNumber = (p) => Date.UTC(p.year, p.month - 1, p.day) / 86400000;

// Is it the afternoon before this booking, in the business's own time zone?
export function reminderDue(booking, client, now = new Date()) {
  const tz = client.timezone ?? DEFAULT_TZ;
  const today = zonedParts(now, tz);
  const jobDay = zonedParts(new Date(booking.starts_at), tz);
  return dayNumber(jobDay) - dayNumber(today) === 1 && today.hour >= REMINDER_FROM_HOUR && today.hour < REMINDER_TO_HOUR;
}

export async function sendReminders(now = new Date(), { sms = sendSms } = {}) {
  if (!smsConfigured()) return { skipped: 'texts not set up' };
  // Everything booked in the next ~2 days; reminderDue() picks the ones for "tomorrow" locally.
  const until = new Date(now.getTime() + 2.5 * 86400000).toISOString();
  const rows = await restJson(
    'bookings?select=id,customer_name,phone,address,job,starts_at,' +
      'clients(business_name,timezone,business_phone,alert_phone,remind_customers)' +
      `&status=eq.booked&reminder_sent_at=is.null&starts_at=gt.${encodeURIComponent(now.toISOString())}` +
      `&starts_at=lt.${encodeURIComponent(until)}&limit=200`,
  );
  let sent = 0;
  for (const booking of rows) {
    const client = booking.clients ?? {};
    if (!client.remind_customers || !isAuMobile(booking.phone) || !reminderDue(booking, client, now)) continue;
    // Claim it first so a reminder can never go out twice.
    const claimed = await restJson(`bookings?id=eq.${booking.id}&reminder_sent_at=is.null`, {
      method: 'PATCH',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({ reminder_sent_at: now.toISOString() }),
    });
    if (!claimed?.length) continue;
    try {
      await sms(booking.phone, buildReminderText(booking, client));
      sent += 1;
    } catch (err) {
      console.error(`follow-ups: reminder for booking ${booking.id} failed`, err.message);
    }
  }
  return { sent };
}

// ---------------------------------------------------------------------------
// Monday-morning summary for the tradie
// ---------------------------------------------------------------------------
export const SUMMARY_HOUR = 7; // from 7am Monday, local time

// Monday 00:00 of this week and last week, in the business's time zone.
export function lastWeek(now, tz = DEFAULT_TZ) {
  const p = zonedParts(now, tz);
  const back = (p.dayIndex + 6) % 7; // days since Monday
  const monday = new Date(Date.UTC(p.year, p.month - 1, p.day - back));
  const thisMonday = zonedToUtc({ year: monday.getUTCFullYear(), month: monday.getUTCMonth() + 1, day: monday.getUTCDate() }, tz);
  const prev = new Date(monday.getTime() - 7 * 86400000);
  const lastMonday = zonedToUtc({ year: prev.getUTCFullYear(), month: prev.getUTCMonth() + 1, day: prev.getUTCDate() }, tz);
  return { from: lastMonday, to: thisMonday, localDate: `${monday.getUTCFullYear()}-${String(monday.getUTCMonth() + 1).padStart(2, '0')}-${String(monday.getUTCDate()).padStart(2, '0')}` };
}

export function summaryDue(client, now = new Date()) {
  const p = zonedParts(now, client.timezone ?? DEFAULT_TZ);
  return p.dayIndex === 1 && p.hour >= SUMMARY_HOUR;
}

export function buildWeeklySummary({ calls, wonCalls, waiting }) {
  const leads = calls.filter(isLead).length;
  const wonValue = wonCalls.reduce((sum, c) => sum + (Number(c.won_value) || 0), 0);
  const parts = [`${calls.length} call${calls.length === 1 ? '' : 's'}`, `${leads} lead${leads === 1 ? '' : 's'}`];
  if (wonCalls.length) parts.push(`${wonCalls.length} job${wonCalls.length === 1 ? '' : 's'} won${wonValue ? ` (${money(wonValue)})` : ''}`);
  const nudge = waiting ? ` ${waiting} ${waiting === 1 ? 'person is' : 'people are'} still waiting on a call back.` : '';
  return {
    title: 'Your week with Elliot',
    body: `Last week Elliot took ${parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}` : parts[0]}.${nudge} Tap for your report.`,
    url: '/dashboard.html#report',
    tag: 'weekly-summary',
  };
}

export async function sendWeeklySummaries(now = new Date(), { push }) {
  const clients = await restJson('clients?select=id,timezone,weekly_summary,weekly_summary_sent_on&weekly_summary=eq.true');
  let sent = 0;
  for (const client of clients) {
    if (!summaryDue(client, now)) continue;
    const week = lastWeek(now, client.timezone ?? DEFAULT_TZ);
    if (client.weekly_summary_sent_on === week.localDate) continue;
    // Claim this Monday so the summary goes out once, even if the job runs twice.
    const claimed = await restJson(
      `clients?id=eq.${client.id}&or=(weekly_summary_sent_on.is.null,weekly_summary_sent_on.neq.${week.localDate})`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ weekly_summary_sent_on: week.localDate }) },
    );
    if (!claimed?.length) continue;
    const range = `&call_started_at=gte.${encodeURIComponent(week.from.toISOString())}&call_started_at=lt.${encodeURIComponent(week.to.toISOString())}`;
    const [calls, wonCalls, waitingRows] = await Promise.all([
      restJson(`calls?select=urgency,duration_seconds,caller_name,issue&client_id=eq.${client.id}${range}&limit=5000`),
      restJson(
        `calls?select=won_value&client_id=eq.${client.id}&lead_status=eq.won` +
          `&status_updated_at=gte.${encodeURIComponent(week.from.toISOString())}&status_updated_at=lt.${encodeURIComponent(week.to.toISOString())}`,
      ),
      restJson(`calls?select=urgency,duration_seconds,caller_name,issue,lead_status&client_id=eq.${client.id}&lead_status=eq.new&limit=500`),
    ]);
    if (!calls.length && !wonCalls.length) continue; // nothing to say: don't nag
    const waiting = waitingRows.filter((c) => isLead(c) && statusOf(c) === 'new').length;
    await push(client.id, buildWeeklySummary({ calls, wonCalls, waiting }));
    sent += 1;
  }
  return { sent };
}

// Used by the webhook: tell the tradie as soon as Elliot books something.
export async function announceBooking(booking, client, push) {
  try {
    await push(client.id, bookedNotification(booking, client));
  } catch (err) {
    console.error('follow-ups: booking notification failed', err?.message ?? err);
  }
}

