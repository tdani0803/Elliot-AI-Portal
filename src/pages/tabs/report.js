// Report: a plain, printable call report (fits a couple of A4 pages; Save as PDF prints it).
import { URGENCY_LABELS, formatDuration, formatMinutes, formatNumber, formatPercent } from '../../lib/format.js';
import { RANGES } from '../../lib/metrics.js';
import {
  HEATMAP_DAYS,
  TIME_BLOCKS,
  busiestTimes,
  customersFrom,
  isLead,
  jobTypeOf,
  monthlyTotals,
  suburbOf,
  summariseRange,
  topCounts,
} from '../../lib/insights.js';
import { ICONS, esc, money, rangeToggle } from './bits.js';

function headline(s, rangeLabel) {
  const parts = [`${rangeLabel.charAt(0).toUpperCase() + rangeLabel.slice(1)}, Elliot answered <strong>${formatNumber(s.calls)}</strong> call${s.calls === 1 ? '' : 's'}`];
  parts.push(`found <strong>${formatNumber(s.leads)}</strong> lead${s.leads === 1 ? '' : 's'}`);
  if (s.won.count) parts.push(`and you won <strong>${s.won.count}</strong> job${s.won.count === 1 ? '' : 's'} worth <strong>${money(s.won.value)}</strong>`);
  return `${parts.join(', ').replace(/, and/, ' and')}.`;
}

