-- Global mobile admin/media/questions update.
-- Additive: no story rows, imports, progress or existing media are deleted.

-- Full songs are commonly larger than the original voice-note-oriented limit.
update storage.buckets
set file_size_limit = 62914560
where id = 'audio';

create table if not exists public.reader_interaction_answers (
  id uuid primary key default gen_random_uuid(),
  visitor_id uuid not null,
  element_id uuid not null references public.timeline_elements(id) on delete cascade,
  answer_index smallint not null check (answer_index between 0 and 3),
  answer_value text not null check (char_length(answer_value) between 1 and 180),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(visitor_id, element_id)
);

create index if not exists idx_reader_interaction_answers_updated
  on public.reader_interaction_answers(updated_at desc);
create index if not exists idx_reader_interaction_answers_element
  on public.reader_interaction_answers(element_id, answer_index);

alter table public.reader_interaction_answers enable row level security;
drop policy if exists "admin full access - reader interaction answers" on public.reader_interaction_answers;
create policy "admin full access - reader interaction answers"
  on public.reader_interaction_answers for all
  using (public.is_admin()) with check (public.is_admin());
revoke all on public.reader_interaction_answers from anon;
grant select, delete on public.reader_interaction_answers to authenticated;
grant all on public.reader_interaction_answers to service_role;

-- Keep the existing reset button complete: when the admin chooses to clear
-- reactions/opinions, questionnaire answers are cleared in the same action.
create or replace function public.admin_clear_reader_analytics(
  p_include_reactions boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  removed_visitors integer := 0;
  removed_visits integer := 0;
  removed_reactions integer := 0;
  removed_answers integer := 0;
begin
  if not is_admin() then raise exception 'not authorized'; end if;

  select count(*) into removed_visitors from reader_visitors;
  select count(*) into removed_visits from reader_visits;
  if p_include_reactions then
    select count(*) into removed_reactions from reader_reactions;
    select count(*) into removed_answers from reader_interaction_answers;
    delete from reader_reactions;
    delete from reader_interaction_answers;
  end if;

  delete from reader_visitors;
  return jsonb_build_object(
    'visitors', removed_visitors,
    'visits', removed_visits,
    'reactions', removed_reactions,
    'answers', removed_answers
  );
end;
$$;

revoke all on function public.admin_clear_reader_analytics(boolean) from public;
grant execute on function public.admin_clear_reader_analytics(boolean) to authenticated;

