# Cyber Recon

Cyber Recon is a web dashboard for authorized domain and IP reconnaissance. The
Next.js application manages targets, scan workflows, findings, host details,
search, live progress, and reporting. A separate Python worker runs
reconnaissance tools on a controlled VM and writes results to Supabase.

> **Use only on systems you own or are explicitly authorized to test.**
> Active workflows can run port scans, directory discovery, nuclei templates,
> and other security checks.

## What it includes

- Target and engagement-group management
- Passive and active scan workflows
- Custom pipeline builder with reorderable modules
- Optional TLS auditing (not enabled in the default workflows)
- Subdomain, DNS, HTTP, technology, WAF, origin, CVE, port, directory, and
  vulnerability-template stages
- Live scan progress through Supabase Realtime
- Search across targets, scans, IPs, hosts, and findings
- Expandable host cards with ports, services, technologies, WAF, ASN, SSL, and
  findings
- Dashboard risk summaries, scan activity, pagination, and interactive charts

## Architecture

```text
Browser
  │ authenticated Supabase session
  ▼
Next.js app (local or Vercel)
  ├─ Supabase Auth + database
  └─ worker API over HTTPS + X-Worker-Secret
                              ▼
                     Python worker on VM
                       ├─ nmap, nuclei, dnsx, httpx
                       ├─ subfinder, whatweb, wafw00f
                       ├─ feroxbuster, testssl.sh, nikto
                       └─ Supabase service-role writes
```

The web app creates a queued `scans` row and sends the job to the worker. The
worker runs asynchronously, updates scan stages and results, and the dashboard
receives changes through Supabase Realtime. The browser never receives the
worker's service-role key.

## Requirements

- Node.js 20 or newer
- npm
- A Supabase project
- Python 3.11 or newer for the worker
- A Linux VM for the worker and recon tools
- HTTPS termination for the worker, recommended through Caddy

## Web app setup

```powershell
git clone https://github.com/itsmalikabdullahnasir/cyber-recon.git
cd cyber-recon
npm install
```

Create `.env.local` in the project root:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY

