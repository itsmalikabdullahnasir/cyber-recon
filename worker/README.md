# Cyber Recon worker

A small FastAPI service that runs your recon pipeline on the Oracle VM and writes
results straight into Supabase. Vercel never waits on it: the Next.js
`/api/recon` route creates a `scans` row, hands the job to the worker, and the
worker replies `202 accepted` and scans in the background. The notification bell
and the scan progress bar update over Supabase Realtime.

```
Browser ──login──> Vercel /api/recon ──X-Worker-Secret──> VM: Caddy :443 ──> uvicorn 127.0.0.1:8000
                        │                                                         │
                        └── inserts scans row (as you) ──> Supabase <── service role writes results
```

Pipeline per scan: **subfinder → dnsx → httpx (+CDN flag) → nmap → local CVE match → nuclei**.
Passive stages (subfinder/dnsx/httpx) run on any valid target. **Active stages
(nmap, nuclei) run only when the Target is `In Scope` and the host matches a
`scope_entries` row.** CVE matching is done against a local NVD mirror on the VM
(`cve.sqlite3`), so a scan makes no third-party CVE calls.

---

## Step 0 — Apply the database migrations

In the Supabase SQL editor, run both migrations in order:
1. [`supabase/migrations/20261030000000_recon_worker.sql`](../supabase/migrations/20261030000000_recon_worker.sql)
2. [`supabase/migrations/20261030000100_console_and_tools.sql`](../supabase/migrations/20261030000100_console_and_tools.sql) — adds the Scan Console target + columns for the dir-brute / TLS / WAF stages.
It only adds things (a `scope_entries` table, a `scans` table, and nullable
columns on `subdomains`/`hosts`/`findings`), so your existing data and UI keep
working. It also adds `scans` to the `supabase_realtime` publication for the live
progress bar.

> **Lock down sign-ups.** The worker writes with the service-role key, which
> bypasses RLS — that is fine, it stays on the VM. But every logged-in user can
> still read every target (that is how your app already works). In
> **Supabase → Authentication → Providers → Email**, turn **off** "Allow new
> users to sign up" so only you have an account.

---

## Step 1 — Get the code onto the VM

```bash
ssh cyberrecon-oracle
```

```bash
# Copy just the worker/ folder up. From your laptop, in the repo root:
#   rsync -av --exclude .venv --exclude .env worker/ cyberrecon-oracle:/home/ubuntu/recon-worker/
# or clone the repo and symlink. Either way you want the tree at:
#   /home/ubuntu/recon-worker/{app,deploy,requirements.txt,.env.example}
mkdir -p /home/ubuntu/recon-worker
```

Create the Python virtualenv and install the pinned dependencies:

```bash
cd /home/ubuntu/recon-worker
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```
*What this does:* an isolated interpreter so the service never depends on system
packages or `~/.bashrc`. FastAPI + uvicorn serve the API; `httpx` talks to
Supabase and NVD; `defusedxml` parses nmap XML safely (no entity-expansion
attacks).

### Step 1b — install the Scan Console tools

The Console adds directory brute-forcing, deeper fingerprinting, a TLS audit and
a web-server scanner. Install the ones you want (each stage is skipped gracefully
if its binary is missing or its `ENABLE_*` flag is false):

```bash
# feroxbuster (dir brute-force) + SecLists wordlist + wafw00f + nikto
sudo apt-get update && sudo apt-get install -y feroxbuster seclists wafw00f nikto
# whatweb + testssl.sh are already on your box per your setup notes.
```

Then confirm the paths the worker expects exist (adjust `.env` if different):

```bash
ls -1 /usr/bin/feroxbuster /usr/bin/wafw00f /usr/bin/nikto \
      /usr/share/seclists/Discovery/Web-Content/common.txt \
      "$(command -v whatweb)" "$(command -v testssl.sh || echo /home/ubuntu/testssl.sh/testssl.sh)"
```

If `feroxbuster` isn't in the Ubuntu repo for your release, grab the static
binary: `curl -sL https://raw.githubusercontent.com/epi052/feroxbuster/main/install-nix.sh | bash` then move `./feroxbuster` to `/usr/bin/`. Set the real paths in `.env`
(`FEROXBUSTER_BIN`, `WORDLIST`, `TESTSSL_BIN`, …). `nikto` is **off by default**
(`ENABLE_NIKTO=false`) because it's noisy and slow — flip it on per your needs.

---

