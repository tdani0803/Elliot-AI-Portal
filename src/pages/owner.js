// Owner page: every client at a glance (calls, costs, profit, health), problems, billing,
// and the "add a client" form. Only logins listed in ADMIN_EMAILS (in Netlify) get data back.
import '../styles/app.css';
import { DEMO_MODE, PAGES, supabase } from '../lib/supabase.js';
import { escapeHtml as esc, formatMoney } from '../lib/format.js';
import { checkClientForm } from '../lib/client-form.js';

const $ = (id) => document.getElementById(id);
const DAYS = [
  ['mon', 'Mon'],
  ['tue', 'Tue'],
  ['wed', 'Wed'],
  ['thu', 'Thu'],
  ['fri', 'Fri'],
  ['sat', 'Sat'],
  ['sun', 'Sun'],
];
const CALLBACKS = [
  [15, '15 minutes'],
  [30, '30 minutes'],
  [60, '1 hour'],
  [120, '2 hours'],
  [240, '4 hours'],
  [480, 'Same day'],
  [1440, 'Next day'],
];
const BILLING = {
  none: ['Not billed', 'tag--muted'],
  invited: ['Link sent', 'tag--amber'],
  active: ['Paid', 'tag--green'],
  past_due: ['Payment failed', 'tag--red'],
  cancelled: ['Cancelled', 'tag--muted'],
};
const HEALTH = { ok: 'dot--non_urgent', quiet: 'dot--somewhat_urgent', problem: 'dot--urgent', setup: 'dot--unknown' };

const state = { data: null, filter: 'all' };
const money = (n) => formatMoney(Number(n) || 0);
const ago = (iso) => {
  if (!iso) return 'no calls yet';
  const h = (Date.now() - new Date(iso)) / 3600000;
  if (h < 1) return 'just now';
  if (h < 24) return `${Math.round(h)} hr${Math.round(h) === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
};

// ---------------------------------------------------------------------------
// Talking to the server
// ---------------------------------------------------------------------------
async function api(action, body) {
  if (DEMO_MODE) return demoApi(action, body);
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    location.replace(`${PAGES.login}?next=owner`);
    throw new Error('Not logged in');
  }
  const res = await fetch(`/api/owner/${action}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) {
    location.replace(`${PAGES.login}?next=owner`);
    throw new Error('Please log in again.');
  }
  if (!res.ok) {
    const err = new Error(json.error || 'Something went wrong. Try again.');
    err.errors = json.errors;
    err.status = res.status;
    throw err;
  }
  return json;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
function kpi(label, value, sub, extra = '') {
  return `<div class="kpi${extra}"><span class="kpi__label">${label}</span><span class="kpi__value">${value}</span><span class="kpi__sub">${sub}</span></div>`;
}

function systemCard(system) {
  const missing = system.filter((s) => !s.ok);
  if (!missing.length) return '<p class="strip strip--ok"><span><strong>All set up.</strong> Texts, payments and alerts are connected.</span></p>';
  return `<section class="card panel">
    <h2 class="dash__title">Still to set up</h2>
    <ul class="checklist">${missing.map((s) => `<li><strong>${esc(s.name)}</strong><span class="muted">${esc(s.fix)}</span></li>`).join('')}</ul>
  </section>`;
}

function problemsCard(events) {
  if (!events.length) return '';
  return `<section class="card panel">
    <div class="dash__head"><h2 class="dash__title">Problems this week</h2><span class="count-badge">${events.length}</span></div>
    <ul class="rows">${events
      .slice(0, 8)
      .map(
        (e) => `<li class="row"><span class="dot dot--urgent"></span><span class="row__main">
          <strong>${esc(e.business_name ?? 'Not linked to a business')}</strong>
          <span class="muted wrap">${esc(e.message)}</span></span>
          <span class="row__side muted">${ago(e.created_at)}</span></li>`,
      )
      .join('')}</ul>
  </section>`;
}

