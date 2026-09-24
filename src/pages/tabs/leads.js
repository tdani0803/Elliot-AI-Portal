// Leads: every call as a lead card with a simple status pipeline.
import { formatDuration, formatWhen } from '../../lib/format.js';
import { jobLabel, shortDetails } from '../../lib/jobs.js';
import { STATUSES, bookingFinder, callsPerPhone, isLead, normalisePhone, statusOf, suburbOf } from '../../lib/insights.js';
import { dueAt } from '../../lib/promise.js';
import { ICONS, esc, pickBar, firstName, mapsHref, money, shortTime, smsHref, statusPill, telHref, timeAgo, urgencyPill } from './bits.js';

// The chips along the top. Booked callers get their own chip, since they don't need a call back.
const filtersFor = (bookingOf) => [
  { id: 'new', label: 'To call', test: (c) => isLead(c) && statusOf(c) === 'new' && !bookingOf(c) },
  { id: 'booked', label: 'Booked', test: (c) => isLead(c) && Boolean(bookingOf(c)) },
  { id: 'called_back', label: 'Called', test: (c) => isLead(c) && statusOf(c) === 'called_back' },
  { id: 'won', label: 'Got the job', test: (c) => isLead(c) && statusOf(c) === 'won' },
  { id: 'lost', label: 'No job', test: (c) => isLead(c) && statusOf(c) === 'lost' },
  { id: 'spam', label: 'Spam', test: (c) => !isLead(c) },
  { id: 'all', label: 'All', test: () => true },
];

function matches(call, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const digits = q.replace(/\D/g, '');
  return (
    [call.caller_name, call.issue, call.address, call.job_type, jobLabel(call), suburbOf(call.address)].some((v) => v && v.toLowerCase().includes(q)) ||
    (digits.length >= 3 && String(call.callback_number ?? '').replace(/\D/g, '').includes(digits))
  );
}

function statusButtons(call) {
  const current = statusOf(call);
  return `<div class="status-row" role="group" aria-label="Lead status">${STATUSES.map(
    (s) =>
      `<button type="button" class="status-btn status-btn--${s.id}" data-action="set-status" data-id="${call.id}" data-status="${s.id}" aria-pressed="${s.id === current}">${s.short}</button>`,
  ).join('')}</div>`;
}

function dueBadge(call, client) {
  const due = dueAt(call, client);
  return new Date() >= due ? '<strong class="overdue">Overdue</strong>' : `<span class="due">Call by ${shortTime(due)}</span>`;
}

// Name, job, one line of detail and status: the top of every call card.
const bookedText = (b) => {
  const d = new Date(b.starts_at);
  return `Booked ${d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}, ${shortTime(d)}`;
};

function cardHead(call, lead, pro, client, timesCalled, booking = null) {
  return `
        <span class="call__top">
          <span class="call__name">${esc(call.caller_name) || 'Unknown caller'}</span>
          ${lead ? urgencyPill(call.urgency) : '<span class="pill pill--irrelevant">Spam</span>'}
        </span>
        <span class="call__job">${esc(jobLabel(call) ?? 'Hung up')}</span>
        ${shortDetails(call) ? `<span class="call__short">${esc(shortDetails(call))}</span>` : ''}
        <span class="call__meta">
          <span>${timeAgo(call.call_started_at)}</span>
          ${booking ? `<span class="tag tag--green">${bookedText(booking)}</span>` : pro && lead ? (statusOf(call) === 'new' ? dueBadge(call, client) : statusPill(call)) : ''}
          ${call.won_value && statusOf(call) === 'won' ? `<span class="won-amount">${money(call.won_value)}</span>` : ''}
          ${timesCalled > 1 ? `<span class="pill pill--repeat">Rang ${timesCalled} times</span>` : ''}
        </span>`;
}

