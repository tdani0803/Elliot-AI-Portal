import '../styles/app.css';
import { DEMO_MODE, PAGES, supabase } from '../lib/supabase.js';
import { RANGES, aggregateCalls, rangeStart, summarise } from '../lib/metrics.js';
import {
  URGENCY_LABELS,
  escapeHtml,
  formatDuration,
  formatDurationShort,
  formatMinutes,
  formatMoney,
  formatNumber,
  formatPercent,
  formatWhen,
} from '../lib/format.js';

const PAGE_SIZE = 25;
const RANGE_KEY = 'elliotai.range';
const $ = (id) => document.getElementById(id);

const state = {
  range: readSavedRange(),
  client: null,
  shown: 0,
};

function readSavedRange() {
  try {
    const saved = localStorage.getItem(RANGE_KEY);
    return RANGES.some((r) => r.id === saved) ? saved : 'week';
  } catch {
    return 'week';
  }
}

// ---------------------------------------------------------------------------
// Data access — Supabase in production, sample data in demo mode.
// ---------------------------------------------------------------------------
const data = DEMO_MODE ? await import('../lib/demo.js').then(demoSource) : supabaseSource();

function demoSource({ demoClient, demoCalls }) {
  return {
    client: async () => demoClient,
    stats: async (since) => aggregateCalls(demoCalls, since),
    calls: async (since, from, to) =>
      demoCalls.filter((c) => !since || new Date(c.call_started_at) >= since).slice(from, to + 1),
    onNewCall: () => {},
  };
}

