import '../styles/app.css';
import { DEMO_MODE, PAGES, supabase } from '../lib/supabase.js';
import { friendlyAuthError, setBusy, showMessage } from './ui.js';

const form = document.getElementById('login-form');
const errorEl = document.getElementById('error');

if (!DEMO_MODE) {
  const { data } = await supabase.auth.getSession();
  if (data.session) location.replace(PAGES.dashboard);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(errorEl, '');
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) return showMessage(errorEl, 'Enter your email and password.');

  if (DEMO_MODE) return location.assign(PAGES.dashboard);

  setBusy(form, true, 'Logging in…');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setBusy(form, false);
    return showMessage(errorEl, friendlyAuthError(error));
  }
  location.replace(PAGES.dashboard);
});
