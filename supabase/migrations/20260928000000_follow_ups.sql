-- ElliotAI Client Portal — automatic follow-ups that keep customers (and tradies) happy.
-- Run AFTER the earlier updates. Safe to run more than once.
--
-- Adds:
--   * A thank-you text to every caller after the call ("we've got your roof repair request…")
--   * A reminder text to customers the afternoon before a booked job
--   * A Monday-morning summary notification for the tradie
--   * On/off switches the tradie can flip in the portal (Settings)

alter table public.clients
  add column if not exists text_callers           boolean not null default true,
  add column if not exists remind_customers       boolean not null default true,
  add column if not exists weekly_summary         boolean not null default true,
  add column if not exists business_phone         text,   -- the number customers can ring back on (shown in texts)
  add column if not exists weekly_summary_sent_on date;

alter table public.calls
  add column if not exists caller_texted_at timestamptz;

alter table public.bookings
  add column if not exists reminder_sent_at timestamptz;

create index if not exists bookings_reminder_idx
  on public.bookings (starts_at)
  where status = 'booked' and reminder_sent_at is null;

-- Tradies can flip their own switches (and nothing else on their business row).
drop policy if exists "Update own settings" on public.clients;
create policy "Update own settings"
  on public.clients for update to authenticated
  using (id in (select public.my_client_ids()))
  with check (id in (select public.my_client_ids()));

revoke update on public.clients from authenticated;
grant update (text_callers, remind_customers, weekly_summary) on public.clients to authenticated;
