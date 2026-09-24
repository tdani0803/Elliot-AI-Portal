// Home: the dashboard. Key numbers, then calls, then booked jobs. Everything else is one tap away.
import { URGENCY_LABELS, formatNumber } from '../../lib/format.js';
import { callbackList, isLead, statusOf, suburbOf, summariseRange } from '../../lib/insights.js';
import { jobLabel } from '../../lib/jobs.js';
import { ICONS, esc, money, rangeToggle, shortTime, telHref, timeAgo } from './bits.js';

// Getting notifications set up: one slim strip until this phone is receiving them.
function alertsCard(status) {
  if (!status || status === 'on') return '';
  const bodies = {
    'install-ios': `<span><strong>Get a buzz for new calls.</strong> On iPhone, first add ElliotAI to your home screen.</span>
      <details class="strip__help"><summary>How</summary>
        <ol class="steps">
          <li>In <strong>Safari</strong>, tap <strong>Share</strong> (the square with an arrow).</li>
          <li>Tap <strong>Add to Home Screen</strong>, then <strong>Add</strong>.</li>
          <li>Open <strong>ElliotAI</strong> from your home screen, log in, and tap <strong>Turn on</strong> here.</li>
        </ol>
      </details>`,
    off: `<span><strong>Get a buzz for new calls.</strong></span>
      <button class="btn btn--small" type="button" data-action="enable-push">Turn on</button>
      <button class="btn btn--small btn--ghost" type="button" data-action="install-app" data-install hidden>Add to home screen</button>`,
    denied: `<span><strong>Notifications are blocked.</strong> Turn them on in your phone's Settings → Notifications → ElliotAI, then refresh.</span>`,
    unsupported: `<span>This browser can't show notifications. Use <strong>Chrome</strong> on Android or <strong>Safari</strong> on iPhone.</span>`,
  };
  return `<section class="strip" aria-label="Notifications">${bodies[status] ?? ''}</section>`;
}

function kpi(label, value, sub, extra = '') {
  return `<div class="kpi${extra}"><span class="kpi__label">${label}</span><span class="kpi__value">${value}</span><span class="kpi__sub">${sub}</span></div>`;
}

function kpiGrid(s, list) {
  const overdue = list.filter((c) => c.overdue).length;
  const moneyTile = s.won.count
    ? kpi('Money won', money(s.won.value), `${s.won.count} job${s.won.count === 1 ? '' : 's'} won`)
    : kpi('Est. value', s.estimateAll != null ? money(s.estimateAll) : '–', s.estimateAll != null ? 'From leads captured' : 'Set your job value');
  return `<section class="kpis" aria-label="Key numbers">
    ${kpi('Calls answered', formatNumber(s.calls), s.afterHours ? `${s.afterHours} after hours` : 'All picked up')}
    ${kpi('New leads', formatNumber(s.leads), s.calls ? `${Math.round((s.leads / s.calls) * 100)}% of calls` : 'Real jobs, not spam')}
    ${kpi('To call back', formatNumber(list.length), overdue ? `<strong class="overdue">${overdue} overdue</strong>` : 'All on time', list.length ? ' kpi--alert' : '')}
    ${moneyTile}
  </section>`;
}
function jobsSection(bookings, now) {
  const upcoming = bookings
    .filter((b) => b.status === 'booked' && new Date(b.starts_at) >= new Date(now.getTime() - 3600000))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at));
  const rows = upcoming.slice(0, 4).map((b) => {
    const d = new Date(b.starts_at);
    const today = d.toDateString() === now.toDateString();
    return `<li class="row">
      <span class="date-chip${today ? ' date-chip--today' : ''}"><small>${today ? 'Today' : d.toLocaleDateString('en-AU', { weekday: 'short' })}</small><b>${d.getDate()}</b></span>
      <span class="row__main"><strong>${esc(b.job)}</strong><span class="muted">${shortTime(d)}${b.customer_name ? ` · ${esc(b.customer_name)}` : ''}${b.address ? ` · ${esc(suburbOf(b.address) ?? '')}` : ''}</span></span>
    </li>`;
  });
  return `<section class="card dash" aria-labelledby="jobs-title">
    <div class="dash__head"><h2 class="dash__title" id="jobs-title">Booked jobs</h2><a href="#jobs">See all</a></div>
    ${
      rows.length
        ? `<ul class="rows">${rows.join('')}</ul>`
        : `<p class="muted dash__empty">No jobs booked yet.</p>`
    }
    <button class="btn btn--small btn--ghost dash__action" type="button" data-action="new-booking">${ICONS.plus}Book a job</button>
  </section>`;
}

function callState(c, due) {
  if (!isLead(c)) return '<span class="tag tag--muted">Spam</span>';
  const st = statusOf(c);
  if (st === 'new') return due?.overdue ? '<span class="tag tag--red">Overdue</span>' : '<span class="tag tag--amber">To call</span>';
  if (st === 'won') return '<span class="tag tag--green">Got the job</span>';
  if (st === 'lost') return '<span class="tag tag--muted">No job</span>';
  return '<span class="tag">Called</span>';
}

function callsSection(calls, list, now) {
  // People still waiting on a call back first, then everyone else, newest first.
  const waiting = new Map(list.map((c) => [c.id, c]));
  const rest = calls.filter((c) => !waiting.has(c.id));
  const shown = [...list, ...rest].slice(0, 6);
  const rows = shown.map((c) => {
    const due = waiting.get(c.id);
    return `<li class="row row--tap">
      <span class="dot dot--${isLead(c) ? c.urgency ?? 'unknown' : 'irrelevant'}" title="${esc(URGENCY_LABELS[c.urgency] ?? 'Not tagged')}"></span>
      <button type="button" class="row__main row__btn" data-action="open-lead" data-id="${c.id}">
        <strong>${esc(c.caller_name) || 'Unknown caller'}</strong>
        <span class="muted">${esc(jobLabel(c) ?? 'Hung up')} · ${timeAgo(c.call_started_at, now)}</span>
      </button>
      <span class="row__side">
        ${callState(c, due)}
        ${due && c.callback_number ? `<a class="icon-btn" href="${telHref(c.callback_number)}" aria-label="Call ${esc(c.caller_name) || 'them'}">${ICONS.phone}</a>` : ''}
      </span>
    </li>`;
  });
  return `<section class="card dash" aria-labelledby="calls-title">
    <div class="dash__head"><h2 class="dash__title" id="calls-title">Calls</h2><a href="#leads">See all</a></div>
    ${rows.length ? `<ul class="rows">${rows.join('')}</ul>` : '<p class="muted dash__empty">No calls yet. They’ll show up here the moment Elliot answers one.</p>'}
  </section>`;
}

export function render({ state, since, now }) {
  const s = summariseRange({ calls: state.calls, client: state.client, since, range: state.range, now });
  const list = state.pro ? callbackList(state.calls, now, state.client) : [];
  const today = now.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' });

  return `
    <section class="dash-top">
      <div>
        <h1 class="dash-top__name">${esc(state.client.business_name)}</h1>
        <p class="muted">${today}</p>
      </div>
      ${rangeToggle(state.range)}
    </section>
    ${state.alerts ? alertsCard(state.notify) : ''}
    ${kpiGrid(s, list)}
    <div class="dash-grid">
      ${callsSection(state.calls, list, now)}
      ${state.pro ? jobsSection(state.bookings ?? [], now) : ''}
    </div>
    ${state.alerts && state.notify === 'on' ? `<p class="footer-note">Notifications are on · <button class="link-button" type="button" data-action="test-push">Send a test</button></p>` : ''}`;
}
