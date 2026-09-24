// Settings: the few switches a tradie might want, in plain words, each with an example.
import { promiseMinutes, promisePhrase } from '../../lib/promise.js';
import { esc } from './bits.js';

// eslint-disable-next-line no-undef
const VERSION = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__;

function toggle(state, key, title, example) {
  const on = Boolean(state.client[key]);
  return `<li class="setting">
    <label class="setting__row">
      <span class="setting__text"><strong>${title}</strong><span class="muted">${example}</span></span>
      <input class="switch" type="checkbox" role="switch" data-action="toggle-setting" data-key="${key}" ${on ? 'checked' : ''} />
    </label>
  </li>`;
}

function notifyRow(status) {
  const text = {
    on: ['On for this phone', '<button class="btn btn--small btn--ghost" type="button" data-action="test-push">Send a test</button>'],
    off: ['Off for this phone', '<button class="btn btn--small" type="button" data-action="enable-push">Turn on</button>'],
    denied: ['Blocked', "Turn them on in your phone's Settings → Notifications → ElliotAI."],
    'install-ios': ['Needs the home-screen app', 'In Safari tap Share → Add to Home Screen, then open ElliotAI from there.'],
    unsupported: ['Not available in this browser', 'Use Safari on iPhone or Chrome on Android.'],
  }[status] ?? ['Checking…', ''];
  return `<li class="setting"><div class="setting__row">
    <span class="setting__text"><strong>New-call notifications</strong><span class="muted">${text[0]}</span></span>
    <span class="setting__side">${text[1]}</span>
  </div></li>`;
}

export function render({ state }) {
  const c = state.client;
  const name = esc(c.business_name);
  const urgent = promisePhrase(promiseMinutes('urgent', c));
  const standard = promisePhrase(promiseMinutes('non_urgent', c));
  return `
    <section class="page-head">
      <h1 class="page-title">Settings</h1>
      <p class="hello__sub">${name}</p>
    </section>

    ${
      state.followUps
        ? `<section class="card panel">
            <h2 class="dash__title">Automatic texts</h2>
            <p class="muted">Elliot follows up for you, so customers feel looked after and don't ring someone else.</p>
            <ul class="settings">
              ${toggle(state, 'text_callers', 'Thank-you text after every call', `“Thanks for calling ${name}. We've got your roof repair request and the team will call you back ${standard}.”`)}
              ${toggle(state, 'remind_customers', 'Reminder the day before a job', `“A reminder from ${name}: we're coming tomorrow at 9am for your roof repair.”`)}
              ${toggle(state, 'weekly_summary', 'Monday morning summary for you', '“Last week Elliot took 14 calls, 9 leads and 3 jobs won ($8,400).”')}
            </ul>
          </section>`
        : ''
    }

    <section class="card panel">
      <h2 class="dash__title">Your phone</h2>
      <ul class="settings">
        ${state.alerts ? notifyRow(state.notify) : ''}
        <li class="setting"><div class="setting__row">
          <span class="setting__text"><strong>Jobs in your phone's calendar</strong><span class="muted">Booked jobs show up in Apple, Google or Outlook calendar.</span></span>
          <span class="setting__side"><button class="btn btn--small btn--ghost" type="button" data-action="calendar-help">Set up</button></span>
        </div></li>
      </ul>
    </section>

    <section class="card panel">
      <h2 class="dash__title">What Elliot tells callers</h2>
      <dl class="facts">
        <div><dt>Urgent jobs</dt><dd>Call back ${urgent}</dd></div>
        <div><dt>Everything else</dt><dd>Call back ${standard}</dd></div>
      </dl>
      <p class="muted">Want these changed, or your hours or prices? Just call or text ElliotAI and we'll sort it.</p>
    </section>

    <button class="btn btn--ghost btn--block" type="button" data-action="logout">Log out</button>
    <p class="footer-note">Version ${VERSION}</p>`;
}
