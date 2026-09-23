// Anyone can make a login, but it shows nothing until ElliotAI links it to a
// business in the `clients` table (row-level security enforces this).
import '../styles/app.css';
import { DEMO_MODE, PAGES, supabase } from '../lib/supabase.js';
import { friendlyAuthError, setBusy, showMessage } from './ui.js';

const form = document.getElementById('signup-form');
const errorEl = document.getElementById('error');
const okEl = document.getElementById('ok');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(errorEl, '');
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email) return showMessage(errorEl, 'Enter your email.');
  if (password.length < 8) return showMessage(errorEl, 'Use at least 8 characters for your password.');
  if (password !== form.confirm.value) return showMessage(errorEl, "Those two passwords don't match.");

  if (DEMO_MODE) return location.assign(PAGES.dashboard);

  setBusy(form, true, 'Creating…');
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: new URL(PAGES.login, location.origin).href },
  });
  if (error) {
    setBusy(form, false);
    return showMessage(errorEl, `${friendlyAuthError(error)} (Details: ${error.message})`);
  }
  if (data.session) return location.replace(PAGES.dashboard);

  // Supabase is set to confirm emails first.
  form.hidden = true;
  showMessage(okEl, `Nearly done. Check ${email} for a link to activate your account, then log in.`);
});
