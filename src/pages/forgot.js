import '../styles/app.css';
import { DEMO_MODE, PAGES, supabase } from '../lib/supabase.js';
import { friendlyAuthError, setBusy, showMessage } from './ui.js';

const form = document.getElementById('forgot-form');
const errorEl = document.getElementById('error');
const okEl = document.getElementById('ok');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(errorEl, '');
  const email = form.email.value.trim();
  if (!email) return showMessage(errorEl, 'Enter your email.');

  setBusy(form, true, 'Sending…');
  const { error } = DEMO_MODE
    ? { error: null }
    : await supabase.auth.resetPasswordForEmail(email, { redirectTo: new URL(PAGES.reset, location.origin).href });
  setBusy(form, false);

  if (error) return showMessage(errorEl, friendlyAuthError(error));
  // Same message whether or not the account exists, so emails can't be fished for.
  form.hidden = true;
  showMessage(okEl, `If ${email} has an account, a reset link is on its way. Check your inbox (and junk folder).`);
});
