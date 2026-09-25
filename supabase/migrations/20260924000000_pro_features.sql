-- ElliotAI Client Portal — "Pro" features
-- Run this AFTER 20260923000000_init.sql. Safe to run more than once.
--
-- Adds:
--   * Call recordings, transcripts, AI summaries and job types
--   * Lead pipeline: New -> Called back -> Quoted -> Won / Lost (+ real job value)
--   * Business hours, monthly fee (for ROI) and Google review link per client
--   * Team logins (several people per business)
--   * Bookings (jobs calendar), including jobs Elliot books during a call
--
-- Clients can now change a few things themselves (lead status, notes, bookings),
-- but only for their own business. Everything else is still service-role only.

-- ---------------------------------------------------------------------------
-- Calls: detail + lead pipeline
-- ---------------------------------------------------------------------------
do $$
begin
  create type public.lead_status as enum ('new', 'called_back', 'quoted', 'won', 'lost');
exception when duplicate_object then null; -- already there from an earlier run
end
$$;

alter table public.calls
  add column if not exists recording_url     text,
  add column if not exists transcript        text,
  add column if not exists summary           text,
  add column if not exists job_type          text,
  add column if not exists lead_status       public.lead_status not null default 'new',
  add column if not exists won_value         numeric(12, 2) check (won_value >= 0),
  add column if not exists notes             text,
  add column if not exists assigned_to       text,
  add column if not exists status_updated_at timestamptz;

-- Stamp when a lead's status changes, so "won this month" means won this month.
create or replace function public.stamp_lead_status()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.lead_status is distinct from old.lead_status then
    new.status_updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists calls_stamp_lead_status on public.calls;
create trigger calls_stamp_lead_status
  before update of lead_status on public.calls
  for each row execute function public.stamp_lead_status();

-- ---------------------------------------------------------------------------
-- Clients: settings you (ElliotAI) fill in per business
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists monthly_fee    numeric(10, 2) check (monthly_fee >= 0),
  add column if not exists timezone       text not null default 'Australia/Sydney',
  add column if not exists business_hours jsonb not null default
    '{"mon":["07:00","17:00"],"tue":["07:00","17:00"],"wed":["07:00","17:00"],"thu":["07:00","17:00"],"fri":["07:00","17:00"],"sat":null,"sun":null}',
  add column if not exists review_url     text;

-- ---------------------------------------------------------------------------
-- Team logins: extra people who can see a business's dashboard
-- ---------------------------------------------------------------------------
create table if not exists public.client_members (
  client_id    uuid not null references public.clients (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null,
  created_at   timestamptz not null default now(),
  primary key (client_id, user_id)
);

-- Which businesses can the logged-in person see? (owner or team member)
-- SECURITY DEFINER so policies can use it without recursive RLS checks.
create or replace function public.my_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from public.clients where user_id = (select auth.uid())
  union
  select client_id from public.client_members where user_id = (select auth.uid());
$$;

revoke execute on function public.my_client_ids() from public, anon;
grant execute on function public.my_client_ids() to authenticated;

-- Swap the owner-only read policies for owner-or-team ones.
drop policy if exists "Clients can read their own business" on public.clients;
drop policy if exists "Clients can read their own calls" on public.calls;

drop policy if exists "Read own business" on public.clients;
create policy "Read own business"
  on public.clients for select to authenticated
  using (id in (select public.my_client_ids()));

drop policy if exists "Read own calls" on public.calls;
create policy "Read own calls"
  on public.calls for select to authenticated
  using (client_id in (select public.my_client_ids()));

-- Clients may update ONLY these columns on their own calls.
drop policy if exists "Update own calls" on public.calls;
create policy "Update own calls"
  on public.calls for update to authenticated
  using (client_id in (select public.my_client_ids()))
  with check (client_id in (select public.my_client_ids()));

grant update (lead_status, won_value, notes, assigned_to) on public.calls to authenticated;

alter table public.client_members enable row level security;

drop policy if exists "Read own team" on public.client_members;
create policy "Read own team"
  on public.client_members for select to authenticated
  using (client_id in (select public.my_client_ids()));

revoke all on public.client_members from anon;
grant select on public.client_members to authenticated;

-- ---------------------------------------------------------------------------
-- Bookings (jobs calendar)
-- ---------------------------------------------------------------------------
create table if not exists public.bookings (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (id) on delete cascade,
  call_id          uuid references public.calls (id) on delete set null,
  vapi_call_id     text,
  customer_name    text,
  phone            text,
  address          text,
  job              text not null,
  starts_at        timestamptz not null,
  duration_minutes integer not null default 60 check (duration_minutes > 0),
  notes            text,
  assigned_to      text,
  status           text not null default 'booked' check (status in ('booked', 'done', 'cancelled')),
  source           text not null default 'manual' check (source in ('manual', 'elliot')),
  created_at       timestamptz not null default now()
);

create index if not exists bookings_client_starts_idx on public.bookings (client_id, starts_at);

alter table public.bookings enable row level security;

drop policy if exists "Manage own bookings" on public.bookings;
create policy "Manage own bookings"
  on public.bookings for all to authenticated
  using (client_id in (select public.my_client_ids()))
  with check (client_id in (select public.my_client_ids()));

revoke all on public.bookings from anon;
grant select, insert, update, delete on public.bookings to authenticated;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'bookings') then
    alter publication supabase_realtime add table public.bookings;
  end if;
end
$$;
