-- =============================================================================
-- Fix statement timeouts: rewrite expensive RPCs, add missing indexes,
-- throttle host_history trigger, cache dashboard totals.
-- Apply in Supabase SQL editor.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. INDEXES for the heaviest query paths
-- ---------------------------------------------------------------------------

-- GIN trigram index for ilike text search in get_findings_groups
create extension if not exists pg_trgm;
create index if not exists findings_title_trgm_idx    on public.findings using gin (title gin_trgm_ops);
create index if not exists findings_url_trgm_idx      on public.findings using gin (affected_url gin_trgm_ops);
create index if not exists findings_cve_trgm_idx      on public.findings using gin (cve_id gin_trgm_ops);

-- Composite index to speed up severity-filtered counts
create index if not exists findings_severity_status_idx on public.findings (severity, status);

-- Scans: status + created_at for the 24-hour series and queue counts
create index if not exists scans_status_created_idx on public.scans (status, created_at desc);

-- host_history: avoid duplicate snapshot spam (same content = no insert)
create index if not exists host_history_host_captured_idx on public.host_history (host_id, captured_at desc);

-- findings owner — speeds up RLS policy check that filters by owner_id
create index if not exists findings_owner_idx on public.findings (owner_id);

-- ---------------------------------------------------------------------------
-- 2. dashboard_totals materialized cache
-- Refreshed once per minute by the cron, never called inline.
-- ---------------------------------------------------------------------------

