-- Persist normalized group members separately from scan results.
create table if not exists public.engagement_group_members (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.targets(id) on delete cascade,
  value text not null,
  kind text not null check (kind in ('domain', 'ip')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  unique (group_id, value)
);

create index if not exists engagement_group_members_group_idx
  on public.engagement_group_members(group_id, created_at desc);

alter table public.engagement_group_members enable row level security;
drop policy if exists "auth read engagement members" on public.engagement_group_members;
drop policy if exists "auth write engagement members" on public.engagement_group_members;
create policy "auth read engagement members" on public.engagement_group_members
  for select using (auth.role() = 'authenticated');
create policy "auth write engagement members" on public.engagement_group_members
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
