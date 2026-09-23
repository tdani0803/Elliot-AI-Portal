// Pure dashboard maths — no DOM, no network — so it can be unit-tested.

export const RANGES = [
  { id: 'week', label: 'This Week' },
  { id: 'month', label: 'This Month' },
  { id: 'all', label: 'All Time' },
];

export const LEAD_URGENCIES = ['urgent', 'somewhat_urgent', 'non_urgent'];

// Start of the range in the viewer's local time (weeks start Monday). null = all time.
export function rangeStart(range, now = new Date()) {
  if (range === 'all') return null;
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'week') start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  else if (range === 'month') start.setDate(1);
  else throw new Error(`Unknown range: ${range}`);
  return start;
}

// Same shape as the dashboard_stats() SQL function, computed in JS (used by demo mode).
export function aggregateCalls(calls, since = null) {
  const inRange = since ? calls.filter((c) => new Date(c.call_started_at) >= since) : calls;
  const count = (u) => inRange.filter((c) => c.urgency === u).length;
  return {
    calls_handled: inRange.length,
    total_seconds: inRange.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0),
    leads_captured: inRange.filter((c) => LEAD_URGENCIES.includes(c.urgency)).length,
    urgent: count('urgent'),
    somewhat_urgent: count('somewhat_urgent'),
    non_urgent: count('non_urgent'),
  };
}

// Estimated Value = Leads Captured × Average Job Value × Assumed Conversion Rate.
// Deliberately conservative; always shown with its assumptions, never as fact.
export function estimatedValue(leads, avgJobValue, conversionRate) {
  return Number(leads) * Number(avgJobValue) * Number(conversionRate);
}

export function summarise(stats, client) {
  const calls = Number(stats.calls_handled) || 0;
  const totalSeconds = Number(stats.total_seconds) || 0;
  const leads = Number(stats.leads_captured) || 0;
  const avgJobValue = Number(client.avg_job_value) || 0;
  const conversionRate = Number(client.conversion_rate) || 0.3;
  return {
    calls,
    totalSeconds,
    avgSeconds: calls ? totalSeconds / calls : 0,
    leads,
    urgency: {
      urgent: Number(stats.urgent) || 0,
      somewhat_urgent: Number(stats.somewhat_urgent) || 0,
      non_urgent: Number(stats.non_urgent) || 0,
    },
    avgJobValue,
    conversionRate,
    value: avgJobValue > 0 ? estimatedValue(leads, avgJobValue, conversionRate) : null,
  };
}
