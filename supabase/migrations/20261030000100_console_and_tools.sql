-- Scan Console: a dedicated auto-managed target whose scope_entries act as the
-- global active-scan allowlist. Plus columns for the new tool stages
-- (feroxbuster dirs, whatweb/wafw00f, testssl, nikto). Additive, safe to re-run.

-- One hidden "console" target. Its scope_entries are the allowlist the console
-- checks before any active stage. Partial unique index => at most one.
alter table public.targets add column if not exists is_console boolean not null default false;
create unique index if not exists targets_one_console on public.targets(is_console) where is_console;

-- WAF detection result on a host (from wafw00f / httpx).
alter table public.hosts add column if not exists waf text;

-- Discovered content paths (feroxbuster) and TLS audit (testssl), kept on the
-- host as structured JSON so the console can render them without extra tables.
-- [{path, status, length, url}]
alter table public.hosts add column if not exists dirs jsonb;
-- [{id, severity, finding, cve}]
alter table public.hosts add column if not exists tls_findings jsonb;

-- findings.source already exists; new sources used by the console:
--   'feroxbuster' (type 'exposed-path'), 'testssl', 'nikto', 'wafw00f',
--   'whatweb' (feeds cve-local). No schema change needed.
