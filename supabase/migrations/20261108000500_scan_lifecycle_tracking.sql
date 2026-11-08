-- Server-owned scan lifecycle and progress fields.

alter table public.scans
  add column if not exists last_stage_at timestamptz;

alter table public.scans
  add column if not exists total_stages integer not null default 0;

alter table public.scans
  add column if not exists completed_stages integer not null default 0;

create or replace function public.get_scan_lifecycle()
returns table (
  scan_id uuid,
  lifecycle_status text,
  last_stage_at timestamptz,
  total_stages integer,
  completed_stages integer,
  queue_position bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with owned as (
    select
      s.*,
      case
        when s.status = 'queued' then 'queued'
        when s.status = 'running'
          and coalesce(s.last_stage_at, s.started_at, s.created_at)
            < now() - interval '30 minutes' then 'stalled'
        when s.status = 'running' then 'running'
        when s.status = 'failed' and s.error ilike '%cancel%' then 'cancelled'
        when s.status = 'failed' then 'failed'
        when s.status = 'done' then 'completed'
        else s.status
      end as lifecycle_status,
      case when s.status = 'queued' then
        row_number() over (
          partition by s.requested_by
          order by s.created_at asc, s.id asc
        )
      end as queue_position
    from public.scans s
    where s.requested_by = auth.uid()
  )
  select
    id,
    lifecycle_status,
    last_stage_at,
    total_stages,
    completed_stages,
    queue_position
  from owned
  order by created_at desc;
$$;

grant execute on function public.get_scan_lifecycle() to authenticated;
