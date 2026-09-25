// Jobs: a simple day-by-day list of bookings (manual or booked by Elliot on a call).
import { ICONS, emptyCard, esc, mapsHref, shortTime, telHref } from './bits.js';

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

function dayLabel(date, now) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = Math.round((that - today) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });
}

const timeText = shortTime;

function jobCard(b) {
  const start = new Date(b.starts_at);
  const end = new Date(start.getTime() + (b.duration_minutes ?? 60) * 60000);
  const badges = [
    b.source === 'elliot' ? '<span class="pill pill--elliot">Booked by Elliot</span>' : '',
    b.status === 'done' ? '<span class="pill pill--won">Done</span>' : '',
    b.status === 'cancelled' ? '<span class="pill pill--irrelevant">Cancelled</span>' : '',
    b.assigned_to ? `<span class="muted who">${ICONS.person}${esc(b.assigned_to)}</span>` : '',
  ].join('');
  return `<li class="card job${b.status !== 'booked' ? ' job--closed' : ''}">
    <div class="job__time"><strong>${timeText(start)}</strong><span>to ${timeText(end)}</span></div>
    <div class="job__main">
      <span class="job__what">${esc(b.job)}</span>
      ${b.customer_name ? `<span>${esc(b.customer_name)}</span>` : ''}
      ${b.address ? `<a class="muted" href="${mapsHref(b.address)}" target="_blank" rel="noopener">${ICONS.pin}${esc(b.address)}</a>` : ''}
      ${b.notes ? `<span class="muted">${esc(b.notes)}</span>` : ''}
      ${badges ? `<span class="job__badges">${badges}</span>` : ''}
      <span class="call__actions">
        ${b.phone ? `<a class="btn btn--small" href="${telHref(b.phone)}">${ICONS.phone}Call</a>` : ''}
        ${b.status === 'booked' ? `<button class="btn btn--small btn--ghost" type="button" data-action="booking-done" data-id="${b.id}">${ICONS.check}Done</button>` : ''}
        <button class="btn btn--small btn--ghost" type="button" data-action="edit-booking" data-id="${b.id}">Edit</button>
      </span>
    </div>
  </li>`;
}

function grouped(bookings, now) {
  const groups = new Map();
  for (const b of bookings) {
    const d = new Date(b.starts_at);
    const key = dayKey(d);
    if (!groups.has(key)) groups.set(key, { label: dayLabel(d, now), items: [] });
    groups.get(key).items.push(b);
  }
  return [...groups.values()]
    .map((g) => `<section class="day"><h2 class="day__title">${g.label}</h2><ul class="job-list">${g.items.map(jobCard).join('')}</ul></section>`)
    .join('');
}

export function render({ state, now }) {
  if (!state.pro) {
    return `<section class="page-head"><h1 class="page-title">Jobs</h1></section>
      ${emptyCard('Coming soon', 'Your jobs calendar is being switched on. Check back shortly.')}`;
  }
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const sorted = [...state.bookings].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const upcoming = sorted.filter((b) => new Date(b.starts_at) >= startOfToday && b.status !== 'cancelled');
  const past = sorted.filter((b) => new Date(b.starts_at) < startOfToday || b.status === 'cancelled').reverse();
  const byElliot = upcoming.filter((b) => b.source === 'elliot').length;

  return `
    <section class="page-head page-head--row">
      <div>
        <h1 class="page-title">Jobs</h1>
        <p class="hello__sub">${upcoming.length} coming up${byElliot ? ` · ${byElliot} booked by Elliot` : ''}</p>
      </div>
      <button class="btn" type="button" data-action="new-booking">${ICONS.plus}Book a job</button>
    </section>
    ${
      state.client.calendar_token
        ? `<button class="link-button link-button--icon" type="button" data-action="calendar-help">${ICONS.calendar}Show jobs in my phone's calendar</button>`
        : ''
    }
    ${upcoming.length ? grouped(upcoming, now) : emptyCard('No jobs booked yet', 'Tap <strong>Book a job</strong>, or open a lead and tap <strong>Book job</strong>.')}
    ${
      past.length
        ? `<details class="past"><summary class="btn btn--ghost btn--block">Past and cancelled jobs (${past.length})</summary>${grouped(past, now)}</details>`
        : ''
    }`;
}
