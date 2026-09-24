const money = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 });
const number = new Intl.NumberFormat('en-AU');

export const formatMoney = (n) => money.format(Math.round(n));
export const formatNumber = (n) => number.format(n);
export const formatPercent = (rate) => `${Math.round(rate * 100)}%`;

// 0 -> "0 min", 95 -> "1 min 35 sec", 3725 -> "62 min"
export function formatDuration(seconds) {
  const s = Math.round(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins === 0) return `${secs} sec`;
  if (mins >= 10 || secs === 0) return `${Math.round(s / 60)} min`;
  return `${mins} min ${secs} sec`;
}

// Compact version for the stat tile: 213 -> "3m 33s"
export function formatDurationShort(seconds) {
  const s = Math.round(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  if (mins === 0) return `${secs}s`;
  return secs && mins < 10 ? `${mins}m ${secs}s` : `${Math.round(s / 60)}m`;
}

export function formatMinutes(seconds) {
  return formatNumber(Math.round(seconds / 60));
}

export function formatWhen(iso, now = new Date()) {
  const d = new Date(iso);
  const time = d.toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' });
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayDiff = Math.round((startOfToday - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  if (dayDiff === 0) return `Today, ${time}`;
  if (dayDiff === 1) return `Yesterday, ${time}`;
  if (dayDiff < 7) return `${d.toLocaleDateString('en-AU', { weekday: 'long' })}, ${time}`;
  return `${d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}, ${time}`;
}

export const URGENCY_LABELS = {
  urgent: 'Urgent',
  somewhat_urgent: 'Somewhat urgent',
  non_urgent: 'Non-urgent',
  irrelevant: 'Not a job',
};
export const UNTAGGED_LABEL = 'New call';

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
}