create table if not exists public.dashboard_totals_cache (
  id            integer primary key default 1 check (id = 1),  -- singleton
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

-- Seed so reads always return one row
insert into public.dashboard_totals_cache (id) values (1) on conflict (id) do nothing;

alter table public.dashboard_totals_cache enable row level security;
drop policy if exists "totals cache read" on public.dashboard_totals_cache;
create policy "totals cache read" on public.dashboard_totals_cache
  for select using (auth.role() = 'authenticated');

-- Function that refreshes the cache (called by pg_cron every minute)
create or replace function public.refresh_dashboard_totals()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.dashboard_totals_cache (
    id, refreshed_at,
    targets, hosts, live_hosts, findings, critical_high, scans, active_scans,
    sev_critical, sev_high, sev_medium, sev_low, sev_info
  )
  select
    1, now(),
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
    refreshed_at  = excluded.refreshed_at,
    targets       = excluded.targets,
    hosts         = excluded.hosts,
    live_hosts    = excluded.live_hosts,
    findings      = excluded.findings,
    critical_high = excluded.critical_high,
    scans         = excluded.scans,
    active_scans  = excluded.active_scans,
    sev_critical  = excluded.sev_critical,
    sev_high      = excluded.sev_high,
    sev_medium    = excluded.sev_medium,
    sev_low       = excluded.sev_low,
    sev_info      = excluded.sev_info;
$$;

-- Seed the cache immediately
select public.refresh_dashboard_totals();

-- Schedule pg_cron to refresh every 60 s (enable pg_cron extension in Supabase first)
-- If pg_cron is not enabled, skip this block — the cache is seeded above and
-- will be refreshed on every successful scan completion via the trigger below.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('refresh-dashboard-totals', '* * * * *',
      'select public.refresh_dashboard_totals()');
  end if;
end;
$$;

-- Also refresh the cache when a scan finishes (status -> done/failed)
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

-- ---------------------------------------------------------------------------
-- 3. Rewrite get_dashboard_data — use cache for counts, skip expensive series
-- ---------------------------------------------------------------------------

create or replace function public.get_dashboard_data()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'targets', coalesce((
      select jsonb_agg(to_jsonb(t) order by t.created_at desc)
      from (
        select id, name, category, domain, ip_range, scope, status, created_at, is_console
        from public.targets order by created_at desc limit 200
      ) t
    ), '[]'::jsonb),
    'hosts', coalesce((
      select jsonb_agg(to_jsonb(h))
      from (
        select id, target_id, ip, status, exploitability, hostname, scan_id
        from public.hosts limit 200
      ) h
    ), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.created_at desc)
      from (
        select id, target_id, title, severity, created_at, scan_id, cve_id
        from public.findings order by created_at desc limit 200
      ) f
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (
        select id, target_id, host_id, user_name, action, detail, created_at
        from public.activities order by created_at desc limit 20
      ) a
    ), '[]'::jsonb),
    'scans', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
      from (
        select id, target_id, input, mode, status, stage, stages, error,
          requested_by_email, created_at, started_at, finished_at, profile_id, pipeline
        from public.scans order by created_at desc limit 40
      ) s
    ), '[]'::jsonb),
    'running_scan', (
      select to_jsonb(s)
      from (
        select id, target_id, input, mode, status, stage, stages, error,
          requested_by_email, created_at, started_at, finished_at, profile_id, pipeline
        from public.scans where status = 'running' order by started_at desc limit 1
      ) s
    ),
    'queue', jsonb_build_object(
      'queued',  coalesce((select count(*) from public.scans where status = 'queued'),0),
      'running', coalesce((select count(*) from public.scans where status = 'running'),0),
      'done',    coalesce((select count(*) from public.scans where status = 'done'),0),
      'failed',  coalesce((select count(*) from public.scans where status = 'failed'),0)
    ),
    -- Single indexed range scan + 24-bucket histogram (replaces 24 correlated subqueries)
    'scan_series', coalesce((
      select jsonb_agg(coalesce(s.cnt, 0) order by gs.n)
      from generate_series(0, 23) as gs(n)
      left join (
        select
          floor(extract(epoch from created_at - (date_trunc('hour', now()) - interval '23 hours'))
                / 3600)::integer as bucket,
          count(*)::integer as cnt
        from public.scans
        where created_at >= date_trunc('hour', now()) - interval '23 hours'
          and created_at <  date_trunc('hour', now()) + interval '1 hour'
        group by bucket
      ) s on s.bucket = gs.n
    ), '[]'::jsonb),
    -- Totals from cache (< 1 ms) instead of 8 COUNT(*) subqueries
    'totals', (
      select jsonb_build_object(
        'targets',          targets,
        'hosts',            hosts,
        'live_hosts',       live_hosts,
        'findings',         findings,
        'critical_findings',critical_high,
        'scans',            scans,
        'active_scans',     active_scans,
        'severity', jsonb_build_object(
          'Critical', sev_critical,
          'High',     sev_high,
          'Medium',   sev_medium,
          'Low',      sev_low,
          'Info',     sev_info
        )
      )
      from public.dashboard_totals_cache
      limit 1
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 4. Rewrite get_findings_data_quality — sample-based, row-capped
-- ---------------------------------------------------------------------------

create or replace function public.get_findings_data_quality()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with sample as (
    -- Cap at 5000 rows to prevent full-table scan on large datasets
    select f.id, f.host_id, f.target_id, f.affected_url, f.scan_id,
           f.fingerprint, f.created_at, f.last_seen_at,
           f.cve_id, f.title, f.assigned_to
    from public.findings f
    order by f.created_at desc
    limit 5000
  ),
  enriched as (
    select s.*,
      (s.host_id is not null) as has_host,
      (s.target_id is not null) as has_target,
      (nullif(trim(coalesce(s.affected_url,'')), '') is not null) as has_url,
      (s.scan_id is not null) as has_scan
    from sample s
  ),
  ranked as (
    select e.*,
      row_number() over (
        partition by target_id, host_id,
          coalesce(affected_url,''), coalesce(cve_id,''), title
        order by created_at, id
      ) as dup_rank
    from enriched e
  ),
  metrics as (
    select
      count(*)::integer                                                     as sampled,
      count(*) filter (where has_host and has_target and has_url and has_scan)::integer as complete,
      count(*) filter (where not has_host or not has_target or not has_url or not has_scan)::integer as incomplete,
      count(*) filter (where fingerprint is null or fingerprint = '')::integer as missing_fingerprint,
      count(*) filter (where created_at < now() - interval '90 days'
        and coalesce(last_seen_at, created_at) < now() - interval '30 days')::integer as stale,
      count(*) filter (where dup_rank > 1)::integer                        as duplicates,
      count(*) filter (where assigned_to is null or trim(assigned_to) = '')::integer as unassigned,
      (select count(*) from public.findings)::integer                      as total
    from ranked
  )
  select jsonb_build_object(
    'total',              total,
    'complete',           complete,
    'incomplete',         incomplete,
    'missing_fingerprint',missing_fingerprint,
    'stale',              stale,
    'duplicates',         duplicates,
    'unassigned',         unassigned,
    'sampled',            sampled,
    'score', case when sampled = 0 then 100
                  else round(complete * 100.0 / sampled)::integer end
  ) from metrics;
$$;

-- ---------------------------------------------------------------------------
-- 5. Throttle host_history trigger — only snapshot meaningful changes
--    (skip heartbeat-only updates that only bump scan_id or last_scanned)
-- ---------------------------------------------------------------------------

create or replace function public.capture_host_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Only write history when real data changes, not bookkeeping columns
  if (
    new.status       is distinct from old.status       or
    new.open_ports   is distinct from old.open_ports   or
    new.services     is distinct from old.services     or
    new.tech         is distinct from old.tech         or
    new.risk_score   is distinct from old.risk_score
  ) then
    insert into public.host_history(host_id, target_id, ip, status, open_ports, services, tech, risk_score)
    values (new.id, new.target_id, new.ip, new.status::text,
            new.open_ports, new.services, new.tech, new.risk_score);
  end if;
  return new;
end;
$$;

-- Recreate the trigger to use the updated function
drop trigger if exists hosts_history_snapshot on public.hosts;
create trigger hosts_history_snapshot
  after insert or update of ip, status, open_ports, services, tech, risk_score
  on public.hosts
  for each row execute function public.capture_host_history();

-- ---------------------------------------------------------------------------
-- 6. Lightweight get_database_health — replace information_schema lookups
--    with pg_attribute (100x faster)
-- ---------------------------------------------------------------------------

create or replace function public.get_database_health()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with checks as (
    select * from (values
      ('get_dashboard_data',    to_regprocedure('public.get_dashboard_data()') is not null),
      ('get_findings_groups',   to_regprocedure('public.get_findings_groups(text,text,boolean,text,integer,integer)') is not null),
      ('get_findings_export',   to_regprocedure('public.get_findings_export(text,text,boolean)') is not null),
      ('get_scan_history',      to_regprocedure('public.get_scan_history(uuid)') is not null),
      ('get_finding_comments',  to_regprocedure('public.get_finding_comments(text)') is not null),
      ('set_finding_sla',       to_regprocedure('public.set_finding_sla(text,timestamptz)') is not null),
      ('get_team_members',      to_regprocedure('public.get_team_members()') is not null),
      ('scan_logs',             to_regclass('public.scan_logs') is not null),
      ('finding_comments',      to_regclass('public.finding_comments') is not null),
      ('host_history',          to_regclass('public.host_history') is not null),
      -- Use pg_attribute instead of information_schema (much faster)
      ('finding_fingerprint',   exists (
        select 1 from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'findings'
          and a.attname = 'fingerprint' and not a.attisdropped
      )),
      ('finding_sla',           exists (
        select 1 from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'findings'
          and a.attname = 'sla_due_at' and not a.attisdropped
      )),
      ('worker_heartbeat',      exists (
        select 1 from pg_attribute a
        join pg_class c on c.oid = a.attrelid
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relname = 'scans'
          and a.attname = 'worker_heartbeat_at' and not a.attisdropped
      ))
    ) as required(name, ready)
  )
  select jsonb_build_object(
    'schema_version', '20261109000300',
    'checked_at', now(),
    'ready', bool_and(ready),
    'checks', coalesce(jsonb_agg(jsonb_build_object('name', name, 'ready', ready) order by name), '[]'::jsonb),
    'migration_checklist', jsonb_build_array(
      '20261108001700_finding_comments_host_history.sql',
      '20261109000200_fix_dashboard_findings_performance.sql',
      '20261109000300_fix_statement_timeouts.sql'
    )
  )
  from checks;
$$;

-- ---------------------------------------------------------------------------
-- 7. Grants
-- ---------------------------------------------------------------------------

revoke all on function public.refresh_dashboard_totals()      from public;
revoke all on function public.get_database_health()           from public;
revoke all on function public.get_findings_data_quality()     from public;
revoke all on function public.get_dashboard_data()            from public;
grant execute on function public.refresh_dashboard_totals()   to authenticated;
grant execute on function public.get_database_health()        to authenticated;
grant execute on function public.get_findings_data_quality()  to authenticated;
grant execute on function public.get_dashboard_data()         to authenticated;
grant select on public.dashboard_totals_cache                 to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Notify PostgREST to reload schema
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';
