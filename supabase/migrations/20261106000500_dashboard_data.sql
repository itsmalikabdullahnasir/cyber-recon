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
        from public.targets
        order by created_at desc
        limit 200
      ) t
    ), '[]'::jsonb),
    'hosts', coalesce((
      select jsonb_agg(to_jsonb(h))
      from (
        select id, target_id, ip, status, exploitability, hostname, scan_id
        from public.hosts
        limit 200
      ) h
    ), '[]'::jsonb),
    'findings', coalesce((
      select jsonb_agg(to_jsonb(f) order by f.created_at desc)
      from (
        select id, target_id, title, severity, created_at, scan_id, cve_id
        from public.findings
        order by created_at desc
        limit 200
      ) f
    ), '[]'::jsonb),
    'activities', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at desc)
      from (
        select id, target_id, host_id, user_name, action, detail, created_at
        from public.activities
        order by created_at desc
        limit 20
      ) a
    ), '[]'::jsonb),
    'scans', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.created_at desc)
      from (
        select id, target_id, input, mode, status, stage, stages, error,
          requested_by_email, created_at, started_at, finished_at, profile_id, pipeline
        from public.scans
        order by created_at desc
        limit 40
      ) s
    ), '[]'::jsonb),
    'running_scan', (
      select to_jsonb(s)
      from (
        select id, target_id, input, mode, status, stage, stages, error,
          requested_by_email, created_at, started_at, finished_at, profile_id, pipeline
        from public.scans
        where status = 'running'
        order by started_at desc
        limit 1
      ) s
    ),
    'queue', jsonb_build_object(
      'queued', (select count(*) from public.scans where status = 'queued'),
      'running', (select count(*) from public.scans where status = 'running'),
      'done', (select count(*) from public.scans where status = 'done'),
      'failed', (select count(*) from public.scans where status = 'failed')
    ),
    'scan_series', coalesce((
      select jsonb_agg(hour_count order by hour)
      from (
        select hour,
          (select count(*) from public.scans s
           where s.created_at >= hour
             and s.created_at < hour + interval '1 hour')::integer as hour_count
        from generate_series(
          date_trunc('hour', now()) - interval '23 hours',
          date_trunc('hour', now()),
          interval '1 hour'
        ) as hours(hour)
      ) hourly
    ), '[]'::jsonb),
    'totals', jsonb_build_object(
      'targets', (select count(*) from public.targets where is_console = false),
      'hosts', (select count(*) from public.hosts),
      'live_hosts', (select count(*) from public.hosts where status = 'Live'),
      'findings', (select count(*) from public.findings),
      'critical_findings', (select count(*) from public.findings where severity in ('Critical', 'High')),
      'scans', (select count(*) from public.scans),
      'active_scans', (select count(*) from public.scans where status in ('queued', 'running')),
      'severity', jsonb_build_object(
        'Critical', (select count(*) from public.findings where severity = 'Critical'),
        'High', (select count(*) from public.findings where severity = 'High'),
        'Medium', (select count(*) from public.findings where severity = 'Medium'),
        'Low', (select count(*) from public.findings where severity = 'Low'),
        'Info', (select count(*) from public.findings where severity = 'Info')
      )
    )
  );
$$;

grant execute on function public.get_dashboard_data() to authenticated;
