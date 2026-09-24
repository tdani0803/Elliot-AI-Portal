-- ElliotAI Client Portal — pick a business's state and its time zone is set for you.
-- Type QLD, NSW, VIC, TAS, ACT, SA, NT or WA in clients.state; clients.timezone fills itself in.
-- Run AFTER the earlier updates. Safe to run more than once.

alter table public.clients add column if not exists state text;

alter table public.clients drop constraint if exists clients_state_check;
alter table public.clients add constraint clients_state_check
  check (state is null or state in ('QLD', 'NSW', 'VIC', 'TAS', 'ACT', 'SA', 'NT', 'WA'));

-- Each state's clock. QLD has no daylight saving; NSW/VIC/TAS/ACT/SA do; NT and WA don't.
create or replace function public.timezone_for_state(p_state text)
returns text
language sql
immutable
as $$
  select case upper(trim(p_state))
    when 'QLD' then 'Australia/Brisbane'
    when 'NSW' then 'Australia/Sydney'
    when 'ACT' then 'Australia/Sydney'
    when 'VIC' then 'Australia/Melbourne'
    when 'TAS' then 'Australia/Hobart'
    when 'SA'  then 'Australia/Adelaide'
    when 'NT'  then 'Australia/Darwin'
    when 'WA'  then 'Australia/Perth'
  end
$$;

-- Tidy the state ("qld " -> "QLD") and set the time zone whenever the state is filled in or changed.
-- A business in an odd spot (e.g. Broken Hill, NSW, runs on Adelaide time) can leave state empty
-- and type its timezone by hand.
create or replace function public.clients_set_timezone()
returns trigger
language plpgsql
as $$
begin
  if new.state is not null then
    new.state := upper(trim(new.state));
    new.timezone := coalesce(public.timezone_for_state(new.state), new.timezone);
  end if;
  return new;
end
$$;

drop trigger if exists clients_set_timezone on public.clients;
create trigger clients_set_timezone
  before insert or update of state on public.clients
  for each row execute function public.clients_set_timezone();

-- Clients already set to a known state's time zone get their state filled in.
update public.clients set state = case timezone
    when 'Australia/Brisbane' then 'QLD'
    when 'Australia/Melbourne' then 'VIC'
    when 'Australia/Hobart' then 'TAS'
    when 'Australia/Adelaide' then 'SA'
    when 'Australia/Darwin' then 'NT'
    when 'Australia/Perth' then 'WA'
  end
where state is null
  and timezone in ('Australia/Brisbane', 'Australia/Melbourne', 'Australia/Hobart', 'Australia/Adelaide', 'Australia/Darwin', 'Australia/Perth');
