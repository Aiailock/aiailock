-- Admin usability + reader interaction/analytics upgrade.
-- Additive migration: existing history rows and media remain compatible.

-- Interactive moments are stored in `memories` (so they can reuse title,
-- text, date, optional photo and style) and get their own reader type.
alter table timeline_elements
  drop constraint if exists timeline_elements_type_check;
alter table timeline_elements
  add constraint timeline_elements_type_check check (type in (
    'message', 'photo', 'video', 'audio', 'sticker',
    'memory', 'special', 'interactive', 'screenshot',
    'year_break', 'on_this_day', 'milestone'
  ));

-- A media message legitimately has both message_id and media_id. The original
-- v1 check counted those as two unrelated sources and could reject imported
-- photos. Keep memories/screenshots exclusive while allowing that pair.
alter table timeline_elements
  drop constraint if exists timeline_elements_one_source;
alter table timeline_elements
  add constraint timeline_elements_one_source check (
    ((memory_id is not null)::int + (screenshot_id is not null)::int <= 1)
    and not (memory_id is not null and (message_id is not null or media_id is not null))
    and not (screenshot_id is not null and (message_id is not null or media_id is not null))
  );

create or replace function sync_memory_timeline() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  kind_value text := coalesce(new.metadata->>'kind', '');
  timeline_type text := case
    when kind_value = 'special' then 'special'
    when kind_value = 'interactive' then 'interactive'
    else 'memory'
  end;
  resolved_importance smallint := greatest(0, least(5, coalesce(new.importance, 0)));
  resolved_at timestamptz := new.occurred_at;
begin
  if new.place_after_message_id is not null then
    select sent_at into resolved_at from messages where id = new.place_after_message_id;
  end if;
  insert into timeline_elements(type,occurred_at,sort_tiebreak,memory_id,style,is_published,metadata,importance)
  values(
    timeline_type,
    resolved_at,
    10,
    new.id,
    new.style,
    true,
    coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object(
      'position', case when new.place_after_message_id is null then 'custom' else 'after_message' end
    ),
    resolved_importance
  )
  on conflict (memory_id) where memory_id is not null do update
    set type=excluded.type,
        occurred_at=excluded.occurred_at,
        style=excluded.style,
        metadata=excluded.metadata,
        importance=excluded.importance;
  return new;
end $$;

drop trigger if exists trg_sync_memory_timeline on memories;
create trigger trg_sync_memory_timeline
after insert or update of occurred_at,style,place_after_message_id,importance,photo_storage_path,metadata
on memories for each row execute function sync_memory_timeline();

update timeline_elements te
set type = case
  when coalesce(mem.metadata->>'kind','') = 'special' then 'special'
  when coalesce(mem.metadata->>'kind','') = 'interactive' then 'interactive'
  else 'memory'
end,
metadata = coalesce(mem.metadata, '{}'::jsonb)
from memories mem
where te.memory_id = mem.id;

-- Apply a top-level style patch to mixed timeline source types. This keeps
-- memories/screenshots and their timeline mirrors in sync.
create or replace function admin_bulk_update_timeline(
  p_ids uuid[],
  p_style_patch jsonb default null,
  p_published boolean default null
) returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer := 0;
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;

  if p_style_patch is not null then
    update memories m
      set style = coalesce(m.style, '{}'::jsonb) || p_style_patch,
          updated_at = now()
    where m.id in (select te.memory_id from timeline_elements te where te.id = any(p_ids) and te.memory_id is not null);

    update screenshots s
      set style = coalesce(s.style, '{}'::jsonb) || p_style_patch
    where s.id in (select te.screenshot_id from timeline_elements te where te.id = any(p_ids) and te.screenshot_id is not null);

    update timeline_elements te
      set style = coalesce(te.style, '{}'::jsonb) || p_style_patch
    where te.id = any(p_ids);
  end if;

  if p_published is not null then
    update timeline_elements set is_published = p_published where id = any(p_ids);
  end if;

  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function admin_bulk_update_timeline(uuid[],jsonb,boolean) from public;
grant execute on function admin_bulk_update_timeline(uuid[],jsonb,boolean) to authenticated;

