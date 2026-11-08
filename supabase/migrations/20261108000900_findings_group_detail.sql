-- Add detail fields to the grouped findings RPC for databases that already ran 008.

create or replace function public.get_findings_groups(
  p_search text default null,
  p_severity text default null,
  p_unresolved_only boolean default true,
  p_sort text default 'severity',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with params as (
    select nullif(trim(p_search), '') as search_text,
      nullif(trim(p_severity), '') as severity_filter,
      greatest(1, least(coalesce(p_page, 1), 10000)) as page_number,
      greatest(1, least(coalesce(p_page_size, 25), 100)) as page_size
  ),
  filtered as (
    select f.id, f.title, f.severity, f.status, f.cve_id, f.cvss, f.cwe,
      f.evidence, f.remediation, f.affected_url, f.created_at, f.scan_id, f.source,
      f.target_id, f.host_id, t.name as target_name, t.domain as target_domain,
      h.ip as host_ip, h.hostname as host_hostname, h.ports as host_ports,
      s.input as scan_input, s.created_at as scan_created_at,
      coalesce(nullif(f.cve_id, ''), f.title) as finding_key
    from public.findings f
    left join public.targets t on t.id = f.target_id
    left join public.hosts h on h.id = f.host_id
    left join public.scans s on s.id = f.scan_id
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
        or coalesce(s.input, '') ilike '%' || p.search_text || '%'
        or f.severity::text ilike '%' || p.search_text || '%')
  ),
  grouped as (
    select md5(concat_ws(chr(0), finding_key, host_id::text, coalesce(affected_url, ''))) as group_id,
      finding_key, host_id, affected_url, max(title) as title, max(cve_id) as cve_id,
      (array_agg(severity::text order by case severity::text when 'Critical' then 5 when 'High' then 4 when 'Medium' then 3 when 'Low' then 2 else 1 end desc))[1] as severity,
      (array_agg(status order by created_at desc))[1] as status, max(cvss) as cvss,
      (array_agg(cwe order by created_at desc))[1] as cwe,
      (array_agg(evidence order by created_at desc))[1] as evidence,
      (array_agg(remediation order by created_at desc))[1] as remediation,
      max(target_name) as target_name, max(target_domain) as target_domain,
      max(host_ip) as host_ip, max(host_hostname) as host_hostname,
      (array_agg(host_ports order by created_at desc))[1] as host_ports,
      count(*)::integer as occurrence_count, count(*) > 1 as is_recurring,
      min(created_at) as first_seen_at, max(created_at) as last_seen_at,
      jsonb_agg(jsonb_build_object('id', id, 'scan_id', scan_id, 'scan_input', scan_input,
        'scan_created_at', scan_created_at, 'source', source, 'status', status, 'cvss', cvss,
        'cwe', cwe, 'evidence', evidence, 'remediation', remediation, 'created_at', created_at)
        order by created_at desc) as occurrences
    from filtered
    group by finding_key, host_id, affected_url
  ),
  page_rows as (
    select g.* from grouped g
    order by case when coalesce(p_sort, 'severity') = 'severity' then
      case g.severity when 'Critical' then 5 when 'High' then 4 when 'Medium' then 3 when 'Low' then 2 else 1 end end desc nulls last,
      case when coalesce(p_sort, 'cvss') = 'cvss' then g.cvss end desc nulls last,
      case when coalesce(p_sort, 'newest') = 'newest' then g.last_seen_at end desc nulls last,
      g.last_seen_at desc, g.group_id
    limit (select page_size from params)
    offset ((select page_number from params) - 1) * (select page_size from params)
  )
  select jsonb_build_object('rows', coalesce((select jsonb_agg(to_jsonb(page_rows)) from page_rows), '[]'::jsonb),
    'total', (select count(*) from grouped), 'page', (select page_number from params),
    'page_size', (select page_size from params));
$$;

grant execute on function public.get_findings_groups(text, text, boolean, text, integer, integer) to authenticated;