function clientCard(r) {
  const [billText, billClass] = BILLING[r.billing_status] ?? BILLING.none;
  const canBill = r.fee > 0 && r.billing_status !== 'active';
  return `<li class="card owner-client">
    <div class="owner-client__head">
      <div>
        <strong class="owner-client__name">${esc(r.business_name)}</strong>
        <span class="muted">${esc(r.state ?? '')}${r.owner_email ? ` · ${esc(r.owner_email)}` : ''}</span>
      </div>
      <span class="tag ${billClass}">${billText}</span>
    </div>
    <p class="owner-client__health"><span class="dot ${HEALTH[r.health.level] ?? 'dot--unknown'}"></span>${esc(r.health.text)} · last call ${ago(r.lastCall)}</p>
    <dl class="owner-client__nums">
      <div><dt>Calls</dt><dd>${r.calls}</dd></div>
      <div><dt>Leads</dt><dd>${r.leads}</dd></div>
      <div><dt>Minutes</dt><dd>${r.minutes}</dd></div>
      <div><dt>They won</dt><dd>${r.wonValue ? money(r.wonValue) : '–'}</dd></div>
      <div><dt>Fee</dt><dd>${r.fee ? money(r.fee) : '–'}</dd></div>
      <div><dt>Cost</dt><dd>${money(r.cost)}</dd></div>
      <div><dt>Profit</dt><dd class="${r.profit < 0 ? 'neg' : ''}">${money(r.profit)}</dd></div>
    </dl>
    <div class="call__actions">
      <button class="btn btn--small btn--ghost" type="button" data-action="edit" data-id="${r.id}">Edit</button>
      ${canBill ? `<button class="btn btn--small btn--ghost" type="button" data-action="pay-link" data-id="${r.id}">Payment link</button>` : ''}
    </div>
  </li>`;
}

const FILTERS = [
  ['all', 'All', () => true],
  ['problems', 'Needs attention', (r) => r.health.level !== 'ok'],
  ['unpaid', 'Not paying', (r) => r.billing_status !== 'active'],
];

function render() {
  const d = state.data;
  const t = d.totals;
  const [, , test] = FILTERS.find(([id]) => id === state.filter);
  const shown = d.rows.filter(test);
  $('view').innerHTML = `
    <section class="dash-top">
      <div>
        <h1 class="dash-top__name">Your business</h1>
        <p class="muted">This month so far. Costs are estimates.</p>
      </div>
      <button class="btn" type="button" data-action="add">+ Add a client</button>
    </section>

    <section class="kpis" aria-label="Key numbers">
      ${kpi('Clients', t.clients, `${t.paying} paying`)}
      ${kpi('Monthly revenue', money(t.mrr), t.fees > t.mrr ? `${money(t.fees)} when all pay` : 'From paying clients')}
      ${kpi('Costs this month', money(t.cost), `${t.calls} calls handled`)}
      ${kpi('Profit this month', money(t.profit), 'Fees minus costs')}
    </section>

    ${systemCard(d.system)}
    ${problemsCard(d.events)}

    <section class="owner-list">
      <div class="chips" role="group" aria-label="Show">${FILTERS.map(
        ([id, label, f]) =>
          `<button type="button" class="chip" data-action="filter" data-filter="${id}" aria-pressed="${id === state.filter}">${label} <span class="chip__count">${d.rows.filter(f).length}</span></button>`,
      ).join('')}</div>
      ${
        shown.length
          ? `<ul class="owner-clients">${shown.map(clientCard).join('')}</ul>`
          : `<div class="card empty"><strong>${d.rows.length ? 'Nothing here' : 'No clients yet'}</strong>${d.rows.length ? 'All good.' : 'Tap <strong>+ Add a client</strong> to set up your first one.'}</div>`
      }
    </section>

    <p class="footer-note"><a href="${PAGES.dashboard}">Open the client portal</a> · <a href="https://github.com/tdani0803/elliot-ai-portal/blob/claude/elliotai-client-portal-r2tj7a/docs/NEW-CLIENT.md" target="_blank" rel="noopener">New-client guide</a></p>`;
  $('view').setAttribute('aria-busy', 'false');
}

async function load() {
  try {
    state.data = await api('overview');
    render();
  } catch (err) {
    if (err.message === 'Not logged in') return;
    $('view').innerHTML = `<div class="card empty"><strong>${err.status === 403 ? 'Owner only' : "Couldn't load"}</strong>${esc(err.message)}${
      err.status === 403 ? `<p><button class="btn btn--ghost btn--small" type="button" data-action="logout">Log in as someone else</button></p>` : ''
    }</div>`;
    $('view').setAttribute('aria-busy', 'false');
  }
}

