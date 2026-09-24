// Dashboard shell: loads data, switches tabs, and handles every button in one place.
import '../styles/app.css';
import { DEMO_MODE, PAGES } from '../lib/supabase.js';
import { createDataSource } from '../lib/data.js';
import { RANGES, rangeStart } from '../lib/metrics.js';
import { callbackList, isLead, statusOf } from '../lib/insights.js';
import { escapeHtml } from '../lib/format.js';
import {
  canPromptInstall,
  enableNotifications,
  notificationStatus,
  promptInstall,
  registerServiceWorker,
  sendTestNotification,
} from '../lib/push.js';
import * as home from './tabs/home.js';
import * as leads from './tabs/leads.js';
import * as jobs from './tabs/jobs.js';
import * as settings from './tabs/settings.js';
import * as report from './tabs/report.js';

const TABS = { home, leads, jobs, report, settings };
const $ = (id) => document.getElementById(id);

const saved = (key, fallback, allowed) => {
  try {
    const value = localStorage.getItem(`elliotai.${key}`);
    return allowed.includes(value) ? value : fallback;
  } catch {
    return fallback;
  }
};
const remember = (key, value) => {
  try {
    localStorage.setItem(`elliotai.${key}`, value);
  } catch {
    /* private mode */
  }
};

const state = {
  client: null,
  members: [],
  calls: [],
  bookings: [],
  pro: true,
  alerts: false,
  notify: null, // notification status for this phone: install-ios | off | denied | unsupported | on
  openedAlerts: new Set(),
  range: saved('range', 'week', RANGES.map((r) => r.id)),
  leadFilter: 'new',
  leadSearch: '',
  leadLimit: 40,
  open: new Set(), // which cards are expanded, so re-renders don't collapse them
  sticky: new Set(), // leads changed on this screen: keep showing them under the current filter
  transcripts: new Map(),
  picking: null, // 'calls' while choosing calls to delete
  picked: new Set(),
};

const data = await createDataSource();

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------
// "#leads/<call id>" opens the Leads tab on that lead (used by notification taps).
const route = () => {
  let [tab, id] = location.hash.slice(1).split('/');
  if (tab === 'customers') tab = 'leads'; // old links: customers now live in Calls search
  return { tab: TABS[tab] ? tab : 'home', id: id ? decodeURIComponent(id) : null };
};
const currentTab = () => route().tab;

// Seeing a lead counts as "opened", so no backup text is sent for it.
function markOpened(id) {
  if (!id || state.openedAlerts.has(id)) return;
  state.openedAlerts.add(id);
  data.markAlertOpened(id).catch(() => state.openedAlerts.delete(id));
}

