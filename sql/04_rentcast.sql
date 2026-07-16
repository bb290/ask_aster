-- Rental comp report widget: RentCast proxy cache + usage counters.
-- Run once against the ask-aster Supabase project (SQL editor or psql).
-- Used by supabase/functions/rentcast-proxy.

create table if not exists rentcast_cache (
  cache_key  text primary key,
  payload    jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists rentcast_usage (
  day   date not null,
  scope text not null,           -- 'global' or 'ip:<addr>'
  count integer not null default 0,
  primary key (day, scope)
);

-- Atomic increment; returns the new count for the (day, scope) pair.
create or replace function rentcast_increment(p_day date, p_scope text)
returns integer
language plpgsql
security definer
as $$
declare
  v integer;
begin
  insert into rentcast_usage (day, scope, count)
  values (p_day, p_scope, 1)
  on conflict (day, scope)
  do update set count = rentcast_usage.count + 1
  returning count into v;
  return v;
end;
$$;

-- Housekeeping helper (optional, call whenever): drop cache older than 7 days
-- and usage rows older than 30 days.
create or replace function rentcast_cleanup()
returns void
language sql
security definer
as $$
  delete from rentcast_cache where created_at < now() - interval '7 days';
  delete from rentcast_usage where day < current_date - 30;
$$;
