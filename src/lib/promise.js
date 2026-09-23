// The call-back promise: what Elliot tells callers, and when a lead becomes overdue.
// Used by the dashboard, the phone notification and the backup text so they always match.

export const DEFAULT_PROMISE = { urgent: 60, standard: 240 };

export function promiseMinutes(urgency, client = {}) {
  return urgency === 'urgent'
    ? Number(client.callback_urgent_minutes) || DEFAULT_PROMISE.urgent
    : Number(client.callback_standard_minutes) || DEFAULT_PROMISE.standard;
}

// 30 -> "within 30 minutes", 60 -> "within 1 hour", 90 -> "within 90 minutes", 240 -> "within 4 hours"
export function promisePhrase(minutes) {
  const m = Math.round(Number(minutes) || 0);
  if (m <= 0) return 'soon';
  if (m % 60 !== 0 || m < 60) return `within ${m} minutes`;
  const hours = m / 60;
  return `within ${hours} hour${hours === 1 ? '' : 's'}`;
}

export function dueAt(call, client) {
  return new Date(new Date(call.call_started_at).getTime() + promiseMinutes(call.urgency, client) * 60000);
}
