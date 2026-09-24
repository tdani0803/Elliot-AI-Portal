// Leads: every call as a lead card with a simple status pipeline.
import { formatDuration, formatWhen } from '../../lib/format.js';
import { STATUSES, callsPerPhone, isLead, normalisePhone, statusOf, suburbOf } from '../../lib/insights.js';
import { dueAt } from '../../lib/promise.js';
import { ICONS, esc, firstName, mapsHref, money, shortTime, smsHref, statusPill, telHref, urgencyPill } from './bits.js';

export const FILTERS = [
  { id: 'new', label: 'Call back', test: (c) => isLead(c) && statusOf(c) === 'new' },
  { id: 'called_back', label: 'Called', test: (c) => isLead(c) && statusOf(c) === 'called_back' },
  { id: 'quoted', label: 'Quoted', test: (c) => isLead(c) && statusOf(c) === 'quoted' },
  { id: 'won', label: 'Won', test: (c) => isLead(c) && statusOf(c) === 'won' },
  { id: 'lost', label: 'Lost', test: (c) => isLead(c) && statusOf(c) === 'lost' },
  { id: 'spam', label: 'Not a job', test: (c) => !isLead(c) },
  { id: 'all', label: 'All', test: () => true },
];

function matches(call, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  const digits = q.replace(/\D/g, '');
  return (
    [call.caller_name, call.issue, call.address, call.job_type, suburbOf(call.address)].some((v) => v && v.toLowerCase().includes(q)) ||
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
  return new Date() >= due ? '<strong class="overdue">Overdue</strong>' : `<span>Call back by ${shortTime(due)}</span>`;
}

function leadCard(call, { members, client, pro }, repeats) {
  const lead = isLead(call);
  const timesCalled = repeats.get(normalisePhone(call.callback_number)) ?? 0;
  const phone = call.callback_number;
  const reviewText = client.review_url
    ? `Hi ${firstName(call.caller_name) || 'there'}, thanks for choosing ${client.business_name}! If you were happy with the job, would you mind leaving us a quick review? ${client.review_url}`
    : '';
  const followUpText = `Hi ${firstName(call.caller_name) || 'there'}, it's ${client.business_name} following up on your enquiry about ${call.issue ? call.issue.toLowerCase() : 'your job'}. When suits for a chat?`;

  const actions = [
    phone && `<a class="btn btn--small" href="${telHref(phone)}">${ICONS.phone}Call</a>`,
    phone && `<a class="btn btn--small btn--ghost" href="${smsHref(phone, followUpText)}">${ICONS.text}Text</a>`,
    pro && lead && `<button class="btn btn--small btn--ghost" type="button" data-action="book-from-lead" data-id="${call.id}">${ICONS.plus}Book job</button>`,
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
        <span class="call__top">
          <span class="call__name">${esc(call.caller_name) || 'Unknown caller'}</span>
          ${lead ? urgencyPill(call.urgency) : '<span class="pill pill--irrelevant">Not a job</span>'}
        </span>
        <span class="call__issue">${esc(call.issue) || 'No reason given'}</span>
        <span class="call__meta">
          <span>${formatWhen(call.call_started_at)}</span>
          <span>${formatDuration(call.duration_seconds ?? 0)} call</span>
          ${pro && lead ? statusPill(call) : ''}
          ${pro && lead && statusOf(call) === 'new' ? dueBadge(call, client) : ''}
          ${call.won_value && statusOf(call) === 'won' ? `<span class="won-amount">${money(call.won_value)}</span>` : ''}
          ${call.assigned_to ? `<span>👷 ${esc(call.assigned_to)}</span>` : ''}
          ${timesCalled > 1 ? `<span class="pill pill--repeat">Repeat caller · ${timesCalled} calls</span>` : ''}
        </span>
      </summary>
      <div class="call__body">
        ${call.summary ? `<p class="summary-box"><strong>Summary</strong>${esc(call.summary)}</p>` : ''}
        ${
          call.recording_url
            ? `<div class="recording-wrap">
                <audio class="recording" controls preload="none" src="${esc(call.recording_url)}" data-recording></audio>
                <a class="link-button recording-link" href="${esc(call.recording_url)}" target="_blank" rel="noopener">Play recording in a new tab</a>
              </div>`
            : ''
        }
        ${actions.length ? `<div class="call__actions">${actions.join('')}</div>` : ''}
        ${pro && lead ? statusButtons(call) : ''}
        ${wonBox}
        ${assign}
        <dl>
          <div><dt>Call back on</dt><dd>${phone ? `<a href="${telHref(phone)}">${esc(phone)}</a>` : 'Not given'}</dd></div>
          <div><dt>Address</dt><dd>${call.address ? `<a href="${mapsHref(call.address)}" target="_blank" rel="noopener">${esc(call.address)}</a>` : 'Not given'}</dd></div>
          <div><dt>What they said</dt><dd>${esc(call.details) || 'No extra details'}</dd></div>
        </dl>
        ${
          pro
            ? `<label class="field-inline field-inline--block">Notes
                <textarea data-action="save-notes" data-id="${call.id}" rows="2" placeholder="e.g. Quote sent, call back Friday">${esc(call.notes ?? '')}</textarea>
              </label>`
            : ''
        }
        <button class="link-button link-button--danger" type="button" data-action="delete-call" data-id="${call.id}">Delete this call</button>
        ${
          pro
            ? `<div class="transcript" data-transcript="${call.id}">
                <button class="link-button" type="button" data-action="load-transcript" data-id="${call.id}">Show full conversation</button>
              </div>`
            : ''
        }
      </div>
    </details>
  </li>`;
}

export function render({ state }) {
  const counts = Object.fromEntries(FILTERS.map((f) => [f.id, state.calls.filter(f.test).length]));
  // Before the database upgrade there are no statuses, so only offer All / Not a job.
  const available = state.pro ? FILTERS : FILTERS.filter((f) => ['all', 'spam'].includes(f.id));
  const filter = available.find((f) => f.id === state.leadFilter) ?? available.find((f) => f.id === (state.pro ? 'new' : 'all'));
  // Cards you just changed stay put until you switch filters, so they don't vanish mid-edit.
  const visible = state.calls.filter((c) => filter.test(c) || state.sticky.has(c.id)).filter((c) => matches(c, state.leadSearch));
  const shown = visible.slice(0, state.leadLimit);
  const repeats = callsPerPhone(state.calls);

  const chips = available
    .map(
      (f) =>
        `<button type="button" class="chip" data-action="lead-filter" data-filter="${f.id}" aria-pressed="${f.id === filter.id}">${f.label} <span class="chip__count">${counts[f.id]}</span></button>`,
    )
    .join('');

  const emptyText = {
    new: ['Nobody to call back ✅', 'Every lead has been called. Nice work.'],
    won: ['No won jobs yet', 'Open a lead and tap <strong>Won</strong> when you get the job.'],
  }[filter.id] ?? ['Nothing here', 'Leads will show up here as Elliot answers calls.'];

  return `
    <section class="page-head">
      <h1 class="page-title">Leads</h1>
      <p class="hello__sub">Everyone Elliot spoke to. Tap one to call, text or update it.</p>
    </section>
    <div class="chips" role="group" aria-label="Show">${chips}</div>
    <label class="search"><span class="visually-hidden">Search leads</span>
      <input id="lead-search" type="search" data-action="search-leads" placeholder="Search name, phone, suburb or job" value="${esc(state.leadSearch)}" />
    </label>
    <ul class="call-list">
      ${shown.length ? shown.map((c) => leadCard(c, state, repeats)).join('') : `<li class="card empty"><strong>${emptyText[0]}</strong>${emptyText[1]}</li>`}
    </ul>
    ${visible.length > shown.length ? `<button class="btn btn--ghost btn--block" type="button" data-action="more-leads">Show more (${visible.length - shown.length} left)</button>` : ''}`;
}
