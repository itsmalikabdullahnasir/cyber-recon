-- Add a fast "enrich" scan mode for imported hosts: resolve + HTTP probe +
-- tech/WAF + CVE-by-version, skipping subfinder (pointless on a known host)
-- and the heavy active stages. ~3s/host instead of ~30s. Safe to re-run.

alter table public.scans drop constraint if exists scans_mode_check;
alter table public.scans add constraint scans_mode_check check (mode in ('passive', 'full', 'enrich'));