function openDeepLink() {
  const { tab, id } = route();
  if (tab !== 'leads' || !id) return;
  state.open.add(id);
  state.sticky.add(id);
  markOpened(id);
  requestAnimationFrame(() => document.querySelector(`details[data-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'start' }));
}

function render() {
  const tab = currentTab();
  const now = new Date();
  const navTab = tab;
  document.querySelectorAll('[data-tab]').forEach((a) => {
    if (a.dataset.tab === navTab) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  const waiting = state.pro ? callbackList(state.calls, now, state.client, state.bookings).length : 0;
  $('leads-badge').textContent = waiting > 99 ? '99+' : String(waiting);
  $('leads-badge').hidden = waiting === 0;

  const view = $('view');
  const focused = document.activeElement?.id;
  view.innerHTML = TABS[tab].render({ state, now, since: rangeStart(state.range, now) });
  view.querySelectorAll('details[data-id]').forEach((d) => {
    if (state.open.has(d.dataset.id)) d.open = true;
  });
  view.querySelectorAll('[data-transcript]').forEach((el) => {
    const text = state.transcripts.get(el.dataset.transcript);
    if (text !== undefined) el.innerHTML = transcriptHtml(text);
  });
  if (focused === 'lead-search') {
    const input = $(focused);
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }
  view.querySelectorAll('[data-install]').forEach((el) => (el.hidden = !canPromptInstall()));
  view.setAttribute('aria-busy', 'false');
}

const transcriptHtml = (text) =>
  text ? `<pre class="transcript__text">${escapeHtml(text)}</pre>` : '<p class="muted">No recording of the conversation for this call.</p>';

let toastTimer;
let toastAction = null;
function toast(message, isError = false, action = null, ms = isError ? 6000 : 2500) {
  const el = $('toast');
  el.textContent = '';
  el.append(message);
  toastAction = action;
  if (action) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'toast__action';
    button.textContent = action.label;
    el.append(button);
  }
  el.classList.toggle('toast--error', isError);
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.hidden = true;
    toastAction = null;
  }, ms);
}
$('toast').addEventListener('click', (event) => {
  if (!event.target.closest('.toast__action') || !toastAction) return;
  const { run } = toastAction;
  toastAction = null;
  $('toast').hidden = true;
  run();
});

// ---------------------------------------------------------------------------
// Saving changes (optimistic: update the screen first, undo if saving fails)
// ---------------------------------------------------------------------------
async function updateCall(id, patch, message) {
  const call = state.calls.find((c) => c.id === id);
  if (!call) return;
  const before = { ...call };
  if (patch.lead_status && patch.lead_status !== call.lead_status) call.status_updated_at = new Date().toISOString();
  Object.assign(call, patch);
  render();
  try {
    await data.updateCall(id, patch);
    if (message) toast(message);
  } catch (err) {
    console.error(err);
    Object.assign(call, before);
    render();
    toast("Couldn't save that. Check your internet and try again.", true);
  }
}

// Deleting is instant with an Undo button (no "are you sure?" pop-ups). The real delete
// happens a few seconds later, or straight away if the app is closed or another delete starts.
const UNDO_MS = 6000;
let pendingDelete = null;

async function commitDelete(pending) {
  clearTimeout(pending.timer);
  if (pendingDelete === pending) pendingDelete = null;
  try {
    const deleted = await data.deleteCalls(pending.ids);
    if (!deleted) throw new Error('permission');
  } catch (err) {
    console.error(err);
    restoreCalls(pending.removed);
    toast(
      /permission|policy|denied/i.test(err.message ?? '')
        ? 'Deleting needs a quick database update first. Ask ElliotAI to switch it on.'
        : "Couldn't delete that. Check your internet and try again.",
      true,
    );
  }
}

function restoreCalls(removed) {
  const have = new Set(state.calls.map((c) => c.id));
  state.calls = [...state.calls, ...removed.filter((c) => !have.has(c.id))].sort((a, b) => b.call_started_at.localeCompare(a.call_started_at));
  render();
}

function removeCalls(ids, message) {
  if (pendingDelete) commitDelete(pendingDelete);
  const removed = state.calls.filter((c) => ids.includes(c.id));
  if (!removed.length) return;
  state.calls = state.calls.filter((c) => !ids.includes(c.id));
  render();
  const pending = { ids, removed };
  pending.timer = setTimeout(() => commitDelete(pending), UNDO_MS);
  pendingDelete = pending;
  toast(message, false, { label: 'Undo', run: () => {
    clearTimeout(pending.timer);
    if (pendingDelete === pending) pendingDelete = null;
    restoreCalls(pending.removed);
    toast('Brought back');
  } }, UNDO_MS);
}
// Closing or leaving the app: finish any delete that's waiting on its Undo.
addEventListener('pagehide', () => pendingDelete && commitDelete(pendingDelete));

// The tradie's own on/off switches. Saved straight away; undone on screen if saving fails.
async function saveSetting(key, value) {
  const before = state.client[key];
  state.client[key] = value;
  render();
  try {
    await data.saveSettings(state.client.id, { [key]: value });
    toast(value ? 'Turned on' : 'Turned off');
  } catch (err) {
    console.error(err);
    state.client[key] = before;
    render();
    toast("Couldn't save that. Check your internet and try again.", true);
  }
}

// ---------------------------------------------------------------------------
// Booking form
// ---------------------------------------------------------------------------
const pad = (n) => String(n).padStart(2, '0');
const dateValue = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const timeValue = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

function openBooking(prefill = {}) {
  const form = $('booking-form');
  form.reset();
  $('booking-error').hidden = true;
  const start = prefill.starts_at ? new Date(prefill.starts_at) : (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(8, 0, 0, 0);
    return d;
  })();
  form.booking_id.value = prefill.id ?? '';
  form.call_id.value = prefill.call_id ?? '';
  form.job.value = prefill.job ?? '';
  form.date.value = dateValue(start);
  form.time.value = timeValue(start);
  form.duration_minutes.value = String(prefill.duration_minutes ?? 60);
  form.customer_name.value = prefill.customer_name ?? '';
  form.phone.value = prefill.phone ?? '';
  form.address.value = prefill.address ?? '';
  form.notes.value = prefill.notes ?? '';
  $('b-assign-field').hidden = state.members.length === 0;
  $('b-assign').innerHTML = `<option value="">Nobody yet</option>${state.members
    .map((m) => `<option ${m.display_name === prefill.assigned_to ? 'selected' : ''}>${escapeHtml(m.display_name)}</option>`)
    .join('')}`;
  $('booking-title').textContent = prefill.id ? 'Edit job' : 'Book a job';
  $('booking-extra').hidden = !prefill.id;
  $('booking-cancel-job').hidden = !prefill.id || prefill.status === 'cancelled';
  $('booking-dialog').showModal();
  form.job.focus();
}

async function saveBooking(fields, message) {
  const payload = { client_id: state.client.id, ...fields };
  const savedRow = await data.saveBooking(payload);
  const i = state.bookings.findIndex((b) => b.id === savedRow.id);
  if (i >= 0) state.bookings[i] = savedRow;
  else state.bookings.push(savedRow);
  render();
  toast(message);
}

$('booking-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.job.value.trim() || !form.date.value || !form.time.value) {
    $('booking-error').textContent = 'Add the job, the day and a start time.';
    $('booking-error').hidden = false;
    return;
  }
  const submit = form.querySelector('[type="submit"]');
  submit.disabled = true;
  try {
    const clean = (v) => v.trim() || null;
    await saveBooking(
      {
        ...(form.booking_id.value ? { id: form.booking_id.value } : {}),
        ...(form.call_id.value ? { call_id: form.call_id.value } : {}),
        job: form.job.value.trim(),
        starts_at: new Date(`${form.date.value}T${form.time.value}`).toISOString(),
        duration_minutes: Number(form.duration_minutes.value),
        customer_name: clean(form.customer_name.value),
        phone: clean(form.phone.value),
        address: clean(form.address.value),
        assigned_to: clean(form.assigned_to.value),
        notes: clean(form.notes.value),
      },
      form.booking_id.value ? 'Job updated' : 'Job booked ✅',
    );
    $('booking-dialog').close();
  } catch (err) {
    console.error(err);
    $('booking-error').textContent = "Couldn't save the job. Check your internet and try again.";
    $('booking-error').hidden = false;
  } finally {
    submit.disabled = false;
  }
});

$('booking-dialog').addEventListener('click', (event) => {
  if (event.target.closest('[data-close]') || event.target === $('booking-dialog')) $('booking-dialog').close();
});

$('booking-cancel-job').addEventListener('click', async () => {
  const id = $('booking-form').booking_id.value;
  if (!id || !confirm('Cancel this job?')) return;
  try {
    await saveBooking({ id, status: 'cancelled' }, 'Job cancelled');
    $('booking-dialog').close();
  } catch {
    toast("Couldn't cancel the job. Try again.", true);
  }
});

$('booking-delete').addEventListener('click', async () => {
  const id = $('booking-form').booking_id.value;
  if (!id || !confirm('Delete this job for good?')) return;
  try {
    await data.deleteBooking(id);
    state.bookings = state.bookings.filter((b) => b.id !== id);
    $('booking-dialog').close();
    render();
    toast('Job deleted');
  } catch {
    toast("Couldn't delete the job. Try again.", true);
  }
});

// ---------------------------------------------------------------------------
// Every button / input on the page, handled in one place
// ---------------------------------------------------------------------------
const actions = {
  'set-range'(el) {
    state.range = el.dataset.range;
    remember('range', state.range);
    render();
  },
  'mark-called'(el) {
    // From Home: the item drops off the to-do list, which is the point.
    updateCall(el.dataset.id, { lead_status: 'called_back' }, 'Marked as called');
  },
  'set-status'(el) {
    const { id, status } = el.dataset;
    const call = state.calls.find((c) => c.id === id);
    if (!call || call.lead_status === status) return;
    state.open.add(id);
    state.sticky.add(id);
    const message = { won: 'Nice one! 🎉 How much was the job worth?', lost: 'Marked as no job' }[status] ?? 'Saved';
    updateCall(id, { lead_status: status }, message);
    if (status === 'won') setTimeout(() => $(`won-${id}`)?.focus(), 50);
  },
  'lead-filter'(el) {
    state.leadFilter = el.dataset.filter;
    state.sticky.clear();
    state.leadLimit = 40;
    render();
  },
  'more-leads'() {
    state.leadLimit += 40;
    render();
  },
  'book-from-lead'(el) {
    const call = state.calls.find((c) => c.id === el.dataset.id);
    openBooking({
      call_id: call.id,
      job: call.issue ?? '',
      customer_name: call.caller_name ?? '',
      phone: call.callback_number ?? '',
      address: call.address ?? '',
      notes: call.details ?? '',
      assigned_to: call.assigned_to,
    });
  },
  'new-booking'() {
    openBooking();
  },
  'edit-booking'(el) {
    openBooking(state.bookings.find((b) => b.id === el.dataset.id));
  },
  async 'booking-done'(el) {
    try {
      await saveBooking({ id: el.dataset.id, status: 'done' }, 'Job marked done ✅');
    } catch {
      toast("Couldn't update the job. Try again.", true);
    }
  },
  async 'load-transcript'(el) {
    const id = el.dataset.id;
    el.disabled = true;
    el.textContent = 'Loading…';
    try {
      state.transcripts.set(id, await data.transcript(id));
    } catch {
      state.transcripts.delete(id);
      toast("Couldn't load the conversation. Try again.", true);
    }
    render();
  },
  print() {
    window.print();
  },
  'delete-call'(el) {
    removeCalls([el.dataset.id], 'Call deleted');
  },
  'start-pick'(el) {
    state.picking = el.dataset.kind;
    state.picked.clear();
    render();
  },
  'stop-pick'() {
    state.picking = null;
    state.picked.clear();
    render();
  },
  'pick-all'() {
    const boxes = [...document.querySelectorAll('[data-action="pick"]')];
    const allTicked = boxes.length && boxes.every((b) => state.picked.has(b.value));
    boxes.forEach((b) => (allTicked ? state.picked.delete(b.value) : state.picked.add(b.value)));
    render();
  },
  'delete-picked'() {
    const ids = [...state.picked];
    if (!ids.length) return;
    state.picking = null;
    state.picked.clear();
    removeCalls(ids, `Deleted ${ids.length} call${ids.length === 1 ? '' : 's'}`);
  },
  async logout() {
    if (pendingDelete) await commitDelete(pendingDelete);
    await data.signOut();
    location.replace(PAGES.login);
  },
  'hide-setup'() {
    try {
      localStorage.setItem('elliotai.setupHidden', '1');
    } catch {
      /* private mode */
    }
    render();
  },
  'open-lead'(el) {
    location.hash = `leads/${el.dataset.id}`;
  },
  async 'enable-push'(el) {
    el.disabled = true;
    el.textContent = 'Turning on…';
    try {
      const result = await enableNotifications(state.client.id);
      state.notify = await notificationStatus();
      if (result === 'granted') toast("Notifications on. We'll buzz you for every new lead.");
      else toast('Notifications were not allowed.', true);
    } catch (err) {
      console.error(err);
      toast(err.message || "Couldn't turn on notifications. Try again.", true);
    }
    render();
  },
  async 'install-app'() {
    if (await promptInstall()) toast('Added to your home screen');
    render();
  },
  async 'test-push'(el) {
    el.disabled = true;
    try {
      const { delivered } = await sendTestNotification();
      toast(delivered ? 'Test sent. Check your notifications.' : "Couldn't reach this phone. Try turning notifications off and on.", !delivered);
    } catch {
      toast("Couldn't send a test. Try again.", true);
    }
    el.disabled = false;
  },
  'calendar-help'() {
    const https = `${location.origin}/api/calendar/${state.client.calendar_token}.ics`;
    $('calendar-webcal').href = https.replace(/^https?:/, 'webcal:');
    $('calendar-copy').dataset.link = https;
    $('calendar-dialog').showModal();
  },
};

$('calendar-copy').addEventListener('click', async (event) => {
  try {
    await navigator.clipboard.writeText(event.currentTarget.dataset.link);
    toast('Calendar link copied');
  } catch {
    prompt('Copy this link:', event.currentTarget.dataset.link);
  }
});
$('calendar-dialog').addEventListener('click', (event) => {
  if (event.target.closest('[data-close]') || event.target === $('calendar-dialog')) $('calendar-dialog').close();
});

$('view').addEventListener('click', (event) => {
  const el = event.target.closest('[data-action]');
  if (!el || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.tagName === 'FORM') return;
  actions[el.dataset.action]?.(el);
});

$('view').addEventListener('submit', (event) => {
  const form = event.target.closest('form[data-action="save-won"]');
  if (!form) return;
  event.preventDefault();
  const raw = form.value.value.trim();
  const value = raw === '' ? null : Math.max(0, Math.round(Number(raw)));
  if (raw !== '' && !Number.isFinite(value)) return toast('Type the amount as a number, like 2500.', true);
  updateCall(form.dataset.id, { won_value: value }, value ? 'Job value saved 💰' : 'Job value cleared');
});

$('view').addEventListener('change', (event) => {
  const el = event.target;
  if (el.dataset.action === 'toggle-setting') {
    saveSetting(el.dataset.key, el.checked);
    return;
  }
  if (el.dataset.action === 'pick') {
    if (el.checked) state.picked.add(el.value);
    else state.picked.delete(el.value);
    render();
    return;
  }
  if (el.dataset.action === 'assign') updateCall(el.dataset.id, { assigned_to: el.value || null }, el.value ? `Given to ${el.value}` : 'Unassigned');
  if (el.dataset.action === 'save-notes') {
    const call = state.calls.find((c) => c.id === el.dataset.id);
    const notes = el.value.trim() || null;
    if (call && (call.notes ?? null) !== notes) updateCall(el.dataset.id, { notes }, 'Note saved');
  }
});

$('view').addEventListener('input', (event) => {
  const el = event.target;
  if (el.dataset.action === 'search-leads') {
    state.leadSearch = el.value;
    state.leadLimit = 40;
    render();
  }
});

// Remember which cards are open so saving a change doesn't snap them shut.
$('view').addEventListener(
  'toggle',
  (event) => {
    const id = event.target.dataset?.id;
    if (!id) return;
    if (event.target.open) {
      state.open.add(id);
      if (currentTab() === 'leads') markOpened(id);
    } else state.open.delete(id);
  },
  true,
);

// Swipe a call card on a phone: right = "Called", left = delete. Both can be undone.
const SWIPE_AT = 90;
let swipe = null;
let ignoreClicksUntil = 0;

function resetSwipe(card, li) {
  card.style.transform = '';
  li.classList.remove('is-dragging');
  setTimeout(() => {
    delete li.dataset.swipe;
    delete li.dataset.swipeLabel;
  }, 180);
}

$('view').addEventListener(
  'touchstart',
  (event) => {
    if (currentTab() !== 'leads' || state.picking || event.touches.length !== 1) return;
    const card = event.target.closest('.call-list > li > details.call');
    if (!card || card.open) return;
    const t = event.touches[0];
    swipe = { card, li: card.parentElement, x: t.clientX, y: t.clientY, dx: 0, active: false };
  },
  { passive: true },
);

$('view').addEventListener(
  'touchmove',
  (event) => {
    if (!swipe) return;
    const t = event.touches[0];
    const dx = t.clientX - swipe.x;
    const dy = t.clientY - swipe.y;
    if (!swipe.active) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        swipe = null; // they're scrolling, not swiping
        return;
      }
      if (Math.abs(dx) < 12) return;
      swipe.active = true;
      swipe.li.classList.add('is-dragging');
    }
    swipe.dx = dx;
    swipe.card.style.transform = `translateX(${dx}px)`;
    swipe.li.dataset.swipe = dx > 0 ? 'right' : 'left';
    swipe.li.dataset.swipeLabel = dx > 0 ? '✓ Called' : 'Delete';
  },
  { passive: true },
);

function endSwipe() {
  if (!swipe) return;
  const { card, li, dx, active } = swipe;
  swipe = null;
  if (!active) return;
  ignoreClicksUntil = Date.now() + 400; // don't let the swipe also open the card
  const call = state.calls.find((c) => c.id === card.dataset.id);
  if (!call) return resetSwipe(card, li);
  if (dx > SWIPE_AT && isLead(call)) {
    resetSwipe(card, li);
    const before = call.lead_status ?? 'new';
    if (statusOf(call) === 'called_back') return;
    updateCall(call.id, { lead_status: 'called_back' });
    toast('Marked as called', false, { label: 'Undo', run: () => updateCall(call.id, { lead_status: before }, 'Moved back') }, 5000);
  } else if (dx < -SWIPE_AT) {
    card.style.transform = 'translateX(-110%)';
    setTimeout(() => removeCalls([call.id], 'Call deleted'), 150);
  } else {
    resetSwipe(card, li);
  }
}
$('view').addEventListener('touchend', endSwipe);
$('view').addEventListener('touchcancel', endSwipe);
$('view').addEventListener(
  'click',
  (event) => {
    if (Date.now() < ignoreClicksUntil) {
      event.preventDefault();
      event.stopPropagation();
    }
  },
  true,
);

window.addEventListener('hashchange', () => {
  state.sticky.clear();
  state.picking = null;
  state.picked.clear();
  window.scrollTo(0, 0);
  openDeepLink();
  render();
});

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
async function loadAll() {
  const [calls, bookings, members] = await Promise.all([data.calls(), data.bookings(), data.members()]);
  state.calls = calls;
  state.bookings = bookings;
  state.members = members;
  state.pro = data.pro;
  state.alerts = data.alerts;
  state.followUps = data.followUps;
  // A delete still waiting on its Undo shouldn't pop back in on a refresh.
  if (pendingDelete) state.calls = state.calls.filter((c) => !pendingDelete.ids.includes(c.id));
}

let reloadTimer;
function scheduleReload() {
  clearTimeout(reloadTimer);
  reloadTimer = setTimeout(async () => {
    try {
      await loadAll();
      render();
    } catch (err) {
      console.error(err);
    }
  }, 800);
}

function showUnlinked() {
  $('view').innerHTML = `<section class="hello">
      <h1 class="hello__business">Almost there</h1>
      <p class="hello__sub">Your account is made. ElliotAI just needs to link it to your business. Once that's done, your calls show up here.</p>
    </section>`;
  $('view').setAttribute('aria-busy', 'false');
}

async function start() {
  if (DEMO_MODE) $('demo-banner').hidden = false;
  else if (!(await data.hasSession())) return location.replace(PAGES.login);

  try {
    state.client = await data.client();
  } catch (err) {
    console.error(err);
  }
  if (!state.client) return showUnlinked();

  try {
    await loadAll();
  } catch (err) {
    console.error(err);
    $('view').innerHTML = `<div class="card empty"><strong>Couldn't load your calls</strong>Check your internet and refresh the page.</div>`;
    return;
  }
  $('upgrade-banner').hidden = state.pro;
  $('tabbar').hidden = false;
  if (state.alerts) {
    registerServiceWorker();
    state.notify = await notificationStatus().catch(() => 'unsupported');
  }
  openDeepLink();
  render();

  data.subscribe(scheduleReload);
  window.addEventListener('elliot:installable', render);
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState !== 'visible') return;
    // They may have just changed notification settings on the phone.
    if (state.alerts) state.notify = await notificationStatus().catch(() => state.notify);
    scheduleReload();
  });
}

$('settings-link').addEventListener('click', () => {
  location.hash = 'settings';
});



start();
