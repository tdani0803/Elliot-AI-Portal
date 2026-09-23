// Handles both "forgot password" links and first-time invite links: either way the
// person lands here with a one-time session and picks a password.
import '../styles/app.css';
import { DEMO_MODE, PAGES, supabase } from '../lib/supabase.js';
import { friendlyAuthError, setBusy, showMessage } from './ui.js';

const form = document.getElementById('reset-form');
const errorEl = document.getElementById('error');
const EXPIRED = 'This link has expired or already been used. Request a new one from "Forgot password?".';

async function establishSession() {
  if (DEMO_MODE) return true;
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  if (query.get('error') || hash.get('error')) return false;

  // Custom email templates may link with ?token_hash=…&type=recovery|invite.
  const tokenHash = query.get('token_hash');
  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: query.get('type') ?? 'recovery' });
    history.replaceState(null, '', location.pathname);
    return !error;
  }
  // Default links (#access_token=… or ?code=…) are picked up by supabase-js on load.
  const { data } = await supabase.auth.getSession();
  return Boolean(data.session);
}

if (await establishSession()) {
  form.hidden = false;
  form.password.focus();
} else {
  showMessage(errorEl, EXPIRED);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(errorEl, '');
  const password = form.password.value;
  if (password.length < 8) return showMessage(errorEl, 'Use at least 8 characters.');
  if (password !== form.confirm.value) return showMessage(errorEl, "Those two passwords don't match.");

  if (DEMO_MODE) return location.replace(PAGES.dashboard);

  setBusy(form, true, 'Saving…');
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    setBusy(form, false);
    return showMessage(errorEl, friendlyAuthError(error));
  }
  location.replace(PAGES.dashboard);
});
