-- ElliotAI Client Portal — initial schema
--
-- Two tables:
--   clients : one row per trade business, linked to exactly one login (auth.users).
--   calls   : one row per Vapi call, tagged to the client it belongs to.
--
-- Security model:
--   * Row-level security is ON for both tables.
--   * A logged-in client can SELECT only their own clients row and their own calls.
--   * Nobody except the service role (the Netlify webhook + admin scripts) can
--     insert, update or delete anything. There is no self-service config.

create type public.call_urgency as enum ('urgent', 'somewhat_urgent', 'non_urgent', 'irrelevant');

create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid unique references auth.users (id) on delete set null,
  business_name     text not null,
  -- Client-provided at onboarding. Drives the "Estimated value" figure.
  avg_job_value     numeric(10, 2) not null default 0 check (avg_job_value >= 0),
  -- Deliberately conservative default; shown plainly on the dashboard.
  conversion_rate   numeric(4, 3) not null default 0.30 check (conversion_rate > 0 and conversion_rate <= 1),
  -- Which Vapi assistant answers this business's phone. Used by the webhook to route calls.
  vapi_assistant_id text unique,
  created_at        timestamptz not null default now()
);

create table public.calls (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references public.clients (id) on delete cascade,
  vapi_call_id     text not null unique,
  call_started_at  timestamptz not null default now(),
  duration_seconds integer not null default 0 check (duration_seconds >= 0),
  caller_name      text,
  callback_number  text,
  address          text,
  issue            text,
  details          text,
  urgency          public.call_urgency,
  job_value        text,
  ended_reason     text,
  created_at       timestamptz not null default now()
);

create index calls_client_started_idx on public.calls (client_id, call_started_at desc);

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------
alter table public.clients enable row level security;
alter table public.calls   enable row level security;

create policy "Clients can read their own business"
  on public.clients for select to authenticated
  using (user_id = (select auth.uid()));

create policy "Clients can read their own calls"
  on public.calls for select to authenticated
  using (client_id in (select id from public.clients where user_id = (select auth.uid())));

-- Belt and braces: even without write policies, strip write privileges outright.
revoke all on public.clients, public.calls from anon;
revoke insert, update, delete, truncate on public.clients, public.calls from authenticated;
grant select on public.clients, public.calls to authenticated;

-- ---------------------------------------------------------------------------
-- Dashboard numbers
-- SECURITY INVOKER: runs as the logged-in user, so RLS limits it to their calls.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_stats(p_since timestamptz default null)
returns table (
  calls_handled   bigint,
  total_seconds   bigint,
  leads_captured  bigint,
  urgent          bigint,
  somewhat_urgent bigint,
  non_urgent      bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)                                                        as calls_handled,
    coalesce(sum(duration_seconds), 0)::bigint                      as total_seconds,
    count(*) filter (where urgency in ('urgent', 'somewhat_urgent', 'non_urgent')) as leads_captured,
    count(*) filter (where urgency = 'urgent')                      as urgent,
    count(*) filter (where urgency = 'somewhat_urgent')             as somewhat_urgent,
    count(*) filter (where urgency = 'non_urgent')                  as non_urgent
  from public.calls
  where p_since is null or call_started_at >= p_since;
$$;

revoke execute on function public.dashboard_stats(timestamptz) from public, anon;
grant execute on function public.dashboard_stats(timestamptz) to authenticated;

-- Live updates: new calls appear on an open dashboard within seconds (RLS still applies).
alter publication supabase_realtime add table public.calls;
