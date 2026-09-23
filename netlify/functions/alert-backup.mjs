// Runs every 5 minutes. If an URGENT lead's notification hasn't been opened within
// 10 minutes (and nobody has called them back), send a backup text to the tradie.
import { hasSupabaseEnv, restJson } from '../lib/rest.mjs';
import { BACKUP_AFTER_MINUTES, smsConfigured, textClient } from '../lib/alerts.mjs';

export default async () => {
  if (!hasSupabaseEnv() || !smsConfigured()) return new Response('skipped: not configured');
  const now = Date.now();
  const olderThan = new Date(now - BACKUP_AFTER_MINUTES * 60000).toISOString();
  const newerThan = new Date(now - 6 * 3600000).toISOString(); // don't text about stale leads after downtime
  let due;
  try {
    due = await restJson(
      'calls?select=id,client_id,caller_name,issue,address,urgency,callback_number,call_started_at,' +
        'clients(business_name,callback_urgent_minutes,callback_standard_minutes,alert_phone,sms_backup)' +
        `&urgency=eq.urgent&lead_status=eq.new&sms_sent_at=is.null&alert_opened_at=is.null` +
        `&notified_at=lt.${encodeURIComponent(olderThan)}&notified_at=gt.${encodeURIComponent(newerThan)}&limit=50`,
    );
  } catch (err) {
    console.error('alert-backup: query failed (alerts migration run?)', err.message);
    return new Response('error', { status: 500 });
  }
  let texted = 0;
  for (const call of due) {
    try {
      if (await textClient(call, call.clients)) texted += 1;
    } catch (err) {
      console.error(`alert-backup: text for ${call.id} failed`, err.message);
    }
  }
  if (texted) console.log(`alert-backup: sent ${texted} backup text(s)`);
  return new Response(`ok: ${texted}`);
};

export const config = { schedule: '*/5 * * * *' };