// Delete mode: the same card as a tick box.
function pickCard(call, state, repeats, bookingOf) {
  const lead = isLead(call);
  const timesCalled = repeats.get(normalisePhone(call.callback_number)) ?? 0;
  const picked = state.picked.has(call.id);
  return `<li><label class="call pick-card${picked ? ' is-picked' : ''}">
    <input type="checkbox" class="pick-card__box" data-action="pick" value="${call.id}" ${picked ? 'checked' : ''} />
    <span class="pick-card__body">${cardHead(call, lead, state.pro, state.client, timesCalled, bookingOf(call))}</span>
  </label></li>`;
}

function leadCard(call, { members, client, pro }, repeats, bookingOf) {
  const lead = isLead(call);
  const booking = bookingOf(call);
  const timesCalled = repeats.get(normalisePhone(call.callback_number)) ?? 0;
  const phone = call.callback_number;
  const reviewText = client.review_url
    ? `Hi ${firstName(call.caller_name) || 'there'}, thanks for choosing ${client.business_name}! If you were happy with the job, would you mind leaving us a quick review? ${client.review_url}`
    : '';
  const followUpText = `Hi ${firstName(call.caller_name) || 'there'}, it's ${client.business_name} following up about your ${(jobLabel(call) ?? 'job').toLowerCase()}. When suits for a chat?`;

  const actions = [
    phone && `<a class="btn btn--small" href="${telHref(phone)}">${ICONS.phone}Call</a>`,
    phone && `<a class="btn btn--small btn--ghost" href="${smsHref(phone, followUpText)}">${ICONS.text}Text</a>`,
    pro && lead && !booking && `<button class="btn btn--small btn--ghost" type="button" data-action="book-from-lead" data-id="${call.id}">${ICONS.plus}Book job</button>`,
    pro && lead && statusOf(call) === 'won' && phone && reviewText &&
      `<a class="btn btn--small btn--ghost" href="${smsHref(phone, reviewText)}">${ICONS.star}Ask for review</a>`,
  ].filter(Boolean);

  const wonBox =
    pro && statusOf(call) === 'won'
      ? `<form class="inline-form" data-action="save-won" data-id="${call.id}">
          <label for="won-${call.id}">What was the job worth?</label>
          <div class="inline-form__row">
            <span class="prefix">$</span>
            <input id="won-${call.id}" name="value" type="number" inputmode="decimal" min="0" step="1" value="${call.won_value ?? ''}" placeholder="${Math.round(client.avg_job_value || 0) || ''}" />
            <button class="btn btn--small" type="submit">Save</button>
          </div>
        </form>`
      : '';

  const assign =
    pro && lead && members.length
      ? `<label class="field-inline">Who's on it?
          <select data-action="assign" data-id="${call.id}">
            <option value="">Nobody yet</option>
            ${members.map((m) => `<option ${m.display_name === call.assigned_to ? 'selected' : ''}>${esc(m.display_name)}</option>`).join('')}
          </select>
        </label>`
      : '';

  return `<li>
    <details class="call" data-id="${call.id}">
      <summary>
${cardHead(call, lead, pro, client, timesCalled, booking)}
      </summary>
      <div class="call__body">
        ${actions.length ? `<div class="call__actions">${actions.join('')}</div>` : ''}
        ${pro && lead ? statusButtons(call) : ''}
        ${wonBox}
        <dl>
          ${booking ? `<div><dt>Booked in</dt><dd><a href="#jobs">${bookedText(booking).replace('Booked ', '')}</a> · ${esc(booking.job)}</dd></div>` : ''}
          <div><dt>Phone</dt><dd>${phone ? `<a href="${telHref(phone)}">${esc(phone)}</a>` : 'Not given'}</dd></div>
          <div><dt>Address</dt><dd>${call.address ? `<a href="${mapsHref(call.address)}" target="_blank" rel="noopener">${esc(call.address)}</a>` : 'Not given'}</dd></div>
          <div><dt>What they said</dt><dd>${esc(call.summary || call.details || call.issue) || 'Nothing written down'}</dd></div>
        </dl>
        <details class="more">
          <summary>More</summary>
          <div class="more__body">
            <p class="muted">${formatWhen(call.call_started_at)} · ${formatDuration(call.duration_seconds ?? 0)} call</p>
            ${call.details && call.summary ? `<p><strong>Details:</strong> ${esc(call.details)}</p>` : ''}
            ${
              call.recording_url
                ? `<div class="recording-wrap">
                    <audio class="recording" controls preload="none" src="${esc(call.recording_url)}" data-recording></audio>
                    <a class="link-button recording-link" href="${esc(call.recording_url)}" target="_blank" rel="noopener">Play recording in a new tab</a>
                  </div>`
                : ''
            }
            ${assign}
            ${
              pro
                ? `<label class="field-inline field-inline--block">Notes
                    <textarea data-action="save-notes" data-id="${call.id}" rows="2" placeholder="e.g. Quote sent, call back Friday">${esc(call.notes ?? '')}</textarea>
                  </label>
                  <div class="transcript" data-transcript="${call.id}">
                    <button class="link-button" type="button" data-action="load-transcript" data-id="${call.id}">Show full conversation</button>
                  </div>`
                : ''
            }
            <button class="link-button link-button--danger" type="button" data-action="delete-call" data-id="${call.id}">Delete this call</button>
          </div>
        </details>
      </div>
    </details>
  </li>`;
}