## Step 2 — Configure secrets

```bash
cp .env.example .env
openssl rand -hex 32          # copy this: it is your shared secret
nano .env
chmod 600 .env                # only ubuntu can read the service-role key
```
Fill in:
- `WORKER_SECRET` — the `openssl` value above (you will paste the same value into Vercel).
- `SUPABASE_URL` — `https://<project>.supabase.co`.
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase → Settings → API → **service_role** key. **VM only. Never in the browser or in Vercel's public env.**
- `NVD_API_KEY` — optional, free from <https://nvd.nist.gov/developers/request-an-api-key>. Makes the CVE mirror sync ~10× faster.

---

## Step 3 — Build the local CVE database

```bash
# First run downloads the full NVD corpus. With an API key ~20-40 min; without, a few hours.
.venv/bin/python -m app.cve_db sync
.venv/bin/python -m app.cve_db stats          # e.g. "260000 CVEs, 900000 CPE match rows"
.venv/bin/python -m app.cve_db lookup nginx 1.18.0   # sanity check
```
*What this does:* mirrors NVD into `/home/ubuntu/recon/cve.sqlite3`. Scans then
match `product + version` offline. A nightly timer (Step 6) keeps it fresh with
incremental pulls. If you skip this, scans still run — the CVE stage is just
marked `skipped` until the DB exists.

---

## Step 4 — Smoke-test the worker by hand

```bash
set -a; . ./.env; set +a
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
```
In a second SSH session:

```bash
curl -s localhost:8000/health
# {"ok":true}

curl -s -o /dev/null -w '%{http_code}\n' -X POST localhost:8000/scan \
  -H 'Content-Type: application/json' -d '{"target":"example.com","scan_id":"...","mode":"passive"}'
# 401  <- no secret header, good
```
Stop it with `Ctrl-C` once `/health` works. (A real scan needs a matching
`scans` row in Supabase; you will drive that from the UI in Step 8.)

---

## Step 5 — Install the systemd service

```bash
sudo cp deploy/recon-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now recon-worker
systemctl status recon-worker --no-pager
journalctl -u recon-worker -f          # live logs
```
*What this does:* starts the worker on boot and restarts it on crash. The unit
**sets `PATH` and `HOME` explicitly** (systemd does not read `~/.bashrc`), binds
uvicorn to `127.0.0.1:8000` only (Caddy is the only thing exposed), and caps
memory (`MemoryMax=850M`) so a runaway tool is killed before the 1 GB box starts
swapping to death. `KillMode=control-group` makes sure nmap/nuclei children die
with the service.

> The unit intentionally does **not** set `NoNewPrivileges`, because that would
> strip the file capabilities nmap relies on (`setcap cap_net_raw,cap_net_admin`)
> and break `--privileged` SYN scans.

---

## Step 6 — Schedule the nightly CVE sync

```bash
sudo cp deploy/cve-sync.service deploy/cve-sync.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now cve-sync.timer
systemctl list-timers cve-sync.timer --no-pager
```
*What this does:* runs `python -m app.cve_db sync` at 03:17 VM time at `idle` IO
priority. Incremental after the first run (only CVEs modified since last sync).

---

## Step 7 — Expose the port safely (HTTPS via Caddy + both firewalls)

The worker listens on localhost. Put Caddy in front for TLS, then open exactly
one port in **both** the Oracle VCN security list **and** the VM's iptables.