// ---------------------------------------------------------------------------
// Add / edit a client
// ---------------------------------------------------------------------------
function fillOptions() {
  const opts = (selected) => CALLBACKS.map(([m, label]) => `<option value="${m}"${m === selected ? ' selected' : ''}>${label}</option>`).join('');
  $('c-urgent').innerHTML = opts(60);
  $('c-standard').innerHTML = opts(240);
  $('c-hours').innerHTML = DAYS.map(
    ([key, label]) => `<div class="hours__row" data-day="${key}">
      <span class="hours__day">${label}</span>
      <input type="time" name="${key}_open" step="900" aria-label="${label} opens" />
      <span class="muted">to</span>
      <input type="time" name="${key}_close" step="900" aria-label="${label} closes" />
      <label class="hours__closed"><input type="checkbox" name="${key}_closed" /> Closed</label>
    </div>`,
  ).join('');
}

function openForm(client = null) {
  const form = $('client-form');
  form.reset();
  form.querySelectorAll('[data-error]').forEach((el) => (el.textContent = ''));
  $('client-error').hidden = true;
  $('client-title').textContent = client ? `Edit ${client.business_name}` : 'Add a client';
  const c = client ?? {};
  form.id.value = c.id ?? '';
  for (const name of ['business_name', 'owner_email', 'state', 'alert_phone', 'business_phone', 'review_url', 'vapi_assistant_id', 'monthly_fee', 'avg_job_value']) {
    form[name].value = c[name] ?? '';
  }
  form.callback_urgent_minutes.value = String(c.callback_urgent_minutes ?? 60);
  form.callback_standard_minutes.value = String(c.callback_standard_minutes ?? 240);
  const hours = c.business_hours ?? { mon: ['07:00', '17:00'], tue: ['07:00', '17:00'], wed: ['07:00', '17:00'], thu: ['07:00', '17:00'], fri: ['07:00', '17:00'], sat: null, sun: null };
  for (const [key] of DAYS) {
    const span = hours[key];
    form[`${key}_open`].value = span?.[0] ?? '07:00';
    form[`${key}_close`].value = span?.[1] ?? '17:00';
    form[`${key}_closed`].checked = !span;
    toggleDay(key);
  }
  $('client-dialog').showModal();
}

function toggleDay(key) {
  const form = $('client-form');
  const closed = form[`${key}_closed`].checked;
  form[`${key}_open`].disabled = closed;
  form[`${key}_close`].disabled = closed;
}

function formBody(form) {
  const body = Object.fromEntries(
    ['id', 'business_name', 'owner_email', 'state', 'alert_phone', 'business_phone', 'review_url', 'vapi_assistant_id', 'monthly_fee', 'avg_job_value', 'callback_urgent_minutes', 'callback_standard_minutes'].map((n) => [n, form[n].value.trim()]),
  );
  if (!body.id) delete body.id;
  body.business_hours = Object.fromEntries(DAYS.map(([key]) => [key, form[`${key}_closed`].checked ? null : [form[`${key}_open`].value, form[`${key}_close`].value]]));
  return body;
}

$('client-form').addEventListener('change', (event) => {
  const m = /^(\w{3})_closed$/.exec(event.target.name ?? '');
  if (m) toggleDay(m[1]);
});

