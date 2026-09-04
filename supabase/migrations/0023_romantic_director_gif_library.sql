-- 0023 Romantic director and reliable AI GIF storage.
-- Additive: existing story rows and media are not changed.

alter table public.ai_story_suggestions
  add column if not exists asset_storage_path text,
  add column if not exists staged_memory_id uuid references public.memories(id) on delete set null;

create or replace function public.admin_stage_ai_batch(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  s public.ai_story_suggestions%rowtype;
  new_id uuid;
  gif_memory_id uuid;
  mapped_type text;
  mapped_style jsonb;
  mapped_metadata jsonb;
  staged_count integer := 0;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  for s in
    select * from public.ai_story_suggestions
    where batch_id = p_batch_id and state = 'approved'
    order by sort_order, created_at
  loop
    mapped_type := case s.suggested_type
      when 'image' then 'photo'
      when 'music' then 'audio'
      else s.suggested_type
    end;

    if s.suggested_type = 'gif'
       and coalesce(trim(s.asset_storage_path), '') = ''
       and coalesce(trim(s.asset_url), '') !~* '^https?://' then
      continue;
    end if;
    if s.suggested_type in ('image','video','music','link')
       and coalesce(trim(s.asset_url), '') !~* '^https?://' then
      continue;
    end if;

    mapped_style := coalesce(s.style, '{}'::jsonb) || jsonb_build_object(
      'hideTime', true,
      'spacing', coalesce(s.style->>'spacing','cinematic')
    );

    if s.suggested_type in ('image','video','music')
       or (s.suggested_type = 'gif' and coalesce(trim(s.asset_storage_path), '') = '') then
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

    gif_memory_id := null;
    if s.suggested_type = 'gif' and coalesce(trim(s.asset_storage_path), '') <> '' then
      gif_memory_id := coalesce(s.staged_memory_id, gen_random_uuid());
      insert into public.memories(id, title, body, occurred_at, style, importance, photo_storage_path, metadata)
      values(
        gif_memory_id,
        nullif(s.title,''),
        coalesce(nullif(s.body,''), 'GIF'),
        s.occurred_at,
        mapped_style || jsonb_build_object('zone','gif','frame','minimal','hideText',coalesce(trim(s.body),'')=''),
        3,
        s.asset_storage_path,
        mapped_metadata || jsonb_build_object('kind','gif')
      )
      on conflict (id) do update set
        title=excluded.title,
        body=excluded.body,
        occurred_at=excluded.occurred_at,
        style=excluded.style,
        importance=excluded.importance,
        photo_storage_path=excluded.photo_storage_path,
        metadata=excluded.metadata,
        updated_at=now();
      update public.ai_story_suggestions set staged_memory_id=gif_memory_id where id=s.id;
      mapped_style := mapped_style || jsonb_build_object('zone','gif','frame','minimal','hideText',coalesce(trim(s.body),'')='');
    end if;

    -- sync_memory_timeline creates/reuses the one allowed timeline row for a
    -- memory. Reuse it instead of inserting a duplicate memory_id.
    if gif_memory_id is not null then
      select id into new_id
      from public.timeline_elements
      where memory_id = gif_memory_id
      limit 1;

      update public.timeline_elements
      set type = mapped_type,
          occurred_at = s.occurred_at,
          style = mapped_style,
          metadata = mapped_metadata,
          memory_id = gif_memory_id,
          is_published = false,
          visible_from = null
      where id = new_id;
      update public.ai_story_suggestions set staged_element_id = new_id where id = s.id;
    elsif s.staged_element_id is not null and exists(select 1 from public.timeline_elements where id=s.staged_element_id) then
      update public.timeline_elements
      set type = mapped_type,
          occurred_at = s.occurred_at,
          style = mapped_style,
          metadata = mapped_metadata,
          memory_id = gif_memory_id,
          is_published = false,
          visible_from = null
      where id = s.staged_element_id;
      new_id := s.staged_element_id;
    else
      insert into public.timeline_elements(type, occurred_at, sort_tiebreak, memory_id, style, mood, importance, metadata, is_published, visible_from)
      values(mapped_type, s.occurred_at, 0, gif_memory_id, mapped_style, null, 2, mapped_metadata, false, null)
      returning id into new_id;
      update public.ai_story_suggestions set staged_element_id = new_id where id = s.id;
    end if;

    perform public.admin_place_timeline_element(new_id, s.left_element_id, s.right_element_id);
    update public.ai_story_suggestions set state='staged', updated_at=now() where id=s.id;
    staged_count := staged_count + 1;
  end loop;

  update public.ai_story_batches set status='staged', updated_at=now() where id=p_batch_id;
  return staged_count;
end;
$$;

revoke all on function public.admin_stage_ai_batch(uuid) from public;
grant execute on function public.admin_stage_ai_batch(uuid) to authenticated;

create or replace function public.admin_unstage_ai_batch(p_batch_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare removed integer;
begin
  if not public.is_admin() then raise exception 'Admin access required'; end if;

  delete from public.timeline_elements te
  using public.ai_story_suggestions s
  where s.batch_id=p_batch_id
    and s.staged_element_id=te.id
    and te.is_published=false;
  get diagnostics removed = row_count;

  delete from public.memories m
  using public.ai_story_suggestions s
  where s.batch_id=p_batch_id
    and s.staged_memory_id=m.id
    and s.state <> 'published';

  update public.ai_story_suggestions
  set staged_element_id=null,
      staged_memory_id=null,
      state=case when state='rejected' then 'rejected' else 'approved' end,
      updated_at=now()
  where batch_id=p_batch_id and state <> 'published';
  update public.ai_story_batches set status='draft', updated_at=now() where id=p_batch_id and status <> 'published';
  return removed;
end;
$$;

revoke all on function public.admin_unstage_ai_batch(uuid) from public;
grant execute on function public.admin_unstage_ai_batch(uuid) to authenticated;