-- Delete canonical sources, not merely the timeline mirror. Storage paths are
-- returned so the admin client can also remove the private objects.
create or replace function admin_delete_timeline_elements(p_ids uuid[])
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  message_ids uuid[] := '{}';
  memory_ids uuid[] := '{}';
  screenshot_ids uuid[] := '{}';
  media_ids uuid[] := '{}';
  storage_objects jsonb := '[]'::jsonb;
  requested integer := coalesce(array_length(p_ids, 1), 0);
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if requested = 0 then return jsonb_build_object('deleted', 0, 'storage', storage_objects); end if;

  select coalesce(array_agg(distinct message_id) filter (where message_id is not null), '{}'),
         coalesce(array_agg(distinct memory_id) filter (where memory_id is not null), '{}'),
         coalesce(array_agg(distinct screenshot_id) filter (where screenshot_id is not null), '{}'),
         coalesce(array_agg(distinct media_id) filter (where media_id is not null), '{}')
  into message_ids, memory_ids, screenshot_ids, media_ids
  from timeline_elements where id = any(p_ids);

  select coalesce(jsonb_agg(item), '[]'::jsonb) into storage_objects from (
    select jsonb_build_object('bucket',
      case md.kind when 'photo' then 'photos' when 'video' then 'videos'
        when 'audio' then 'audio' when 'sticker' then 'stickers' else 'documents' end,
      'path', md.storage_path) as item
    from media md where md.id = any(media_ids) and md.storage_path is not null
    union all
    select jsonb_build_object('bucket','thumbnails','path',md.thumbnail_path)
    from media md where md.id = any(media_ids) and md.thumbnail_path is not null
    union all
    select jsonb_build_object('bucket','screenshots','path',m.photo_storage_path)
    from memories m where m.id = any(memory_ids) and m.photo_storage_path is not null
    union all
    select jsonb_build_object('bucket','screenshots','path',s.storage_path)
    from screenshots s where s.id = any(screenshot_ids) and s.storage_path is not null
  ) objects(item);

  delete from messages where id = any(message_ids);
  delete from memories where id = any(memory_ids);
  delete from screenshots where id = any(screenshot_ids);
  delete from media where id = any(media_ids);
  -- Generated elements (year breaks, anniversaries, milestones) have no source.
  delete from timeline_elements where id = any(p_ids);

  return jsonb_build_object('deleted', requested, 'storage', storage_objects);
end;
$$;
revoke all on function admin_delete_timeline_elements(uuid[]) from public;
grant execute on function admin_delete_timeline_elements(uuid[]) to authenticated;

-- Anonymous-but-token-authorized reading analytics. There is deliberately no
-- anon policy: only the service-role Edge Function can write, while the owner
-- can inspect the aggregate rows in Admin.
create table if not exists reader_visitors (
  visitor_id uuid primary key,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  visit_count integer not null default 0,
  last_element_id uuid references timeline_elements(id) on delete set null,
  last_element_at timestamptz,
  last_element_type text,
  max_position integer not null default 0,
  max_progress smallint not null default 0 check (max_progress between 0 and 100),
  completed_at timestamptz,
  user_agent text,
  viewport_width integer
);

create table if not exists reader_visits (
  id uuid primary key,
  visitor_id uuid not null references reader_visitors(visitor_id) on delete cascade,
  opened_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  last_element_id uuid references timeline_elements(id) on delete set null,
  last_element_at timestamptz,
  last_element_type text,
  max_position integer not null default 0,
  max_progress smallint not null default 0 check (max_progress between 0 and 100),
  completed_at timestamptz
);

create index if not exists idx_reader_visits_opened on reader_visits(opened_at desc);
create index if not exists idx_reader_visits_visitor on reader_visits(visitor_id,last_seen_at desc);

alter table reader_visitors enable row level security;
alter table reader_visits enable row level security;
drop policy if exists "admin full access - reader visitors" on reader_visitors;
drop policy if exists "admin full access - reader visits" on reader_visits;
create policy "admin full access - reader visitors" on reader_visitors for all using (is_admin()) with check (is_admin());
create policy "admin full access - reader visits" on reader_visits for all using (is_admin()) with check (is_admin());