$('client-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  form.querySelectorAll('[data-error]').forEach((el) => (el.textContent = ''));
  $('client-error').hidden = true;
  const button = form.querySelector('[type="submit"]');
  button.disabled = true;
  button.textContent = 'Saving…';
  try {
    const body = formBody(form);
    const check = checkClientForm(body);
    if (!check.ok) {
      const err = new Error('Check the form.');
      err.errors = check.errors;
      throw err;
    }
    const { client } = await api('save-client', body);
    $('client-dialog').close();
    toast(body.id ? 'Saved' : `${client.business_name} added. ${client.user_id ? 'Their login is linked.' : 'It links up when they sign up.'}`);
    await load();
  } catch (err) {
    if (err.errors) {
      for (const [field, message] of Object.entries(err.errors)) {
        const el = form.querySelector(`[data-error="${field}"]`);
        if (el) el.textContent = message;
      }
      form.querySelector('.field-error:not(:empty)')?.scrollIntoView({ block: 'center' });
    } else {
      $('client-error').textContent = err.message;
      $('client-error').hidden = false;
    }
  } finally {
    button.disabled = false;
    button.textContent = 'Save client';
  }
});

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------
let toastTimer;
function toast(message, isError = false) {
  const el = $('toast');
  el.textContent = message;
  el.classList.toggle('toast--error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), isError ? 6000 : 3000);
}

const actions = {
  add: () => openForm(),
  edit: (el) => openForm(state.data.rows.find((r) => r.id === el.dataset.id)?.client),
  filter: (el) => {
    state.filter = el.dataset.filter;
    render();
  },
  async 'pay-link'(el) {
    el.disabled = true;
    try {
      const { url } = await api('payment-link', { id: el.dataset.id });
      $('link-url').value = url;
      $('link-dialog').showModal();
      await load();
    } catch (err) {
      toast(err.message, true);
    } finally {
      el.disabled = false;
    }
  },
  async logout() {
    await supabase.auth.signOut();
    location.replace(`${PAGES.login}?next=owner`);
  },
};

document.addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
  if (event.target.closest('[data-close]')) event.target.closest('dialog')?.close();
});

$('link-copy').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('link-url').value);
    toast('Link copied. Paste it in a text or email to the client.');
  } catch {
    $('link-url').select();
    toast('Press and hold the link to copy it.');
  }
});

// ---------------------------------------------------------------------------
// Demo mode: sample numbers so the page can be tried without a server
// ---------------------------------------------------------------------------
function demoApi(action, body) {
  const hours = { mon: ['07:00', '17:00'], tue: ['07:00', '17:00'], wed: ['07:00', '17:00'], thu: ['07:00', '17:00'], fri: ['07:00', '17:00'], sat: null, sun: null };
  const mk = (id, name, extra) => ({
    id,
    business_name: name,
    owner_email: `${id}@example.com`,
    state: 'QLD',
    billing_status: 'active',
    health: { level: 'ok', text: 'Working' },
    lastCall: new Date(Date.now() - 3 * 3600000).toISOString(),
    client: { id, business_name: name, owner_email: `${id}@example.com`, state: 'QLD', monthly_fee: 1000, avg_job_value: 2500, business_hours: hours, callback_urgent_minutes: 60, callback_standard_minutes: 240 },
    ...extra,
  });
  if (action === 'save-client') return Promise.resolve({ client: { ...body, id: body.id ?? 'new', user_id: null } });
  if (action === 'payment-link') return Promise.resolve({ url: 'https://checkout.stripe.com/c/pay/demo' });
  const rows = [
    mk('tysons', 'Tysons Roofing', { calls: 64, leads: 41, minutes: 212, texts: 70, wonValue: 38400, fee: 1000, cost: 71.2, profit: 928.8 }),
    mk('smith', 'Smith Plumbing', { state: 'WA', calls: 12, leads: 9, minutes: 40, texts: 15, wonValue: 6200, fee: 1000, cost: 18.4, profit: 981.6, health: { level: 'quiet', text: 'No calls for 4 days' }, lastCall: new Date(Date.now() - 4 * 86400000).toISOString() }),
    mk('bright', 'Bright Sparks Electrical', { state: 'NSW', billing_status: 'invited', calls: 0, leads: 0, minutes: 0, texts: 0, wonValue: 0, fee: 1200, cost: 7, profit: 1193, health: { level: 'setup', text: 'Waiting for them to sign up' }, lastCall: null }),
  ];
  return Promise.resolve({
    rows,
    totals: { clients: 3, paying: 2, mrr: 2000, fees: 3200, cost: 96.6, profit: 3103.4, calls: 76, problems: 0 },
    events: [{ business_name: 'Smith Plumbing', kind: 'quiet', message: 'No calls for 4 days. Check their call forwarding.', created_at: new Date(Date.now() - 2 * 3600000).toISOString() }],
    system: [
      { name: 'Texts (Twilio)', ok: false, fix: 'Add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_FROM_NUMBER in Netlify.' },
      { name: 'Payments (Stripe)', ok: true, fix: '' },
    ],
  });
}

// ---------------------------------------------------------------------------
if (DEMO_MODE) $('demo-banner').hidden = false;
fillOptions();
load();
