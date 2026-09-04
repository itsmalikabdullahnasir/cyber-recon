-- Cyber Recon Tracker v2 — Enhanced pentest schema
-- Run this ONLY if you already ran v1. Otherwise run the full schema.sql

-- New enums
create type priority_t as enum ('None','Low','Medium','High','Critical');
create type attack_vector_t as enum ('Network','Web','Wireless','Social','Physical','Cloud','API','Mobile');

-- Alter targets
alter table targets add column if not exists description text;
alter table targets add column if not exists priority priority_t not null default 'None';
alter table targets add column if not exists methodology text;
alter table targets add column if not exists tags text[];
alter table targets add column if not exists updated_at timestamptz not null default now();

-- Alter hosts
alter table hosts add column if not exists vulnerability_count integer default 0;
alter table hosts add column if not exists banners text;
alter table hosts add column if not exists attack_vector attack_vector_t;
alter table hosts add column if not exists hostname text;
alter table hosts add column if not exists http_title text;
alter table hosts add column if not exists ssl_info text;

-- Alter findings
alter table findings add column if not exists cvss numeric(3,1);
alter table findings add column if not exists cwe text;
alter table findings add column if not exists affected_url text;
alter table findings add column if not exists fix_priority priority_t not null default 'None';
alter table findings add column if not exists tags text[];

-- Activity log
create table if not exists activities (
  id uuid primary key default gen_random_uuid(),
  target_id uuid references targets(id) on delete cascade,
  host_id uuid references hosts(id) on delete set null,
  user_name text,
  action text not null,
  detail text,
  created_at timestamptz not null default now()
);

alter table activities enable row level security;
create policy "auth read activities" on activities for select using (auth.role() = 'authenticated');
create policy "auth write activities" on activities for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create index on activities(target_id);
create index on activities(created_at desc);
