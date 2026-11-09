-- =============================================================================
-- Fix findings workbench timeout.
-- Root cause: RLS policy on findings has a correlated EXISTS subquery into
-- scans that runs once per row, making get_findings_groups timeout.
-- Fix: convert to SECURITY DEFINER + explicit ownership filter + 30s timeout.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Fix the RLS policy — replace correlated subquery with a simpler check.
--    findings.owner_id is already populated from the scan's requested_by.
--    The fallback scan subquery is only needed for findings where owner_id
--    was NULL before migration 20261108001300 backfilled it.
--    We now make the policy cheap: just check owner_id (indexed).
-- ---------------------------------------------------------------------------

drop policy if exists "own findings read"  on public.findings;
drop policy if exists "own findings write" on public.findings;

create policy "own findings read" on public.findings for select
  using (public.recon_is_admin() or owner_id = auth.uid());

create policy "own findings write" on public.findings for all
  using  (public.recon_is_admin() or owner_id = auth.uid())
  with check (public.recon_is_admin() or owner_id = auth.uid());

-- Backfill any remaining NULL owner_ids (safe to run again)
update public.findings f
set owner_id = s.requested_by
from public.scans s
where f.owner_id is null and f.scan_id = s.id;

-- Index on owner_id so the RLS check is an index lookup, not a seq scan
create index if not exists findings_owner_idx on public.findings (owner_id);

-- ---------------------------------------------------------------------------
-- 2. Rewrite get_findings_groups as SECURITY DEFINER with 30s timeout.
--    This bypasses the per-row RLS overhead entirely and sets its own timeout.
--    Ownership is enforced explicitly in the WHERE clause.
-- ---------------------------------------------------------------------------

