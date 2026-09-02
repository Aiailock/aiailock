-- 0020 Local AI Story Director
-- Fully free/local AI workflow: suggestions are generated in the admin browser,
-- stored as drafts, staged as unpublished timeline elements, previewed by the
-- authenticated admin, then explicitly published.

create table if not exists ai_story_batches (
  id uuid primary key default gen_random_uuid(),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  status text not null default 'draft' check (status in ('draft','staged','published','archived')),
  mode text not null default 'careful' check (mode in ('careful','balanced','cinematic')),
  model_id text,
  settings jsonb not null default '{}'::jsonb
);

create table if not exists ai_story_suggestions (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references ai_story_batches(id) on delete cascade,
  left_element_id uuid references timeline_elements(id) on delete set null,
  right_element_id uuid references timeline_elements(id) on delete set null,
  suggested_type text not null check (suggested_type in ('pause','chapter','quote','gif','image','video','music','link')),
  title text,
  body text,
  reason text,
  asset_query text,
  asset_url text,
  confidence numeric(4,3) not null default 0.5 check (confidence >= 0 and confidence <= 1),
  style jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  state text not null default 'draft' check (state in ('draft','approved','rejected','staged','published')),
  sort_order integer not null default 0,
  occurred_at timestamptz not null,
  staged_element_id uuid references timeline_elements(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_ai_story_suggestions_batch on ai_story_suggestions(batch_id, sort_order, created_at);
create index if not exists idx_ai_story_suggestions_state on ai_story_suggestions(batch_id, state);

alter table ai_story_batches enable row level security;
alter table ai_story_suggestions enable row level security;

drop policy if exists "admin full access - ai story batches" on ai_story_batches;
create policy "admin full access - ai story batches" on ai_story_batches
for all using (is_admin()) with check (is_admin());

drop policy if exists "admin full access - ai story suggestions" on ai_story_suggestions;
create policy "admin full access - ai story suggestions" on ai_story_suggestions
for all using (is_admin()) with check (is_admin());

revoke all on ai_story_batches, ai_story_suggestions from anon;
grant select, insert, update, delete on ai_story_batches, ai_story_suggestions to authenticated;

-- Rich admin-only context for local browser inference. Text is never sent to a paid API.
drop view if exists admin_ai_story_context;
create view admin_ai_story_context
with (security_invoker = true, security_barrier = true) as
select
  te.id as element_id,
  te.type,
  te.occurred_at,
  te.display_order::double precision as display_order,
  te.mood,
  te.importance,
  te.style,
  te.metadata,
  coalesce(
    nullif(trim(m.display_text), ''),
    nullif(trim(m.original_text), ''),
    nullif(trim(mem.body), ''),
    nullif(trim(sc.caption), ''),
    nullif(trim(sc.description), ''),
    nullif(trim(te.metadata->>'body'), ''),
    nullif(trim(te.metadata->>'text'), ''),
    nullif(trim(te.metadata->>'quote'), ''),
    nullif(trim(te.metadata->>'subtitle'), ''),
    nullif(trim(te.metadata->>'title'), ''),
    ''
  ) as content_text,
  coalesce(
    nullif(trim(mem.title), ''),
    nullif(trim(sc.title), ''),
    nullif(trim(te.metadata->>'title'), ''),
    nullif(trim(md.original_filename), ''),
    ''
  ) as content_title,
  coalesce(md.kind,
    case
      when te.type in ('photo','video','audio','gif','sticker','screenshot') then te.type
      when nullif(te.style->>'externalMediaKind','') is not null then te.style->>'externalMediaKind'
      else null
    end
  ) as media_kind
from timeline_elements te
left join messages m on m.id = te.message_id
left join media md on md.id = te.media_id
left join memories mem on mem.id = te.memory_id
left join screenshots sc on sc.id = te.screenshot_id
where te.is_published = true
  and (te.visible_from is null or te.visible_from <= now());

revoke all on admin_ai_story_context from public;
grant select on admin_ai_story_context to authenticated;

-- Preview view deliberately includes unpublished rows, but only the service-role
-- Edge Function can read it. The Edge Function additionally requires admin auth
-- before allowing an AI batch preview.
drop view if exists reader_timeline_preview_data;
create view reader_timeline_preview_data as
select
  te.id as element_id,
  te.type,
  te.occurred_at,
  te.sort_tiebreak,
  te.display_order::double precision as display_order,
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
  sc.reaction_text as screenshot_reaction_text,
  nullif(te.metadata->>'aiBatchId','') as ai_batch_id,
  (te.is_published = true and (te.visible_from is null or te.visible_from <= now())) as is_reader_visible
from timeline_elements te
left join messages m on m.id = te.message_id
left join media md on md.id = te.media_id
left join memories mem on mem.id = te.memory_id
left join screenshots sc on sc.id = te.screenshot_id;

revoke all on reader_timeline_preview_data from anon, authenticated;
grant select on reader_timeline_preview_data to service_role;

create or replace function admin_stage_ai_batch(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  s ai_story_suggestions%rowtype;
  new_id uuid;
  mapped_type text;
  mapped_style jsonb;
  mapped_metadata jsonb;
  staged_count integer := 0;
begin
  if not is_admin() then raise exception 'Admin access required'; end if;

  for s in
    select * from ai_story_suggestions
    where batch_id = p_batch_id and state = 'approved'
    order by sort_order, created_at
  loop
    mapped_type := case s.suggested_type
      when 'image' then 'photo'
      when 'music' then 'audio'
      else s.suggested_type
    end;

    -- Media ideas need an actual URL before they can be previewed as real media.
    if s.suggested_type in ('gif','image','video','music','link')
       and coalesce(trim(s.asset_url), '') !~* '^https?://' then
      continue;
    end if;

    mapped_style := coalesce(s.style, '{}'::jsonb) || jsonb_build_object(
      'hideTime', true,
      'spacing', coalesce(s.style->>'spacing','cinematic')
    );

    if s.suggested_type in ('gif','image','video','music') then
      mapped_style := mapped_style || jsonb_build_object(
        'externalMediaUrl', s.asset_url,
        'externalMediaKind', case s.suggested_type
          when 'image' then 'image'
          when 'music' then 'audio'
          else s.suggested_type
        end
      );
    end if;

    mapped_metadata := coalesce(s.metadata, '{}'::jsonb) || jsonb_build_object(
      'aiBatchId', s.batch_id::text,
      'aiSuggestionId', s.id::text,
      'aiGenerated', true,
      'title', nullif(s.title,''),
      'body', nullif(s.body,''),
      'reason', nullif(s.reason,'')
    );

    if s.suggested_type = 'pause' then
      mapped_metadata := mapped_metadata || jsonb_build_object('text', coalesce(s.body,''));
    elsif s.suggested_type = 'chapter' then
      mapped_metadata := mapped_metadata || jsonb_build_object('subtitle', coalesce(s.body,''));
    elsif s.suggested_type = 'quote' then
      mapped_metadata := mapped_metadata || jsonb_build_object('quote', coalesce(s.body,''), 'author', nullif(s.title,''));
    elsif s.suggested_type = 'link' then
      mapped_metadata := mapped_metadata || jsonb_build_object('url', s.asset_url, 'description', coalesce(s.body,''), 'openMode', 'external');
    end if;

    if s.staged_element_id is not null and exists(select 1 from timeline_elements where id=s.staged_element_id) then
      update timeline_elements
      set type = mapped_type,
          occurred_at = s.occurred_at,
          style = mapped_style,
          metadata = mapped_metadata,
          is_published = false,
          visible_from = null
      where id = s.staged_element_id;
      new_id := s.staged_element_id;
    else
      insert into timeline_elements(type, occurred_at, sort_tiebreak, style, mood, importance, metadata, is_published, visible_from)
      values(mapped_type, s.occurred_at, 0, mapped_style, null, 2, mapped_metadata, false, null)
      returning id into new_id;
      update ai_story_suggestions set staged_element_id = new_id where id = s.id;
    end if;

    perform admin_place_timeline_element(new_id, s.left_element_id, s.right_element_id);
    update ai_story_suggestions set state='staged', updated_at=now() where id=s.id;
    staged_count := staged_count + 1;
  end loop;

  update ai_story_batches set status='staged', updated_at=now() where id=p_batch_id;
  return staged_count;
end;
$$;

revoke all on function admin_stage_ai_batch(uuid) from public;
grant execute on function admin_stage_ai_batch(uuid) to authenticated;

create or replace function admin_unstage_ai_batch(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare removed integer;
begin
  if not is_admin() then raise exception 'Admin access required'; end if;

  delete from timeline_elements te
  using ai_story_suggestions s
  where s.batch_id=p_batch_id
    and s.staged_element_id=te.id
    and te.is_published=false;
  get diagnostics removed = row_count;

  update ai_story_suggestions
  set staged_element_id=null,
      state=case when state='rejected' then 'rejected' else 'approved' end,
      updated_at=now()
  where batch_id=p_batch_id and state <> 'published';
  update ai_story_batches set status='draft', updated_at=now() where id=p_batch_id and status <> 'published';
  return removed;
end;
$$;

revoke all on function admin_unstage_ai_batch(uuid) from public;
grant execute on function admin_unstage_ai_batch(uuid) to authenticated;

create or replace function admin_publish_ai_batch(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare published_count integer;
begin
  if not is_admin() then raise exception 'Admin access required'; end if;

  update timeline_elements te
  set is_published=true,
      visible_from=null,
      metadata=coalesce(te.metadata,'{}'::jsonb) || jsonb_build_object('aiPublishedAt', now())
  from ai_story_suggestions s
  where s.batch_id=p_batch_id
    and s.state='staged'
    and s.staged_element_id=te.id
    and te.is_published=false;
  get diagnostics published_count = row_count;

  update ai_story_suggestions set state='published', updated_at=now()
  where batch_id=p_batch_id and state='staged';
  update ai_story_batches set status='published', updated_at=now() where id=p_batch_id;
  return published_count;
end;
$$;

revoke all on function admin_publish_ai_batch(uuid) from public;
grant execute on function admin_publish_ai_batch(uuid) to authenticated;
