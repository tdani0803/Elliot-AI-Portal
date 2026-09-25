// Owner tools: who's allowed in, per-client numbers (calls, costs, profit, health),
// checking the "add a client" form, and telling the owner when something breaks.
import { rest, restJson, userFromToken } from './rest.mjs';
import { sendPush, sendSms, smsConfigured } from './alerts.mjs';
import { isLead, statusOf } from '../../src/lib/insights.js';
import { zonedParts, zonedToUtc } from '../../src/lib/time.js';

export { STATES, checkClientForm } from '../../src/lib/client-form.js';
export const OWNER_TZ = process.env.OWNER_TIMEZONE || 'Australia/Brisbane';

// ---------------------------------------------------------------------------
// Who's the owner?
// ---------------------------------------------------------------------------
export const adminEmails = () =>
  String(process.env.ADMIN_EMAILS ?? '')
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

// Returns the logged-in owner, or a Response to send back (401 not logged in / 403 not the owner).
export async function requireOwner(req, { lookup = userFromToken } = {}) {
  const json = (status, error) => Response.json({ error }, { status });
  if (!adminEmails().length) return { response: json(503, 'Set ADMIN_EMAILS in Netlify to your email first.') };
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  const user = await lookup(token).catch(() => null);
  if (!user?.email) return { response: json(401, 'Please log in again.') };
  if (!adminEmails().includes(user.email.toLowerCase())) return { response: json(403, 'This page is only for the ElliotAI owner.') };
  return { user };
}

// ---------------------------------------------------------------------------
// Costs (estimates, shown as such). All AUD unless it says USD.
// ---------------------------------------------------------------------------
const num = (v, fallback) => (Number.isFinite(Number(v)) && String(v).trim() !== '' ? Number(v) : fallback);
export function costRates(env = process.env) {
  return {
    usdToAud: num(env.USD_TO_AUD, 1.55),
    vapiUsdPerMinute: num(env.VAPI_USD_PER_MINUTE, 0.15), // used only when Vapi didn't report a cost
    smsAud: num(env.SMS_COST_AUD, 0.08),
    numberAudPerMonth: num(env.PHONE_NUMBER_AUD_PER_MONTH, 7),
  };
}

// Start of this month in the owner's time zone.
export function monthStart(now = new Date(), tz = OWNER_TZ) {
  const p = zonedParts(now, tz);
  return zonedToUtc({ year: p.year, month: p.month, day: 1 }, tz);
}

const DAY = 86400000;

// One row per client with this month's numbers and a health check. Pure: easy to test.
export function clientStats({ clients, calls, bookings = [], events = [], now = new Date(), rates = costRates(), since = monthStart(now) }) {
  const rows = clients.map((client) => {
    const mine = calls.filter((c) => c.client_id === client.id);
    const month = mine.filter((c) => new Date(c.call_started_at) >= since);
    const seconds = month.reduce((sum, c) => sum + (Number(c.duration_seconds) || 0), 0);
    const vapiUsd = month.reduce(
      (sum, c) => sum + (c.cost_usd != null ? Number(c.cost_usd) : ((Number(c.duration_seconds) || 0) / 60) * rates.vapiUsdPerMinute),
      0,
    );
    const texts =
      month.filter((c) => c.caller_texted_at).length +
      month.filter((c) => c.sms_sent_at).length +
      bookings.filter((b) => b.client_id === client.id && b.reminder_sent_at && new Date(b.reminder_sent_at) >= since).length;
    const cost = vapiUsd * rates.usdToAud + texts * rates.smsAud + (client.vapi_assistant_id ? rates.numberAudPerMonth : 0);
    const fee = Number(client.monthly_fee) || 0;
    const won = mine.filter((c) => statusOf(c) === 'won' && new Date(c.status_updated_at ?? c.call_started_at) >= since);
    const lastCall = mine.reduce((max, c) => (!max || c.call_started_at > max ? c.call_started_at : max), null);
    const problems = events.filter((e) => e.client_id === client.id && now - new Date(e.created_at) < DAY);

    let health;
    if (!client.vapi_assistant_id) health = { level: 'setup', text: 'No Vapi assistant ID yet' };
    else if (!client.user_id) health = { level: 'setup', text: 'Waiting for them to sign up' };
    else if (problems.length) health = { level: 'problem', text: problems[0].message };
    else if (client.billing_status === 'past_due') health = { level: 'problem', text: 'Payment failed' };
    else if (!lastCall) health = { level: 'setup', text: 'Waiting for the first call' };
    else if (now - new Date(lastCall) > 3 * DAY) health = { level: 'quiet', text: `No calls for ${Math.floor((now - new Date(lastCall)) / DAY)} days` };
    else health = { level: 'ok', text: 'Working' };

    return {
      id: client.id,
      business_name: client.business_name,
      owner_email: client.owner_email ?? null,
      state: client.state ?? null,
      linked: Boolean(client.user_id),
      billing_status: client.billing_status ?? 'none',
      last_paid_at: client.last_paid_at ?? null,
      calls: month.length,
      leads: month.filter(isLead).length,
      minutes: Math.round(seconds / 60),
      texts,
      wonCount: won.length,
      wonValue: won.reduce((sum, c) => sum + (Number(c.won_value) || 0), 0),
      fee,
      cost: Math.round(cost * 100) / 100,
      profit: Math.round((fee - cost) * 100) / 100,
      lastCall,
      health,
      client, // everything needed to fill the edit form
    };
  });

  const paying = rows.filter((r) => r.billing_status === 'active');
  return {
    rows: rows.sort((a, b) => a.business_name.localeCompare(b.business_name)),
    totals: {
      clients: rows.length,
      paying: paying.length,
      mrr: paying.reduce((sum, r) => sum + r.fee, 0),
      fees: rows.reduce((sum, r) => sum + r.fee, 0),
      cost: Math.round(rows.reduce((sum, r) => sum + r.cost, 0) * 100) / 100,
      profit: Math.round(rows.reduce((sum, r) => sum + r.profit, 0) * 100) / 100,
      calls: rows.reduce((sum, r) => sum + r.calls, 0),
      problems: rows.filter((r) => r.health.level === 'problem').length,
    },
  };
}

