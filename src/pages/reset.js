// Handles both "forgot password" links and first-time invite links: either way the
// person lands here with a one-time session and picks a password.
import '../styles/app.css';
import { DEMO_MODE, PAGES, supabase } from '../lib/supabase.js';
import { friendlyAuthError, setBusy, showMessage } from './ui.js';

const form = document.getElementById('reset-form');
const errorEl = document.getElementById('error');
const statusEl = document.getElementById('status');
const TIMEOUT_MS = 15000;

// Supabase can send people here in several shapes depending on project settings and
// email templates. Handle each one explicitly rather than relying on auto-detection.
async function establishSession() {
  if (DEMO_MODE) return {};
  const query = new URLSearchParams(location.search);
  const hash = new URLSearchParams(location.hash.slice(1));
  const clearUrl = () => history.replaceState(null, '', location.pathname);

  const linkError = query.get('error_description') || hash.get('error_description') || query.get('error') || hash.get('error');
  if (linkError) {
    clearUrl();
    return { error: linkError };
  }

  // 1. Default links: #access_token=…&refresh_token=…&type=invite|recovery
  const accessToken = hash.get('access_token');
  const refreshToken = hash.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    clearUrl();
    return { error: error?.message };
  }

  // 2. Custom email templates: ?token_hash=…&type=recovery|invite
  const tokenHash = query.get('token_hash');
  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: query.get('type') ?? 'recovery' });
    clearUrl();
    return { error: error?.message };
  }

  // 3. PKCE links: ?code=…
  const code = query.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    clearUrl();
    return { error: error?.message };
  }

  // 4. Already signed in (e.g. page refreshed after the link was used).
  const { data } = await supabase.auth.getSession();
  return data.session ? {} : { error: 'No link details found' };
}

function explain(reason) {
  const r = reason.toLowerCase();
  if (r.includes('timeout')) return "Couldn't reach the login server. Check your internet and try again.";
  if (r.includes('no link details')) {
    return 'Open this page using the link in your email. No email? Click "Forgot password?" to get a new one.';
  }
  return 'This link has expired or already been used. Click "Forgot password?" below to get a new one.';
}

const timeout = new Promise((resolve) => setTimeout(() => resolve({ error: 'timeout' }), TIMEOUT_MS));
let result;
try {
  result = await Promise.race([establishSession(), timeout]);
} catch (err) {
  result = { error: err?.message || 'unknown error' };
}
statusEl.hidden = true;

if (!result.error) {
  form.hidden = false;
  form.password.focus();
} else {
  console.error('Set password link problem:', result.error);
  showMessage(errorEl, `${explain(result.error)} (Details: ${result.error})`);
  document.getElementById('forgot-link').hidden = false;
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
    return showMessage(errorEl, `${friendlyAuthError(error)} (Details: ${error.message})`);
  }
  location.replace(PAGES.dashboard);
});
