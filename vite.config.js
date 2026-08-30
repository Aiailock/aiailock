-- Completion polish: close schema/UX gaps identified during the final audit.
-- This migration is additive: existing data and working flows stay intact.

alter table memories
  add column if not exists importance smallint not null default 0,
  add column if not exists photo_storage_path text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table memories
  drop constraint if exists memories_importance_check;
alter table memories
  add constraint memories_importance_check check (importance between 0 and 5);

alter table screenshots
  add column if not exists title text,
  add column if not exists description text,
  add column if not exists animation text not null default 'fade',
  add column if not exists position text not null default 'custom';

alter table timeline_elements
  add column if not exists metadata jsonb not null default '{}'::jsonb,
  add column if not exists importance smallint not null default 0;

alter table timeline_elements
  drop constraint if exists timeline_elements_importance_check;
alter table timeline_elements
  add constraint timeline_elements_importance_check check (importance between 0 and 5);

alter table timeline_elements
  drop constraint if exists timeline_elements_type_check;
alter table timeline_elements
  add constraint timeline_elements_type_check check (type in (
    'message', 'photo', 'video', 'audio', 'sticker',
    'memory', 'special', 'screenshot', 'year_break', 'on_this_day', 'milestone'
  ));

alter table ai_metadata
  add column if not exists importance smallint;

alter table ai_metadata
  drop constraint if exists ai_metadata_importance_check;
alter table ai_metadata
  add constraint ai_metadata_importance_check check (importance is null or importance between 0 and 5);

alter table media
  add column if not exists occurred_at timestamptz;

-- Keep media metadata chronologically addressable without duplicating source dates.
update media md
set occurred_at = m.sent_at
from messages m
where md.message_id = m.id
  and md.occurred_at is null;
create index if not exists idx_media_occurred_at on media(occurred_at);

-- Manual positioning is now represented explicitly in timeline metadata.
create or replace function sync_memory_timeline() returns trigger language plpgsql security definer set search_path=public as $$
declare
  timeline_type text := case when coalesce(new.metadata->>'kind','') = 'special' then 'special' else 'memory' end;
  resolved_importance smallint := greatest(0, least(5, coalesce(new.importance, 0)));
  resolved_at timestamptz := new.occurred_at;
begin
  if new.place_after_message_id is not null then
    select sent_at into resolved_at from messages where id = new.place_after_message_id;
  end if;
  insert into timeline_elements(type,occurred_at,sort_tiebreak,memory_id,style,is_published,metadata,importance)
  values(timeline_type,resolved_at,10,new.id,new.style,true,coalesce(new.metadata,'{}'::jsonb) || jsonb_build_object('position', case when new.place_after_message_id is null then 'custom' else 'after_message' end),resolved_importance)
  on conflict (memory_id) where memory_id is not null do update
    set type=excluded.type, occurred_at=excluded.occurred_at, style=excluded.style, metadata=excluded.metadata, importance=excluded.importance;
  return new;
end $$;
drop trigger if exists trg_sync_memory_timeline on memories;
create trigger trg_sync_memory_timeline after insert or update of occurred_at,style,place_after_message_id,importance,photo_storage_path,metadata on memories for each row execute function sync_memory_timeline();

create or replace function sync_screenshot_timeline() returns trigger language plpgsql security definer set search_path=public as $$
declare
  resolved_at timestamptz := new.occurred_at;
begin
  if new.place_after_message_id is not null then
    select sent_at into resolved_at from messages where id = new.place_after_message_id;
    if new.position = 'before_message' then
      resolved_at := resolved_at - interval '1 millisecond';
    elsif new.position = 'after_message' then
      resolved_at := resolved_at + interval '1 millisecond';
    end if;
  end if;
  insert into timeline_elements(type,occurred_at,sort_tiebreak,screenshot_id,style,is_published,metadata)
  values('screenshot',resolved_at,20,new.id,new.style,true,jsonb_build_object(
    'title', new.title,
    'description', new.description,
    'position', new.position,
    'animation', new.animation
  ))
  on conflict (screenshot_id) where screenshot_id is not null do update
    set occurred_at=excluded.occurred_at,style=excluded.style,metadata=excluded.metadata;
  return new;
end $$;
drop trigger if exists trg_sync_screenshot_timeline on screenshots;
create trigger trg_sync_screenshot_timeline after insert or update of occurred_at,style,place_after_message_id,title,description,animation,position on screenshots for each row execute function sync_screenshot_timeline();

-- Existing AI output can carry importance without exposing technical model data.
create or replace function sync_ai_to_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  target_style jsonb;
  target_importance smallint;
begin
  if new.message_id is not null then
    select id into target_id from timeline_elements where message_id = new.message_id limit 1;
  else
    target_id := new.timeline_element_id;
  end if;
  if target_id is null then return new; end if;
  target_style := coalesce(new.applied_style, new.suggested_style, '{}'::jsonb);
  target_importance := greatest(0, least(5, coalesce(new.importance, 0)));
  update timeline_elements
  set mood = new.mood,
      style = case when target_style = '{}'::jsonb then style else target_style end,
      importance = target_importance
  where id = target_id;
  return new;