function heatmap(grid) {
  const max = Math.max(1, ...grid.flat());
  const head = TIME_BLOCKS.map((b) => `<th scope="col"><span>${b.label}</span><small>${b.sub}</small></th>`).join('');
  const rows = grid
    .map(
      (row, i) =>
        `<tr><th scope="row">${HEATMAP_DAYS[i]}</th>${row
          .map((n, j) => {
            const level = n === 0 ? 0 : Math.ceil((n / max) * 4);
            return `<td class="heat heat--${level}" title="${HEATMAP_DAYS[i]} ${TIME_BLOCKS[j].label}: ${n} call${n === 1 ? '' : 's'}">${n || ''}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');
  return `<div class="heatmap-wrap"><table class="heatmap"><thead><tr><td></td>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
}

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : '–');
const dateText = (d) => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });

function table(head, rows, { className = '' } = {}) {
  if (!rows.length) return '<p class="muted">Nothing yet.</p>';
  return `<table class="doc-table ${className}"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr${r.className ? ` class="${r.className}"` : ''}>${r.cells.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table>`;
}

function monthTable(rows) {
  // Start from the first month with any calls, so a new client doesn't see a wall of zeros.
  const first = rows.findIndex((r) => r.calls > 0);
  if (first === -1) return '<p class="muted">Your months will fill in here as calls come in.</p>';
  const shown = rows.slice(Math.min(first, rows.length - 3));
  const byMoney = shown.some((r) => r.wonValue > 0);
  const score = byMoney ? (r) => r.wonValue : (r) => r.leads;
  const active = shown.filter((r) => r.calls > 0);
  const best = active.reduce((a, b) => (score(b) > score(a) ? b : a));
  const worst = active.length > 1 ? active.reduce((a, b) => (score(b) < score(a) ? b : a)) : null;
  const max = Math.max(1, ...shown.map(score));
  const long = (r) => r.start.toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });
  return `<p class="doc-note">Best month: <strong>${long(best)}</strong>${worst && worst !== best ? ` · Quietest: <strong>${long(worst)}</strong>` : ''} (by ${byMoney ? 'money won' : 'leads'}).</p>
    ${table(
      ['Month', 'Calls', 'Leads', 'Jobs won', '$ won', ''],
      shown
        .slice()
        .reverse()
        .map((r) => ({
          className: r === best ? 'is-best' : '',
          cells: [r.label, r.calls, r.leads, r.won, r.wonValue ? money(r.wonValue) : '–', `<span class="minibar"><span style="width:${(score(r) / max) * 100}%"></span></span>`],
        })),
      { className: 'doc-table--months' },
    )}`;
}

export function render({ state, since, now }) {
  const range = RANGES.find((r) => r.id === state.range);
  const s = summariseRange({ calls: state.calls, client: state.client, since, range: state.range, now });
  const ranged = state.calls.filter((c) => !since || new Date(c.call_started_at) >= since);
  const leads = ranged.filter(isLead);
  const tz = state.client.timezone ?? 'Australia/Sydney';
  const jobTypes = topCounts(leads.map(jobTypeOf), 8);
  const suburbs = topCounts(leads.map((c) => suburbOf(c.address)), 5);
  const repeatCallers = customersFrom(ranged).filter((c) => c.repeat).length;
  const firstCall = state.calls.reduce((min, c) => Math.min(min, new Date(c.call_started_at).getTime()), now.getTime());
  const from = since ?? new Date(firstCall);
  const f = s.funnel;
  const u = s.urgency;

  const key = [
    ['Calls answered', formatNumber(s.calls)],
    ['Leads (real jobs)', formatNumber(s.leads)],
    ['After-hours calls', `${formatNumber(s.afterHours)} (${pct(s.afterHours, s.calls)})`],
    ['Repeat callers', formatNumber(repeatCallers)],
    ['Total talk time', `${formatMinutes(s.totalSeconds)} min`],
    ['Average call', s.calls ? formatDuration(s.avgSeconds) : '–'],
    ['Jobs won', formatNumber(s.won.count)],
    ['Money won', s.won.count ? money(s.won.value) : '–'],
    ['Still in play (estimate)', s.open.estimate != null ? money(s.open.estimate) : '–'],
    ['Return on Elliot', s.timesBack ? `${s.timesBack >= 10 ? Math.floor(s.timesBack) : s.timesBack.toFixed(1)}× its cost` : '–'],
  ];

  return `
    <section class="report-bar no-print">
      ${rangeToggle(state.range)}
      <button class="btn btn--small" type="button" data-action="print">${ICONS.print}Save as PDF</button>
    </section>

    <article class="doc">
      <header class="doc__head">
        <div>
          <span class="doc__brand">Elliot<span>AI</span></span>
          <h1 class="doc__title">Call report</h1>
        </div>
        <dl class="doc__meta">
          <div><dt>Business</dt><dd>${esc(state.client.business_name)}</dd></div>
          <div><dt>Period</dt><dd>${range.label} · ${dateText(from)} – ${dateText(now)}</dd></div>
          <div><dt>Prepared</dt><dd>${dateText(now)}</dd></div>
        </dl>
      </header>

      <section class="doc__section">
        <h2>Summary</h2>
        <p>${headline(s, range.label.toLowerCase())}</p>
        <table class="doc-kv"><tbody>${key.map(([k, v]) => `<tr><th>${k}</th><td>${v}</td></tr>`).join('')}</tbody></table>
      </section>

      <section class="doc__section">
        <h2>From call to job</h2>
        ${
          f.leads
            ? table(['Stage', 'Leads', 'Of all leads'], [
                { cells: ['Leads', f.leads, '100%'] },
                { cells: ['Called back', f.called_back, pct(f.called_back, f.leads)] },
                { cells: ['Got the job', f.won, pct(f.won, f.leads)] },
                { cells: ['No job', f.lost, pct(f.lost, f.leads)] },
              ])
            : '<p class="muted">No leads in this period yet.</p>'
        }
      </section>

      <div class="doc__cols">
        <section class="doc__section">
          <h2>What people called about</h2>
          ${table(['Job', 'Calls', 'Share'], jobTypes.map((j) => ({ cells: [esc(j.label), j.count, pct(j.count, leads.length)] })))}
        </section>
        <section class="doc__section">
          <h2>How urgent</h2>
          ${table(['Urgency', 'Calls', 'Share'], ['urgent', 'somewhat_urgent', 'non_urgent'].map((k) => ({ cells: [URGENCY_LABELS[k], u[k], pct(u[k], s.leads)] })))}
          <h2 class="doc__h2-gap">Where calls came from</h2>
          ${table(['Suburb', 'Calls'], suburbs.map((x) => ({ cells: [esc(x.label), x.count] })))}
        </section>
      </div>

      <section class="doc__section">
        <h2>Busiest times</h2>
        <p class="doc-note">Number of calls by day and time of day. Darker means busier.</p>
        ${heatmap(busiestTimes(ranged, tz))}
      </section>

      <section class="doc__section">
        <h2>Month by month</h2>
        ${monthTable(monthlyTotals(state.calls, now))}
      </section>

      <footer class="doc__foot">
        "Money won" counts jobs marked <em>Got the job</em>. "Still in play" is an estimate based on an average job value${
          s.avgJobValue ? ` of ${money(s.avgJobValue)}` : ''
        } and a ${formatPercent(s.conversionRate)} typical conversion rate, not a guarantee. "Return on Elliot" compares money won with what Elliot costs over the same period.
      </footer>
    </article>`;
}
