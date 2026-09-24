// Pure dashboard analytics over a list of call rows. No DOM, no network.
import { LEAD_URGENCIES, estimatedValue } from './metrics.js';
import { DEFAULT_HOURS, DEFAULT_TZ, isAfterHours, zonedParts } from './time.js';
import { dueAt } from './promise.js';

export const STATUSES = [
  { id: 'new', label: 'Needs a call back', short: 'New' },
  { id: 'called_back', label: 'Called back', short: 'Called' },
  { id: 'quoted', label: 'Quoted', short: 'Quoted' },
  { id: 'won', label: 'Won', short: 'Won' },
  { id: 'lost', label: 'Lost', short: 'Lost' },
];
export const OPEN_STATUSES = ['new', 'called_back', 'quoted'];
const URGENCY_RANK = { urgent: 0, somewhat_urgent: 1, non_urgent: 2 };
const rankOf = (urgency) => URGENCY_RANK[urgency] ?? 1.5; // untagged sits between somewhat and non-urgent

// A lead is any real enquiry. Calls Vapi didn't tag with an urgency still count if the
// caller stayed on the line or gave details; only "irrelevant" (spam) and hang-ups don't.
export const MIN_LEAD_SECONDS = 15;
export const isLead = (call) =>
  LEAD_URGENCIES.includes(call.urgency) ||
  (call.urgency == null && ((Number(call.duration_seconds) || 0) >= MIN_LEAD_SECONDS || Boolean(call.caller_name || call.issue)));
export const statusOf = (call) => call.lead_status ?? 'new';
export const normalisePhone = (phone) => {
  const digits = String(phone ?? '').replace(/[^\d+]/g, '');
  return digits.startsWith('+61') ? `0${digits.slice(3)}` : digits;
};

const inRange = (iso, since) => !since || new Date(iso) >= since;

// When a job counted as won: the moment it was marked won (fallback: call time).
const wonAt = (call) => call.status_updated_at ?? call.call_started_at;

// What Elliot costs over the selected range — deliberately generous to the fee so
// the "times back" figure is never inflated (a part-month is charged as a full month).
export function feeForRange(range, monthlyFee, calls = [], now = new Date()) {
  const fee = Number(monthlyFee) || 0;
  if (!fee) return 0;
  if (range === 'week') return fee / 4.33;
  if (range === 'month') return fee;
  const first = calls.reduce((min, c) => Math.min(min, new Date(c.call_started_at).getTime()), now.getTime());
  const months = Math.max(1, Math.ceil((now.getTime() - first) / (30.44 * 86400000)));
  return fee * months;
}

export function summariseRange({ calls, client, since, range, now = new Date() }) {
  const hours = client.business_hours ?? DEFAULT_HOURS;
  const tz = client.timezone ?? DEFAULT_TZ;
  const avgJobValue = Number(client.avg_job_value) || 0;
  const conversionRate = Number(client.conversion_rate) || 0.3;

  const ranged = calls.filter((c) => inRange(c.call_started_at, since));
  const leads = ranged.filter(isLead);
  const totalSeconds = ranged.reduce((sum, c) => sum + (Number(c.duration_seconds) || 0), 0);
  const wonCalls = calls.filter((c) => statusOf(c) === 'won' && inRange(wonAt(c), since));
  const wonValue = wonCalls.reduce((sum, c) => sum + (Number(c.won_value) || 0), 0);
  const openLeads = leads.filter((c) => OPEN_STATUSES.includes(statusOf(c)));
  const fee = feeForRange(range, client.monthly_fee, calls, now);

  const funnel = {
    leads: leads.length,
    called_back: leads.filter((c) => ['called_back', 'quoted', 'won'].includes(statusOf(c))).length,
    quoted: leads.filter((c) => ['quoted', 'won'].includes(statusOf(c))).length,
    won: leads.filter((c) => statusOf(c) === 'won').length,
    lost: leads.filter((c) => statusOf(c) === 'lost').length,
  };

  return {
    calls: ranged.length,
    leads: leads.length,
    afterHours: ranged.filter((c) => isAfterHours(c.call_started_at, hours, tz)).length,
    afterHoursLeads: leads.filter((c) => isAfterHours(c.call_started_at, hours, tz)).length,
    totalSeconds,
    avgSeconds: ranged.length ? totalSeconds / ranged.length : 0,
    urgency: {
      urgent: leads.filter((c) => c.urgency === 'urgent').length,
      somewhat_urgent: leads.filter((c) => c.urgency === 'somewhat_urgent').length,
      non_urgent: leads.filter((c) => c.urgency === 'non_urgent').length,
    },
    won: { count: wonCalls.length, value: wonValue },
    open: {
      count: openLeads.length,
      estimate: avgJobValue > 0 ? estimatedValue(openLeads.length, avgJobValue, conversionRate) : null,
    },
    estimateAll: avgJobValue > 0 ? estimatedValue(leads.length, avgJobValue, conversionRate) : null,
    avgJobValue,
    conversionRate,
    fee,
    timesBack: fee > 0 && wonValue > 0 ? wonValue / fee : null,
    funnel,
  };
}

