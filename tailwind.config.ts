-- Stage 4 part 2: make AI output reader-safe and controllable from admin.
-- The reader never needs ai_metadata directly. Timeline carries only the
-- non-technical mood/style result needed for presentation.

alter table timeline_elements
  add column if not exists mood text;

alter table timeline_elements
  drop constraint if exists timeline_elements_mood_check;
alter table timeline_elements
  add constraint timeline_elements_mood_check check (
    mood is null or mood in (
      'normal','romantic','sad','funny','deep','night','memory',
      'important','hopeful','neutral'
    )
  );

create index if not exists idx_timeline_mood on timeline_elements(mood)
  where mood is not null;

-- AI processing can update a message before/after the timeline trigger. This
-- trigger is therefore the single place that projects the accepted AI result
-- onto the reader-facing timeline row.
create or replace function sync_ai_to_timeline()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_id uuid;
  target_style jsonb;
begin
  if new.message_id is not null then
    select id into target_id
    from timeline_elements
    where message_id = new.message_id
    limit 1;
  else
    target_id := new.timeline_element_id;
  end if;

  if target_id is null then
    return new;
  end if;

  target_style := coalesce(new.applied_style, new.suggested_style, '{}'::jsonb);

  update timeline_elements
  set mood = new.mood,
      style = case
        when target_style = '{}'::jsonb then style
        else target_style
      end
  where id = target_id;


  return new;
end;
$$;

drop trigger if exists trg_sync_ai_timeline on ai_metadata;
create trigger trg_sync_ai_timeline
after insert or update of mood, suggested_style, applied_style, timeline_element_id
on ai_metadata
for each row execute function sync_ai_to_timeline();

-- Existing AI rows become reader-ready without exposing model/prompt metadata.
update timeline_elements te
set mood = am.mood,
    style = coalesce(am.applied_style, am.suggested_style, te.style)
from ai_metadata am
where am.message_id = te.message_id;

-- Backfill the reverse link for message-targeted metadata where possible.
update ai_metadata am
set timeline_element_id = te.id
from timeline_elements te
where am.message_id = te.message_id
  and am.timeline_element_id is null;

-- A small public-safe view keeps the reader query simple and prevents it from
-- depending on admin-only ai_metadata columns.
create or replace view public_timeline
with (security_invoker = true) as
select
  te.id,
  te.type,
  te.occurred_at,
  te.sort_tiebreak,
  te.message_id,
  te.media_id,
  te.memory_id,
  te.screenshot_id,
  te.style,
  te.mood,
  te.is_published
from timeline_elements te
where te.is_published = true;

grant select on public_timeline to anon;
grant select on public_timeline to authenticated;
