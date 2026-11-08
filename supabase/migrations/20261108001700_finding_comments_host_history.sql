-- Finding collaboration, SLA tracking, host history, audit logging, and quality metrics.

alter table public.findings add column if not exists sla_due_at timestamptz;

create table if not exists public.finding_comments (
  id uuid primary key default gen_random_uuid(),
  finding_id uuid not null references public.findings(id) on delete cascade,
  author_id uuid not null default auth.uid(),
  author_email text,
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index if not exists finding_comments_finding_idx on public.finding_comments(finding_id, created_at desc);
alter table public.finding_comments enable row level security;
drop policy if exists "finding comments read" on public.finding_comments;
drop policy if exists "finding comments insert" on public.finding_comments;
create policy "finding comments read" on public.finding_comments for select using (
  public.recon_is_admin() or exists (
    select 1 from public.findings f
    where f.id = finding_comments.finding_id and f.owner_id = auth.uid()
  )
);
create policy "finding comments insert" on public.finding_comments for insert with check (
  author_id = auth.uid() and exists (
    select 1 from public.findings f
    where f.id = finding_comments.finding_id and f.owner_id = auth.uid()
  )
);

create table if not exists public.host_history (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null references public.hosts(id) on delete cascade,
  target_id uuid not null references public.targets(id) on delete cascade,
  ip text not null,
  status text,
  open_ports text,
  services text,
  tech text[],
  risk_score integer,
  captured_at timestamptz not null default now()
);
create index if not exists host_history_host_idx on public.host_history(host_id, captured_at desc);
alter table public.host_history enable row level security;
drop policy if exists "host history read" on public.host_history;
create policy "host history read" on public.host_history for select using (
  public.recon_is_admin() or exists (
    select 1 from public.scans s where s.target_id = host_history.target_id and s.requested_by = auth.uid()
  )
);

create or replace function public.capture_host_history()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.host_history(host_id, target_id, ip, status, open_ports, services, tech, risk_score)
  values (new.id, new.target_id, new.ip, new.status::text, new.open_ports, new.services, new.tech, new.risk_score);
  return new;
end;
$$;

drop trigger if exists hosts_history_snapshot on public.hosts;
create trigger hosts_history_snapshot
after insert or update of ip, status, open_ports, services, tech, risk_score on public.hosts
for each row execute function public.capture_host_history();

create or replace function public.add_finding_comment(p_finding_id uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  comment_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if nullif(trim(p_body), '') is null or length(trim(p_body)) > 5000 then
    raise exception 'Comment must contain 1 to 5000 characters';
  end if;
  if not (public.recon_is_admin() or exists (
    select 1 from public.findings f where f.id = p_finding_id and f.owner_id = auth.uid()
  )) then
    raise exception 'Finding is not accessible';
  end if;
  insert into public.finding_comments(finding_id, author_id, author_email, body)
  values (p_finding_id, auth.uid(), coalesce(auth.jwt() ->> 'email', 'analyst@team'), trim(p_body))
  returning id into comment_id;

  insert into public.audit_logs(actor_id, actor_email, action, metadata)
  values (auth.uid(), coalesce(auth.jwt() ->> 'email', 'analyst@team'), 'add_finding_comment',
    jsonb_build_object('finding_id', p_finding_id, 'comment_id', comment_id));

  return comment_id;
end;
$$;

create or replace function public.set_finding_sla(p_group_id text, p_due_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  update public.findings f
  set sla_due_at = p_due_at
  where md5(jsonb_build_array(coalesce(nullif(f.cve_id, ''), f.title),
      f.host_id::text, coalesce(f.affected_url, ''))::text) = p_group_id
    and (public.recon_is_admin() or f.owner_id = auth.uid());

  get diagnostics updated_count = row_count;

  if updated_count > 0 then
    insert into public.audit_logs(actor_id, actor_email, action, metadata)
    values (auth.uid(), coalesce(auth.jwt() ->> 'email', 'analyst@team'), 'set_finding_sla',
      jsonb_build_object('group_id', p_group_id, 'due_at', p_due_at, 'updated', updated_count));
  end if;

  return updated_count;
end;
$$;

create or replace function public.get_finding_comments(p_group_id text)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select coalesce(jsonb_agg(to_jsonb(c) order by c.created_at desc), '[]'::jsonb)
  from public.finding_comments c
  join public.findings f on f.id = c.finding_id
  where md5(jsonb_build_array(coalesce(nullif(f.cve_id, ''), f.title),
      f.host_id::text, coalesce(f.affected_url, ''))::text) = p_group_id;
$$;

create or replace function public.get_team_members()
returns table (email text, display_name text)
language sql
stable
security definer
set search_path = public
as $$
  select distinct email, split_part(email, '@', 1) as display_name
  from (
    select distinct requested_by_email as email from public.scans where requested_by_email is not null and requested_by_email != ''
    union
    select distinct actor_email as email from public.audit_logs where actor_email is not null and actor_email != ''
    union
    select distinct author_email as email from public.finding_comments where author_email is not null and author_email != ''
  ) members
  where email is not null and length(email) > 3
  order by email;
$$;

create index if not exists findings_group_lookup_idx on public.findings(host_id, severity, status);
create index if not exists scans_queue_idx on public.scans(status, priority desc, created_at asc);

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
      ('get_finding_comments', to_regprocedure('public.get_finding_comments(text)') is not null),
      ('set_finding_sla', to_regprocedure('public.set_finding_sla(text,timestamptz)') is not null),
      ('get_team_members', to_regprocedure('public.get_team_members()') is not null),
      ('scan_logs', to_regclass('public.scan_logs') is not null),
      ('finding_comments', to_regclass('public.finding_comments') is not null),
      ('host_history', to_regclass('public.host_history') is not null),
      ('finding_fingerprint', exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'findings' and column_name = 'fingerprint'
      )),
      ('finding_sla', exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'findings' and column_name = 'sla_due_at'
      )),
      ('worker_heartbeat', exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'scans' and column_name = 'worker_heartbeat_at'
      ))
    ) as required(name, ready)
  )
  select jsonb_build_object(
    'schema_version', '20261108001700',
    'checked_at', now(),
    'ready', bool_and(ready),
    'checks', coalesce(jsonb_agg(jsonb_build_object('name', name, 'ready', ready) order by name), '[]'::jsonb),
    'migration_checklist', jsonb_build_array(
      '20261030000000_recon_worker.sql',
      '20261030000100_console_and_tools.sql',
      '20261031000000_enrich_mode.sql',
      '20261031000100_risk_and_origin.sql',
      '20261031000200_pipelines.sql',
      '20261101000300_engagement_group_members.sql',
      '20261101000400_audit_logs.sql',
      '20261106000500_dashboard_data.sql',
      '20261108000100_dashboard_queue_data.sql',
      '20261108000200_server_side_scan_aggregates.sql',
      '20261108000300_findings_pagination_queue_actions.sql',
      '20261108000400_fix_findings_severity_filter.sql',
      '20261108000500_scan_lifecycle_tracking.sql',
      '20261108000600_findings_asset_context.sql',
      '20261108000700_findings_scan_identity.sql',
      '20261108000800_findings_grouped_workbench.sql',
      '20261108000900_findings_group_detail.sql',
      '20261108001000_findings_lifecycle_actions.sql',
      '20261108001100_stable_finding_identity.sql',
      '20261108001200_fix_null_separator_fingerprints.sql',
      '20261108001300_scan_observability_permissions.sql',
      '20261108001400_findings_filtered_export.sql',
      '20261108001500_repair_findings_groups_rpc.sql',
      '20261108001600_health_quality_scan_history.sql',
      '20261108001700_finding_comments_host_history.sql'
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
      count(*) filter (where duplicate_rank > 1)::integer as duplicates,
      count(*) filter (where assigned_to is null or trim(assigned_to) = '')::integer as unassigned
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
    'unassigned', unassigned,
    'score', case when total = 0 then 100 else round(complete * 100.0 / total)::integer end
  ) from metrics;
$$;

grant execute on function public.add_finding_comment(uuid, text) to authenticated;
grant execute on function public.set_finding_sla(text, timestamptz) to authenticated;
grant execute on function public.get_finding_comments(text) to authenticated;
grant execute on function public.get_team_members() to authenticated;
