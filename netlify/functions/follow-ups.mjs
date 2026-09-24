// Runs every hour:
//   * reminder texts to customers the afternoon before their job (4pm–8pm, business's local time)
//   * the Monday-morning "your week with Elliot" notification for each tradie
import { hasSupabaseEnv } from '../lib/rest.mjs';
import { pushToClient } from '../lib/alerts.mjs';
import { sendReminders, sendWeeklySummaries } from '../lib/followups.mjs';

export default async () => {
  if (!hasSupabaseEnv()) return new Response('skipped: not configured');
  const now = new Date();
  const results = {};
  for (const [name, job] of [
    ['reminders', () => sendReminders(now)],
    ['weekly', () => sendWeeklySummaries(now, { push: pushToClient })],
  ]) {
    try {
      results[name] = await job();
    } catch (err) {
      // Most likely the follow-ups update hasn't been run in Supabase yet.
      console.error(`follow-ups: ${name} failed`, err.message);
      results[name] = { error: err.message };
    }
  }
  console.log('follow-ups', JSON.stringify(results));
  return new Response('ok');
};

export const config = { schedule: '0 * * * *' };