# Server-side only. Never prefix these with NEXT_PUBLIC_.
RECON_WORKER_URL=https://recon-worker.example.com
RECON_WORKER_SECRET=the_same_secret_used_by_the_worker
WHOISXML_API_KEY=
SHODAN_API_KEY=
```

Start the development server:

```powershell
npm run dev
```

Open <http://localhost:3000>.

Production commands:

```powershell
npm run build
npm run start
```

## Supabase setup

Run every SQL migration in [`supabase/migrations`](./supabase/migrations) in
filename order using the Supabase SQL Editor or your migration workflow.

The pipeline migration,
[`20261031000200_pipelines.sql`](./supabase/migrations/20261031000200_pipelines.sql),
creates `public.pipeline_profiles` and adds per-scan pipeline configuration.
If it is missing, the Pipeline Builder cannot save custom workflows.

After applying migrations:

1. Enable Supabase Realtime for `scans` and any result tables used by the UI.
2. Configure authentication and create the first operator account.
3. Keep service-role credentials out of browser-exposed environment variables.
4. Review RLS policies before adding additional users.

## Worker setup

The full VM installation guide is in [`worker/README.md`](./worker/README.md).
The short version is:

```bash
cd /home/ubuntu/recon-worker
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
chmod 600 .env
```

Set these worker values in `.env`:

```env
WORKER_SECRET=generate_a_long_random_value
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
RESULTS_DIR=/home/ubuntu/recon/results
CVE_DB_PATH=/home/ubuntu/recon/cve.sqlite3
# Optional visual evidence: install Chromium and enable only for approved scope.
ENABLE_SCREENSHOTS=true
CHROMIUM_BIN=/usr/bin/chromium-browser
# Optional: dedicated Chromium profile containing an approved test login session.
# SCREENSHOT_PROFILE_DIR=/home/ubuntu/recon/screenshot-profile
```

Use the same `WORKER_SECRET` as `RECON_WORKER_SECRET` in the web app. The
service-role key belongs only on the VM. Do not commit `.env` files or secrets.

For production, run the worker with the supplied systemd unit and expose it
through HTTPS. Keep FastAPI bound to `127.0.0.1:8000`; only the reverse proxy
should be publicly reachable.

## Scan workflows

The New Scan screen uses one **Workflow** selector. Built-in and saved
workflows show their risk level and module sequence:

- **Basic — Passive**: subdomains, DNS, HTTP probing, fingerprinting, origin
  discovery, and CVE matching. Designed for read-only reconnaissance.
- **Basic — Full (active)**: passive stages plus scoped active modules such as
  nmap, directory discovery, and nuclei.
- **Full — Everything**: includes the available active modules, including the
  optional TLS audit and Nikto when enabled.
- **Saved workflows**: profiles created in Pipeline Builder.

TLS auditing is intentionally not part of the default workflows because it can
be slow. Add the TLS module explicitly when it is needed.

Active stages are scope-controlled. Add authorized domains, IPs, or CIDRs to
the selected engagement group before running an active workflow.

## Visual history and VM operations

When `ENABLE_SCREENSHOTS=true`, the worker captures up to 20 successful,
public HTTP probe results after `httpx`. Each image is retained on the worker,
with metadata recorded in `web_screenshots`; the newest image and prior visual
history appear on the target overview. To capture an approved authenticated
test session, configure a dedicated Chromium profile with
`SCREENSHOT_PROFILE_DIR`—never point it at a personal browser profile.

Apply `20261109000100_screenshot_history.sql` before enabling this feature.
The authenticated `/operations` page presents CPU, memory, disk, queue depth,
tool versions, CVE freshness, and the last CVE-sync service result. Its support
bundle intentionally excludes secrets, environment variables, scan data, and
screenshots.

## Pipeline Builder

Pipeline Builder lets you:

1. Load a built-in starting workflow.
2. Add, remove, enable, disable, and reorder modules.
3. Inspect dependencies and VM installation status.
4. Save the result as a reusable workflow.
5. Select that workflow from New Scan.

The worker receives the selected module list with each scan and honors enabled
modules. A saved workflow does not install missing VM tools; unavailable
modules remain visible and are skipped until the tool is installed and enabled.

## Security model

- Supabase Auth protects the web application.
- The worker API requires `X-Worker-Secret`.
- The worker should bind locally behind an HTTPS reverse proxy.
- The service-role key is used only by the worker.
- Active scans require an authorized scope entry.
- Public-target validation and worker-side scope checks provide defense in depth.
- Third-party API keys are read from server-side environment variables.

Rotate any credential immediately if it was ever committed, logged, or shared.
Do not use the application to scan systems without permission.

## Validation

Web build:

```powershell
npm run build
```

Worker tests:

```powershell
cd worker
$env:PYTHONPATH = (Get-Location).Path
python -m pytest -q
```

Target reports are available from each target page: **Host report CSV** exports
IP, hostname, ports, technologies, and vulnerability counts. **Executive
report / PDF** opens a printable HTML report; use the browser print dialog to
save it as PDF. The filtered findings workbench also supports all-results CSV
and JSON exports after applying the corresponding Supabase migrations.

Permission validation requires a deployed Supabase project and two
authenticated test users. Verify that each user can only read and update their
own scans, findings, and scan logs, while admin claims can access the intended
team scope. This cannot be run against the repository without Supabase
credentials.

The dashboard deployment health panel and finding data-quality panel require
`20261108001600_health_quality_scan_history.sql`. The queue links each scan to
`/scans/<scan-id>` for stage timelines, heartbeat status, logs, retry metadata,
and a downloadable JSON report. Queue priority can be changed from the queue
table for queued scans.

Useful checks before a commit:

```powershell
git diff --check
git status
```

## Troubleshooting

### Pipeline Builder says `pipeline_profiles` is missing

Apply [`20261031000200_pipelines.sql`](./supabase/migrations/20261031000200_pipelines.sql)
in Supabase and refresh the schema cache.

### The worker is unavailable

Check:

```bash
systemctl status recon-worker --no-pager
journalctl -u recon-worker -n 100 --no-pager
curl -s https://recon-worker.example.com/health
```

Confirm that `RECON_WORKER_URL`, `RECON_WORKER_SECRET`, and `WORKER_SECRET`
match and that the HTTPS reverse proxy can reach `127.0.0.1:8000`.

### TLS audits take too long

TLS checks are intentionally optional. Use a workflow without `testssl`, or
adjust `TESTSSL_TIMEOUT` and the worker's heavy-host limits in its `.env`.

### Scans do not appear live

Confirm the `scans` table is in the Supabase Realtime publication, the user
has permission to read the rows, and the browser is authenticated to the same
Supabase project as the worker.

## Repository layout

```text
app/                  Next.js routes and pages
components/           Dashboard and scan UI
lib/                  Shared types, Supabase clients, helpers
supabase/migrations/  Database schema and RLS migrations
worker/app/           FastAPI service and scan pipeline
worker/deploy/        systemd deployment files
worker/tests/         Python worker tests
```

## License

No license has been declared yet. Add a license file before distributing the
project or accepting external contributions.
