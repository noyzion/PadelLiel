-- Test-only: replaces app_now() so tests can control "now" (visible to every connection).
create table public.test_clock (now_at timestamptz);

create or replace function public.app_now() returns timestamptz
language sql stable security definer set search_path = public as $$
  select coalesce((select now_at from public.test_clock limit 1), now())
$$;
