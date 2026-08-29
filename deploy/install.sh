#!/usr/bin/env bash
# BOTM-DIGITALOCEAN-UNATTENDED-DEPLOYMENT-01
#
# Idempotent install/update script for one small Linux server. Run as
# root (or via sudo) -- it creates a dedicated, non-login service user and
# never runs the application itself as root.
#
# GIT UPDATE STRATEGY (deliberate, see deploy/README.md): this script
# checks out an EXPLICIT git ref -- never a silent, blind `git pull` of
# whatever `main` currently is. The deployed checkout is pinned to a known
# commit; updating BOTM's running code is always this one explicit,
# operator-triggered action, never something the twice-daily collection
# timer does on its own. The timer only ever runs the code already
# installed by the most recent invocation of this script.
#
# Usage:
#   sudo deploy/install.sh --ref=<git-sha-or-tag> [--repo=<git-url>] [--dir=<path>] [--skip-publication-restart]
#
# Example:
#   sudo deploy/install.sh --ref=c25545c0dbbe2e2520876bd5a895d11358ff68c2
#
# What this script does, in order (safe to re-run):
#   1. create the `botm` system user/group if missing (non-login, no home
#      shell)
#   2. clone the repository into APP_DIR if missing, else fetch
#   3a. reconcile the working tree via deploy/check-deploy-tree.sh: the
#      ONE known, deterministic, collector-regenerated runtime artifact
#      (data/public/lisbon-porto-map.json) is discarded automatically and
#      explicitly if that is the ONLY local modification present; ANY
#      other dirty/staged/untracked state stops this script here, before
#      anything is checked out -- see deploy/check-deploy-tree.sh and
#      deploy/README.md's "Runtime artifact vs pinned deployment"
#   3. checkout the EXACT ref given via --ref (required -- this script
#      refuses to run without one, so an update is always an explicit,
#      reviewable choice)
#   4. `npm ci --omit=dev` -- BOTM's own unattended collector
#      (ingestion/unattended-runner/**) needs none of this repository's
#      devDependencies (eslint/typescript/tailwind tooling) at runtime;
#      only `npm test`/`npm run lint`/`npm run build` do, and this script
#      never runs those on the server
#   5. install/refresh the systemd unit files from deploy/systemd/ into
#      /etc/systemd/system/, then `systemctl daemon-reload`
#   6. fix ownership of APP_DIR to the `botm` user
#   7. restart botm-publication.service so it serves the code just
#      installed -- UNLESS --skip-publication-restart was passed
#      explicitly (see BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01
#      below and deploy/README.md's "Publication service lifecycle")
#
# This script deliberately does NOT enable or start the timer -- see
# deploy/README.md's "Live deployment" section for the required manual
# proof-run step that must succeed first.
#
# --skip-publication-restart (BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01):
# an explicit, operator-controlled flag -- never inferred from --ref, a
# branch name, or any other heuristic -- that skips step 7 entirely. Every
# other step (clone/fetch, checkout, npm ci, systemd unit install/reload,
# ownership) still runs exactly as before; only the long-running
# botm-publication.service process is left completely undisturbed. This
# exists for a bounded APPROVED_CANDIDATE runtime trial (see
# .github/workflows/deploy-beatmapped-collector.yml's `post_deploy_action:
# DEPLOY_ONLY`) where code must be installed on disk without the ONE
# unrelated side effect a normal deploy always has: briefly restarting the
# live, public-facing publication endpoint. Omitting this flag reproduces
# the exact prior unconditional-restart behaviour -- nothing about normal
# deployment changes.

set -euo pipefail

# BOTM-COLLECTOR-DEPLOY-HARDENING-01: resolved from THIS script's own
# location (never $APP_DIR) so the co-located deploy/check-deploy-tree.sh
# always matches the version of install.sh actually being run -- this
# matters on the very deployment that introduces check-deploy-tree.sh
# itself, where the OLD checked-out tree at $APP_DIR does not have it yet.
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]:-$0}")" && pwd)"

APP_DIR="/opt/band-on-the-map"
REPO_URL="https://github.com/chriswatson6675/band_on_the_map.git"
SERVICE_USER="botm"
REF=""
SKIP_PUBLICATION_RESTART=0

