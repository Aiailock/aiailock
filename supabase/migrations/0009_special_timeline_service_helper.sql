-- Internal service-role variant used by import-zip. The public/admin wrapper
-- remains protected by is_admin().
create or replace function rebuild_special_timeline_internal()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer := 0;
  r record;
begin
  delete from timeline_elements where type in ('year_break', 'on_this_day');

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
revoke all on function rebuild_special_timeline_internal() from public, anon, authenticated;
grant execute on function rebuild_special_timeline_internal() to service_role;

create or replace function rebuild_special_timeline()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not is_admin() then
    raise exception 'not authorized';
  end if;
  return rebuild_special_timeline_internal();
end;
$$;
revoke all on function rebuild_special_timeline() from public;
grant execute on function rebuild_special_timeline() to authenticated;
