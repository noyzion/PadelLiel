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

-- Minimal stand-in for Supabase Storage (only the tables the policies touch). As on Supabase, the API
-- roles hold full table privileges on storage.objects and Row Level Security is the only gate.
create schema storage;

create table storage.buckets (
  id                  text primary key,
  name                text not null unique,
  public              boolean not null default false,
  file_size_limit     bigint,
  allowed_mime_types  text[]
);

create table storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets (id),
  name       text,
  owner      uuid default auth.uid(),
  metadata   jsonb,
  created_at timestamptz not null default now(),
  unique (bucket_id, name)
);
alter table storage.objects enable row level security;

grant usage on schema storage to anon, authenticated, service_role;
grant select on storage.buckets to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;

grant usage on schema auth   to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
