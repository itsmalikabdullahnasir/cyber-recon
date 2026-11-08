-- Exact per-scan aggregates for dashboard risk and counts.
-- Safe to apply after the recon-worker migration, even if the risk migration
-- has not been applied yet.

alter table public.hosts
  add column if not exists risk_score integer;

create index if not exists hosts_scan_id_idx
  on public.hosts(scan_id);

create index if not exists findings_scan_id_idx
  on public.findings(scan_id);

create or replace view public.scan_finding_summary
with (security_invoker = true)
as
select
  scan_id,
  count(*)::integer as finding_count,
  count(*) filter (where severity = 'Critical')::integer as critical_count,
  count(*) filter (where severity = 'High')::integer as high_count,
  count(*) filter (where severity = 'Medium')::integer as medium_count,
  count(*) filter (where severity = 'Low')::integer as low_count,
  count(*) filter (where severity = 'Info')::integer as info_count,
  coalesce(sum(cvss), 0)::numeric as cvss_total
from public.findings
where scan_id is not null
group by scan_id;

create or replace view public.scan_host_summary
with (security_invoker = true)
as
select
  scan_id,
  count(*)::integer as host_count,
  count(*) filter (where status = 'Live')::integer as live_count,
  coalesce(max(risk_score), 0)::integer as max_host_risk
from public.hosts
where scan_id is not null
group by scan_id;

create or replace function public.get_scan_summaries()
returns table (
  scan_id uuid,
  finding_count integer,
  critical_count integer,
  high_count integer,
  medium_count integer,
  low_count integer,
  info_count integer,
  host_count integer,
  live_count integer,
  risk_score integer
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    s.id,
    coalesce(f.finding_count, 0),
    coalesce(f.critical_count, 0),
    coalesce(f.high_count, 0),
    coalesce(f.medium_count, 0),
    coalesce(f.low_count, 0),
    coalesce(f.info_count, 0),
    coalesce(h.host_count, 0),
    coalesce(h.live_count, 0),
    least(
      100,
      round(
        0.5 * coalesce(h.max_host_risk, 0)
        + 0.5 * least(
          100,
          coalesce(f.critical_count, 0) * 40
          + coalesce(f.high_count, 0) * 20
          + coalesce(f.medium_count, 0) * 8
          + coalesce(f.low_count, 0) * 2
        )
      )
    )::integer
  from public.scans s
  left join public.scan_finding_summary f on f.scan_id = s.id
  left join public.scan_host_summary h on h.scan_id = s.id
  where s.requested_by = auth.uid()
  order by s.created_at desc;
$$;

grant execute on function public.get_scan_summaries() to authenticated;
