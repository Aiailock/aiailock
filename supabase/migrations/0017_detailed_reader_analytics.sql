-- Detailed reader analytics: human-readable story points, per-visit device
-- information and an owner-only reset action. This migration is additive and
-- does not touch the story, imported media or reader settings.

alter table reader_visitors
  add column if not exists last_element_label text,
  add column if not exists last_element_preview text,
  add column if not exists last_chapter text,
  add column if not exists device_info jsonb not null default '{}'::jsonb,
  add column if not exists country_code text;

alter table reader_visits
  add column if not exists last_element_label text,
  add column if not exists last_element_preview text,
  add column if not exists last_chapter text,
  add column if not exists user_agent text,
  add column if not exists viewport_width integer,
  add column if not exists device_info jsonb not null default '{}'::jsonb,
  add column if not exists country_code text;

-- Existing visits predate per-session device snapshots. Use the latest known
-- device information so the old rows remain useful after the upgrade.
update reader_visits visit
set user_agent = coalesce(visit.user_agent, visitor.user_agent),
    viewport_width = coalesce(visit.viewport_width, visitor.viewport_width),
    device_info = case
      when visit.device_info = '{}'::jsonb then visitor.device_info
      else visit.device_info
    end,
    country_code = coalesce(visit.country_code, visitor.country_code)
from reader_visitors visitor
where visitor.visitor_id = visit.visitor_id;

-- Owner-facing dictionary for every story point. It replaces opaque UUIDs in
-- Analytics with a type, number, title, excerpt, date and chapter-independent
-- position in the current published story.
drop view if exists admin_reader_story_points;
create view admin_reader_story_points
with (security_invoker = true, security_barrier = true) as
with ordered as (
  select
    te.*,
    (row_number() over (order by te.display_order asc, te.id asc))::integer as story_position
  from timeline_elements te
  where te.is_published = true
    and (te.visible_from is null or te.visible_from <= now())
)
select
  te.id as element_id,
  te.type,
  te.occurred_at,
  te.story_position,
  case te.type
    when 'message' then 'Сообщение'
    when 'photo' then 'Фотография'
    when 'video' then 'Видео'
    when 'audio' then 'Аудиосообщение'
    when 'sticker' then 'Стикер'
    when 'memory' then coalesce(nullif(trim(mem.title), ''), 'Воспоминание')
    when 'special' then coalesce(nullif(trim(mem.title), ''), nullif(trim(te.metadata->>'title'), ''), 'Особый момент')
    when 'interactive' then coalesce(nullif(trim(mem.title), ''), nullif(trim(te.metadata->>'title'), ''), 'Интерактивный момент')
    when 'screenshot' then coalesce(nullif(trim(sc.title), ''), 'Скриншот')
    when 'chapter' then coalesce(nullif(trim(te.metadata->>'title'), ''), 'Глава')
    when 'quote' then coalesce(nullif(trim(te.metadata->>'title'), ''), 'Цитата')
    when 'pause' then coalesce(nullif(trim(te.metadata->>'title'), ''), 'Пауза')
    when 'year_break' then coalesce(nullif(trim(te.metadata->>'year'), ''), extract(year from te.occurred_at)::text) || ' год'
    when 'on_this_day' then 'В этот день'
    when 'milestone' then coalesce(nullif(trim(te.metadata->>'title'), ''), 'Важная точка')
    else 'Элемент истории'
  end as story_label,
  nullif(left(trim(coalesce(
    m.display_text,
    m.original_text,
    mem.body,
    sc.description,
    sc.caption,
    te.metadata->>'text',
    te.metadata->>'body',
    te.metadata->>'subtitle',
    md.original_filename,
    ''
  )), 280), '') as story_preview
from ordered te
left join messages m on m.id = te.message_id
left join media md on md.id = te.media_id
left join memories mem on mem.id = te.memory_id
left join screenshots sc on sc.id = te.screenshot_id;

revoke all on admin_reader_story_points from public;
grant select on admin_reader_story_points to authenticated;

-- Make already recorded progress understandable immediately. New progress
-- events also save the label/preview snapshot in reader-analytics.
update reader_visitors visitor
set last_element_label = point.story_label,
    last_element_preview = point.story_preview
from admin_reader_story_points point
where visitor.last_element_id = point.element_id
  and (visitor.last_element_label is null or visitor.last_element_preview is null);

update reader_visits visit
set last_element_label = point.story_label,
    last_element_preview = point.story_preview
from admin_reader_story_points point
where visit.last_element_id = point.element_id
  and (visit.last_element_label is null or visit.last_element_preview is null);

-- One deliberate owner-only action clears reading visits, accumulated
-- progress and last-point data. Reactions can either be preserved or removed
-- together with the analytics, as chosen in the Admin confirmation panel.
create or replace function admin_clear_reader_analytics(
  p_include_reactions boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed_visitors integer := 0;
  removed_visits integer := 0;
  removed_reactions integer := 0;
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  select count(*) into removed_visitors from reader_visitors;
  select count(*) into removed_visits from reader_visits;
  if p_include_reactions then
    select count(*) into removed_reactions from reader_reactions;
    delete from reader_reactions;
  end if;

  -- reader_visits are removed by the foreign-key cascade.
  delete from reader_visitors;

  return jsonb_build_object(
    'visitors', removed_visitors,
    'visits', removed_visits,
    'reactions', removed_reactions
  );
end;
$$;

revoke all on function admin_clear_reader_analytics(boolean) from public;
grant execute on function admin_clear_reader_analytics(boolean) to authenticated;

comment on function admin_clear_reader_analytics(boolean) is
  'Owner-only reset for reader visits/progress; optionally clears reactions.';
