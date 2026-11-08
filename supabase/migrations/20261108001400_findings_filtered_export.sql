-- Export all grouped findings matching the workbench filters.

create or replace function public.get_findings_export(
  p_search text default null,
  p_severity text default null,
  p_unresolved_only boolean default true
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select nullif(trim(p_search), '') as search_text,
      nullif(trim(p_severity), '') as severity_filter
  ),
  filtered as (
    select f.id, f.title, f.severity::text as severity, f.status, f.cve_id, f.cvss,
      f.affected_url, f.created_at, f.host_id, t.name as target_name,
      t.domain as target_domain, h.ip as host_ip, h.hostname as host_hostname
    from public.findings f
    left join public.targets t on t.id = f.target_id
    left join public.hosts h on h.id = f.host_id
    cross join params p
    where (p.severity_filter is null or f.severity::text = p.severity_filter)
      and (not coalesce(p_unresolved_only, true) or f.status not in ('Fixed', 'False Positive'))
      and (p.search_text is null
        or f.title ilike '%' || p.search_text || '%'
        or coalesce(f.cve_id, '') ilike '%' || p.search_text || '%'
        or coalesce(f.affected_url, '') ilike '%' || p.search_text || '%'
        or coalesce(t.name, '') ilike '%' || p.search_text || '%'
        or coalesce(t.domain, '') ilike '%' || p.search_text || '%'
        or coalesce(h.ip, '') ilike '%' || p.search_text || '%'
        or coalesce(h.hostname, '') ilike '%' || p.search_text || '%'
        or f.severity::text ilike '%' || p.search_text || '%')
  ),
  grouped as (
    select
      md5(jsonb_build_array(coalesce(nullif(max(cve_id), ''), max(title)),
        host_id::text, coalesce(max(affected_url), ''))::text) as group_id,
      max(title) as title,
      (array_agg(severity order by case severity when 'Critical' then 5 when 'High' then 4
        when 'Medium' then 3 when 'Low' then 2 else 1 end desc))[1] as severity,
      (array_agg(status order by created_at desc))[1] as status,
      max(cve_id) as cve_id,
      max(cvss) as cvss,
      max(target_name) as target_name,
      max(target_domain) as target_domain,
      max(host_ip) as host_ip,
      max(host_hostname) as host_hostname,
      max(affected_url) as affected_url,
      count(*)::integer as occurrence_count,
      min(created_at) as first_seen_at,
      max(created_at) as last_seen_at
    from filtered
    group by coalesce(nullif(cve_id, ''), title), host_id, affected_url
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by
    case severity when 'Critical' then 5 when 'High' then 4 when 'Medium' then 3 when 'Low' then 2 else 1 end desc,
    last_seen_at desc, group_id), '[]'::jsonb)
  from grouped;
$$;

grant execute on function public.get_findings_export(text, text, boolean) to authenticated;
