-- Fix: sync_message_timeline() declared a local PL/pgSQL variable named
-- `kind`, which collides with the `media.kind` column referenced inside the
-- same function's subquery. Postgres cannot resolve which `kind` is meant
-- ("column reference "kind" is ambiguous"), and because this function runs
-- as an AFTER INSERT trigger on `messages`, every single message insert
-- during import failed with this error (0 saved / N errors).
--
-- Fix: rename the local variable to `v_kind` and explicitly qualify the
-- table column as `media.kind` so there is no naming collision.
create or replace function sync_message_timeline() returns trigger language plpgsql security definer set search_path=public as $$
declare v_kind text;
begin
  if new.is_system_message then
    delete from timeline_elements where message_id = new.id;
    return new;
  end if;
  v_kind := case when new.has_media then coalesce((select media.kind from media where media.id = new.media_id), 'message') else 'message' end;
  if v_kind not in ('photo','video','audio','sticker') then v_kind := 'message'; end if;
  insert into timeline_elements(type,occurred_at,sort_tiebreak,message_id,media_id,style,is_published)
  values(v_kind,new.sent_at,0,new.id,new.media_id,'{}'::jsonb,true)
  on conflict (message_id) where message_id is not null do update
    set type=excluded.type, occurred_at=excluded.occurred_at, media_id=excluded.media_id;
  return new;
end $$;

-- Re-run the backfill for any messages that were "received/parsed" during
-- earlier failed import attempts but never got a timeline row because the
-- trigger kept erroring out. Safe/idempotent thanks to the ON CONFLICT DO NOTHING.
insert into timeline_elements(type,occurred_at,sort_tiebreak,message_id,media_id,style,is_published)
select case when m.has_media then coalesce(md.kind,'message') else 'message' end,
       m.sent_at,0,m.id,m.media_id,'{}'::jsonb,true
from messages m left join media md on md.id=m.media_id
where not m.is_system_message
on conflict (message_id) where message_id is not null do nothing;
