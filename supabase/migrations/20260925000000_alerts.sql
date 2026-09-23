-- ElliotAI Client Portal — lead alerts, call-back promise, calendar feed
-- Run AFTER 20260924000000_pro_features.sql. Safe to run more than once.
--
-- Adds:
--   * Call-back promise per business (what Elliot tells callers) -> overdue flags
--   * Phone notifications (web push) for every new lead
--   * Backup text message when an urgent lead's notification isn't opened
--   * A private calendar link so jobs show in the tradie's phone calendar

-- ---------------------------------------------------------------------------
-- Per-business settings (you fill these in; clients can't change them)
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists callback_urgent_minutes   integer not null default 60  check (callback_urgent_minutes > 0),
  add column if not exists callback_standard_minutes integer not null default 240 check (callback_standard_minutes > 0),
  add column if not exists alert_phone               text,
  add column if not exists sms_backup                boolean not null default true,
  add column if not exists calendar_token            uuid not null default gen_random_uuid();

create unique index if not exists clients_calendar_token_idx on public.clients (calendar_token);

-- ---------------------------------------------------------------------------
-- Alert tracking on calls (written by the server; clients may mark "opened")
-- ---------------------------------------------------------------------------
alter table public.calls
  add column if not exists notified_at     timestamptz,
  add column if not exists alert_opened_at timestamptz,
  add column if not exists sms_sent_at     timestamptz;

grant update (alert_opened_at) on public.calls to authenticated;

create index if not exists calls_backup_sms_idx
  on public.calls (notified_at)
  where urgency = 'urgent' and sms_sent_at is null and alert_opened_at is null;

-- ---------------------------------------------------------------------------
-- Phones that want notifications (one row per phone/browser per login)
-- ---------------------------------------------------------------------------
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  client_id  uuid not null references public.clients (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_client_idx on public.push_subscriptions (client_id);

alter table public.push_subscriptions enable row level security;

drop policy if exists "Manage own phones" on public.push_subscriptions;
create policy "Manage own phones"
  on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and client_id in (select public.my_client_ids()));

revoke all on public.push_subscriptions from anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;

-- ---------------------------------------------------------------------------
-- Server-only settings (notification keys are created here automatically)
-- No policies: only the service role (Netlify functions) can read or write.
-- ---------------------------------------------------------------------------
create table if not exists public.app_secrets (
  name       text primary key,
  value      text not null,
  created_at timestamptz not null default now()
);

alter table public.app_secrets enable row level security;
revoke all on public.app_secrets from anon, authenticated;
