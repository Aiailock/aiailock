begin;
-- Additive update. Does not modify story positions, messages or media.
create table public.reader_live_state (
  id boolean primary key default true check(id),
  revision bigint not null default 1,
  analytics_epoch bigint not null default 0
);
insert into public.reader_live_state(id) values(true);
alter table public.reader_live_state enable row level security;
create policy "read revision only" on public.reader_live_state for select to anon, authenticated using(true);
grant select on public.reader_live_state to anon, authenticated;
grant all on public.reader_live_state to service_role;

create table public.chapter_support (
  id uuid primary key default gen_random_uuid(),
  anchor_id uuid not null references public.timeline_elements(id) on delete cascade,
  placement text not null check(placement in ('before','after')),
  title text not null default '' check(length(title)<=120),
  body text not null check(length(trim(body)) between 1 and 2000),
  signature text not null default '' check(length(signature)<=100),
  style text not null default 'letter' check(style in ('letter','night','sunrise','minimal')),
  published boolean not null default false,
  created_at timestamptz not null default now()
);
create index chapter_support_anchor on public.chapter_support(anchor_id,created_at,id);
alter table public.chapter_support enable row level security;
create policy "owner support" on public.chapter_support for all to authenticated using(public.is_admin()) with check(public.is_admin());
grant select,insert,update,delete on public.chapter_support to authenticated;
grant all on public.chapter_support to service_role;

create function public.notify_reader_change() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
begin
  update reader_live_state set revision=revision+1 where id;
  return null;
end $$;
revoke all on function public.notify_reader_change() from public;
do $$ declare t text; begin
  foreach t in array array['timeline_elements','messages','media','memories','screenshots','history_settings','chapter_support'] loop
    execute format('create trigger reader_live_change after insert or update or delete on public.%I for each statement execute function public.notify_reader_change()',t);
  end loop;
  if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='reader_live_state') then
    alter publication supabase_realtime add table public.reader_live_state;
  end if;
end $$;

create table public.reader_ignored_visitors(visitor_id uuid primary key);
alter table public.reader_ignored_visitors enable row level security;
create policy "owner exclusions" on public.reader_ignored_visitors for select to authenticated using(public.is_admin());
grant select on public.reader_ignored_visitors to authenticated;
grant all on public.reader_ignored_visitors to service_role;
alter table public.reader_visitors add column analytics_epoch bigint not null default 0;
alter table public.reader_visits add column analytics_epoch bigint not null default 0;
create function public.guard_reader_analytics() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare current_epoch bigint;
begin
  select analytics_epoch into current_epoch from reader_live_state where id for share;
  if new.analytics_epoch <> current_epoch or exists(select 1 from reader_ignored_visitors where visitor_id=new.visitor_id) then
    raise exception 'analytics session reset or excluded';
  end if;
  return new;
end $$;
revoke all on function public.guard_reader_analytics() from public;
create trigger analytics_guard before insert or update on public.reader_visitors for each row execute function public.guard_reader_analytics();
create trigger analytics_guard before insert or update on public.reader_visits for each row execute function public.guard_reader_analytics();

create or replace function public.admin_clear_reader_analytics(p_include_reactions boolean default false) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer; v integer;
begin
  if is_admin() is not true then raise exception 'not authorized'; end if;
  update reader_live_state set analytics_epoch=analytics_epoch+1 where id;
  select count(*) into n from reader_visitors;
  select count(*) into v from reader_visits;
  delete from reader_visits;
  delete from reader_visitors;
  if p_include_reactions then
    delete from reader_reactions;
    delete from reader_interaction_answers;
  end if;
  return jsonb_build_object('visitors',n,'visits',v);
end $$;
revoke all on function public.admin_clear_reader_analytics(boolean) from public;
grant execute on function public.admin_clear_reader_analytics(boolean) to authenticated;

create function public.admin_set_reader_excluded(p_visitor_id uuid,p_excluded boolean) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if is_admin() is not true then raise exception 'not authorized'; end if;
  -- Serialize with in-flight analytics writes and global reset.
  perform 1 from reader_live_state where id for update;
  if p_excluded then
    insert into reader_ignored_visitors values(p_visitor_id) on conflict do nothing;
    delete from reader_visits where visitor_id=p_visitor_id;
    delete from reader_visitors where visitor_id=p_visitor_id;
  else
    delete from reader_ignored_visitors where visitor_id=p_visitor_id;
  end if;
end $$;
revoke all on function public.admin_set_reader_excluded(uuid,boolean) from public;
grant execute on function public.admin_set_reader_excluded(uuid,boolean) to authenticated;

commit;
