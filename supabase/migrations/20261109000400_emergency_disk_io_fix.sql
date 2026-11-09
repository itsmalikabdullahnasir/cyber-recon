-- =============================================================================
-- EMERGENCY: Stop Disk IO budget exhaustion
-- Run this IMMEDIATELY in Supabase SQL Editor (all at once).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- STEP 1: Run ANALYZE so the query planner uses existing indexes instead of
--         falling back to seq scans. This alone can halve disk reads.
-- ---------------------------------------------------------------------------
analyze public.findings;
analyze public.scans;
analyze public.hosts;
analyze public.targets;
analyze public.host_history;
analyze public.audit_logs;

-- ---------------------------------------------------------------------------
-- STEP 2: Create the most critical indexes NOW (if not already applied from
--         migration 20261109000300). These prevent full table seq scans.
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm;

-- Findings: the most-read table
create index if not exists findings_fingerprint_idx      on public.findings (fingerprint);
create index if not exists findings_target_idx           on public.findings (target_id);
create index if not exists findings_host_idx             on public.findings (host_id);
create index if not exists findings_status_idx           on public.findings (status);
create index if not exists findings_created_idx          on public.findings (created_at desc);
create index if not exists findings_severity_status_idx  on public.findings (severity, status);
create index if not exists findings_scan_id_idx          on public.findings (scan_id);
create index if not exists findings_owner_idx            on public.findings (owner_id);
create index if not exists findings_group_lookup_idx     on public.findings (host_id, severity, status);
create index if not exists findings_group_page_idx       on public.findings (host_id, affected_url, created_at desc);
-- GIN trigram indexes (makes ilike '%...%' use index instead of seq scan)
create index if not exists findings_title_trgm_idx       on public.findings using gin (title gin_trgm_ops);
create index if not exists findings_url_trgm_idx         on public.findings using gin (affected_url gin_trgm_ops);
create index if not exists findings_cve_trgm_idx         on public.findings using gin (cve_id gin_trgm_ops);

-- Scans
create index if not exists scans_status_idx              on public.scans (status);
create index if not exists scans_owner_idx               on public.scans (requested_by);
create index if not exists scans_status_created_idx      on public.scans (status, created_at desc);
create index if not exists scans_created_status_idx      on public.scans (created_at desc, status);
create index if not exists scans_queue_idx               on public.scans (status, priority desc, created_at asc);

-- Hosts
create index if not exists hosts_scan_id_idx             on public.hosts (scan_id);
create index if not exists hosts_target_id_idx           on public.hosts (target_id);
create index if not exists hosts_status_idx              on public.hosts (status);

-- host_history
create index if not exists host_history_host_captured_idx on public.host_history (host_id, captured_at desc);

-- finding_comments
create index if not exists finding_comments_finding_idx  on public.finding_comments (finding_id, created_at desc);

-- ---------------------------------------------------------------------------
-- STEP 3: dashboard_totals_cache — read totals in < 1ms, not 8 COUNT(*) scans
-- ---------------------------------------------------------------------------

create table if not exists public.dashboard_totals_cache (
  id            integer primary key default 1 check (id = 1),
  refreshed_at  timestamptz not null default now(),
  targets       integer not null default 0,
  hosts         integer not null default 0,
  live_hosts    integer not null default 0,
  findings      integer not null default 0,
  critical_high integer not null default 0,
  scans         integer not null default 0,
  active_scans  integer not null default 0,
  sev_critical  integer not null default 0,
  sev_high      integer not null default 0,
  sev_medium    integer not null default 0,
  sev_low       integer not null default 0,
  sev_info      integer not null default 0
);
insert into public.dashboard_totals_cache (id) values (1) on conflict (id) do nothing;
alter table public.dashboard_totals_cache enable row level security;
drop policy if exists "totals cache read" on public.dashboard_totals_cache;
create policy "totals cache read" on public.dashboard_totals_cache
  for select using (auth.role() = 'authenticated');

create or replace function public.refresh_dashboard_totals()
returns void language sql security definer set search_path = public as $$
  insert into public.dashboard_totals_cache (
    id, refreshed_at, targets, hosts, live_hosts, findings, critical_high,
    scans, active_scans, sev_critical, sev_high, sev_medium, sev_low, sev_info
  )
  select 1, now(),
    (select count(*) from public.targets  where is_console = false),
    (select count(*) from public.hosts),
    (select count(*) from public.hosts    where status = 'Live'),
    (select count(*) from public.findings),
    (select count(*) from public.findings where severity in ('Critical','High')),
    (select count(*) from public.scans),
    (select count(*) from public.scans    where status in ('queued','running')),
    (select count(*) from public.findings where severity = 'Critical'),
    (select count(*) from public.findings where severity = 'High'),
    (select count(*) from public.findings where severity = 'Medium'),
    (select count(*) from public.findings where severity = 'Low'),
    (select count(*) from public.findings where severity = 'Info')
  on conflict (id) do update set
    refreshed_at = excluded.refreshed_at, targets = excluded.targets,
    hosts = excluded.hosts, live_hosts = excluded.live_hosts,
    findings = excluded.findings, critical_high = excluded.critical_high,
    scans = excluded.scans, active_scans = excluded.active_scans,
    sev_critical = excluded.sev_critical, sev_high = excluded.sev_high,
    sev_medium = excluded.sev_medium, sev_low = excluded.sev_low,
    sev_info = excluded.sev_info;
