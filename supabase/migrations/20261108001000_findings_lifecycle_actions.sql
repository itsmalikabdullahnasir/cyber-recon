-- Authenticated lifecycle actions for grouped findings.

alter table public.findings add column if not exists finding_priority text
  check (finding_priority in ('None', 'Low', 'Medium', 'High', 'Critical'));
alter table public.findings add column if not exists finding_notes text;
alter table public.findings add column if not exists assigned_to text;

create or replace function public.update_findings_group(
  p_group_id text,
  p_status text default null,
  p_priority text default null,
  p_notes text default null,
  p_assigned_to text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_status is not null and p_status not in ('New', 'Confirmed', 'Reported', 'Fixed', 'False Positive') then
    raise exception 'Invalid finding status';
  end if;
  if p_priority is not null and p_priority not in ('None', 'Low', 'Medium', 'High', 'Critical') then
    raise exception 'Invalid finding priority';
  end if;

  update public.findings f
  set status = coalesce(p_status, f.status),
      finding_priority = coalesce(p_priority, f.finding_priority),
      finding_notes = case when p_notes is null then f.finding_notes else nullif(trim(p_notes), '') end,
      assigned_to = case when p_assigned_to is null then f.assigned_to else nullif(trim(p_assigned_to), '') end
  where md5(jsonb_build_array(coalesce(nullif(f.cve_id, ''), f.title), f.host_id::text, coalesce(f.affected_url, ''))::text) = p_group_id;

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

create or replace function public.update_findings_groups(
  p_group_ids text[],
  p_status text default null,
  p_priority text default null,
  p_notes text default null,
  p_assigned_to text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if p_group_ids is null or cardinality(p_group_ids) = 0 then
    return 0;
  end if;
  select coalesce(sum(public.update_findings_group(group_id, p_status, p_priority, p_notes, p_assigned_to)), 0)::integer
    into updated_count
  from unnest(p_group_ids) as group_id;
  return updated_count;
end;
$$;

grant execute on function public.update_findings_group(text, text, text, text, text) to authenticated;
grant execute on function public.update_findings_groups(text[], text, text, text, text) to authenticated;
