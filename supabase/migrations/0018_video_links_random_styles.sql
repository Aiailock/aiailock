-- Manual video, story links and per-element random styling.
-- Additive only: existing history, media, analytics and settings stay intact.

alter table timeline_elements drop constraint if exists timeline_elements_type_check;
alter table timeline_elements add constraint timeline_elements_type_check check (type in (
  'message', 'photo', 'video', 'audio', 'sticker',
  'memory', 'special', 'interactive', 'gif', 'screenshot',
  'chapter', 'quote', 'pause', 'link',
  'year_break', 'on_this_day', 'milestone'
));

-- Gives every selected scene its own coherent combination instead of applying
-- one identical patch to the whole selection. Canonical memory/screenshot
-- sources are updated too, so their sync triggers cannot later restore an old
-- style over the randomized timeline mirror.
create or replace function admin_randomize_timeline_styles(p_ids uuid[])
returns integer
language plpgsql security definer set search_path=public,pg_temp as $$
declare
  item record;
  patch jsonb;
  changed integer := 0;
  frames text[] := array['minimal','polaroid','gold','flowers','branches','stars','ribbon','washi','ticket','film','sepia','hearts','postcard','torn','phone','locket','envelope','moonlit'];
  fonts text[] := array['serif','script','literata','yeseva','comfort','badscript','marck','neucha'];
  zones text[] := array['default','dawn','evening','romantic','night','burgundy','sepia','forest','dusk'];
  dates text[] := array['line','centered','ribbon','handwritten','capsule','split'];
  aligns text[] := array['left','center','right'];
  spacing_values text[] := array['normal','normal','cinematic','compact'];
  animations text[] := array['fade-up','fade','slide-left','slide-right','zoom','blur','flip','words'];
  decorations jsonb[] := array[
    '[]'::jsonb,
    '["petals"]'::jsonb,
    '["fireflies"]'::jsonb,
    '["stardust"]'::jsonb,
    '["leaves"]'::jsonb,
    '["candles"]'::jsonb,
    '["rain"]'::jsonb,
    '["snow"]'::jsonb
  ];
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  if coalesce(array_length(p_ids, 1), 0) = 0 then return 0; end if;

  for item in
    select id, memory_id, screenshot_id
    from timeline_elements
    where id = any(p_ids)
      and type not in ('year_break', 'on_this_day')
    order by display_order, id
  loop
    patch := jsonb_build_object(
      'frame', frames[1 + floor(random() * array_length(frames, 1))::integer],
      'font', fonts[1 + floor(random() * array_length(fonts, 1))::integer],
      'zone', zones[1 + floor(random() * array_length(zones, 1))::integer],
      'dateStyle', dates[1 + floor(random() * array_length(dates, 1))::integer],
      'dateAlign', aligns[1 + floor(random() * array_length(aligns, 1))::integer],
      'textAlign', aligns[1 + floor(random() * array_length(aligns, 1))::integer],
      'spacing', spacing_values[1 + floor(random() * array_length(spacing_values, 1))::integer],
      'animation', animations[1 + floor(random() * array_length(animations, 1))::integer],
      'decoration', decorations[1 + floor(random() * array_length(decorations, 1))::integer]
    );

    if item.memory_id is not null then
      update memories
      set style = coalesce(style, '{}'::jsonb) || patch,
          updated_at = now()
      where id = item.memory_id;
    end if;

    if item.screenshot_id is not null then
      update screenshots
      set style = coalesce(style, '{}'::jsonb) || patch
      where id = item.screenshot_id;
    end if;

    update timeline_elements
    set style = coalesce(style, '{}'::jsonb) || patch
    where id = item.id;
    changed := changed + 1;
  end loop;

  return changed;
end;
$$;
revoke all on function admin_randomize_timeline_styles(uuid[]) from public;
grant execute on function admin_randomize_timeline_styles(uuid[]) to authenticated;

-- Keep the owner-facing analytics labels readable for the new transition
-- scene and for source-less videos added by direct URL.
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
    when 'audio' then 'Аудиосообщение'
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
