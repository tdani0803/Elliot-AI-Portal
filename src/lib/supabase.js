import { createClient } from '@supabase/supabase-js';

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!DEMO_MODE && (!url || !anonKey)) {
  // Show the problem on screen instead of leaving buttons that silently do nothing.
  const box = document.createElement('p');
  box.setAttribute('role', 'alert');
  box.style.cssText =
    'position:fixed;inset:16px 16px auto;z-index:99;margin:0;padding:14px 16px;background:#fde4e1;' +
    'border:3px solid #111418;border-radius:12px;font:600 16px/1.4 system-ui,sans-serif;color:#111418';
  box.textContent =
    'Setup problem: this website can\'t find its Supabase settings. In Netlify, check the ' +
    'VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY settings, then go to Deploys → Trigger deploy → Deploy site.';
  document.body.prepend(box);
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. See .env.example.');
}

export const supabase = DEMO_MODE ? null : createClient(url, anonKey);

export const PAGES = {
  login: '/',
  dashboard: '/dashboard.html',
  forgot: '/forgot-password.html',
  reset: '/reset-password.html',
};
