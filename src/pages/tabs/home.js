// Home: the 5-second scoreboard. Money, who to call back, the headline numbers, next job.
import { formatMinutes, formatNumber, formatPercent } from '../../lib/format.js';
import { RANGES } from '../../lib/metrics.js';
import { callbackList, summariseRange } from '../../lib/insights.js';
import { ICONS, esc, money, rangeToggle, shortTime, telHref, timeAgo, urgencyPill } from './bits.js';

function moneyCard(s, rangeLabel) {
  const assumptions = s.avgJobValue
    ? `based on your average job value (${money(s.avgJobValue)}) and a ${formatPercent(s.conversionRate)} typical conversion rate — not a guarantee`
    : null;

  if (s.won.count > 0) {
    const times = s.timesBack && s.timesBack >= 1 ? ` That's <strong>${Math.floor(s.timesBack)}×</strong> what Elliot costs you.` : '';
    const inPlay =
      s.open.count && s.open.estimate
        ? `<p class="hero__saved">Plus about <strong>${money(s.open.estimate)}</strong> still in play from ${s.open.count} open lead${s.open.count === 1 ? '' : 's'}.</p>`
        : '';
    return `<section class="card hero" aria-label="Money">
      <span class="hero__label">Money won from Elliot's calls</span>
      <span class="hero__value">${money(s.won.value)}</span>
      <p class="hero__line">${s.won.count} job${s.won.count === 1 ? '' : 's'} won ${rangeLabel}.${times}</p>
      ${inPlay}
      <p class="hero__fineprint">"Won" is the jobs you marked as Won in Leads.${assumptions && inPlay ? ` "In play" is an estimate ${assumptions}.` : ''}</p>
    </section>`;
  }

  if (s.estimateAll == null) {
    return `<section class="card hero" aria-label="Money">
      <span class="hero__label">Estimated value captured</span>
      <span class="hero__value">–</span>
      <p class="hero__saved">We haven't set your average job value yet. Give us a call and we'll add it.</p>
    </section>`;
  }
  return `<section class="card hero" aria-label="Money">
    <span class="hero__label">Estimated value captured</span>
    <span class="hero__value">${money(s.estimateAll)}</span>
    <p class="hero__saved">Money saved: <strong>~${money(s.estimateAll)}</strong> — what you'd likely have lost if these calls went unanswered.</p>
    <p class="hero__fineprint">Estimate ${assumptions}. Tip: mark jobs as <strong>Won</strong> in Leads to see real money here.</p>
  </section>`;
}

function callbackCard(list) {
  if (list.length === 0) {
    return `<section class="card todo todo--done">
      <h2 class="section-title">All caught up ✅</h2>
      <p class="muted">Nobody is waiting on a call back.</p>
    </section>`;
  }
  const items = list
    .slice(0, 3)
    .map(
      (c) => `<li class="todo__item${c.overdue ? ' todo__item--overdue' : ''}">
        <div class="todo__text">
          <span class="todo__name">${esc(c.caller_name) || 'Unknown caller'} ${urgencyPill(c.urgency)}</span>
          <span class="todo__issue">${esc(c.issue) || 'No reason given'}</span>
          <span class="todo__meta">${c.overdue ? '⏰ Waiting ' : 'Called '}${timeAgo(c.call_started_at)}</span>
        </div>
        <div class="todo__actions">
          ${c.callback_number ? `<a class="btn btn--small" href="${telHref(c.callback_number)}">${ICONS.phone}Call</a>` : ''}
          <button class="btn btn--small btn--ghost" type="button" data-action="mark-called" data-id="${c.id}">${ICONS.check}Done</button>
        </div>
      </li>`,
    )
    .join('');
  return `<section class="card todo" aria-labelledby="todo-title">
    <div class="todo__head">
      <h2 class="section-title" id="todo-title">Call these people back</h2>
      <span class="count-badge">${list.length}</span>
    </div>
    <ul class="todo__list">${items}</ul>
    ${list.length > 3 ? `<a class="link-more" href="#leads">See all ${list.length} →</a>` : ''}
  </section>`;
}

function nextJobCard(bookings, now) {
  const next = bookings
    .filter((b) => b.status === 'booked' && new Date(b.starts_at) >= new Date(now.getTime() - 3600000))
    .sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))[0];
  if (!next) {
    return `<section class="card next-job">
      <span class="stat__label">Next job</span>
      <p class="muted">Nothing booked yet.</p>
      <button class="btn btn--small" type="button" data-action="new-booking">${ICONS.plus}Book a job</button>
    </section>`;
  }
  const when = new Date(next.starts_at);
  const day = when.toDateString() === now.toDateString() ? 'Today' : when.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'short' });
  const time = shortTime(when);
  return `<section class="card next-job">
    <span class="stat__label">Next job</span>
    <strong class="next-job__when">${day}, ${time}</strong>
    <span class="next-job__what">${esc(next.job)}${next.customer_name ? ` · ${esc(next.customer_name)}` : ''}</span>
    ${next.address ? `<span class="muted">${esc(next.address)}</span>` : ''}
    <a class="link-more" href="#jobs">All jobs →</a>
  </section>`;
}

export function render({ state, since, now }) {
  const rangeLabel = RANGES.find((r) => r.id === state.range).label.toLowerCase();
  const s = summariseRange({ calls: state.calls, client: state.client, since, range: state.range, now });
  const list = callbackList(state.calls, now);

  return `
    <section class="hello">
      <h1 class="hello__business">${esc(state.client.business_name)}</h1>
      <p class="hello__sub">Here's how Elliot is going for you.</p>
    </section>
    ${rangeToggle(state.range)}
    ${moneyCard(s, rangeLabel)}
    ${state.pro ? callbackCard(list) : ''}
    <section class="stats" aria-label="Call numbers">
      <div class="card stat">
        <span class="stat__label">Calls answered</span>
        <span class="stat__value">${formatNumber(s.calls)}</span>
        <span class="stat__hint">Picked up by Elliot</span>
      </div>
      <div class="card stat">
        <span class="stat__label">Leads captured</span>
        <span class="stat__value">${formatNumber(s.leads)}</span>
        <span class="stat__hint">Real jobs, not spam</span>
      </div>
      <div class="card stat">
        <span class="stat__label">After-hours calls</span>
        <span class="stat__value">${formatNumber(s.afterHours)}</span>
        <span class="stat__hint">While you were closed</span>
      </div>
      <div class="card stat">
        <span class="stat__label">Time saved</span>
        <span class="stat__value">${formatMinutes(s.totalSeconds)}<small> min</small></span>
        <span class="stat__hint">Off your phone</span>
      </div>
    </section>
    ${state.pro ? nextJobCard(state.bookings, now) : ''}
    <p class="footer-note">Need something changed? Just call or text us — we'll sort it.</p>`;
}
