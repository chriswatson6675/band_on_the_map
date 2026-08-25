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
#   sudo deploy/install.sh --ref=<git-sha-or-tag> [--repo=<git-url>] [--dir=<path>]
#
# Example:
#   sudo deploy/install.sh --ref=c25545c0dbbe2e2520876bd5a895d11358ff68c2
#
# What this script does, in order (safe to re-run):
#   1. create the `botm` system user/group if missing (non-login, no home
#      shell)
#   2. clone the repository into APP_DIR if missing, else fetch
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
#
# This script deliberately does NOT enable or start the timer -- see
# deploy/README.md's "Live deployment" section for the required manual
# proof-run step that must succeed first.

set -euo pipefail

APP_DIR="/opt/band-on-the-map"
REPO_URL="https://github.com/chriswatson6675/band_on_the_map.git"
SERVICE_USER="botm"
REF=""

for arg in "$@"; do
  case "$arg" in
    --ref=*) REF="${arg#--ref=}" ;;
    --repo=*) REPO_URL="${arg#--repo=}" ;;
    --dir=*) APP_DIR="${arg#--dir=}" ;;
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
echo "Installing systemd unit files..."
install -m 0644 "$APP_DIR/deploy/systemd/botm-unattended.service" /etc/systemd/system/botm-unattended.service
install -m 0644 "$APP_DIR/deploy/systemd/botm-unattended.timer" /etc/systemd/system/botm-unattended.timer
systemctl daemon-reload

# --- 6. ownership --------------------------------------------------------
echo "Setting ownership of $APP_DIR to $SERVICE_USER:$SERVICE_USER ..."
chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"

cat <<EOF

== Install/update complete ==
Deployed commit: $ACTUAL_SHA
Systemd units installed and reloaded, but NOT yet enabled/started.

Next steps (see deploy/README.md "Live deployment" for the full sequence):
  1. Prove one manual run:   sudo systemctl start botm-unattended.service
  2. Check it completed:      systemctl status botm-unattended.service
  3. Check the health report: cat $APP_DIR/runtime/health-reports/latest.json
  4. Only once that succeeds, enable the recurring schedule:
       sudo systemctl enable --now botm-unattended.timer
EOF
