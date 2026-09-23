import { createClient } from '@supabase/supabase-js';

export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!DEMO_MODE && (!url || !anonKey)) {
  throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. See .env.example.');
}

export const supabase = DEMO_MODE ? null : createClient(url, anonKey);

export const PAGES = {
  login: '/',
  dashboard: '/dashboard.html',
  forgot: '/forgot-password.html',
  reset: '/reset-password.html',
};
