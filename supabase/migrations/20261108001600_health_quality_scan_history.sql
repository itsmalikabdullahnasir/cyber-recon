-- Deployment health, finding data quality, indexes, and queue priority controls.

create index if not exists findings_fingerprint_idx on public.findings(fingerprint);
create index if not exists findings_target_idx on public.findings(target_id);
create index if not exists findings_host_idx on public.findings(host_id);
create index if not exists findings_status_idx on public.findings(status);
create index if not exists findings_created_idx on public.findings(created_at desc);
create index if not exists scans_status_idx on public.scans(status);
create index if not exists scans_owner_idx on public.scans(requested_by);

create or replace function public.get_database_health()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with checks as (
    select * from (values
      ('get_dashboard_data', to_regprocedure('public.get_dashboard_data()') is not null),
      ('get_findings_groups', to_regprocedure('public.get_findings_groups(text,text,boolean,text,integer,integer)') is not null),
      ('get_findings_export', to_regprocedure('public.get_findings_export(text,text,boolean)') is not null),
      ('get_scan_history', to_regprocedure('public.get_scan_history(uuid)') is not null),
      ('scan_logs', to_regclass('public.scan_logs') is not null),
      ('finding_fingerprint', exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'findings' and column_name = 'fingerprint'
      )),
      ('worker_heartbeat', exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'scans' and column_name = 'worker_heartbeat_at'
      ))
    ) as required(name, ready)
  )
  select jsonb_build_object(
    'schema_version', '20261108001600',
    'checked_at', now(),
    'ready', bool_and(ready),
    'checks', coalesce(jsonb_agg(jsonb_build_object('name', name, 'ready', ready) order by name), '[]'::jsonb),
    'migration_checklist', jsonb_build_array(
      '20261108001300_scan_observability_permissions.sql',
      '20261108001400_findings_filtered_export.sql',
      '20261108001500_repair_findings_groups_rpc.sql',
      '20261108001600_health_quality_scan_history.sql'
    )
  )
  from checks;
$$;

create or replace function public.get_findings_data_quality()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  with base as (
    select f.*,
      (f.host_id is not null and (h.ip is not null or h.hostname is not null)) as has_host,
      (f.target_id is not null and (t.name is not null or t.domain is not null)) as has_target,
      (nullif(trim(f.affected_url), '') is not null) as has_url,
      (f.scan_id is not null) as has_scan
    from public.findings f
    left join public.hosts h on h.id = f.host_id
    left join public.targets t on t.id = f.target_id
  ),
  metrics as (
    select count(*)::integer as total,
      count(*) filter (where has_host and has_target and has_url and has_scan)::integer as complete,
      count(*) filter (where not has_host or not has_target or not has_url or not has_scan)::integer as incomplete,
      count(*) filter (where fingerprint is null or fingerprint = '')::integer as missing_fingerprint,
      count(*) filter (where created_at < now() - interval '90 days'
        and coalesce(last_seen_at, created_at) < now() - interval '30 days')::integer as stale,
      count(*) filter (where duplicate_rank > 1)::integer as duplicates
    from (
      select base.*, row_number() over (
        partition by target_id, host_id, coalesce(affected_url, ''), coalesce(cve_id, ''), title
        order by created_at, id
      ) as duplicate_rank
      from base
    ) ranked
  )
  select jsonb_build_object(
    'total', total, 'complete', complete, 'incomplete', incomplete,
    'missing_fingerprint', missing_fingerprint, 'stale', stale, 'duplicates', duplicates,
    'score', case when total = 0 then 100 else round(complete * 100.0 / total)::integer end
  ) from metrics;
$$;

create or replace function public.set_scan_priority(p_scan_id uuid, p_priority integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_priority is null or p_priority < 0 or p_priority > 100 then
    raise exception 'Priority must be between 0 and 100';
  end if;
  update public.scans
  set priority = p_priority
  where id = p_scan_id
    and (public.recon_is_admin() or requested_by = auth.uid())
    and status = 'queued';
  return found;
end;
$$;

revoke all on function public.get_database_health() from public;
revoke all on function public.get_findings_data_quality() from public;
revoke all on function public.set_scan_priority(uuid, integer) from public;
grant execute on function public.get_database_health() to authenticated;
grant execute on function public.get_findings_data_quality() to authenticated;
grant execute on function public.set_scan_priority(uuid, integer) to authenticated;
