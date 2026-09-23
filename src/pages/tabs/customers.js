// Customers: everyone who has called, grouped by phone number, with their history.
import { formatWhen } from '../../lib/format.js';
import { customersFrom } from '../../lib/insights.js';
import { ICONS, emptyCard, esc, mapsHref, money, smsHref, statusPill, telHref } from './bits.js';

const LIMIT = 100;

function customerCard(c, pro) {
  const history = c.calls
    .map(
      (call) => `<li class="history__item">
        <span class="history__when">${formatWhen(call.call_started_at)}</span>
        <span class="history__what">${esc(call.issue) || 'No reason given'}</span>
        ${pro ? statusPill(call) : ''}
      </li>`,
    )
    .join('');
  return `<li>
    <details class="call" data-id="cust-${esc(c.key)}">
      <summary>
        <span class="call__top">
          <span class="call__name">${esc(c.name) || 'Unknown name'}</span>
          ${c.wonValue ? `<span class="won-amount">${money(c.wonValue)} won</span>` : ''}
        </span>
        <span class="call__meta">
          ${c.phone ? `<span>${esc(c.phone)}</span>` : ''}
          ${c.suburb ? `<span>${esc(c.suburb)}</span>` : ''}
          <span>${c.calls.length} call${c.calls.length === 1 ? '' : 's'}</span>
          ${c.repeat ? '<span class="pill pill--repeat">Repeat caller</span>' : ''}
        </span>
      </summary>
      <div class="call__body">
        <div class="call__actions">
          ${c.phone ? `<a class="btn btn--small" href="${telHref(c.phone)}">${ICONS.phone}Call</a>` : ''}
          ${c.phone ? `<a class="btn btn--small btn--ghost" href="${smsHref(c.phone)}">${ICONS.text}Text</a>` : ''}
          ${c.address ? `<a class="btn btn--small btn--ghost" href="${mapsHref(c.address)}" target="_blank" rel="noopener">${ICONS.pin}Map</a>` : ''}
        </div>
        ${c.address ? `<p class="muted">${esc(c.address)}</p>` : ''}
        <h3 class="mini-title">History</h3>
        <ul class="history">${history}</ul>
      </div>
    </details>
  </li>`;
}

export function render({ state }) {
  const all = customersFrom(state.calls);
  const q = state.customerSearch.trim().toLowerCase();
  const digits = q.replace(/\D/g, '');
  const filtered = q
    ? all.filter(
        (c) =>
          [c.name, c.address, c.suburb].some((v) => v && v.toLowerCase().includes(q)) ||
          (digits.length >= 3 && String(c.phone ?? '').replace(/\D/g, '').includes(digits)),
      )
    : all;
  const repeat = all.filter((c) => c.repeat).length;

  return `
    <section class="page-head">
      <h1 class="page-title">Customers</h1>
      <p class="hello__sub">${all.length} customer${all.length === 1 ? '' : 's'}${repeat ? ` · ${repeat} called more than once` : ''}</p>
    </section>
    <label class="search"><span class="visually-hidden">Search customers</span>
      <input id="customer-search" type="search" data-action="search-customers" placeholder="Search name, phone or suburb" value="${esc(state.customerSearch)}" />
    </label>
    ${
      filtered.length
        ? `<ul class="call-list">${filtered.slice(0, LIMIT).map((c) => customerCard(c, state.pro)).join('')}</ul>
           ${filtered.length > LIMIT ? `<p class="muted center">Showing ${LIMIT} of ${filtered.length}. Search to find someone.</p>` : ''}`
        : emptyCard(q ? 'No match' : 'No customers yet', q ? 'Try a different name, number or suburb.' : 'Everyone Elliot speaks to will be saved here.')
    }`;
}
