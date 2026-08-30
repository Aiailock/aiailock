-- Journey Reader: one explicit order shared by Admin and Reader.
--
-- occurred_at remains the real date shown to the reader. display_order is a
-- separate presentation key, so dragging a card never falsifies its date.

alter table timeline_elements
  add column if not exists display_order numeric(38, 18);

update timeline_elements te
set display_order = ranked.display_order
from (
  select
    id,
    (extract(epoch from occurred_at) * 1000)::numeric
      + (sort_tiebreak::numeric / 100)
      + (row_number() over (
          partition by occurred_at, sort_tiebreak
          order by id
        )::numeric / 1000000) as display_order
  from timeline_elements
) ranked
where ranked.id = te.id
  and te.display_order is null;

alter table timeline_elements
  alter column display_order set not null;

create index if not exists idx_timeline_display_order
  on timeline_elements(display_order asc, id asc);

create or replace function timeline_default_display_order()
returns trigger
language plpgsql
set search_path=public
as $$
begin
  if tg_op = 'INSERT' and new.display_order is null then
    new.display_order :=
      (extract(epoch from new.occurred_at) * 1000)::numeric
      + (new.sort_tiebreak::numeric / 100)
      + ((abs(hashtext(new.id::text)) % 100000)::numeric / 100000000);
  elsif tg_op = 'UPDATE'
    and (new.occurred_at is distinct from old.occurred_at
      or new.sort_tiebreak is distinct from old.sort_tiebreak)
    and new.display_order is not distinct from old.display_order then
    new.display_order :=
      (extract(epoch from new.occurred_at) * 1000)::numeric
      + (new.sort_tiebreak::numeric / 100)
      + ((abs(hashtext(new.id::text)) % 100000)::numeric / 100000000);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_timeline_default_display_order on timeline_elements;
create trigger trg_timeline_default_display_order
before insert or update of occurred_at,sort_tiebreak,display_order
on timeline_elements
for each row execute function timeline_default_display_order();

-- Moves a card between its actual visible neighbours. The date is preserved.
create or replace function admin_place_timeline_element(
  p_id uuid,
  p_prev_id uuid default null,
  p_next_id uuid default null
) returns numeric
language plpgsql
security definer
set search_path=public
as $$
declare
  previous_order numeric;
  next_order numeric;
  resolved_order numeric;
begin
  if not is_admin() then raise exception 'Admin access required'; end if;

  if p_prev_id is not null then
    select display_order into previous_order
    from timeline_elements where id = p_prev_id;
  end if;
  if p_next_id is not null then
    select display_order into next_order
    from timeline_elements where id = p_next_id;
  end if;

  if previous_order is not null and next_order is not null then
    resolved_order := (previous_order + next_order) / 2;
  elsif previous_order is not null then
    resolved_order := previous_order + 1024;
  elsif next_order is not null then
    resolved_order := next_order - 1024;
  else
    select coalesce(max(display_order), 0) + 1024
      into resolved_order from timeline_elements;
  end if;

  update timeline_elements
  set display_order = resolved_order
  where id = p_id;

  if not found then raise exception 'Timeline element not found'; end if;
  return resolved_order;
end;
$$;

revoke all on function admin_place_timeline_element(uuid,uuid,uuid) from public;
grant execute on function admin_place_timeline_element(uuid,uuid,uuid) to authenticated;

-- Reader-safe view. display_order is deliberately exposed only through the
-- service-role Edge Function, exactly like the rest of this view.
drop view if exists reader_timeline_data;
create view reader_timeline_data as
select
  te.id as element_id,
  te.type,
  te.occurred_at,
  te.sort_tiebreak,
  te.display_order::double precision as display_order,
  te.style,
  te.mood,
  te.importance,
  te.metadata,
  te.is_published,
  te.visible_from,
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
where te.is_published = true
  and (te.visible_from is null or te.visible_from <= now());

revoke all on reader_timeline_data from anon, authenticated;
grant select on reader_timeline_data to service_role;
