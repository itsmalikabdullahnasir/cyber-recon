-- Server-side findings search/pagination and owner-scoped queue actions.

create index if not exists findings_created_at_idx
  on public.findings(created_at desc);

create index if not exists findings_severity_idx
  on public.findings(severity);

create or replace function public.get_findings_page(
  p_search text default null,
  p_severity text default null,
  p_unresolved_only boolean default true,
  p_sort text default 'severity',
  p_page integer default 1,
  p_page_size integer default 50
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select
      nullif(trim(p_search), '') as search_text,
      nullif(trim(p_severity), '') as severity_filter,
      greatest(1, least(coalesce(p_page, 1), 10000)) as page_number,
      greatest(1, least(coalesce(p_page_size, 50), 100)) as page_size
  ),
  filtered as (
    select f.*
    from public.findings f
    cross join params p
    where (p.severity_filter is null or f.severity::text = p.severity_filter)
      and (not coalesce(p_unresolved_only, true)
        or f.status not in ('Fixed', 'False Positive'))
      and (p.search_text is null
        or f.title ilike '%' || p.search_text || '%'
        or coalesce(f.cve_id, '') ilike '%' || p.search_text || '%'
        or coalesce(f.affected_url, '') ilike '%' || p.search_text || '%'
        or f.severity::text ilike '%' || p.search_text || '%')
  ),
  page_rows as (
    select f.*
    from filtered f
    cross join params p
    order by
      case when coalesce(p_sort, 'severity') = 'severity' then
        case f.severity when 'Critical' then 5 when 'High' then 4 when 'Medium' then 3 when 'Low' then 2 else 1 end
      end desc nulls last,
      case when coalesce(p_sort, 'severity') = 'cvss' then f.cvss end desc nulls last,
      case when coalesce(p_sort, 'severity') = 'newest' then f.created_at end desc nulls last,
      f.created_at desc
    limit (select page_size from params)
    offset ((select page_number from params) - 1) * (select page_size from params)
  )
  select jsonb_build_object(
    'rows', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'page', (select page_number from params),
    'page_size', (select page_size from params)
  );
$$;

grant execute on function public.get_findings_page(text, text, boolean, text, integer, integer) to authenticated;

create or replace function public.cancel_queued_scans()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare changed integer;
begin
  update public.scans
  set status = 'failed', error = 'cancelled by user', finished_at = now()
  where requested_by = auth.uid() and status = 'queued';
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.retry_failed_scans()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare changed integer;
begin
  update public.scans
  set status = 'queued', error = null, stage = null, stages = '{}'::jsonb,
      started_at = null, finished_at = null
  where requested_by = auth.uid() and status = 'failed';
  get diagnostics changed = row_count;
  return changed;
end;
$$;

create or replace function public.clear_old_scans(p_days integer default 7)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare changed integer;
begin
  delete from public.scans
  where requested_by = auth.uid()
    and status in ('done', 'failed')
    and created_at < now() - make_interval(days => greatest(1, least(coalesce(p_days, 7), 3650)));
  get diagnostics changed = row_count;
  return changed;
end;
$$;

grant execute on function public.cancel_queued_scans() to authenticated;
grant execute on function public.retry_failed_scans() to authenticated;
grant execute on function public.clear_old_scans(integer) to authenticated;
