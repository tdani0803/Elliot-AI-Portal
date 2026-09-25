-- ElliotAI Client Portal — your owner tools: add clients without SQL, see costs and profit,
-- get told when something breaks, and bill clients through Stripe.
-- Run AFTER the earlier updates. Safe to run more than once.

-- ---------------------------------------------------------------------------
-- Clients: whose login it is, and billing
-- ---------------------------------------------------------------------------
alter table public.clients
  add column if not exists owner_email            text,
  add column if not exists billing_status         text not null default 'none',
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists last_paid_at           timestamptz;

alter table public.clients drop constraint if exists clients_billing_status_check;
alter table public.clients add constraint clients_billing_status_check
  check (billing_status in ('none', 'invited', 'active', 'past_due', 'cancelled'));

create unique index if not exists clients_owner_email_idx on public.clients (lower(owner_email)) where owner_email is not null;

-- Fill in owner_email for businesses that are already linked to a login.
update public.clients c set owner_email = u.email
from auth.users u
where c.user_id = u.id and c.owner_email is null;

-- ---------------------------------------------------------------------------
-- Link a new login to its business automatically (whichever comes first:
-- you add the business, or they sign up — they meet up by email)
-- ---------------------------------------------------------------------------
create or replace function public.link_client_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.clients
  set user_id = new.id
  where user_id is null and lower(owner_email) = lower(new.email);
  return new;
end
$$;

drop trigger if exists link_client_on_signup on auth.users;
create trigger link_client_on_signup
  after insert on auth.users
  for each row execute function public.link_client_on_signup();

-- Server-only helpers (the owner page uses these through the service key).
create or replace function public.admin_user_id(p_email text)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) = lower(trim(p_email)) limit 1
$$;

create or replace function public.admin_user_ids(p_emails text[])
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select id from auth.users where lower(email) in (select lower(trim(e)) from unnest(p_emails) e)
$$;

revoke execute on function public.admin_user_id(text) from public, anon, authenticated;
revoke execute on function public.admin_user_ids(text[]) from public, anon, authenticated;
revoke execute on function public.link_client_on_signup() from public, anon, authenticated;
grant execute on function public.admin_user_id(text) to service_role;
grant execute on function public.admin_user_ids(text[]) to service_role;

-- ---------------------------------------------------------------------------
-- What each call cost you (from Vapi's end-of-call report, in US dollars)
-- ---------------------------------------------------------------------------
alter table public.calls add column if not exists cost_usd numeric(10, 4);

-- ---------------------------------------------------------------------------
-- Problems log: anything that went wrong, shown on your owner page
-- ---------------------------------------------------------------------------
create table if not exists public.system_events (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid references public.clients (id) on delete cascade,
  kind       text not null,
  message    text not null,
  created_at timestamptz not null default now()
);

create index if not exists system_events_recent_idx on public.system_events (created_at desc);
create index if not exists system_events_kind_idx on public.system_events (client_id, kind, created_at desc);

alter table public.system_events enable row level security;
revoke all on public.system_events from anon, authenticated;
