-- Cinematic Reader + Safety Center.
-- Additive migration: existing story content and imported WhatsApp data stay intact.

alter table timeline_elements
  add column if not exists visible_from timestamptz;
create index if not exists idx_timeline_visible_from
  on timeline_elements(visible_from) where visible_from is not null;

alter table timeline_elements drop constraint if exists timeline_elements_type_check;
alter table timeline_elements add constraint timeline_elements_type_check check (type in (
  'message', 'photo', 'video', 'audio', 'sticker',
  'memory', 'special', 'interactive', 'gif', 'screenshot',
  'chapter', 'quote', 'pause', 'year_break', 'on_this_day', 'milestone'
));

-- Version history stores presentation/admin edits only. Imports and service-role
-- maintenance have auth.uid() = null and therefore do not flood the log.
create table if not exists story_revisions (
  id bigint generated always as identity primary key,
  source_table text not null check (source_table in ('messages','memories','screenshots','timeline_elements')),
  source_id uuid not null,
  before_data jsonb not null,
  after_data jsonb not null,
  changed_at timestamptz not null default now(),
  changed_by uuid
);
create index if not exists idx_story_revisions_changed on story_revisions(changed_at desc);
create index if not exists idx_story_revisions_source on story_revisions(source_table, source_id, changed_at desc);

alter table story_revisions enable row level security;
drop policy if exists "admin full access - story revisions" on story_revisions;
create policy "admin full access - story revisions" on story_revisions
  for all using (is_admin()) with check (is_admin());
revoke all on story_revisions from anon;
grant select, delete on story_revisions to authenticated;

create or replace function capture_story_revision() returns trigger
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if auth.uid() is null or not is_admin() then return new; end if;
  if current_setting('app.restoring_revision', true) = '1' then return new; end if;
  if to_jsonb(old) = to_jsonb(new) then return new; end if;
  insert into story_revisions(source_table,source_id,before_data,after_data,changed_by)
  values(tg_table_name, old.id, to_jsonb(old), to_jsonb(new), auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_revision_messages on messages;
create trigger trg_revision_messages before update on messages
  for each row execute function capture_story_revision();
drop trigger if exists trg_revision_memories on memories;
create trigger trg_revision_memories before update on memories
  for each row execute function capture_story_revision();
drop trigger if exists trg_revision_screenshots on screenshots;
create trigger trg_revision_screenshots before update on screenshots
  for each row execute function capture_story_revision();
drop trigger if exists trg_revision_timeline on timeline_elements;
create trigger trg_revision_timeline before update on timeline_elements
  for each row execute function capture_story_revision();

create or replace function admin_restore_story_revision(p_revision_id bigint)
returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare r story_revisions%rowtype;
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  select * into r from story_revisions where id = p_revision_id;
  if not found then raise exception 'revision not found'; end if;
  if r.source_table = 'messages' then
    update messages set
      sender_name = coalesce(r.before_data->>'sender_name', sender_name),
      sent_at = coalesce((r.before_data->>'sent_at')::timestamptz, sent_at),
      display_text = r.before_data->>'display_text',
      reaction_emoji = r.before_data->>'reaction_emoji',
      reaction_by = r.before_data->>'reaction_by'
    where id = r.source_id;
  elsif r.source_table = 'memories' then
    update memories set
      title = r.before_data->>'title',
      body = coalesce(r.before_data->>'body', body),
      occurred_at = coalesce((r.before_data->>'occurred_at')::timestamptz, occurred_at),
      place_after_message_id = nullif(r.before_data->>'place_after_message_id','')::uuid,
      importance = coalesce((r.before_data->>'importance')::smallint, importance),
      style = coalesce(nullif(r.before_data->'style','null'::jsonb), style),
      metadata = coalesce(nullif(r.before_data->'metadata','null'::jsonb), metadata),
      updated_at = now()
    where id = r.source_id;
  elsif r.source_table = 'screenshots' then
    update screenshots set
      title = r.before_data->>'title',
      description = r.before_data->>'description',
      caption = r.before_data->>'caption',
      occurred_at = coalesce((r.before_data->>'occurred_at')::timestamptz, occurred_at),
      place_after_message_id = nullif(r.before_data->>'place_after_message_id','')::uuid,
      style = coalesce(nullif(r.before_data->'style','null'::jsonb), style),
      position = coalesce(r.before_data->>'position', position),
      animation = coalesce(r.before_data->>'animation', animation),
      collection_id = nullif(r.before_data->>'collection_id','')::uuid,
      collection_order = coalesce((r.before_data->>'collection_order')::smallint, collection_order),
      collection_layout = coalesce(r.before_data->>'collection_layout', collection_layout),
      reaction_emoji = r.before_data->>'reaction_emoji',
      reaction_text = r.before_data->>'reaction_text'
    where id = r.source_id;
  elsif r.source_table = 'timeline_elements' then
    update timeline_elements set
      occurred_at = coalesce((r.before_data->>'occurred_at')::timestamptz, occurred_at),
      sort_tiebreak = coalesce((r.before_data->>'sort_tiebreak')::integer, sort_tiebreak),
      style = coalesce(nullif(r.before_data->'style','null'::jsonb), style),
      is_published = coalesce((r.before_data->>'is_published')::boolean, is_published),
      mood = r.before_data->>'mood',
      importance = coalesce((r.before_data->>'importance')::smallint, importance),
      metadata = coalesce(nullif(r.before_data->'metadata','null'::jsonb), metadata),
      visible_from = nullif(r.before_data->>'visible_from','')::timestamptz
    where id = r.source_id;
  end if;
  return found;
end;
$$;
revoke all on function admin_restore_story_revision(bigint) from public;
grant execute on function admin_restore_story_revision(bigint) to authenticated;

create or replace function admin_integrity_report()
returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not is_admin() then raise exception 'not authorized'; end if;
  return jsonb_build_object(
    'messages', (select count(*) from messages where not is_system_message),
    'published', (select count(*) from timeline_elements where is_published and (visible_from is null or visible_from <= now())),
    'hidden', (select count(*) from timeline_elements where not is_published),
    'scheduled', (select count(*) from timeline_elements where is_published and visible_from > now()),
    'missing_media', (select count(*) from media where status in ('missing','failed')),
    'stuck_imports', (select count(*) from imports where status = 'processing' and started_at < now() - interval '30 minutes'),
    'duplicate_fingerprints', (select count(*) from (select fingerprint from messages group by fingerprint having count(*) > 1) d),
    'untitled_chapters', (select count(*) from timeline_elements where type='chapter' and coalesce(trim(metadata->>'title'),'')=''),
    'revisions', (select count(*) from story_revisions)
  );
end;
$$;
revoke all on function admin_integrity_report() from public;
grant execute on function admin_integrity_report() to authenticated;

-- Reader-safe view hides scheduled pages until their publication moment.
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
