# Cyber Recon Dashboard Implementation Summary

## What was improved

### Dashboard and queue

- Added live scan polling and realtime refresh behavior.
- Added queue counts for queued, running, completed, and failed scans.
- Added queue wait estimates based on recent scan durations.
- Added scan priority ordering.
- Added retry counts and maximum retry limits.
- Added automatic retry for scans interrupted by worker restarts.
- Added individual scan cancellation and retry RPCs.
- Added worker online/offline status and clear offline explanations.
- Added worker heartbeat age for active scans.
- Added stage progress, duration, error details, and result counters.

### Findings workbench

- Added server-side pagination and filtering.
- Added search by title, CVE, URL, target, hostname, IP, scan input, and severity.
- Grouped repeated findings by vulnerability identity, host, and affected URL.
- Added occurrence counts instead of repeated rows.
- Added expandable scan occurrences.
- Added first-seen and last-seen timestamps.
- Added recurring/new finding indicators.
- Added exact target, domain, IP, hostname, URL, and scan context.
- Added evidence, remediation, CVSS, CWE, host ports, and status history.
- Added lifecycle actions:
  - Confirmed
  - Fixed
  - False positive
  - Priority
  - Notes
  - Assignee
  - Bulk updates
- Added current-page CSV and JSON exports.
- Added all-filtered CSV and JSON exports.
- Exports include IP, domain, hostname, URL, CVE, CVSS, status, first seen, last seen, and occurrence count.

### Finding identity and deduplication

- Added stable finding fingerprints using:
  - Target ID
  - Host ID
  - Affected URL
  - CVE ID
  - Finding title
- Recurring findings update existing records instead of inserting duplicates.
- Added occurrence count, first seen, and last seen tracking.
- Fixed PostgreSQL invalid null-character fingerprint errors.

### Asset-centric views

- Added domain-to-asset navigation.
- Target pages now show:
  - Domains
  - IPs
  - Hostnames
  - Open ports
  - Services
  - Technologies
  - Findings
  - Scan history
- Findings can be traced back to the exact host and affected URL.

### Scan observability

- Added exact scan input and mode.
- Added start time, finish time, and duration.
- Added current stage and stage progress.
- Added hosts discovered.
- Added findings created, updated, and resolved counters.
- Added durable scan logs.
- Added retry metadata.
- Added worker heartbeat timestamps.
- Added ownership-safe scan history RPC.

### Reporting

- Added host vulnerability CSV reports.
- Added printable executive HTML reports.
- Executive reports can be saved as PDF through the browser print dialog.
- Reports include target information, host counts, finding counts, severity totals, affected IPs, URLs, and statuses.

### Security and permissions

- Added owner-scoped scan policies.
- Added owner-scoped finding policies.
- Added owner-scoped scan log access.
- Added authenticated cancellation and retry RPCs.
- Added admin/analyst claim support through JWT app metadata.
- Prevented normal users from directly changing worker-owned scan lifecycle states.
- Backfilled finding ownership from the owning scan.
- Service-role worker writes remain supported.

## Important migrations

Apply these migrations in Supabase in filename order:

1. `20261108001300_scan_observability_permissions.sql`
2. `20261108001400_findings_filtered_export.sql`
3. `20261108001500_repair_findings_groups_rpc.sql`
4. `20261108001600_health_quality_scan_history.sql`

The earlier migrations for grouping, detail views, lifecycle actions, and stable finding identity must also be applied if they are not already deployed:

- `20261108000800_findings_grouped_workbench.sql`
- `20261108000900_findings_group_detail.sql`
- `20261108001000_findings_lifecycle_actions.sql`
- `20261108001100_stable_finding_identity.sql`
- `20261108001200_fix_null_separator_fingerprints.sql`

The health migration adds deployment/RPC readiness checks, finding quality
metrics, query indexes, and owner-safe scan priority updates. It also enables
the dedicated `/scans/<scan-id>` history page.

After applying migrations:

1. Refresh the Supabase schema cache.
2. Restart or redeploy the worker.
3. Confirm the worker service-role key is configured only on the worker.
4. Sign in and verify scans, findings, exports, and queue actions.

## Permission test checklist

Use two authenticated test users:

- User A cannot see User B's scans.
- User A cannot see User B's findings.
- User A cannot see User B's scan logs.
- User A cannot cancel or retry User B's scans.
- User A cannot update User B's findings.
- Admin claims can access the intended team scope.
- Scan Console records do not leak across users.

Live permission testing was not run in this checkout because no Supabase credentials, local database, or Supabase CLI configuration is present.

## Validation completed

- Next.js production build passed.
- TypeScript validation passed.
- ESLint validation passed.
- Python syntax checks passed.
- Worker tests passed: **42 passed**.
- Git diff checks passed.

## Recent commits

- `a7fda7e` — Add target reports and worker visibility
- `03f976e` — Add filtered findings exports
- `6600d10` — Add scan observability and ownership controls
- `1458eff` — Fix PostgreSQL null fingerprint separators
- `7e977aa` — Add asset view and stable finding identity
- `ef969a9` — Add finding lifecycle management
- `0417196` — Add finding detail drawer
- `8701f44` — Group repeated findings in workbench
- `cd8cf82` — Show exact finding scan identity
- `7564d53` — Show finding target and host context
