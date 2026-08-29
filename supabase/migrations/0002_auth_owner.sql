-- ============================================================================
-- Single-owner admin auth
--
-- This product has exactly one admin (you). Rather than a roles table, we
-- store your one allowed user id in app_config and check against it. You set
-- this after creating your Supabase Auth user (see README "Настройка Auth").
-- ============================================================================

create table if not exists app_config (
  id boolean primary key default true constraint app_config_singleton check (id = true),
  owner_user_id uuid, -- set this once, manually, after creating your admin user (see README)
  updated_at timestamptz not null default now()
);

insert into app_config (id) values (true) on conflict (id) do nothing;

alter table app_config enable row level security;
-- No policies at all on app_config for anon or authenticated — it is only ever
-- read via the SECURITY DEFINER function below, and only ever written by you
-- via the Supabase SQL editor / dashboard, never via the app.

create or replace function is_admin()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select
    auth.uid() is not null
    and auth.uid() = (select owner_user_id from app_config where id = true);
$$;

comment on function is_admin() is
  'Returns true only for the single configured owner account. Used by every RLS policy that gates admin-only reads/writes.';
