-- Cyber Recon Tracker — Supabase schema
-- Run this in the Supabase SQL editor

-- Enums
create type likelihood_t as enum ('Info','Low','Medium','High','Critical');
create type host_status_t as enum ('Live','Down','Filtered');
create type target_status_t as enum ('Not Started','Recon','Testing','Reporting','Done');
create type scope_t as enum ('In Scope','Out of Scope');
create type severity_t as enum ('Info','Low','Medium','High','Critical');
create type finding_status_t as enum ('New','Confirmed','Reported','Fixed','False Positive');

-- Targets (the "folders")
create table targets (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category text not null default 'University',
  domain text,
  ip_range text,
  scope scope_t not null default 'In Scope',
  status target_status_t not null default 'Not Started',
  owner text,
  created_at timestamptz not null default now()
);

-- Hosts (IPs inside a target)
create table hosts (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references targets(id) on delete cascade,
  ip text not null,
  status host_status_t not null default 'Live',
  open_ports text,
  services text,
  os_guess text,
  exploitability likelihood_t not null default 'Info',
  notes text,
  last_scanned date,
  checked_by text,
  created_at timestamptz not null default now()
);

-- Findings (issues, optionally tied to a host)
create table findings (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references targets(id) on delete cascade,
  host_id uuid references hosts(id) on delete set null,
  title text not null,
  type text,
  severity severity_t not null default 'Info',
  status finding_status_t not null default 'New',
  evidence text,
  remediation text,
  found_by text,
  created_at timestamptz not null default now()
);

create index on hosts(target_id);
create index on findings(target_id);
create index on findings(host_id);

-- Row Level Security
alter table targets enable row level security;
alter table hosts enable row level security;
alter table findings enable row level security;

create policy "auth read targets"  on targets  for select using (auth.role() = 'authenticated');
create policy "auth write targets" on targets  for all    using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth read hosts"     on hosts    for select using (auth.role() = 'authenticated');
create policy "auth write hosts"    on hosts    for all    using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "auth read findings"  on findings for select using (auth.role() = 'authenticated');
create policy "auth write findings" on findings for all    using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Seed data (optional)
insert into targets (name, category, domain, ip_range, scope, status, owner) values
('Bahria University','University','example.edu','192.0.2.0/24','In Scope','Recon','You'),
('Example University','University','example2.edu','203.0.113.0/24','In Scope','Not Started','Buddy'),
('Acme Corp','Corp','acme.test','198.51.100.0/24','In Scope','Not Started','You');
