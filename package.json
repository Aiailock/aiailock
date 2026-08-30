-- Foundation extension required by password hashing in later migrations.
create extension if not exists pgcrypto with schema extensions;

-- Compatibility for deployments where the extension schema is not on the default search_path.
grant usage on schema extensions to anon, authenticated, service_role;

create table if not exists public.app_config (
  id boolean primary key default true,
  owner_email text,
  updated_at timestamptz not null default now(),
  constraint app_config_singleton check (id = true)
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
set search_path = public, extensions, pg_temp
stable
as $$
  select
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.app_config
      where id = true
        and owner_email is not null
        and lower(owner_email) = lower(coalesce(auth.jwt() ->> 'email', ''))
    );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;
