// Small HTML helpers shared by the dashboard tabs.
import { URGENCY_LABELS, UNTAGGED_LABEL, escapeHtml, formatMoney } from '../../lib/format.js';
import { RANGES } from '../../lib/metrics.js';
import { STATUSES, statusOf } from '../../lib/insights.js';

export const esc = escapeHtml;
export const money = (n) => formatMoney(Number(n) || 0);

export const telHref = (phone) => (phone ? `tel:${String(phone).replace(/[^\d+]/g, '')}` : null);
export const smsHref = (phone, body = '') =>
  phone ? `sms:${String(phone).replace(/[^\d+]/g, '')}${body ? `?&body=${encodeURIComponent(body)}` : ''}` : null;
export const mapsHref = (address) => (address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : null);

// 14:00 -> "2pm", 9:30 -> "9:30am"
export const shortTime = (d) =>
  new Date(d)
    .toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' })
    .replace(':00', '')
    .replace(/\s*([ap])\.?m\.?/i, (_, x) => `${x.toLowerCase()}m`);

export const firstName = (name) => (name ? String(name).trim().split(/\s+/)[0] : '');

export function urgencyPill(urgency) {
  const key = urgency ?? 'unknown';
  return `<span class="pill pill--${key}">${URGENCY_LABELS[urgency] ?? UNTAGGED_LABEL}</span>`;
}

export function statusPill(call) {
  const status = statusOf(call);
  const label = STATUSES.find((s) => s.id === status)?.label ?? status;
  return `<span class="pill pill--status pill--${status}">${label}</span>`;
}

export function timeAgo(iso, now = new Date()) {
  const mins = Math.round((now - new Date(iso)) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function rangeToggle(current) {
  return `<div class="range" role="group" aria-label="Date range">${RANGES.map(
    (r) => `<button type="button" data-action="set-range" data-range="${r.id}" aria-pressed="${r.id === current}">${r.label}</button>`,
  ).join('')}</div>`;
}

export function emptyCard(title, text) {
  return `<div class="card empty"><strong>${title}</strong>${text}</div>`;
}

// Horizontal bars for "top N" lists. Labels and counts are text, the bar is decoration.
export function barList(items, { total, format = (n) => n } = {}) {
  if (!items.length) return '<p class="muted">Nothing to show yet.</p>';
  const max = Math.max(...items.map((i) => i.count));
  return `<ul class="bars">${items
    .map((i) => {
      const pct = total ? ` <span class="muted">(${Math.round((i.count / total) * 100)}%)</span>` : '';
      return `<li class="bars__row">
        <span class="bars__label">${esc(i.label)}</span>
        <span class="bars__track"><span class="bars__fill" style="width:${Math.max(4, (i.count / max) * 100)}%"></span></span>
        <span class="bars__value">${format(i.count)}${pct}</span>
      </li>`;
    })
    .join('')}</ul>`;
}

// The bar shown while choosing things to delete. `noun` is "call" or "customer".
export function pickBar(state, shownCount, noun) {
  const n = state.picked.size;
  return `<div class="pick-bar" role="region" aria-label="Delete">
    <p class="pick-bar__hint">${n ? `<strong>${n}</strong> ${noun}${n === 1 ? '' : 's'} ticked` : `Tick the ${noun}s you want to delete.`}</p>
    <div class="pick-bar__actions">
      <button class="btn btn--small btn--ghost" type="button" data-action="pick-all">${n && n === shownCount ? 'Untick all' : 'Tick all'}</button>
      <button class="btn btn--small btn--ghost" type="button" data-action="stop-pick">Cancel</button>
      <button class="btn btn--small btn--danger" type="button" data-action="delete-picked" ${n ? '' : 'disabled'}>${ICONS.trash}Delete${n ? ` ${n}` : ''}</button>
    </div>
  </div>`;
}

export const ICONS = {
  phone: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>',
  text: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 5 5L20 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  pin: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>',
  star: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  trash: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
  print: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z"/></svg>',
};