end;
$$;
drop trigger if exists trg_sync_ai_timeline on ai_metadata;
create trigger trg_sync_ai_timeline
after insert or update of mood,suggested_style,applied_style,timeline_element_id,importance on ai_metadata
for each row execute function sync_ai_to_timeline();

-- Reader-safe view now contains the additional presentation metadata only.
drop view if exists reader_timeline_data;
create view reader_timeline_data as
select
  te.id as element_id,
  te.type,
  te.occurred_at,
  te.sort_tiebreak,
  te.style,
  te.mood,
  te.importance,
  te.metadata,
  te.is_published,
  te.message_id,
  te.media_id,
  te.memory_id,
  te.screenshot_id,
  m.sender_name,
  m.sent_at as message_sent_at,
  m.original_text,
  m.display_text,
  m.has_media,
  m.reaction_emoji,
  m.reaction_by,
  md.kind as media_kind,
  md.original_filename as media_filename,
  md.thumbnail_path,
  md.storage_path,
  md.mime_type,
  md.size_bytes,
  md.duration_seconds,
  md.width,
  md.height,
  md.status as media_status,
  mem.title as memory_title,
  mem.body as memory_body,
  mem.occurred_at as memory_occurred_at,
  mem.style as memory_style,
  mem.importance as memory_importance,
  mem.photo_storage_path as memory_photo_storage_path,
  mem.metadata as memory_metadata,
  sc.storage_path as screenshot_storage_path,
  sc.title as screenshot_title,
  sc.description as screenshot_description,
  sc.caption as screenshot_caption,
  sc.occurred_at as screenshot_occurred_at,
  sc.style as screenshot_style,
  sc.animation as screenshot_animation,
  sc.position as screenshot_position
from timeline_elements te
left join messages m on m.id = te.message_id
left join media md on md.id = te.media_id
left join memories mem on mem.id = te.memory_id
left join screenshots sc on sc.id = te.screenshot_id
where te.is_published = true;

revoke all on reader_timeline_data from anon, authenticated;
grant select on reader_timeline_data to service_role;

-- Backfill generated/reader metadata from existing rows.
update timeline_elements te
set importance = greatest(0, least(5, coalesce(am.importance, 0)))
from ai_metadata am
where am.message_id = te.message_id;

update timeline_elements te
set type = case when coalesce(mem.metadata->>'kind','') = 'special' then 'special' else 'memory' end,
    importance = greatest(0, least(5, coalesce(mem.importance, 0))),
    metadata = coalesce(mem.metadata,'{}'::jsonb)
from memories mem
where te.memory_id = mem.id;

update timeline_elements te
set metadata = jsonb_build_object(
  'title', sc.title,
  'description', sc.description,
  'position', sc.position,
  'animation', sc.animation
)
from screenshots sc
where te.screenshot_id = sc.id;

-- A dedicated folder-like prefix in the existing screenshots private bucket keeps
-- manual memory photos private without introducing another public asset bucket.


create or replace function rebuild_special_timeline_internal()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer := 0;
  r record;
begin
  delete from timeline_elements where type in ('year_break', 'on_this_day');

  for r in
    select distinct on (extract(year from sent_at)) sent_at, extract(year from sent_at)::int as year_no
    from messages
    where is_system_message = false
    order by extract(year from sent_at), sent_at
  loop
    insert into timeline_elements(type, occurred_at, sort_tiebreak, style, is_published, metadata)
    values ('year_break', r.sent_at, -100, jsonb_build_object('zone','default','frame','minimal'), true, jsonb_build_object('year', r.year_no));
    inserted_count := inserted_count + 1;
  end loop;

  for r in
    select current_msg.sent_at as occurred_at,
           older_msg.sent_at as previous_at,
           coalesce(nullif(trim(older_msg.display_text), ''), older_msg.original_text) as previous_text
    from (
      select distinct on (extract(month from sent_at), extract(day from sent_at)) *
      from messages
      where is_system_message = false
      order by extract(month from sent_at), extract(day from sent_at), sent_at desc
    ) current_msg
    join lateral (
      select older.sent_at, older.display_text, older.original_text
      from messages older
      where older.is_system_message = false
        and extract(month from older.sent_at) = extract(month from current_msg.sent_at)
        and extract(day from older.sent_at) = extract(day from current_msg.sent_at)
        and older.sent_at < current_msg.sent_at - interval '330 days'
      order by older.sent_at desc
      limit 1
    ) older_msg on true
  loop
    insert into timeline_elements(type, occurred_at, sort_tiebreak, style, is_published, metadata)
    values (
      'on_this_day', r.occurred_at, -50,
      jsonb_build_object('zone','default','frame','minimal'), true,
      jsonb_build_object('previous_at', r.previous_at, 'previous_text', left(coalesce(r.previous_text,''), 500))
    );
    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;
revoke all on function rebuild_special_timeline_internal() from public, anon, authenticated;
grant execute on function rebuild_special_timeline_internal() to service_role;

create or replace function rebuild_special_timeline()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return rebuild_special_timeline_internal();
end;
$$;
revoke all on function rebuild_special_timeline() from public;
grant execute on function rebuild_special_timeline() to authenticated;
