-- Make AI upserts portable through PostgREST. A normal UNIQUE constraint on a
-- nullable UUID still allows multiple NULLs, while giving `ON CONFLICT
-- (message_id)` a directly inferable unique constraint.
drop index if exists idx_ai_metadata_message;
drop index if exists idx_ai_metadata_element;
create unique index if not exists idx_ai_metadata_message_unique on ai_metadata(message_id);
create unique index if not exists idx_ai_metadata_element_unique on ai_metadata(timeline_element_id);

-- The Stage 4 timeline triggers use ON CONFLICT for source IDs. Those source
-- relationships are one-to-one, so make the conflict targets explicit.
create unique index if not exists idx_timeline_message_unique on timeline_elements(message_id) where message_id is not null;
create unique index if not exists idx_timeline_media_unique on timeline_elements(media_id) where media_id is not null;
create unique index if not exists idx_timeline_memory_unique on timeline_elements(memory_id) where memory_id is not null;
create unique index if not exists idx_timeline_screenshot_unique on timeline_elements(screenshot_id) where screenshot_id is not null;
