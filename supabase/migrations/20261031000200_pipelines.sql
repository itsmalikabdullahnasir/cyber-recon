-- Pipeline Builder: user-saved scanning profiles + per-scan pipeline config.
-- Additive and safe to re-run. Built-in profiles (Basic, etc.) live in the
-- worker's module registry and are served via GET /modules; THIS table holds
-- only the custom profiles a user builds and saves.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Saved custom pipelines.
--   modules = ordered list of { "id": "<module id>", "enabled": true,
--                               "config": { ... optional per-module overrides } }
-- The order of the array IS the execution order.
-- ---------------------------------------------------------------------------
create table if not exists public.pipeline_profiles (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 120),
  description text,
  modules jsonb not null default '[]'::jsonb,
  is_builtin boolean not null default false,
  owner uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists pipeline_profiles_owner_idx on public.pipeline_profiles(owner, created_at desc);

alter table public.pipeline_profiles enable row level security;
drop policy if exists "auth read profiles" on public.pipeline_profiles;
drop policy if exists "auth write profiles" on public.pipeline_profiles;
create policy "auth read profiles" on public.pipeline_profiles
  for select using (auth.role() = 'authenticated');
create policy "auth write profiles" on public.pipeline_profiles
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ---------------------------------------------------------------------------
-- Per-scan pipeline config. Both nullable, so a scan created the old way
-- (pipeline = null) runs exactly as before — the fixed sequence. When set,
-- `pipeline` is the resolved, ordered list of modules that scan should run.
-- ---------------------------------------------------------------------------
alter table public.scans add column if not exists profile_id uuid references public.pipeline_profiles(id) on delete set null;
alter table public.scans add column if not exists pipeline jsonb;
