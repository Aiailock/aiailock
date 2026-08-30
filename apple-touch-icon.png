-- Mobile Story Studio: chapters, screenshot albums and reader reactions.
-- This migration is additive and keeps every existing message/media row intact.

-- Several screenshots can now form one reader scene. Standalone screenshots
-- keep collection_id = null and render exactly as before.
alter table screenshots
  add column if not exists collection_id uuid,
  add column if not exists collection_order smallint not null default 0,
  add column if not exists collection_layout text not null default 'carousel',
  add column if not exists reaction_emoji text,
  add column if not exists reaction_text text;

alter table screenshots drop constraint if exists screenshots_collection_order_check;
alter table screenshots add constraint screenshots_collection_order_check
  check (collection_order between 0 and 49);
alter table screenshots drop constraint if exists screenshots_collection_layout_check;
alter table screenshots add constraint screenshots_collection_layout_check
  check (collection_layout in ('carousel', 'stack', 'collage'));
create index if not exists idx_screenshots_collection
  on screenshots(collection_id, collection_order) where collection_id is not null;

-- Chapters and first-class GIF scenes do not require a new source table:
-- chapters live directly in timeline_elements; GIF scenes reuse memories so
-- they retain title/body/date/style and an optional private uploaded file.
alter table timeline_elements drop constraint if exists timeline_elements_type_check;
alter table timeline_elements add constraint timeline_elements_type_check check (type in (
  'message', 'photo', 'video', 'audio', 'sticker',
  'memory', 'special', 'interactive', 'gif', 'screenshot',
  'chapter', 'year_break', 'on_this_day', 'milestone'
));

create or replace function sync_memory_timeline() returns trigger
language plpgsql security definer set search_path=public as $$
declare
  kind_value text := coalesce(new.metadata->>'kind', '');
  timeline_type text := case
    when kind_value = 'special' then 'special'
    when kind_value = 'interactive' then 'interactive'
    when kind_value = 'gif' then 'gif'
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
    timeline_type, resolved_at, 10, new.id, new.style, true,
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

create or replace function sync_screenshot_timeline() returns trigger
language plpgsql security definer set search_path=public as $$
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
  values(
    'screenshot', resolved_at, 20 + new.collection_order, new.id, new.style, true,
    jsonb_build_object(
      'title', new.title,
      'description', new.description,
      'position', new.position,
      'animation', new.animation,
      'collection_id', new.collection_id,
      'collection_order', new.collection_order,
      'collection_layout', new.collection_layout,
      'reaction_emoji', new.reaction_emoji,
      'reaction_text', new.reaction_text
    )
  )
  on conflict (screenshot_id) where screenshot_id is not null do update
    set occurred_at=excluded.occurred_at,
        sort_tiebreak=excluded.sort_tiebreak,
        style=excluded.style,
        metadata=excluded.metadata;
  return new;
end $$;

drop trigger if exists trg_sync_screenshot_timeline on screenshots;
create trigger trg_sync_screenshot_timeline
after insert or update of occurred_at,style,place_after_message_id,title,description,
  animation,position,collection_id,collection_order,collection_layout,reaction_emoji,reaction_text
on screenshots for each row execute function sync_screenshot_timeline();

-- Recreate the service-only reader view with the new presentation fields.
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
  sc.position as screenshot_position,
  sc.collection_id as screenshot_collection_id,
  sc.collection_order as screenshot_collection_order,
  sc.collection_layout as screenshot_collection_layout,
  sc.reaction_emoji as screenshot_reaction_emoji,
  sc.reaction_text as screenshot_reaction_text
from timeline_elements te
left join messages m on m.id = te.message_id
left join media md on md.id = te.media_id
left join memories mem on mem.id = te.memory_id
left join screenshots sc on sc.id = te.screenshot_id
where te.is_published = true;

revoke all on reader_timeline_data from anon, authenticated;
grant select on reader_timeline_data to service_role;

-- A reader can leave one reaction per story element. Anonymous browser clients
-- never touch this table directly; the token-checking Edge Function writes it.
create table if not exists reader_reactions (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  element_id uuid not null references timeline_elements(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 12),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(visitor_id, element_id)
);
create index if not exists idx_reader_reactions_element on reader_reactions(element_id, updated_at desc);
create index if not exists idx_reader_reactions_updated on reader_reactions(updated_at desc);

alter table reader_reactions enable row level security;
drop policy if exists "admin full access - reader reactions" on reader_reactions;
create policy "admin full access - reader reactions" on reader_reactions
  for all using (is_admin()) with check (is_admin());
revoke all on reader_reactions from anon;
grant select, delete on reader_reactions to authenticated;

-- Refresh existing mirror rows so their metadata gains album/reaction fields.
update screenshots set collection_order = collection_order;