for arg in "$@"; do
  case "$arg" in
    --ref=*) REF="${arg#--ref=}" ;;
    --repo=*) REPO_URL="${arg#--repo=}" ;;
    --dir=*) APP_DIR="${arg#--dir=}" ;;
    --skip-publication-restart) SKIP_PUBLICATION_RESTART=1 ;;
    *)
      echo "Unknown argument: $arg" >&2
      exit 1
      ;;
  esac
done

if [ -z "$REF" ]; then
  echo "ERROR: --ref=<git-sha-or-tag> is required." >&2
  echo "This script never deploys a silently-moving branch tip -- pass the exact" >&2
  echo "commit (or tag) you have reviewed, e.g.:" >&2
  echo "  sudo deploy/install.sh --ref=c25545c0dbbe2e2520876bd5a895d11358ff68c2" >&2
  exit 1
fi

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: run as root (or via sudo) -- this script creates a system user and" >&2
  echo "installs systemd units under /etc/systemd/system/." >&2
  exit 1
fi

echo "== BOTM install/update =="
echo "  ref:  $REF"
echo "  dir:  $APP_DIR"
echo "  repo: $REPO_URL"
echo "  user: $SERVICE_USER"
echo

# --- 1. dedicated, non-login service user -----------------------------
if ! id -u "$SERVICE_USER" >/dev/null 2>&1; then
  echo "Creating system user '$SERVICE_USER' (non-login, no shell)..."
  useradd --system --no-create-home --shell /usr/sbin/nologin "$SERVICE_USER"
else
  echo "System user '$SERVICE_USER' already exists — reusing it."
fi

# --- 2/3. clone or update, pinned to the explicit ref ------------------
if [ ! -d "$APP_DIR/.git" ]; then
  echo "Cloning $REPO_URL into $APP_DIR ..."
  mkdir -p "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "Existing checkout found at $APP_DIR — fetching..."
  git -C "$APP_DIR" fetch origin
fi

# --- 3a. reconcile the ONE known, deterministic runtime-generated ------
#     artifact (data/public/lisbon-porto-map.json) before switching
#     commits -- see deploy/check-deploy-tree.sh. Every other kind of
#     dirty working tree, staged change, or unexpected file still stops
#     deployment here, exactly as a bare checkout already did before.
echo "Checking working tree state before switching commits..."
"$SCRIPT_DIR/check-deploy-tree.sh" "$APP_DIR"

echo "Checking out $REF (detached — this deployment is pinned, not tracking a branch tip)..."
git -C "$APP_DIR" checkout --detach "$REF"

ACTUAL_SHA="$(git -C "$APP_DIR" rev-parse HEAD)"
if [ "$ACTUAL_SHA" != "$REF" ] && [ "${ACTUAL_SHA:0:${#REF}}" != "$REF" ]; then
  echo "WARNING: resolved HEAD ($ACTUAL_SHA) does not literally match the requested" >&2
  echo "ref ($REF) — this is expected if REF was a branch/tag name; verify manually" >&2
  echo "if REF was meant to be an exact commit SHA." >&2
fi
echo "Deployed commit: $ACTUAL_SHA"

# --- 4. deterministic, production-only dependency install --------------
echo "Installing production dependencies (npm ci --omit=dev)..."
( cd "$APP_DIR" && npm ci --omit=dev )

# --- 5. systemd units ----------------------------------------------------
# BEATMAPPED-PUBLICATION-SERVICE-DEPLOY-LIFECYCLE-01: botm-publication.service
# (deploy/systemd/botm-publication.service, docs/RUNTIME_PUBLICATION_BRIDGE.md)
# is installed/reloaded here exactly like the two botm-unattended units
# above -- it has been a repo-controlled, reviewed unit file since the
# runtime-publication-bridge package; this script simply keeps its
# installed copy in sync with the checkout on every deploy, same as it
# already does for the other two units.
echo "Installing systemd unit files..."
install -m 0644 "$APP_DIR/deploy/systemd/botm-unattended.service" /etc/systemd/system/botm-unattended.service
install -m 0644 "$APP_DIR/deploy/systemd/botm-unattended.timer" /etc/systemd/system/botm-unattended.timer
install -m 0644 "$APP_DIR/deploy/systemd/botm-publication.service" /etc/systemd/system/botm-publication.service
systemctl daemon-reload

# --- 6. ownership --------------------------------------------------------
echo "Setting ownership of $APP_DIR to $SERVICE_USER:$SERVICE_USER ..."
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

