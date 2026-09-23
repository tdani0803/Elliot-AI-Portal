// Minimal Supabase REST helper for Netlify functions (service role — bypasses RLS).
import { normaliseSupabaseUrl } from '../../src/lib/supabase-url.js';

export function hasSupabaseEnv() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

// New-style Supabase keys ("sb_secret_…") go in the apikey header only — they aren't
// JWTs, so sending them as "Authorization: Bearer" gets rejected. Legacy service_role
// keys are JWTs and need both headers.
// Tidy what people paste into Netlify: quotes, "NAME=" in front, spaces or line breaks.
export function serviceKey() {
  return String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '')
    .trim()
    .replace(/^SUPABASE_SERVICE_ROLE_KEY\s*=\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .replace(/\s+/g, '');
}

export function serviceHeaders(withBearer) {
  const key = serviceKey();
  const bearer = withBearer ?? !key.startsWith('sb_');
  return bearer ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

// Safe to show: enough to compare with the Supabase dashboard, not enough to use.
export function keyFingerprint() {
  const key = serviceKey();
  if (!key) return 'no key is set';
  const kind = key.startsWith('sb_secret_') ? 'a secret key' : key.startsWith('sb_publishable_') ? 'a PUBLISHABLE key (wrong one — use the secret key)' : key.startsWith('eyJ') ? 'a legacy key' : 'not a Supabase key';
  return `the key in Netlify is ${kind}, starts "${key.slice(0, key.startsWith('sb_') ? 13 : 6)}…" and is ${key.length} characters long`;
}

export async function rest(path, init = {}) {
  const url = `${normaliseSupabaseUrl(process.env.SUPABASE_URL)}/rest/v1/${path}`;
  const send = (withBearer) =>
    fetch(url, { ...init, headers: { ...serviceHeaders(withBearer), 'Content-Type': 'application/json', ...init.headers } });
  let res = await send();
  // If Supabase rejects the key one way, try the other way before giving up.
  if (res.status === 401) res = await send(!serviceHeaders().Authorization);
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
  const res = await fetch(`${normaliseSupabaseUrl(process.env.SUPABASE_URL)}/auth/v1/user`, {
    headers: { apikey: serviceKey(), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  return res.json();
}
