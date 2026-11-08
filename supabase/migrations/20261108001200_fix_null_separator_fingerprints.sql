-- PostgreSQL text values cannot contain chr(0). Use JSON serialization for
-- stable, unambiguous fingerprint and group identity inputs.

alter table public.findings add column if not exists first_seen_at timestamptz;
alter table public.findings add column if not exists last_seen_at timestamptz;
alter table public.findings add column if not exists occurrence_count integer not null default 1;

with ranked as (
  select ctid,
    digest(jsonb_build_array(target_id::text, host_id::text, coalesce(affected_url, ''),
      coalesce(cve_id, ''), title)::text, 'sha256') as stable_fingerprint,
    row_number() over (
      partition by target_id, host_id, coalesce(affected_url, ''), coalesce(cve_id, ''), title
      order by created_at, id
    ) as duplicate_rank,
    count(*) over (
      partition by target_id, host_id, coalesce(affected_url, ''), coalesce(cve_id, ''), title
    ) as total_occurrences,
    min(created_at) over (
      partition by target_id, host_id, coalesce(affected_url, ''), coalesce(cve_id, ''), title
    ) as first_seen,
    max(created_at) over (
      partition by target_id, host_id, coalesce(affected_url, ''), coalesce(cve_id, ''), title
    ) as last_seen
  from public.findings
)
update public.findings f
set fingerprint = encode(r.stable_fingerprint, 'hex'),
    first_seen_at = r.first_seen,
    last_seen_at = r.last_seen,
    occurrence_count = r.total_occurrences
from ranked r
where f.ctid = r.ctid and r.duplicate_rank = 1;

delete from public.findings f
using (
  select ctid,
    row_number() over (
      partition by target_id, host_id, coalesce(affected_url, ''), coalesce(cve_id, ''), title
      order by created_at, id
    ) as duplicate_rank
  from public.findings
) duplicates
where f.ctid = duplicates.ctid and duplicates.duplicate_rank > 1;

update public.findings
set first_seen_at = coalesce(first_seen_at, created_at),
    last_seen_at = coalesce(last_seen_at, created_at),
    occurrence_count = greatest(1, occurrence_count);

drop index if exists public.findings_fingerprint_key;
create unique index if not exists findings_stable_fingerprint_key
  on public.findings(fingerprint);