create or replace function public.get_findings_groups(
  p_search        text    default null,
  p_severity      text    default null,
  p_unresolved_only boolean default true,
  p_sort          text    default 'severity',
  p_page          integer default 1,
  p_page_size     integer default 25
)
returns jsonb
language sql
stable
security definer                 -- runs as function owner, bypasses RLS
set search_path = public
set statement_timeout = '30000'  -- 30 s regardless of role timeout
as $$
  with params as (
    select
      nullif(trim(p_search),   '') search_text,
      nullif(trim(p_severity), '') severity_filter,
      greatest(1, least(coalesce(p_page,      1),   10000)) page_number,
      greatest(1, least(coalesce(p_page_size, 25),   100))  page_size,
      auth.uid()  current_uid,
      (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','analyst')) is_admin
  ),
  base as materialized (
    -- Explicit ownership filter replaces RLS (security definer bypasses it)
    select
      f.id, f.title, f.severity::text severity, f.status,
      f.cve_id, f.cvss, f.cwe, f.affected_url,
      f.created_at, f.scan_id, f.source, f.target_id, f.host_id,
      coalesce(nullif(f.cve_id, ''), f.title) finding_key,
      t.name  target_name, t.domain target_domain,
      h.ip    host_ip,    h.hostname host_hostname, h.ports host_ports,
      s.input scan_input, s.created_at scan_created_at
    from public.findings f
    left join public.targets t on t.id = f.target_id
    left join public.hosts   h on h.id = f.host_id
    left join public.scans   s on s.id = f.scan_id
    cross join params p
    where
      -- ownership (explicit, not via RLS)
      (p.is_admin or f.owner_id = p.current_uid)
      -- severity filter
      and (p.severity_filter is null or f.severity::text = p.severity_filter)
      -- resolved filter
      and (not coalesce(p_unresolved_only, true)
           or f.status not in ('Fixed', 'False Positive'))
      -- text search (GIN trigram indexes make ilike fast)
      and (p.search_text is null
        or f.title        ilike '%' || p.search_text || '%'
        or coalesce(f.cve_id, '')       ilike '%' || p.search_text || '%'
        or coalesce(f.affected_url, '') ilike '%' || p.search_text || '%'
        or coalesce(t.name, '')         ilike '%' || p.search_text || '%'
        or coalesce(t.domain, '')       ilike '%' || p.search_text || '%'
        or coalesce(h.ip, '')           ilike '%' || p.search_text || '%'
        or coalesce(h.hostname, '')     ilike '%' || p.search_text || '%'
        or coalesce(s.input, '')        ilike '%' || p.search_text || '%')
  ), keys as materialized (
    select
      finding_key, host_id, affected_url,
      max(created_at)  last_seen_at,
      min(created_at)  first_seen_at,
      max(cvss)        cvss,
      (array_agg(severity order by
        case severity when 'Critical' then 5 when 'High' then 4
                      when 'Medium'  then 3 when 'Low'  then 2 else 1 end desc
      ))[1] severity
    from base
    group by finding_key, host_id, affected_url
  ), page_keys as materialized (
    select k.* from keys k cross join params p
    order by
      case when coalesce(p_sort,'severity') = 'severity'
        then case k.severity when 'Critical' then 5 when 'High' then 4
             when 'Medium' then 3 when 'Low' then 2 else 1 end
      end desc nulls last,
      case when coalesce(p_sort,'severity') = 'cvss'   then k.cvss         end desc nulls last,
      case when coalesce(p_sort,'severity') = 'newest' then k.last_seen_at end desc nulls last,
      k.last_seen_at desc
    limit  (select page_size    from params)
    offset ((select page_number from params) - 1) * (select page_size from params)
  ), details as (
    select
      k.finding_key, k.host_id, k.affected_url,
      max(b.title)       title,
      max(b.cve_id)      cve_id,
      k.severity,
      (array_agg(b.status        order by b.created_at desc))[1] status,
      k.cvss,
      (array_agg(b.cwe           order by b.created_at desc))[1] cwe,
      max(b.target_name)    target_name,
      max(b.target_domain)  target_domain,
      max(b.host_ip)        host_ip,
      max(b.host_hostname)  host_hostname,
      (array_agg(b.host_ports    order by b.created_at desc))[1] host_ports,
      count(*)::integer     occurrence_count,
      count(*) > 1          is_recurring,
      k.first_seen_at, k.last_seen_at,
      -- Evidence/remediation fetched per-row on expand (saves huge disk reads)
      jsonb_agg(jsonb_build_object(
        'id',              b.id,
        'scan_id',         b.scan_id,
        'scan_input',      b.scan_input,
        'scan_created_at', b.scan_created_at,
        'source',          b.source,
        'status',          b.status,
        'cvss',            b.cvss,
        'created_at',      b.created_at
      ) order by b.created_at desc) occurrences
    from page_keys k
    join base b
      on  b.finding_key  = k.finding_key
      and b.host_id      is not distinct from k.host_id
      and b.affected_url is not distinct from k.affected_url
    group by k.finding_key, k.host_id, k.affected_url,
             k.severity, k.cvss, k.first_seen_at, k.last_seen_at
  )
  select jsonb_build_object(
    'rows',      coalesce((
                   select jsonb_agg(to_jsonb(details) order by last_seen_at desc)
                   from details
                 ), '[]'::jsonb),
    'total',     (select count(*) from keys),
    'page',      (select page_number from params),
    'page_size', (select page_size  from params)
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Same treatment for get_findings_export
-- ---------------------------------------------------------------------------

create or replace function public.get_findings_export(
  p_search          text    default null,
  p_severity        text    default null,
  p_unresolved_only boolean default true
)
returns jsonb
language sql
stable
security definer
set search_path = public
set statement_timeout = '30000'
as $$
  with params as (
    select
      nullif(trim(p_search),   '') search_text,
      nullif(trim(p_severity), '') severity_filter,
      auth.uid() current_uid,
      (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin','analyst')) is_admin
  ),
  filtered as (
    select
      f.id, f.title, f.severity::text severity, f.status,
      f.cve_id, f.cvss, f.affected_url, f.created_at, f.host_id,
      t.name target_name, t.domain target_domain,
      h.ip host_ip, h.hostname host_hostname
    from public.findings f
    left join public.targets t on t.id = f.target_id
    left join public.hosts   h on h.id = f.host_id
    cross join params p
    where (p.is_admin or f.owner_id = p.current_uid)
      and (p.severity_filter is null or f.severity::text = p.severity_filter)
      and (not coalesce(p_unresolved_only, true) or f.status not in ('Fixed','False Positive'))
      and (p.search_text is null
        or f.title               ilike '%' || p.search_text || '%'
        or coalesce(f.cve_id,'') ilike '%' || p.search_text || '%'
        or coalesce(f.affected_url,'') ilike '%' || p.search_text || '%'
        or coalesce(t.name,'')   ilike '%' || p.search_text || '%'
        or coalesce(t.domain,'') ilike '%' || p.search_text || '%'
        or coalesce(h.ip,'')     ilike '%' || p.search_text || '%'
        or coalesce(h.hostname,'') ilike '%' || p.search_text || '%')
  ),
  grouped as (
    select
      md5(jsonb_build_array(
        coalesce(nullif(max(cve_id),''), max(title)),
        host_id::text,
        coalesce(max(affected_url),'')
      )::text) group_id,
      max(title) title,
      (array_agg(severity order by case severity
        when 'Critical' then 5 when 'High' then 4 when 'Medium' then 3
        when 'Low' then 2 else 1 end desc))[1] severity,
      (array_agg(status order by created_at desc))[1] status,
      max(cve_id) cve_id, max(cvss) cvss,
      max(target_name) target_name, max(target_domain) target_domain,
      max(host_ip) host_ip, max(host_hostname) host_hostname,
      max(affected_url) affected_url,
      count(*)::integer occurrence_count,
      min(created_at) first_seen_at, max(created_at) last_seen_at
    from filtered
    group by coalesce(nullif(cve_id,''), title), host_id, affected_url
  )
  select coalesce(jsonb_agg(to_jsonb(grouped) order by
    case severity when 'Critical' then 5 when 'High' then 4
    when 'Medium' then 3 when 'Low' then 2 else 1 end desc,
    last_seen_at desc, group_id), '[]'::jsonb)
  from grouped;
$$;

-- ---------------------------------------------------------------------------
-- 4. Grants (security definer functions only need execute, not table access)
-- ---------------------------------------------------------------------------

revoke all on function public.get_findings_groups(text,text,boolean,text,integer,integer) from public;
revoke all on function public.get_findings_export(text,text,boolean)                      from public;
grant execute on function public.get_findings_groups(text,text,boolean,text,integer,integer) to authenticated;
grant execute on function public.get_findings_export(text,text,boolean)                      to authenticated;

-- Run ANALYZE to ensure the new owner_id index is used
analyze public.findings;

notify pgrst, 'reload schema';
