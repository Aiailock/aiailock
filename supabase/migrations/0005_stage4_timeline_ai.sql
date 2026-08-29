-- Stage 4: timeline engine + AI cache metadata
alter table ai_metadata add column if not exists source_hash text;
alter table ai_metadata add column if not exists status text not null default 'completed'
  check (status in ('pending','completed','failed'));
alter table ai_metadata add column if not exists error_message text;
create index if not exists idx_ai_metadata_cache on ai_metadata(model, prompt_version, source_hash);

-- Timeline source rows are one-to-one. These unique indexes are required by
-- the ON CONFLICT clauses used by the synchronization triggers and backfill.
create unique index if not exists idx_timeline_message_unique on timeline_elements(message_id) where message_id is not null;
create unique index if not exists idx_timeline_memory_unique on timeline_elements(memory_id) where memory_id is not null;
create unique index if not exists idx_timeline_screenshot_unique on timeline_elements(screenshot_id) where screenshot_id is not null;

-- Stable style payload for timeline reader. Exactly one source per element remains enforced.
create or replace function sync_message_timeline() returns trigger language plpgsql security definer set search_path=public as $$
declare kind text;
begin
  if new.is_system_message then
    delete from timeline_elements where message_id = new.id;
    return new;
  end if;
  kind := case when new.has_media then coalesce((select kind from media where id=new.media_id), 'message') else 'message' end;
  if kind not in ('photo','video','audio','sticker') then kind := 'message'; end if;
  insert into timeline_elements(type,occurred_at,sort_tiebreak,message_id,media_id,style,is_published)
  values(kind,new.sent_at,0,new.id,new.media_id,'{}'::jsonb,true)
  on conflict (message_id) where message_id is not null do update
    set type=excluded.type, occurred_at=excluded.occurred_at, media_id=excluded.media_id;
  return new;
end $$;

drop trigger if exists trg_sync_message_timeline on messages;
create trigger trg_sync_message_timeline after insert or update of sent_at,is_system_message,has_media,media_id on messages
for each row execute function sync_message_timeline();

create or replace function sync_memory_timeline() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into timeline_elements(type,occurred_at,sort_tiebreak,memory_id,style,is_published)
 values('memory',new.occurred_at,10,new.id,new.style,true)
 on conflict (memory_id) where memory_id is not null do update set occurred_at=excluded.occurred_at,style=excluded.style;
 return new;
end $$;
drop trigger if exists trg_sync_memory_timeline on memories;
create trigger trg_sync_memory_timeline after insert or update of occurred_at,style on memories for each row execute function sync_memory_timeline();

create or replace function sync_screenshot_timeline() returns trigger language plpgsql security definer set search_path=public as $$
begin
 insert into timeline_elements(type,occurred_at,sort_tiebreak,screenshot_id,style,is_published)
 values('screenshot',new.occurred_at,20,new.id,new.style,true)
 on conflict (screenshot_id) where screenshot_id is not null do update set occurred_at=excluded.occurred_at,style=excluded.style;
 return new;
end $$;
drop trigger if exists trg_sync_screenshot_timeline on screenshots;
create trigger trg_sync_screenshot_timeline after insert or update of occurred_at,style on screenshots for each row execute function sync_screenshot_timeline();

-- Backfill current data idempotently.
insert into timeline_elements(type,occurred_at,sort_tiebreak,message_id,media_id,style,is_published)
select case when m.has_media then coalesce(md.kind,'message') else 'message' end,
       m.sent_at,0,m.id,m.media_id,'{}'::jsonb,true
from messages m left join media md on md.id=m.media_id
where not m.is_system_message
on conflict (message_id) where message_id is not null do nothing;
insert into timeline_elements(type,occurred_at,sort_tiebreak,memory_id,style,is_published)
select 'memory',occurred_at,10,id,style,true from memories
on conflict (memory_id) where memory_id is not null do nothing;
insert into timeline_elements(type,occurred_at,sort_tiebreak,screenshot_id,style,is_published)
select 'screenshot',occurred_at,20,id,style,true from screenshots
on conflict (screenshot_id) where screenshot_id is not null do nothing;
