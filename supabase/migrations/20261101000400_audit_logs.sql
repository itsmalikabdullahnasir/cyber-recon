create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid default auth.uid(),
  actor_email text,
  action text not null check (length(action) between 1 and 100),
  target_id uuid references public.targets(id) on delete set null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx on public.audit_logs(created_at desc);
create index if not exists audit_logs_target_idx on public.audit_logs(target_id, created_at desc);

alter table public.audit_logs enable row level security;
drop policy if exists "auth read audit logs" on public.audit_logs;
drop policy if exists "auth insert audit logs" on public.audit_logs;
create policy "auth read audit logs" on public.audit_logs
  for select using (auth.role() = 'authenticated');
create policy "auth insert audit logs" on public.audit_logs
  for insert with check (auth.uid() = actor_id);
