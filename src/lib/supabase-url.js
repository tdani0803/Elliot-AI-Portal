// People copy the Supabase URL from different places in the dashboard, e.g.
//   https://abc.supabase.co/rest/v1/   (Data API page)
//   https://supabase.com/dashboard/project/abc   (browser address bar)
// The client libraries need just https://abc.supabase.co, so normalise it.
export function normaliseSupabaseUrl(raw) {
  if (!raw) return raw;
  const text = String(raw).trim().replace(/^["']|["']$/g, '');
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
  } catch {
    return text;
  }
  const dashboard = url.hostname.endsWith('supabase.com') && url.pathname.match(/\/project\/([a-z0-9]+)/i);
  if (dashboard) return `https://${dashboard[1]}.supabase.co`;
  return url.origin;
}
