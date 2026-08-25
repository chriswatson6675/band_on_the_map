# BOTM Unattended Deployment (DigitalOcean + systemd)

Reviewed: 2026-08-25
Task: `BOTM-DIGITALOCEAN-UNATTENDED-DEPLOYMENT-01`

Runs the already-proven `npm run unattended` command
(`docs/UNATTENDED_RUNNER.md`) automatically, twice daily, on a small Linux
server, using standard `systemd` — no Docker, Kubernetes, PM2, Redis,
PostgreSQL, or queues. This package covers the server-side collector only.
It does **not** run the public website (see "The publication gap" below,
which this package deliberately does not close).

## Files in this directory

| File | Purpose |
|---|---|
| `install.sh` | idempotent install/update script — see below |
| `check-deploy-tree.sh` | explicit pre-checkout working-tree reconciliation — see "Runtime artifact vs pinned deployment" below |
| `systemd/botm-unattended.service` | `oneshot` unit running one `npm run unattended` cycle |
| `systemd/botm-unattended.timer` | twice-daily schedule (~06:15, ~18:15 UTC) |

## Requirements

- **Node.js ≥ 20.9.0** (from `next`'s own `package.json` `engines` field —
  this repository's dev environment currently runs v24.15.0; any Node
  ≥20.9, LTS preferred, is sufficient for the collector itself). Verify
  with `node --version` / `npm --version` on the target host before
  installing — do not assume a version.
- `git`, standard `systemd` (present on any current Debian/Ubuntu droplet).
- **No** Docker/Kubernetes/PM2/Redis/PostgreSQL/queue software — none of
  it is required and none should be introduced for this.

## Server directory & user

- Application path: **`/opt/band-on-the-map`** (override with
  `install.sh --dir=`).
- Service account: **`botm`**, a dedicated, non-login system user
  (`useradd --system --no-create-home --shell /usr/sbin/nologin`) —
  created by `install.sh` if it does not already exist. The application
  runs as this user, never as root. It owns only `/opt/band-on-the-map`
  (the checkout, its `runtime/` directory, and the generated
  `data/public/lisbon-porto-map.json`) — no other system permissions are
  granted or weakened.

## Git update strategy (read this before deploying)

The deployed checkout is **pinned to an explicit commit**, never a moving
branch tip. `install.sh` requires `--ref=<sha>` and refuses to run without
it. The twice-daily timer only ever executes `npm run unattended` against
whatever code is already checked out — it never runs `git pull` or
touches the checkout at all. Deploying new application code is always a
separate, deliberate re-run of `install.sh` with a new `--ref`, reviewed
and chosen by a human. **We want event collection automatic; we do not
want arbitrary new application code self-deploying twice a day.**

## Runtime artifact vs pinned deployment (`BOTM-COLLECTOR-DEPLOY-HARDENING-01`)

The unattended collector (`npm run unattended`) legitimately rewrites the
**tracked** `data/public/lisbon-porto-map.json` on every run — that is its
whole job, and it is expected, healthy production behaviour (see
`docs/UNATTENDED_RUNNER.md`), not an operator mistake. In practice this
means the deployed checkout is routinely "dirty" by the time a human
re-runs `install.sh` for a new pinned-SHA deployment: a bare
`git checkout --detach <ref>` correctly refuses to silently overwrite a
locally-modified tracked file.

`install.sh` now reconciles this automatically and explicitly via
[`deploy/check-deploy-tree.sh`](check-deploy-tree.sh), run just before the
checkout step:

- if the working tree is clean, or the **only** local modification is
  exactly `data/public/lisbon-porto-map.json` (unstaged, ordinary
  modification — never staged, never deleted/renamed), that ONE file's
  local change is discarded (`git checkout -- data/public/lisbon-porto-map.json`)
  intentionally and loudly logged, and the deployment proceeds — the file
  is regenerated fresh by the very next unattended/publication run anyway;
- **any other** unexpected working-tree state — a different modified
  tracked file, any staged change (including a staged change to the
  artifact itself), any untracked file, a deletion of the artifact instead
  of an ordinary modification — stops deployment immediately, unchanged,
  exactly as a bare `git checkout` already did before this hardening.
  Nothing is ever discarded in that case.

This mechanism never runs a generic `git stash` across the whole
repository, and never accumulates stash entries. **Operators should no
longer need to manually `git stash` routine collector output before
running `install.sh`** — if a deployment is refused, it means something
genuinely unexpected (beyond the known generated artifact) is present in
the working tree and needs a human to look at it directly.

## Install / update