**7a. Caddy** (automatic Let's Encrypt cert):

```bash
sudo apt-get install -y debian-keyring debian-archive-keyring apt-transport-https curl
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt-get update && sudo apt-get install -y caddy

sudo mkdir -p /var/log/caddy
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo nano /etc/caddy/Caddyfile      # set your email; keep the sslip.io host or use your own DNS
sudo systemctl restart caddy
```
`145-241-119-168.sslip.io` resolves to your IP, so Caddy gets a real cert over
the TLS-ALPN challenge with no DNS setup. The Caddyfile only proxies `POST /scan`
and `GET /health`; everything else returns 404.

**7b. Oracle VCN security list** (in the Oracle Cloud console): Networking →
your VCN → Security Lists → default → **Add Ingress Rule**:
- Source `0.0.0.0/0` (or, better, Vercel's egress range if you have Static IPs), IP protocol **TCP**, destination port **443**.

**7c. VM iptables** (exactly as your runbook says, for port 443):

```bash
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```
*What this does:* `-I INPUT 6` inserts the ACCEPT above the default REJECT in
your hardened chain; `netfilter-persistent save` makes it survive reboots. Port
22 stays as-is; 8000 is never exposed.

**7d. Verify from your laptop:**

```bash
curl -s https://145-241-119-168.sslip.io/health      # {"ok":true}
```

> **Tighten egress (recommended).** If you enable Vercel Static IPs (Pro
> "Secure Compute" / Static IPs), restrict both the Oracle ingress rule and the
> `@blocked` matcher in the Caddyfile to those IPs, so only your Vercel
> deployment can reach `/scan`. The shared secret is the primary gate; the IP
> allowlist is defence in depth.

---

## Step 8 — Wire up Vercel

In your Vercel project → Settings → Environment Variables (Production +
Preview), add **server-side** (not `NEXT_PUBLIC_`):

| Name | Value |
|------|-------|
| `RECON_WORKER_URL` | `https://145-241-119-168.sslip.io` |
| `RECON_WORKER_SECRET` | the same `WORKER_SECRET` from Step 2 |

Redeploy. The route is `app/api/recon/route.ts` — it checks your Supabase login,
re-checks scope for active scans, inserts the `scans` row as you, and calls the
worker. (Your existing `/api/scan` header-scanner is untouched.)

---

## Step 9 — Use it

1. Open a target → **Recon VM** tab.
2. Under **Authorized scope**, add what you may actively test (e.g. `wildcard
   *.example.com`, `cidr 203.0.113.0/24`). Make sure the target is **In Scope**.
3. **Passive scan** — subdomains, DNS, HTTP probe, tech + CVE match from banners.
   Works regardless of scope.
4. **Full scan (active)** — adds nmap + nuclei, but only against in-scope,
   non-CDN hosts. The button is disabled until scope exists.
5. Watch the per-stage progress; results fill the table below. **Export JSON**
   gives you the bulk shape:

```json
[{"subdomain":"app.example.com","ip":"203.0.113.10","cloudflare":false,
  "ports":[22,80,443],"tech":["Nginx:1.18.0"],"cves":["CVE-2021-23017"]}]
```

---

## Scan Console

Beyond the per-target tab, there's a standalone **🛰️ Scan Console** (link in the
dashboard header, page at `/console`). It targets an auto-created hidden target
whose scope entries are the **active-scan allowlist**. Use it to:

- scan a **single** IP/domain, or paste **many** (newline, comma, or JSON —
  `["example.com","203.0.113.10"]` or `[{"target":"x","mode":"full"}]`);
- watch each job stream its stages live;
- read results grouped by host and export the JSON bulk shape.

**Passive** runs on anything. **Full (active)** — nmap, testssl, feroxbuster,
nikto, nuclei — is refused unless the IP/domain matches an allowlist entry you
add on that page first. This is the same gate as the per-target scope; the
Console just surfaces one shared allowlist.

## Operating notes

- **One scan at a time.** Extra requests queue (`QUEUE_MAX=5`, then `429`). Tune
  limits in `.env`: `MAX_HEAVY_HOSTS` (default 20) caps how many live hosts get
  nmap/nuclei; `NUCLEI_SEVERITY`, timeouts, etc.
- **Re-scans don't duplicate.** Findings carry a `fingerprint`; a repeat scan
  skips ones you've already triaged (so a `False Positive` stays that way).
- **CDN hosts skip nmap** — the edge IP isn't the origin. They're still flagged
  in the table.
- **Restart safety.** A scan interrupted by a restart is marked `failed` with a
  clear message, not left `running` forever.
- **Logs:** `journalctl -u recon-worker -f`. Per-scan tool output is under
  `RESULTS_DIR/<scan_id>/`.

## Local development / tests

```bash
cd worker
python3 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q      # 41 tests: validation, scope gate, parsers, CVE match, full pipeline, API
```

## Security model

- Shared secret compared with `hmac.compare_digest` (constant-time).
- No `shell=True` anywhere; every external command is an args **list** built only
  from validated values. Targets must parse as a public domain or globally
  routable IP — private, loopback and link-local (incl. `169.254.169.254`) are
  rejected on both the Vercel and worker sides.
- Every command has a timeout and is killed by process group on expiry.
- Tool output is parsed from JSON/XML, never screen-scraped.
- Active scanning is gated by `scope_entries`; the gate is enforced in the worker
  (authoritative) and pre-checked on Vercel.
