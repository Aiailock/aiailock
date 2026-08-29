-- Stage 5-7: production reader, admin content management, optional reader password,
-- timeline specials, safe public API, and maintenance helpers.

-- Fix the narrow settings view: it must be readable by the anonymous reader while
-- still exposing only two non-sensitive columns. The view owner executes it with
-- its privileges; reader_password_hash is never selected.
drop view if exists public_settings;
create view public_settings as
select reader_title, reader_requires_password, theme
from history_settings;
grant select on public_settings to anon, authenticated;

-- The public browser no longer reads source tables directly. All reader data is
-- served through the public-timeline Edge Function, which can enforce the optional
-- password before using service_role. Keep the old RLS policies for authenticated
-- admin access, but remove direct anonymous table privileges.
revoke all on table timeline_elements, messages, media, memories, screenshots from anon;
revoke all on table ai_metadata, imports, history_settings from anon;
revoke all on table app_config from anon;

-- Optional password support. The plaintext password never leaves Postgres.
create or replace function set_reader_password(p_password text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;

  if p_password is null or length(trim(p_password)) = 0 then
    update history_settings
      set reader_requires_password = false,
          reader_password_hash = null,
          updated_at = now()
    where id = true;
  else
    update history_settings
      set reader_requires_password = true,
          reader_password_hash = crypt(p_password, gen_salt('bf', 10)),
          updated_at = now()
    where id = true;
  end if;

  return true;
end;
$$;
revoke all on function set_reader_password(text) from public;
grant execute on function set_reader_password(text) to authenticated;

create or replace function verify_reader_password(p_password text)
returns boolean
language sql
security definer
set search_path = public, pg_temp
stable
as $$
  select case
    when coalesce((select reader_requires_password from history_settings where id = true), false) = false then true
    else exists (
      select 1
      from history_settings
      where id = true
        and reader_password_hash is not null
        and crypt(coalesce(p_password, ''), reader_password_hash) = reader_password_hash
    )
  end;
$$;
revoke all on function verify_reader_password(text) from public;
grant execute on function verify_reader_password(text) to anon, authenticated;

-- Keep settings editable from the admin SPA without ever exposing the password hash.
create or replace function update_history_settings(
  p_reader_title text,
  p_contact_display_name text,
  p_theme jsonb
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  update history_settings
  set reader_title = coalesce(nullif(trim(p_reader_title), ''), 'Для тебя'),
      contact_display_name = nullif(trim(coalesce(p_contact_display_name, '')), ''),
      theme = coalesce(p_theme, '{}'::jsonb),
      updated_at = now()
  where id = true;
  return true;
end;
$$;
revoke all on function update_history_settings(text,text,jsonb) from public;
grant execute on function update_history_settings(text,text,jsonb) to authenticated;

-- Helper used after imports and when manually adding/deleting content.
create or replace function rebuild_special_timeline()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer := 0;
  r record;
begin
  if not is_admin() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'not authorized';
  end if;

  delete from timeline_elements where type in ('year_break', 'on_this_day');

  -- One year break at the first visible message of every year.
  for r in
    select distinct on (extract(year from sent_at)) sent_at, extract(year from sent_at)::int as year_no
    from messages
    where is_system_message = false
    order by extract(year from sent_at), sent_at
  loop
    insert into timeline_elements(type, occurred_at, sort_tiebreak, style, is_published)
    values ('year_break', r.sent_at, -100, jsonb_build_object('zone','default'), true);
    inserted_count := inserted_count + 1;
  end loop;

  -- A lightweight "this day" marker when a message has an anniversary in the
  -- imported history. We keep the current/latest occurrence as the marker.
  for r in
    select max(m.sent_at) as occurred_at
    from messages m
    where m.is_system_message = false
      and exists (
        select 1 from messages older
        where older.id <> m.id
          and older.is_system_message = false
          and extract(month from older.sent_at) = extract(month from m.sent_at)
          and extract(day from older.sent_at) = extract(day from m.sent_at)
          and older.sent_at < m.sent_at - interval '330 days'
      )
    group by extract(month from m.sent_at), extract(day from m.sent_at)
  loop
    insert into timeline_elements(type, occurred_at, sort_tiebreak, style, is_published)
    values ('on_this_day', r.occurred_at, -50, jsonb_build_object('zone','default'), true);
    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;
revoke all on function rebuild_special_timeline() from public;
grant execute on function rebuild_special_timeline() to authenticated;

-- Keep timestamps and source placement deterministic.
create index if not exists idx_messages_sent_at_id on messages(sent_at asc, id asc);
create index if not exists idx_timeline_cursor on timeline_elements(occurred_at asc, sort_tiebreak asc, id asc);
create index if not exists idx_timeline_message on timeline_elements(message_id) where message_id is not null;
create index if not exists idx_timeline_media on timeline_elements(media_id) where media_id is not null;

-- A reader-safe API view used by the public Edge Function. No model/prompt/error
-- fields are exposed here.
drop view if exists reader_timeline_data;
create view reader_timeline_data as
select
  te.id as element_id,
  te.type,
  te.occurred_at,
  te.sort_tiebreak,
  te.style,
  te.mood,
  te.is_published,
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
  sc.storage_path as screenshot_storage_path,
  sc.caption as screenshot_caption,
  sc.occurred_at as screenshot_occurred_at,
  sc.style as screenshot_style
from timeline_elements te
left join messages m on m.id = te.message_id
left join media md on md.id = te.media_id
left join memories mem on mem.id = te.memory_id
left join screenshots sc on sc.id = te.screenshot_id
where te.is_published = true;

-- Only service_role should use the internal reader view.
revoke all on reader_timeline_data from anon, authenticated;

-- Admin-friendly updated_at trigger for manually edited memories.
create or replace function touch_memory_updated_at()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists trg_touch_memory_updated_at on memories;
create trigger trg_touch_memory_updated_at before update on memories
for each row execute function touch_memory_updated_at();

-- Ensure the first settings row exists after a migration on an empty project.
-- The actual reader start date remains mandatory and is still established by the
-- first import, so this does not change import semantics.
revoke all on public_timeline from anon, authenticated;
grant select on reader_timeline_data to service_role;
