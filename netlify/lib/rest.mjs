// Minimal Supabase REST helper for Netlify functions (service role — bypasses RLS).
import { normaliseSupabaseUrl } from '../../src/lib/supabase-url.js';

export function hasSupabaseEnv() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function rest(path, init = {}) {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  const res = await fetch(`${normaliseSupabaseUrl(process.env.SUPABASE_URL)}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...init.headers,
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res;
}

export async function restJson(path, init) {
  const res = await rest(path, init);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Who is calling? Verifies a logged-in user's access token with Supabase Auth.
export async function userFromToken(token) {
  if (!token) return null;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY.trim();
  const res = await fetch(`${normaliseSupabaseUrl(process.env.SUPABASE_URL)}/auth/v1/user`, {
    headers: { apikey: key, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}