```bash
# on the target server, as root or via sudo, from a clone of this repo
# (or fetch install.sh directly — it clones the rest itself):
sudo deploy/install.sh --ref=<the exact commit SHA to deploy>
```

Safe to re-run for an update: it fetches, checks out the new `--ref`,
reinstalls dependencies deterministically (`npm ci --omit=dev` — the
collector needs none of this repo's devDependencies, which exist only for
`npm test`/`npm run lint`/`npm run build`, none of which this script or
the timer ever run on the server), reinstalls the systemd unit files, and
reloads systemd. It does **not** touch the timer's enabled/running state.

## Live deployment sequence (do this in order)

1. **Read-only inspection first** — before installing anything, confirm:
   hostname; OS/version; architecture; available disk; whether Node/npm
   are already present and their versions; whether `/opt/band-on-the-map`
   already exists; whether `botm-unattended.{service,timer}` already
   exist; whether any *unrelated* application already uses this host —
   never overwrite an unrelated deployment.
2. Run `install.sh` (above).
3. **Prove the service manually through systemd** — never substitute a
   bare `npm run unattended` for this step:
   ```bash
   sudo systemctl start botm-unattended.service
   systemctl status botm-unattended.service   # must show completed, not failed
   journalctl -u botm-unattended.service -n 100 --no-pager
   ```
4. Verify the health report:
   ```bash
   cat /opt/band-on-the-map/runtime/health-reports/latest.json
   ```
5. Verify the public artifact was written/updated:
   ```bash
   git -C /opt/band-on-the-map status -- data/public/lisbon-porto-map.json
   ```
6. **Only after step 3 succeeds**, enable the recurring schedule:
   ```bash
   sudo systemctl enable --now botm-unattended.timer
   systemctl is-enabled botm-unattended.timer   # expect: enabled
   systemctl status botm-unattended.timer       # shows next scheduled trigger
   ```

## Reading status later

- Latest run's machine-readable outcome:
  `/opt/band-on-the-map/runtime/health-reports/latest.json`
  (`overall_status`: `HEALTHY` / `DEGRADED` / `FAILED`).
- Logs: `journalctl -u botm-unattended.service` (concise, `[unattended]`-
  prefixed lines — see `docs/UNATTENDED_RUNNER.md`).
- Timer schedule/state: `systemctl status botm-unattended.timer` (also
  shows the computed next trigger time).

No dashboard or external monitoring is added in this package — the health
report file is the sufficient, documented interface for now.

## Reboot resilience

`botm-unattended.timer` is enabled via `systemctl enable`, which creates
the standard `WantedBy=timers.target` symlink — this timer starts
automatically on every boot without any further action, exactly like any
other enabled systemd timer on the host. `Persistent=true` (in the
`.timer` unit) means a scheduled run missed while the server was off is
fired once as soon as the timer is next active, rather than silently
skipped. This is a configuration-level guarantee inherent to systemd; this
package does not reboot the server to demonstrate it live (no
authorised, safe reason to reboot an operator-owned host exists in this
package's scope).

## The publication gap (read this — it is the most important finding in this package)

**This repository's public site is deployed on Netlify (`netlify.toml`,
`@netlify/plugin-nextjs`), not Vercel.** `app/page.tsx` **statically
imports** `data/public/lisbon-porto-map.json`:

```ts
import publicationData from "@/data/public/lisbon-porto-map.json";
```

This means the map data is bundled into the site **at Next.js build
time** (Netlify's own `npx next build` step), not read at request time.

**Consequence: this package's DigitalOcean unattended runner updating its
own local `data/public/lisbon-porto-map.json` on the droplet has NO
effect on the live public site by itself.** The live site only refreshes
when Netlify performs a new build — which (per standard Netlify behaviour,
not something this repository's own files can fully confirm without
dashboard access) happens on a push to whichever branch Netlify's site
settings designate as the production branch (almost certainly `main`).

**No git-commit/push automation exists anywhere in this repository's
ingestion pipeline today** — `ingestion/unattended-runner/`,
`ingestion/publish-map-data/`, and every other publication path only ever
write the local file; none of them ever invoke `git`. This package does
**not** add one. Building a mechanism that lets an unattended,
server-side process push a commit to the canonical GitHub `main` branch
is a genuinely separate, security-sensitive design question (credential
scope, whether it pushes directly to `main` vs. opens a PR, rate limiting,
what happens if two runs disagree) that deserves its own small, deliberate
package — not something to bolt on silently here.

**Until that bridge exists, running the unattended collector on
DigitalOcean proves the collection/publication *logic* end-to-end
locally on the server, but does NOT make the live Netlify site reflect
fresh data.** See this task's own FINAL REPORT for the exact recommended
next package.
