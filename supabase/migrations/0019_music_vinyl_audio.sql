-- Music search previews and owner-uploaded audio use the existing `audio`
-- timeline/media type. This migration only improves owner-facing analytics;
-- no existing rows or storage objects are changed.

create or replace view admin_reader_story_points
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
    when 'video' then coalesce(nullif(trim(te.metadata->>'title'), ''), 'Видео')
    when 'audio' then coalesce(nullif(trim(te.metadata->>'title'), ''), 'Аудиозапись')
    when 'sticker' then 'Стикер'
    when 'memory' then coalesce(nullif(trim(mem.title), ''), 'Воспоминание')
    when 'special' then coalesce(nullif(trim(mem.title), ''), nullif(trim(te.metadata->>'title'), ''), 'Особый момент')
    when 'interactive' then coalesce(nullif(trim(mem.title), ''), nullif(trim(te.metadata->>'title'), ''), 'Интерактивный момент')
    when 'screenshot' then coalesce(nullif(trim(sc.title), ''), 'Скриншот')
    when 'chapter' then coalesce(nullif(trim(te.metadata->>'title'), ''), 'Глава')
    when 'quote' then coalesce(nullif(trim(te.metadata->>'title'), ''), 'Цитата')
    when 'pause' then coalesce(nullif(trim(te.metadata->>'title'), ''), 'Пауза')
    when 'link' then coalesce(nullif(trim(te.metadata->>'title'), ''), 'Переход по ссылке')
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
    te.metadata->>'description',
    te.metadata->>'text',
    te.metadata->>'body',
    te.metadata->>'artist',
    te.metadata->>'album',
    te.metadata->>'subtitle',
    te.metadata->>'url',
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
