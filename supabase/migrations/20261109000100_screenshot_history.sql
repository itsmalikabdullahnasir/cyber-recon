-- Visual evidence is metadata only; image bytes stay on the restricted worker VM.
create table if not exists public.web_screenshots (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.targets(id) on delete cascade,
  subdomain_id uuid references public.subdomains(id) on delete set null,
  scan_id uuid references public.scans(id) on delete set null,
  hostname text not null,
  url text not null,
  page_type text not null check (page_type in ('login', 'dashboard', 'public')),
  image_path text not null,
  byte_size integer,
  captured_at timestamptz not null default now()
);
create index if not exists web_screenshots_target_captured_idx on public.web_screenshots(target_id, captured_at desc);
create index if not exists web_screenshots_hostname_captured_idx on public.web_screenshots(target_id, hostname, captured_at desc);
alter table public.web_screenshots enable row level security;
create policy "auth read screenshot metadata" on public.web_screenshots for select using (auth.role() = 'authenticated');