$$;

-- Seed it now
select public.refresh_dashboard_totals();

-- Auto-refresh when a scan finishes
create or replace function public._refresh_totals_on_scan_finish()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (new.status in ('done','failed') and (old.status is distinct from new.status)) then
    perform public.refresh_dashboard_totals();
  end if;
  return new;
end;
$$;
drop trigger if exists scans_refresh_totals on public.scans;
create trigger scans_refresh_totals
  after update of status on public.scans
  for each row execute function public._refresh_totals_on_scan_finish();

-- pg_cron if available
do $$ begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('refresh-dashboard-totals', '* * * * *',
      'select public.refresh_dashboard_totals()');
  end if;
end; $$;

-- ---------------------------------------------------------------------------
-- STEP 4: Rewrite get_dashboard_data — use cache for counts
-- ---------------------------------------------------------------------------

create or replace function public.get_dashboard_data()
returns jsonb language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'targets', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at desc)
      from (select id, name, category, domain, ip_range, scope, status, created_at, is_console
            from public.targets order by created_at desc limit 200) t
    ), '[]'::jsonb),
    'hosts', coalesce((
      select jsonb_agg(to_jsonb(h))
      from (select id, target_id, ip, status, exploitability, hostname, scan_id
            from public.hosts limit 200) h
    ), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.created_at desc)
      from (select id, target_id, title, severity, created_at, scan_id, cve_id
            from public.findings order by created_at desc limit 200) f
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (select id, target_id, host_id, user_name, action, detail, created_at
            from public.activities order by created_at desc limit 20) a
    ), '[]'::jsonb),
    'scans', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
      from (select id, target_id, input, mode, status, stage, stages, error,
                   requested_by_email, created_at, started_at, finished_at, profile_id, pipeline
            from public.scans order by created_at desc limit 40) s
    ), '[]'::jsonb),
    'running_scan', (
      select to_jsonb(s)
      from (select id, target_id, input, mode, status, stage, stages, error,
                   requested_by_email, created_at, started_at, finished_at, profile_id, pipeline
            from public.scans where status = 'running' order by started_at desc limit 1) s
    ),
    'queue', jsonb_build_object(
      'queued',  (select count(*) from public.scans where status = 'queued'),
      'running', (select count(*) from public.scans where status = 'running'),
      'done',    (select count(*) from public.scans where status = 'done'),
      'failed',  (select count(*) from public.scans where status = 'failed')
    ),
    -- Single range scan histogram (replaces 24 correlated subqueries)
    'scan_series', coalesce((
      select jsonb_agg(coalesce(s.cnt, 0) order by gs.n)
      from generate_series(0, 23) gs(n)
      left join (
        select floor(extract(epoch from created_at -
                (date_trunc('hour', now()) - interval '23 hours')) / 3600)::integer as bucket,
               count(*)::integer cnt
        from public.scans
        where created_at >= date_trunc('hour', now()) - interval '23 hours'
          and created_at <  date_trunc('hour', now()) + interval '1 hour'
        group by bucket
      ) s on s.bucket = gs.n
    ), '[]'::jsonb),
    -- Totals from cache (< 1 ms) instead of 8 COUNT(*) subqueries
    'totals', (
      select jsonb_build_object(
        'targets', targets, 'hosts', hosts, 'live_hosts', live_hosts,
        'findings', findings, 'critical_findings', critical_high,
        'scans', scans, 'active_scans', active_scans,
        'severity', jsonb_build_object(
          'Critical', sev_critical, 'High', sev_high, 'Medium', sev_medium,
          'Low', sev_low, 'Info', sev_info
        )
      ) from public.dashboard_totals_cache limit 1
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- STEP 5: get_findings_groups — strip large evidence/remediation from
--         occurrences list (fetched separately on row expand). This is the
--         biggest disk-read reduction: evidence can be 4000 chars × every row.
-- ---------------------------------------------------------------------------

create or replace function public.get_findings_groups(
  p_search text default null,
  p_severity text default null,
  p_unresolved_only boolean default true,
  p_sort text default 'severity',
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb language sql stable security invoker set search_path = public as $$
  with params as (
    select nullif(trim(p_search), '') search_text, nullif(trim(p_severity), '') severity_filter,
      greatest(1, least(coalesce(p_page, 1), 10000)) page_number,
      greatest(1, least(coalesce(p_page_size, 25), 100)) page_size
  ), base as materialized (
    -- Select only columns needed for grouping; skip evidence/remediation here
    -- (they are only fetched when the user opens a specific finding row).
    select f.id, f.title, f.severity::text severity, f.status, f.cve_id, f.cvss, f.cwe,
      f.affected_url, f.created_at, f.scan_id, f.source,
      f.target_id, f.host_id, coalesce(nullif(f.cve_id, ''), f.title) finding_key,
      t.name target_name, t.domain target_domain,
      h.ip host_ip, h.hostname host_hostname, h.ports host_ports,
      s.input scan_input, s.created_at scan_created_at
    from public.findings f
    left join public.targets t on t.id = f.target_id
    left join public.hosts   h on h.id = f.host_id
    left join public.scans   s on s.id = f.scan_id
    cross join params p
    where (p.severity_filter is null or f.severity::text = p.severity_filter)
      and (not coalesce(p_unresolved_only, true) or f.status not in ('Fixed', 'False Positive'))
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
    select finding_key, host_id, affected_url,
      max(created_at) last_seen_at, min(created_at) first_seen_at, max(cvss) cvss,
      (array_agg(severity order by case severity
        when 'Critical' then 5 when 'High' then 4 when 'Medium' then 3
        when 'Low' then 2 else 1 end desc))[1] severity
    from base group by finding_key, host_id, affected_url
  ), page_keys as materialized (
    select k.* from keys k cross join params p
    order by
      case when coalesce(p_sort,'severity') = 'severity'
        then case k.severity when 'Critical' then 5 when 'High' then 4
             when 'Medium' then 3 when 'Low' then 2 else 1 end end desc nulls last,
      case when coalesce(p_sort,'severity') = 'cvss'   then k.cvss end desc nulls last,
      case when coalesce(p_sort,'severity') = 'newest' then k.last_seen_at end desc nulls last,
      k.last_seen_at desc
    limit  (select page_size    from params)
    offset ((select page_number from params) - 1) * (select page_size from params)
  ), details as (
    select k.finding_key, k.host_id, k.affected_url,
      max(b.title) title, max(b.cve_id) cve_id,
      k.severity,
      (array_agg(b.status       order by b.created_at desc))[1] status,
      k.cvss,
      (array_agg(b.cwe          order by b.created_at desc))[1] cwe,
      max(b.target_name) target_name, max(b.target_domain) target_domain,
      max(b.host_ip) host_ip, max(b.host_hostname) host_hostname,
      (array_agg(b.host_ports   order by b.created_at desc))[1] host_ports,
      count(*)::integer occurrence_count,
      count(*) > 1 is_recurring,
      k.first_seen_at, k.last_seen_at,
      -- Occurrences: strip evidence/remediation (large text) — only send metadata
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
    join base b on b.finding_key = k.finding_key
      and b.host_id      is not distinct from k.host_id
      and b.affected_url is not distinct from k.affected_url
    group by k.finding_key, k.host_id, k.affected_url, k.severity, k.cvss,
             k.first_seen_at, k.last_seen_at
  )
  select jsonb_build_object(
    'rows',      coalesce((select jsonb_agg(to_jsonb(details) order by last_seen_at desc) from details), '[]'::jsonb),
    'total',     (select count(*) from keys),
    'page',      (select page_number from params),
    'page_size', (select page_size from params)
  );
$$;

-- ---------------------------------------------------------------------------
-- STEP 6: Throttle host_history trigger — skip heartbeat-only updates
-- ---------------------------------------------------------------------------

create or replace function public.capture_host_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if (
    new.status     is distinct from old.status     or
    new.open_ports is distinct from old.open_ports or
    new.services   is distinct from old.services   or
    new.tech       is distinct from old.tech       or
    new.risk_score is distinct from old.risk_score
  ) then
    insert into public.host_history(host_id, target_id, ip, status, open_ports, services, tech, risk_score)
    values (new.id, new.target_id, new.ip, new.status::text,
            new.open_ports, new.services, new.tech, new.risk_score);
  end if;
  return new;
end;
$$;

drop trigger if exists hosts_history_snapshot on public.hosts;
create trigger hosts_history_snapshot
  after insert or update of ip, status, open_ports, services, tech, risk_score
  on public.hosts for each row execute function public.capture_host_history();

-- ---------------------------------------------------------------------------
-- STEP 7: get_findings_data_quality — sample-capped (5000 rows max)
-- ---------------------------------------------------------------------------

create or replace function public.get_findings_data_quality()
returns jsonb language sql stable security invoker set search_path = public as $$
  with sample as (
    select f.id, f.host_id, f.target_id, f.affected_url, f.scan_id,
           f.fingerprint, f.created_at, f.last_seen_at, f.cve_id, f.title, f.assigned_to
    from public.findings f order by f.created_at desc limit 5000
  ),
  ranked as (
    select s.*,
      (s.host_id   is not null) as has_host,
      (s.target_id is not null) as has_target,
      (nullif(trim(coalesce(s.affected_url,'')), '') is not null) as has_url,
      (s.scan_id   is not null) as has_scan,
      row_number() over (
        partition by target_id, host_id, coalesce(affected_url,''), coalesce(cve_id,''), title
        order by created_at, id
      ) dup_rank
    from sample s
  ),
  metrics as (
    select
      count(*)::integer                                                        sampled,
      count(*) filter (where has_host and has_target and has_url and has_scan)::integer complete,
      count(*) filter (where not has_host or not has_target or not has_url or not has_scan)::integer incomplete,
      count(*) filter (where fingerprint is null or fingerprint = '')::integer missing_fingerprint,
      count(*) filter (where created_at < now() - interval '90 days'
        and coalesce(last_seen_at, created_at) < now() - interval '30 days')::integer stale,
      count(*) filter (where dup_rank > 1)::integer                           duplicates,
      count(*) filter (where assigned_to is null or trim(assigned_to) = '')::integer unassigned,
      (select count(*) from public.findings)::integer                         total
    from ranked
  )
  select jsonb_build_object(
    'total', total, 'complete', complete, 'incomplete', incomplete,
    'missing_fingerprint', missing_fingerprint, 'stale', stale, 'duplicates', duplicates,
    'unassigned', unassigned, 'sampled', sampled,
    'score', case when sampled = 0 then 100
                  else round(complete * 100.0 / sampled)::integer end
  ) from metrics;
$$;

-- ---------------------------------------------------------------------------
-- STEP 8: get_database_health — replace information_schema (slow) with pg_attribute (fast)
-- ---------------------------------------------------------------------------

create or replace function public.get_database_health()
returns jsonb language sql stable security invoker set search_path = public as $$
  with checks as (
    select * from (values
      ('get_dashboard_data',   to_regprocedure('public.get_dashboard_data()') is not null),
      ('get_findings_groups',  to_regprocedure('public.get_findings_groups(text,text,boolean,text,integer,integer)') is not null),
      ('get_findings_export',  to_regprocedure('public.get_findings_export(text,text,boolean)') is not null),
      ('get_scan_history',     to_regprocedure('public.get_scan_history(uuid)') is not null),
      ('get_finding_comments', to_regprocedure('public.get_finding_comments(text)') is not null),
      ('set_finding_sla',      to_regprocedure('public.set_finding_sla(text,timestamptz)') is not null),
      ('get_team_members',     to_regprocedure('public.get_team_members()') is not null),
      ('scan_logs',            to_regclass('public.scan_logs') is not null),
      ('finding_comments',     to_regclass('public.finding_comments') is not null),
      ('host_history',         to_regclass('public.host_history') is not null),
      ('finding_fingerprint',  exists (select 1 from pg_attribute a
        join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname='public' and c.relname='findings' and a.attname='fingerprint' and not a.attisdropped)),
      ('finding_sla',          exists (select 1 from pg_attribute a
        join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname='public' and c.relname='findings' and a.attname='sla_due_at' and not a.attisdropped)),
      ('worker_heartbeat',     exists (select 1 from pg_attribute a
        join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
        where n.nspname='public' and c.relname='scans' and a.attname='worker_heartbeat_at' and not a.attisdropped))
    ) as required(name, ready)
  )
  select jsonb_build_object(
    'schema_version', '20261109000400',
    'checked_at', now(), 'ready', bool_and(ready),
    'checks', coalesce(jsonb_agg(jsonb_build_object('name', name, 'ready', ready) order by name), '[]'::jsonb),
    'migration_checklist', jsonb_build_array(
      '20261108001700_finding_comments_host_history.sql',
      '20261109000200_fix_dashboard_findings_performance.sql',
      '20261109000400_emergency_disk_io_fix.sql'
    )
  ) from checks;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select  on public.dashboard_totals_cache               to authenticated;
grant execute on function public.refresh_dashboard_totals()  to authenticated;
grant execute on function public.get_database_health()       to authenticated;
grant execute on function public.get_findings_data_quality() to authenticated;
grant execute on function public.get_dashboard_data()        to authenticated;
grant execute on function public.get_findings_groups(text,text,boolean,text,integer,integer) to authenticated;

-- Run ANALYZE again after index creation
analyze public.findings;
analyze public.scans;
analyze public.hosts;

notify pgrst, 'reload schema';

