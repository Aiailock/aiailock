-- Lightweight chapter index for the reader journey map. The Edge Function uses
-- the service role; public browser clients never receive direct table access.
create or replace view public.reader_journey_chapters as
with visible_story as (
  select
    te.id as element_id,
    te.display_order::double precision as display_order,
    row_number() over (order by te.display_order asc, te.id asc)::integer as story_position,
    te.type,
    te.metadata
  from public.timeline_elements te
  where te.is_published = true
    and (te.visible_from is null or te.visible_from <= now())
)
select
  element_id,
  display_order,
  story_position,
  coalesce(nullif(trim(metadata ->> 'title'), ''), 'Новая глава') as title
from visible_story
where type = 'chapter';

revoke all on public.reader_journey_chapters from anon, authenticated;
grant select on public.reader_journey_chapters to service_role;

comment on view public.reader_journey_chapters is
  'All published chapter summaries and their absolute reader positions for the journey map.';
