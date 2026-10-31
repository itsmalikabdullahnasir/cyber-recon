-- Per-host risk score (0-100) and candidate origin IPs found behind a CDN.
-- Additive, safe to re-run.

alter table public.hosts add column if not exists risk_score integer;
alter table public.hosts add column if not exists origin_ips text[];
