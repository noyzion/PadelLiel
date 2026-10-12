-- Minimal stand-in for the parts of Supabase that the migrations depend on.
-- Only used by the local integration-test database. Real projects get these from Supabase.

create role anon          nologin;
create role authenticated nologin;
create role service_role  nologin bypassrls;

create schema auth;

create table auth.users (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  raw_user_meta_data  jsonb not null default '{}'::jsonb
);

-- Same contract as Supabase: the caller's id comes from the JWT claim `sub`.
create function auth.uid() returns uuid
language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

grant usage on schema auth   to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