// ---------------------------------------------------------------------------
// Telling the owner something's wrong
// ---------------------------------------------------------------------------
const QUIET_MINUTES = 60; // at most one alert per client per kind of problem each hour

export async function notifyOwner({ clientId = null, kind, message }, deps = {}) {
  const { push = sendPush, sms = sendSms, now = new Date() } = deps;
  try {
    const since = new Date(now.getTime() - QUIET_MINUTES * 60000).toISOString();
    const recent = await restJson(
      `system_events?select=id&kind=eq.${encodeURIComponent(kind)}&client_id=${clientId ? `eq.${clientId}` : 'is.null'}` +
        `&created_at=gte.${encodeURIComponent(since)}&limit=1`,
    );
    await rest('system_events', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ client_id: clientId, kind, message }),
    });
    if (recent?.length) return { logged: true, alerted: false };

    let business = '';
    if (clientId) {
      const [client] = await restJson(`clients?select=business_name&id=eq.${clientId}`).catch(() => []);
      business = client?.business_name ? `${client.business_name}: ` : '';
    }
    const note = { title: 'ElliotAI problem', body: `${business}${message}`, url: '/owner.html', tag: `owner-${kind}-${clientId ?? 'none'}`, urgent: true };

    // Push to the owner's own phones (any login listed in ADMIN_EMAILS that turned notifications on).
    let pushed = 0;
    if (adminEmails().length) {
      const ids = await restJson('rpc/admin_user_ids', { method: 'POST', body: JSON.stringify({ p_emails: adminEmails() }) }).catch(() => []);
      const list = (ids ?? []).map((r) => (typeof r === 'string' ? r : r.admin_user_ids)).filter(Boolean);
      if (list.length) {
        const subs = await restJson(`push_subscriptions?select=endpoint,p256dh,auth&user_id=in.(${list.join(',')})`).catch(() => []);
        for (const sub of subs ?? []) {
          try {
            await push(sub, note);
            pushed += 1;
          } catch {
            /* a stale phone: ignore */
          }
        }
      }
    }
    let texted = false;
    if (process.env.OWNER_PHONE && smsConfigured()) {
      await sms(process.env.OWNER_PHONE, `ElliotAI problem – ${note.body}`).then(() => (texted = true), () => {});
    }
    return { logged: true, alerted: pushed > 0 || texted, pushed, texted };
  } catch (err) {
    // The problems log itself isn't set up yet (owner update not run): don't make things worse.
    console.error('owner alert failed', err?.message ?? err);
    return { logged: false, alerted: false };
  }
}

// Hourly: a working client whose phone has gone quiet for 3 days probably has a problem
// (forwarding turned off, number unassigned, Vapi out of credit…).
export async function checkQuietClients(now = new Date(), deps = {}) {
  const clients = await restJson('clients?select=id,user_id,vapi_assistant_id,billing_status&vapi_assistant_id=not.is.null&user_id=not.is.null');
  let flagged = 0;
  for (const client of clients) {
    if (client.billing_status === 'cancelled') continue;
    const [last] = await restJson(`calls?select=call_started_at&client_id=eq.${client.id}&order=call_started_at.desc&limit=1`);
    if (!last) continue; // never had a call yet: that's setup, not a fault
    const days = (now - new Date(last.call_started_at)) / DAY;
    if (days < 3) continue;
    // Once a day is plenty for this one.
    const since = new Date(now.getTime() - DAY).toISOString();
    const recent = await restJson(`system_events?select=id&kind=eq.quiet&client_id=eq.${client.id}&created_at=gte.${encodeURIComponent(since)}&limit=1`);
    if (recent.length) continue;
    await notifyOwner(
      { clientId: client.id, kind: 'quiet', message: `No calls for ${Math.floor(days)} days. Check their call forwarding and that the number is still on their assistant in Vapi.` },
      deps,
    );
    flagged += 1;
  }
  return { flagged };
}
