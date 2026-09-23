// Report: the "your month with Elliot" page. Printable / save-as-PDF.
import { URGENCY_LABELS, formatDuration, formatMinutes, formatNumber, formatPercent } from '../../lib/format.js';
import { RANGES } from '../../lib/metrics.js';
import {
  HEATMAP_DAYS,
  TIME_BLOCKS,
  busiestTimes,
  customersFrom,
  isLead,
  jobTypeOf,
  suburbOf,
  summariseRange,
  topCounts,
} from '../../lib/insights.js';
import { ICONS, barList, esc, money, rangeToggle } from './bits.js';

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

function funnel(f) {
  const steps = [
    { label: 'Leads', count: f.leads },
    { label: 'Called back', count: f.called_back },
    { label: 'Quoted', count: f.quoted },
    { label: 'Won', count: f.won },
  ];
  if (!f.leads) return '<p class="muted">No leads in this period yet.</p>';
  return barList(steps, { total: f.leads });
}

export function render({ state, since, now }) {
  const rangeLabel = RANGES.find((r) => r.id === state.range).label.toLowerCase();
  const s = summariseRange({ calls: state.calls, client: state.client, since, range: state.range, now });
  const ranged = state.calls.filter((c) => !since || new Date(c.call_started_at) >= since);
  const leads = ranged.filter(isLead);
  const tz = state.client.timezone ?? 'Australia/Sydney';
  const jobTypes = topCounts(leads.map(jobTypeOf));
  const suburbs = topCounts(leads.map((c) => suburbOf(c.address)));
  const repeatCallers = customersFrom(ranged).filter((c) => c.repeat).length;
  const printedFor = `${esc(state.client.business_name)} · ${RANGES.find((r) => r.id === state.range).label} · printed ${now.toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`;

  const urgencyItems = ['urgent', 'somewhat_urgent', 'non_urgent'].map((k) => ({ label: URGENCY_LABELS[k], count: s.urgency[k] }));

  return `
    <section class="page-head page-head--row">
      <div>
        <h1 class="page-title">Report</h1>
        <p class="hello__sub print-only">${printedFor}</p>
      </div>
      <button class="btn btn--ghost no-print" type="button" data-action="print">${ICONS.print}Save as PDF</button>
    </section>
    <div class="no-print">${rangeToggle(state.range)}</div>

    <section class="card report-lead"><p>${headline(s, rangeLabel)}</p></section>

    <section class="stats" aria-label="Money">
      <div class="card stat">
        <span class="stat__label">Money won</span>
        <span class="stat__value">${s.won.count ? money(s.won.value) : '–'}</span>
        <span class="stat__hint">${s.won.count ? `${s.won.count} job${s.won.count === 1 ? '' : 's'} marked Won` : 'Mark jobs Won in Leads'}</span>
      </div>
      <div class="card stat">
        <span class="stat__label">Still in play</span>
        <span class="stat__value">${s.open.estimate != null ? money(s.open.estimate) : '–'}</span>
        <span class="stat__hint">Estimate · ${s.open.count} open lead${s.open.count === 1 ? '' : 's'}</span>
      </div>
      <div class="card stat">
        <span class="stat__label">Elliot paid for itself</span>
        <span class="stat__value">${s.timesBack ? `${s.timesBack >= 10 ? Math.floor(s.timesBack) : s.timesBack.toFixed(1)}×` : '–'}</span>
        <span class="stat__hint">${s.fee ? `Won ÷ ${money(s.fee)} fee` : 'Fee not set yet'}</span>
      </div>
      <div class="card stat">
        <span class="stat__label">After-hours calls</span>
        <span class="stat__value">${formatNumber(s.afterHours)}</span>
        <span class="stat__hint">${s.calls ? `${Math.round((s.afterHours / s.calls) * 100)}% of all calls` : 'While you were closed'}</span>
      </div>
    </section>

    <section class="card panel">
      <h2 class="section-title">From call to job</h2>
      <p class="muted">How far your ${rangeLabel} leads got.</p>
      ${funnel(s.funnel)}
    </section>

    <div class="panel-grid">
      <section class="card panel">
        <h2 class="section-title">What people called about</h2>
        ${barList(jobTypes, { total: leads.length })}
      </section>
      <section class="card panel">
        <h2 class="section-title">Where calls came from</h2>
        ${barList(suburbs, { total: leads.length })}
      </section>
    </div>

    <section class="card panel">
      <h2 class="section-title">Busiest times</h2>
      <p class="muted">When your phone rings the most. Darker = more calls.</p>
      ${heatmap(busiestTimes(ranged, tz))}
    </section>

    <div class="panel-grid">
      <section class="card panel">
        <h2 class="section-title">How urgent were they?</h2>
        ${barList(urgencyItems, { total: s.leads })}
      </section>
      <section class="card panel">
        <h2 class="section-title">Calls</h2>
        <dl class="facts">
          <div><dt>Total talk time</dt><dd>${formatMinutes(s.totalSeconds)} min</dd></div>
          <div><dt>Average call</dt><dd>${s.calls ? formatDuration(s.avgSeconds) : '–'}</dd></div>
          <div><dt>Repeat callers</dt><dd>${repeatCallers}</dd></div>
          <div><dt>Not a job (spam etc.)</dt><dd>${s.calls - s.leads}</dd></div>
        </dl>
      </section>
    </div>

    <p class="footer-note">"Money won" counts jobs marked Won. "Still in play" is an estimate based on your average job value${
      s.avgJobValue ? ` (${money(s.avgJobValue)})` : ''
    } and a ${formatPercent(s.conversionRate)} typical conversion rate — not a guarantee. "Paid for itself" compares money won with what Elliot costs over the same period (a part-month counts as a full month).</p>`;
}
