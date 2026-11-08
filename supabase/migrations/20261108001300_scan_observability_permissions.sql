-- Durable scan observability, retry controls, and ownership-safe read RPC.

alter table public.scans add column if not exists retry_count integer not null default 0;
alter table public.scans add column if not exists max_retries integer not null default 3;
alter table public.scans add column if not exists priority integer not null default 0;
alter table public.scans add column if not exists worker_heartbeat_at timestamptz;
alter table public.scans add column if not exists duration_seconds integer;
alter table public.scans add column if not exists hosts_discovered integer not null default 0;
alter table public.scans add column if not exists findings_created integer not null default 0;
alter table public.scans add column if not exists findings_updated integer not null default 0;
alter table public.scans add column if not exists findings_resolved integer not null default 0;
alter table public.findings add column if not exists owner_id uuid default auth.uid();
update public.findings f
set owner_id = s.requested_by
from public.scans s
where f.owner_id is null and f.scan_id = s.id;

create or replace function public.recon_is_admin()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('admin', 'analyst');
$$;

do $$
declare
  policy_row record;
begin
  for policy_row in
    select policyname, tablename from pg_policies
    where schemaname = 'public' and tablename in ('scans', 'findings')
  loop
    execute format('drop policy if exists %I on public.%I', policy_row.policyname, policy_row.tablename);
  end loop;
end $$;

alter table public.findings enable row level security;
drop policy if exists "own findings read" on public.findings;
drop policy if exists "own findings write" on public.findings;
create policy "own findings read" on public.findings for select
  using (public.recon_is_admin() or owner_id = auth.uid() or exists (
    select 1 from public.scans s where s.id = findings.scan_id and s.requested_by = auth.uid()
  ));
create policy "own findings write" on public.findings for all
  using (public.recon_is_admin() or owner_id = auth.uid())
  with check (public.recon_is_admin() or owner_id = auth.uid());

alter table public.scans enable row level security;
create policy "own scans read" on public.scans for select
  using (public.recon_is_admin() or requested_by = auth.uid());
create policy "own scans insert" on public.scans for insert
  with check (requested_by = auth.uid());
create policy "own scans update" on public.scans for update
  using (public.recon_is_admin() or requested_by = auth.uid())
  with check (
    public.recon_is_admin()
    or (requested_by = auth.uid() and status in ('queued', 'failed'))
  );
create policy "own scans delete" on public.scans for delete
  using (public.recon_is_admin() or requested_by = auth.uid());

create table if not exists public.scan_logs (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  level text not null default 'info' check (level in ('info', 'warning', 'error')),
  stage text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists scan_logs_scan_created_idx on public.scan_logs(scan_id, created_at desc);

alter table public.scan_logs enable row level security;
drop policy if exists "own scan logs read" on public.scan_logs;
create policy "own scan logs read" on public.scan_logs for select
  using (public.recon_is_admin() or exists (
    select 1 from public.scans s
    where s.id = scan_logs.scan_id and s.requested_by = auth.uid()
  ));

-- This RPC is the only client-facing scan history surface. It enforces
-- ownership even if legacy broad scan policies still exist.
create or replace function public.get_scan_history(p_scan_id uuid default null)
returns table (
  id uuid,
  target_id uuid,
  input text,
  mode text,
  status text,
  stage text,
  stages jsonb,
  error text,
  requested_by_email text,
  created_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz,
  retry_count integer,
  max_retries integer,
  priority integer,
  worker_heartbeat_at timestamptz,
  duration_seconds integer,
  hosts_discovered integer,
  findings_created integer,
  findings_updated integer,
  findings_resolved integer,
  logs jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select s.id, s.target_id, s.input, s.mode, s.status, s.stage, s.stages, s.error,
    s.requested_by_email, s.created_at, s.started_at, s.finished_at, s.retry_count,
    s.max_retries, s.priority, s.worker_heartbeat_at, s.duration_seconds,
    s.hosts_discovered, s.findings_created, s.findings_updated, s.findings_resolved,
    coalesce((
      select jsonb_agg(to_jsonb(l) order by l.created_at desc)
      from public.scan_logs l where l.scan_id = s.id
    ), '[]'::jsonb)
  from public.scans s
  where (public.recon_is_admin() or s.requested_by = auth.uid())
    and (p_scan_id is null or s.id = p_scan_id)
  order by s.created_at desc;
$$;

grant execute on function public.get_scan_history(uuid) to authenticated;

create or replace function public.cancel_scan(p_scan_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.scans
  set status = 'failed', error = 'cancelled by user', finished_at = now()
  where id = p_scan_id and (public.recon_is_admin() or requested_by = auth.uid())
    and status in ('queued', 'running');
  return found;
end;
$$;

create or replace function public.retry_scan(p_scan_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.scans
  set status = 'queued', error = null, started_at = null, finished_at = null,
      stage = null, stages = '{}'::jsonb, retry_count = retry_count + 1
  where id = p_scan_id and (public.recon_is_admin() or requested_by = auth.uid())
    and status = 'failed' and retry_count < max_retries;
  return found;
end;
$$;

revoke all on function public.cancel_scan(uuid) from public;
revoke all on function public.retry_scan(uuid) from public;
grant execute on function public.cancel_scan(uuid) to authenticated;
grant execute on function public.retry_scan(uuid) to authenticated;
