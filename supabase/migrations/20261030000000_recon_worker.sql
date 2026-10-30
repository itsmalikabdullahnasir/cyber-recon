-- Recon worker: per-target scope list, scan jobs, and structured result columns.
-- Run once in the Supabase SQL editor (or `supabase db push`). Safe to re-run.
-- Only ADDS tables/columns; existing columns and data are untouched.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- 1. Authorized scope list (gates the ACTIVE stages: nmap, nuclei)
--    kind = 'domain'   exact hostname          e.g. app.example.com
--           'wildcard' any subdomain of value  e.g. *.example.com (not the apex)
--           'ip'       single address          e.g. 203.0.113.10
--           'cidr'     network                 e.g. 203.0.113.0/24
-- ---------------------------------------------------------------------------
create table if not exists public.scope_entries (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.targets(id) on delete cascade,
  kind text not null check (kind in ('domain', 'wildcard', 'ip', 'cidr')),
  value text not null check (length(value) between 1 and 255),
  note text,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (target_id, kind, value)
);
create index if not exists scope_entries_target_idx on public.scope_entries(target_id);

alter table public.scope_entries enable row level security;
drop policy if exists "auth read scope" on public.scope_entries;
drop policy if exists "auth write scope" on public.scope_entries;
create policy "auth read scope" on public.scope_entries
  for select using (auth.role() = 'authenticated');
create policy "auth write scope" on public.scope_entries
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- 2. Scan jobs. Created by the Vercel route (as the logged-in user),
--    updated only by the worker (service role bypasses RLS).
-- ---------------------------------------------------------------------------
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.targets(id) on delete cascade,
  input text not null,
  mode text not null check (mode in ('passive', 'full')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'done', 'failed')),
  stage text,
  stages jsonb not null default '{}'::jsonb,
  error text,
  requested_by uuid not null default auth.uid(),
  requested_by_email text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);
create index if not exists scans_target_idx on public.scans(target_id, created_at desc);

alter table public.scans enable row level security;
drop policy if exists "auth read scans" on public.scans;
drop policy if exists "own insert scans" on public.scans;
drop policy if exists "own update scans" on public.scans;
create policy "auth read scans" on public.scans
  for select using (auth.role() = 'authenticated');
create policy "own insert scans" on public.scans
  for insert with check (auth.uid() = requested_by and status = 'queued');
-- Lets the Vercel route mark its own scan failed if the worker is unreachable.
create policy "own update scans" on public.scans
  for update using (auth.uid() = requested_by) with check (auth.uid() = requested_by);

-- Live progress in the UI.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'scans'
  ) then
    alter publication supabase_realtime add table public.scans;
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Structured result columns (all nullable, so the existing UI keeps working)
-- ---------------------------------------------------------------------------
alter table public.subdomains add column if not exists scan_id uuid references public.scans(id) on delete set null;
alter table public.subdomains add column if not exists resolved_ips text[];
alter table public.subdomains add column if not exists is_cdn boolean;
alter table public.subdomains add column if not exists cdn_name text;
alter table public.subdomains add column if not exists url text;
alter table public.subdomains add column if not exists http_status integer;
alter table public.subdomains add column if not exists http_title text;
alter table public.subdomains add column if not exists webserver text;
alter table public.subdomains add column if not exists tech text[];
alter table public.subdomains add column if not exists asn text;
alter table public.subdomains add column if not exists last_seen timestamptz;
create index if not exists subdomains_target_name_idx on public.subdomains(target_id, name);

alter table public.hosts add column if not exists scan_id uuid references public.scans(id) on delete set null;
alter table public.hosts add column if not exists is_cdn boolean;
alter table public.hosts add column if not exists cdn_name text;
alter table public.hosts add column if not exists asn text;
alter table public.hosts add column if not exists tech text[];
-- [{port, protocol, service, product, version, extrainfo, cpe:[...]}]
alter table public.hosts add column if not exists ports jsonb;
create index if not exists hosts_target_ip_idx on public.hosts(target_id, ip);

alter table public.findings add column if not exists scan_id uuid references public.scans(id) on delete set null;
alter table public.findings add column if not exists subdomain_id uuid references public.subdomains(id) on delete set null;
alter table public.findings add column if not exists cve_id text;
alter table public.findings add column if not exists source text;
-- Dedupe key so re-scans update instead of duplicating. NULL for manual findings.
alter table public.findings add column if not exists fingerprint text;
create unique index if not exists findings_fingerprint_key on public.findings(fingerprint);