function supabaseSource() {
  return {
    async client() {
      const { data, error } = await supabase
        .from('clients')
        .select('business_name, avg_job_value, conversion_rate')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    async stats(since) {
      const { data, error } = await supabase
        .rpc('dashboard_stats', { p_since: since ? since.toISOString() : null })
        .single();
      if (error) throw error;
      return data;
    },
    async calls(since, from, to) {
      let query = supabase
        .from('calls')
        .select('id, call_started_at, duration_seconds, caller_name, callback_number, address, issue, details, urgency')
        .order('call_started_at', { ascending: false })
        .range(from, to);
      if (since) query = query.gte('call_started_at', since.toISOString());
      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    onNewCall(callback) {
      // RLS applies to realtime too: this only ever fires for the client's own calls.
      supabase
        .channel('calls')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'calls' }, callback)
        .subscribe((status) => {
          $('live').hidden = status !== 'SUBSCRIBED';
        });
    },
  };
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function renderRangeButtons() {
  $('range').innerHTML = RANGES.map(
    (r) => `<button type="button" data-range="${r.id}" aria-pressed="${r.id === state.range}">${r.label}</button>`,
  ).join('');
}

function renderSummary(m) {
  const rate = formatPercent(m.conversionRate);
  const rangeLabel = RANGES.find((r) => r.id === state.range).label.toLowerCase();

  if (m.value == null) {
    $('value').textContent = '–';
    $('saved').textContent = "We haven't set your average job value yet — give us a call and we'll add it.";
    $('fineprint').textContent = '';
  } else {
    const value = formatMoney(m.value);
    $('value').textContent = value;
    $('saved').innerHTML = `Money saved: <strong>~${value}</strong> — what you'd likely have lost if these calls went unanswered.`;
    $('fineprint').textContent =
      `Estimate based on your average job value (${formatMoney(m.avgJobValue)}) and a ${rate} typical conversion rate — not a guarantee.`;
  }

  $('stat-calls').textContent = formatNumber(m.calls);
  $('stat-leads').textContent = formatNumber(m.leads);
  $('stat-minutes').textContent = formatMinutes(m.totalSeconds);
  $('stat-avg').textContent = m.calls ? formatDurationShort(m.avgSeconds) : '–';

  const order = ['urgent', 'somewhat_urgent', 'non_urgent'];
  const total = order.reduce((sum, key) => sum + m.urgency[key], 0);
  $('urgency-bar').innerHTML = order
    .filter((key) => m.urgency[key] > 0)
    .map((key) => `<span class="urgency__seg urgency__seg--${key}" style="flex:${m.urgency[key]}"></span>`)
    .join('');
  $('urgency-bar').setAttribute(
    'aria-label',
    total ? order.map((key) => `${URGENCY_LABELS[key]}: ${m.urgency[key]}`).join(', ') : `No leads ${rangeLabel}`,
  );
  $('urgency-legend').innerHTML = order
    .map(
      (key) => `<li class="urgency__item">
        <span class="urgency__name"><span class="dot dot--${key}"></span>${URGENCY_LABELS[key]}</span>
        <span class="urgency__count">${m.urgency[key]}</span>
      </li>`,
    )
    .join('');
}

function callItem(call) {
  const urgency = call.urgency ?? 'unknown';
  const label = URGENCY_LABELS[call.urgency] ?? 'Not tagged';
  const phone = call.callback_number;
  const telHref = phone ? `tel:${phone.replace(/[^\d+]/g, '')}` : null;
  const rows = [
    ['Call back on', phone ? `<a href="${telHref}">${escapeHtml(phone)}</a>` : 'Not given'],
    ['Address', escapeHtml(call.address) || 'Not given'],
    ['What they said', escapeHtml(call.details) || 'No extra details'],
  ];
  return `<li>
    <details class="call">
      <summary>
        <span class="call__top">
          <span class="call__name">${escapeHtml(call.caller_name) || 'Unknown caller'}</span>
          <span class="pill pill--${urgency}">${label}</span>
        </span>
        <span class="call__issue">${escapeHtml(call.issue) || 'No reason given'}</span>
        <span class="call__meta">
          <span>${formatWhen(call.call_started_at)}</span>
          <span>${formatDuration(call.duration_seconds ?? 0)} call</span>
          <span class="call__more"><span class="call__more-open">Show details ▾</span><span class="call__more-close">Hide ▴</span></span>
        </span>
      </summary>
      <div class="call__body">
        <dl>${rows.map(([dt, dd]) => `<div><dt>${dt}</dt><dd>${dd}</dd></div>`).join('')}</dl>
        ${telHref ? `<div class="call__actions"><a class="btn btn--small" href="${telHref}">Call back</a></div>` : ''}
      </div>
    </details>
  </li>`;
}

function renderCalls(calls, append) {
  const list = $('call-list');
  if (!append) list.innerHTML = '';
  if (!append && calls.length === 0) {
    const rangeLabel = RANGES.find((r) => r.id === state.range).label.toLowerCase();
    list.innerHTML = `<li class="card empty"><strong>No calls ${rangeLabel} yet</strong>
      When Elliot answers a call, it'll show up here within seconds.</li>`;
  } else {
    list.insertAdjacentHTML('beforeend', calls.map(callItem).join(''));
  }
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
async function load() {
  const page = $('page');
  page.classList.add('loading');
  page.setAttribute('aria-busy', 'true');
  const since = rangeStart(state.range);
  try {
    const [stats, calls] = await Promise.all([data.stats(since), data.calls(since, 0, PAGE_SIZE - 1)]);
    renderSummary(summarise(stats, state.client));
    renderCalls(calls, false);
    state.shown = calls.length;
    $('more').hidden = calls.length < PAGE_SIZE;
  } catch (err) {
    console.error(err);
    $('call-list').innerHTML =
      '<li class="card empty"><strong>Couldn\'t load your calls</strong>Check your internet and refresh the page.</li>';
  } finally {
    page.classList.remove('loading');
    page.setAttribute('aria-busy', 'false');
  }
}

async function loadMore() {
  const button = $('more');
  button.disabled = true;
  try {
    const calls = await data.calls(rangeStart(state.range), state.shown, state.shown + PAGE_SIZE - 1);
    renderCalls(calls, true);
    state.shown += calls.length;
    button.hidden = calls.length < PAGE_SIZE;
  } finally {
    button.disabled = false;
  }
}

let reloadTimer;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(load, 800); // a call's details can arrive as two quick updates
}

async function start() {
  if (DEMO_MODE) {
    $('demo-banner').hidden = false;
  } else {
    const { data: session } = await supabase.auth.getSession();
    if (!session.session) return location.replace(PAGES.login);
  }

  try {
    state.client = await data.client();
  } catch (err) {
    console.error(err);
  }
  if (!state.client) {
    $('business').textContent = 'Almost there';
    document.querySelector('.hello__sub').textContent =
      "Your account is made. ElliotAI just needs to link it to your business. Once that's done, your calls show up here.";
    document.querySelectorAll('.range, .hero, .stats, .urgency, .calls').forEach((el) => (el.hidden = true));
    $('page').setAttribute('aria-busy', 'false');
    return;
  }

  $('business').textContent = state.client.business_name;
  renderRangeButtons();
  await load();

  $('range').addEventListener('click', (event) => {
    const range = event.target.closest('button')?.dataset.range;
    if (!range || range === state.range) return;
    state.range = range;
    try {
      localStorage.setItem(RANGE_KEY, range);
    } catch {
      /* private mode — not important */
    }
    renderRangeButtons();
    load();
  });
  $('more').addEventListener('click', loadMore);
  data.onNewCall(scheduleReload);
  // Tradies flick between apps: refresh whenever they come back to the tab.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleReload();
  });
}

$('logout').addEventListener('click', async () => {
  if (!DEMO_MODE) await supabase.auth.signOut();
  location.replace(PAGES.login);
});

start();
