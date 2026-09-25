import '../styles/app.css';
import { DEMO_MODE, PAGES, supabase } from '../lib/supabase.js';
import { friendlyAuthError, setBusy, showMessage } from './ui.js';

// ?next=owner sends you back to the owner page after logging in.
const after = new URLSearchParams(location.search).get('next') === 'owner' ? PAGES.owner : PAGES.dashboard;
const form = document.getElementById('login-form');
const errorEl = document.getElementById('error');

if (!DEMO_MODE) {
  const { data } = await supabase.auth.getSession();
  if (data.session) location.replace(after);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(errorEl, '');
  const email = form.email.value.trim();
  const password = form.password.value;
  if (!email || !password) return showMessage(errorEl, 'Enter your email and password.');

  if (DEMO_MODE) return location.assign(after);

  setBusy(form, true, 'Logging in…');
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setBusy(form, false);
    return showMessage(errorEl, friendlyAuthError(error));
  }
  location.replace(after);
});