# --- 7. restart the long-running publication service --------------------
# BEATMAPPED-PUBLICATION-SERVICE-DEPLOY-LIFECYCLE-01
#
# botm-unattended.service/.timer (above) are deliberately left
# un-enabled/un-started by this script -- they run to completion once per
# invocation and re-spawn fresh from whatever code is on disk every time,
# so a stopped/never-started state is always safe and the "prove one run
# first" gate in deploy/README.md's "Live deployment" section is a
# meaningful, deliberate checkpoint for THAT unit.
#
# botm-publication.service is different in kind: it is a small,
# long-running `node:http` process (ingestion/publication-server/run.mjs)
# that stays resident in memory for as long as it runs, and Node.js does
# NOT hot-reload ES modules -- so once code on disk changes underneath it
# (exactly what steps 3/4 above just did), the running process keeps
# serving requests using whatever validator/route logic was loaded at its
# own last start, silently drifting from the code actually checked out.
# This has a genuine live-traffic consequence: it is the ONE process that
# answers https://data.beatmapped.com/{health,map-data} for real visitors,
# so leaving it un-restarted after a deploy means visitors keep being
# served by stale in-memory logic indefinitely, with nothing about the
# deploy itself indicating that.
#
# `systemctl enable` here is idempotent (a no-op if already enabled) and
# ensures this unit survives a host reboot going forward, same as
# botm-unattended.timer already does. `systemctl restart` (not `start`) is
# unconditional and idempotent either way: if the service was not already
# running, this starts it fresh (identical effect to `start`); if it WAS
# already running, this is the one thing that actually forces it to pick
# up the code just installed -- `start` alone would silently do nothing in
# that case. The explicit `is-active` check after it, with a short retry
# window for systemd to settle, ensures a service that fails to come back
# up (crash-looping on bad new code, a port conflict, etc.) fails this
# script LOUDLY and visibly, rather than leaving a broken/absent publication
# process undetected behind a "successful" deploy.
if [ "$SKIP_PUBLICATION_RESTART" -eq 1 ]; then
  echo "Skipping botm-publication.service enable/restart (--skip-publication-restart"
  echo "was passed explicitly) -- code is installed on disk only; the live,"
  echo "already-running publication process is left completely undisturbed."
  PUBLICATION_SUMMARY_LINE="botm-publication.service was NOT touched (--skip-publication-restart) --
it is still serving whatever code it loaded at its own last start; only
new code on disk was installed by this run."
else
  echo "Restarting botm-publication.service so it serves the code just installed..."
  systemctl enable botm-publication.service
  systemctl restart botm-publication.service

  RESTART_CHECK_ATTEMPTS=10
  RESTART_CHECK_OK=0
  for _ in $(seq 1 "$RESTART_CHECK_ATTEMPTS"); do
    if systemctl is-active --quiet botm-publication.service; then
      RESTART_CHECK_OK=1
      break
    fi
    sleep 1
  done

  if [ "$RESTART_CHECK_OK" -ne 1 ]; then
    echo "ERROR: botm-publication.service did not report active after restart." >&2
    echo "This deployment updated code on disk but the live publication endpoint" >&2
    echo "may now be down or still running stale code. Investigate with:" >&2
    echo "  systemctl status botm-publication.service" >&2
    echo "  journalctl -u botm-publication.service -n 100 --no-pager" >&2
    exit 1
  fi
  echo "botm-publication.service is active."
  PUBLICATION_SUMMARY_LINE="botm-publication.service installed, enabled, and restarted -- it is now
serving the code just deployed."
fi

cat <<EOF

== Install/update complete ==
Deployed commit: $ACTUAL_SHA
botm-unattended.{service,timer} installed and reloaded, but NOT enabled/started
by this script (see deploy/README.md "Live deployment" for that deliberate,
manual first-run gate).
$PUBLICATION_SUMMARY_LINE

Next steps (see deploy/README.md "Live deployment" for the full sequence):
  1. Prove one manual run:   sudo systemctl start botm-unattended.service
  2. Check it completed:      systemctl status botm-unattended.service
  3. Check the health report: cat $APP_DIR/runtime/health-reports/latest.json
  4. Only once that succeeds, enable the recurring schedule:
       sudo systemctl enable --now botm-unattended.timer
EOF