// Leads nobody has called back yet, most urgent first, then oldest first.
// A lead is overdue once the call-back time Elliot promised the caller has passed.
export function callbackList(calls, now = new Date(), client = {}) {
  return calls
    .filter((c) => isLead(c) && statusOf(c) === 'new')
    .map((c) => {
      const ageHours = (now - new Date(c.call_started_at)) / 3600000;
      const due = dueAt(c, client);
      return { ...c, ageHours, dueAt: due, overdue: now >= due };
    })
    .sort((a, b) => rankOf(a.urgency) - rankOf(b.urgency) || b.ageHours - a.ageHours);
}

// "14 Banksia St, Newtown NSW 2042" -> "Newtown"
export function suburbOf(address) {
  if (!address) return null;
  const parts = String(address).split(',').map((p) => p.trim()).filter(Boolean);
  // The first part is the street; look backwards for the first part that is a place name.
  for (let i = parts.length - 1; i >= 1; i--) {
    const place = parts[i]
      .replace(/\b(NSW|VIC|QLD|SA|WA|TAS|NT|ACT)\b/gi, '')
      .replace(/\b\d{4}\b/g, '')
      .replace(/\bAustralia\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (place && !/^\d/.test(place)) return place.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
  }
  return null;
}

// Prefer the job type Elliot tagged; fall back to a tidied version of the issue.
export function jobTypeOf(call) {
  const raw = call.job_type || call.issue;
  if (!raw) return null;
  const text = String(raw).trim().replace(/\s+/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

export function topCounts(items, n = 6) {
  const counts = new Map();
  for (const item of items) if (item) counts.set(item, (counts.get(item) ?? 0) + 1);
  return [...counts.entries()]
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, n);
}

export const TIME_BLOCKS = [
  { label: 'Early', sub: 'before 9am', from: 0, to: 9 },
  { label: 'Morning', sub: '9–12', from: 9, to: 12 },
  { label: 'Arvo', sub: '12–3', from: 12, to: 15 },
  { label: 'Late arvo', sub: '3–6', from: 15, to: 18 },
  { label: 'Evening', sub: 'after 6pm', from: 18, to: 24 },
];
export const HEATMAP_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// 7 rows (Mon..Sun) x 5 time blocks of call counts, in the business's timezone.
export function busiestTimes(calls, timeZone = DEFAULT_TZ) {
  const grid = HEATMAP_DAYS.map(() => TIME_BLOCKS.map(() => 0));
  for (const c of calls) {
    const p = zonedParts(new Date(c.call_started_at), timeZone);
    const row = (p.dayIndex + 6) % 7;
    const col = TIME_BLOCKS.findIndex((b) => p.hour >= b.from && p.hour < b.to);
    if (col >= 0) grid[row][col] += 1;
  }
  return grid;
}

// Group calls into customers by phone number (falling back to name).
export function customersFrom(calls) {
  const byKey = new Map();
  const sorted = [...calls].sort((a, b) => new Date(b.call_started_at) - new Date(a.call_started_at));
  for (const call of sorted) {
    if (!isLead(call)) continue; // spam, wrong numbers and hang-ups aren't customers
    const key = normalisePhone(call.callback_number) || (call.caller_name ? `name:${call.caller_name.toLowerCase()}` : null);
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        name: null,
        phone: call.callback_number ?? null,
        address: null,
        calls: [],
        wonValue: 0,
        lastContact: call.call_started_at,
      });
    }
    const customer = byKey.get(key);
    customer.calls.push(call);
    customer.name ??= call.caller_name || null;
    customer.address ??= call.address || null;
    if (statusOf(call) === 'won') customer.wonValue += Number(call.won_value) || 0;
  }
  return [...byKey.values()].map((c) => ({ ...c, suburb: suburbOf(c.address), repeat: c.calls.length > 1 }));
}

// How many calls each phone number has made (for "Repeat caller" badges).
export function callsPerPhone(calls) {
  const counts = new Map();
  for (const c of calls) {
    const key = normalisePhone(c.callback_number);
    if (key && isLead(c)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
}

// Month-by-month totals for the last `months` months (oldest first), in the viewer's time.
export function monthlyTotals(calls, now = new Date(), months = 12) {
  const rows = [];
  for (let i = months - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const inMonth = (iso) => iso && new Date(iso) >= start && new Date(iso) < end;
    const monthCalls = calls.filter((c) => inMonth(c.call_started_at));
    const won = calls.filter((c) => statusOf(c) === 'won' && inMonth(c.status_updated_at ?? c.call_started_at));
    rows.push({
      start,
      label: start.toLocaleDateString('en-AU', { month: 'short', year: '2-digit' }),
      calls: monthCalls.length,
      leads: monthCalls.filter(isLead).length,
      won: won.length,
      wonValue: won.reduce((sum, c) => sum + (Number(c.won_value) || 0), 0),
    });
  }
  return rows;
}
