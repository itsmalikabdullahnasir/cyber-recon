#!/usr/bin/env bash
# One-command worker deploy on the Oracle VM.
#
# Why this exists: the systemd service runs the worker from $RUNDIR
# (/home/ubuntu/recon-worker), which has its own .venv and .env — a SEPARATE
# copy from the git clone at $REPO (~/cyber-recon). So "git pull" alone updates
# the clone but NOT the code the service actually runs. This script does the
# full dance: pull, sync code into the run dir (keeping .venv/.env), restart,
# and health-check.
#
# Usage:  bash worker/deploy/deploy-worker.sh
set -euo pipefail

REPO="${REPO:-$HOME/cyber-recon}"
RUNDIR="${RUNDIR:-/home/ubuntu/recon-worker}"
SERVICE="${SERVICE:-recon-worker}"

echo "==> Pulling latest in $REPO"
# --ff-only: refuse to create a merge commit; fail loudly if branches diverged,
# so a deploy never silently merges unexpected history.
git -C "$REPO" pull --ff-only origin master

echo "==> Syncing worker code into $RUNDIR (preserving .venv and .env)"
# --delete keeps $RUNDIR an exact mirror of the repo's worker/ (so a removed or
# renamed file doesn't linger and get imported). --exclude protects the runtime
# bits that must NOT be touched: the virtualenv and the secrets file.
rsync -a --delete --exclude .venv --exclude .env "$REPO/worker/" "$RUNDIR/"

echo "==> Restarting $SERVICE"
sudo systemctl restart "$SERVICE"

echo "==> Waiting for the worker to report healthy..."
for i in $(seq 1 10); do
  sleep 1
  if curl -sf localhost:8000/health >/dev/null 2>&1; then
    echo "OK: $(curl -s localhost:8000/health)"
    exit 0
  fi
done

echo "WARN: worker did not report healthy within 10s."
echo "      Check logs:  journalctl -u $SERVICE -n 30 --no-pager"
exit 1