export function render({ state }) {
  const bookingOf = bookingFinder(state.bookings);
  const FILTERS = filtersFor(bookingOf);
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, state.calls.filter(f.test).length]));
  // Before the database upgrade there are no statuses, so only offer All / Spam. Empty extra chips stay hidden.
  const available = (state.pro ? FILTERS : FILTERS.filter((f) => ['all', 'spam'].includes(f.id))).filter(
    (f) => counts[f.id] || ['new', 'all'].includes(f.id) || f.id === state.leadFilter,
  );
  const filter = available.find((f) => f.id === state.leadFilter) ?? available.find((f) => f.id === (state.pro ? 'new' : 'all'));
  // Cards you just changed stay put until you switch filters, so they don't vanish mid-edit.
  const visible = state.calls.filter((c) => filter.test(c) || state.sticky.has(c.id)).filter((c) => matches(c, state.leadSearch));
  const shown = visible.slice(0, state.leadLimit);
  const repeats = callsPerPhone(state.calls);
  const picking = state.picking === 'calls';

  const chips = available
    .map(
      (f) =>
        `<button type="button" class="chip" data-action="lead-filter" data-filter="${f.id}" aria-pressed="${f.id === filter.id}">${f.label} <span class="chip__count">${counts[f.id]}</span></button>`,
    )
    .join('');

  const emptyText = {
    new: ['Nobody to call back ✅', 'Every lead has been called. Nice work.'],
    won: ['No jobs yet', 'Open a lead and tap <strong>Got the job</strong> when you win it.'],
  }[filter.id] ?? ['Nothing here', 'Leads will show up here as Elliot answers calls.'];

  return `
    <section class="page-head page-head--row">
      <div>
        <h1 class="page-title">Calls</h1>
        <p class="hello__sub">Tap a person to see details and call them.</p>
      </div>
      ${picking ? '' : `<button class="btn btn--small btn--ghost" type="button" data-action="start-pick" data-kind="calls">${ICONS.trash}Delete</button>`}
    </section>
    <div class="chips" role="group" aria-label="Show">${chips}</div>
    <label class="search"><span class="visually-hidden">Search calls</span>
      <input id="lead-search" type="search" data-action="search-leads" placeholder="Search name, phone or job" value="${esc(state.leadSearch)}" />
    </label>
    ${picking ? pickBar(state, shown.length, 'call') : ''}
    <ul class="call-list">
      ${
        shown.length
          ? shown.map((c) => (picking ? pickCard(c, state, repeats, bookingOf) : leadCard(c, state, repeats, bookingOf))).join('')
          : `<li class="card empty"><strong>${emptyText[0]}</strong>${emptyText[1]}</li>`
      }
    </ul>
    ${visible.length > shown.length ? `<button class="btn btn--ghost btn--block" type="button" data-action="more-leads">Show more (${visible.length - shown.length} left)</button>` : ''}
    ${!picking && shown.length ? '<p class="swipe-hint">Tip: swipe a call right once you’ve called them, or left to delete it.</p>' : ''}`;
}
