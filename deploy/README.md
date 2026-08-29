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
| `systemd/botm-publication.service` | long-running `npm run serve:map-data` unit — installed, enabled, and (by default) restarted by `install.sh` on every deploy, unless `--skip-publication-restart` is passed (see "Publication service lifecycle" below) |
| `ci/resolve-and-validate-deployment.sh` | the exact SHA-resolution/authorisation logic the Action's `resolve-and-validate` job runs — see "Approved-candidate deployment trials" below |
| `systemd/beatmapped-city-worker.service` | (present only on the unmerged city-worker candidate line, not yet in this checkout) the always-on city-job worker unit — installed/started only by the dedicated trial Action, see "Bounded city-worker runtime trial" below |

## Simple human deployment workflow (`BEATMAPPED-COLLECTOR-ONE-CLICK-DEPLOY-02`)

Most changes to this repository need **no manual deployment step at all**:

- **Frontend-only change** (UI, copy, styling, anything under `app/`
  that doesn't touch the collector/enrichment/publication code paths) —
  merge to `main`. Vercel's own GitHub integration picks it up and
  deploys the frontend automatically. Nothing else to do.
- **Collector, enrichment, or publication change** (anything the
  DigitalOcean production collector actually runs —
  `ingestion/unattended-runner/**`, `ingestion/map/**`,
  `ingestion/publication-server/**`, `artists/**`, etc.) — merge to
  `main`, then:
  1. GitHub → **Actions** → **Deploy BeatMapped Collector**
  2. **Run workflow**, enter the approved `main` commit SHA
  3. Confirm the run finishes **green** — the run summary shows the
     resolved SHA, main-history validation, deployment result,
     collector/timer health, publication result, and the fresh runtime
     `generated_at`/listing count directly, with no need to read raw logs.

This is the [`.github/workflows/deploy-beatmapped-collector.yml`](../.github/workflows/deploy-beatmapped-collector.yml)
Action — `workflow_dispatch` only, never triggered automatically on push
(collector code reaching `main` and collector code actually running in
production are two deliberately separate, human-gated events). It never
duplicates `install.sh`'s own logic — it only decides which commit is
safe to hand to it, then runs the exact same `deploy/install.sh --ref=<sha>`
this document already describes below, over SSH, using this repository's
own hardened, dirty-tree-aware installer.

**Manual interactive SSH to the production droplet is emergency/debugging
access only** — for investigating an unclear failure, or a situation the
Action itself cannot safely resolve — never the normal way to deploy.
Routine deployment should never require anyone (a human or a Claude
session) to hold production SSH access directly.

Before the Action can run for the very first time, an operator must
configure its GitHub secrets once (see the Action file's own header
comment and this repository's operational notes for the exact secret
names: `BEATMAPPED_PROD_HOST`, `BEATMAPPED_PROD_USER`,
`BEATMAPPED_PROD_SSH_KEY`, `BEATMAPPED_PROD_SSH_HOST_KEY`, under a
GitHub Environment named `beatmapped-collector-production` — deliberately
**not** this repository's existing `Production`/`Preview` Environments,
which are Vercel's own auto-managed frontend-deployment pair and
unrelated to this SSH-based collector deployment). This is a one-time
setup step performed directly in GitHub's own UI; secret values are never
generated or handled by an automated coding session.

## Approved-candidate deployment trials (`BEATMAPPED-APPROVED-CANDIDATE-SHA-DEPLOYMENT-PATH-01`, `BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01`)

The workflow above (`mode: MAIN`, the default) only ever deploys a commit
reachable from `origin/main` — the normal, unchanged rule for every real
collector/publication change. A second, narrowly-scoped `mode:
APPROVED_CANDIDATE` lets a Founder explicitly deploy ONE exact, reviewed,
**pushed-but-unmerged** commit SHA for a tightly bounded trial — e.g.
proving a new subsystem installs and runs correctly on the real host —
**without** merging it to `main`, and without ever handing production SSH
credentials to a human or a Claude session (the Action still owns those,
exactly as in `MAIN` mode).

**What makes a commit an authorised candidate**: a `candidate/deploy/*`
branch, pushed to `origin`, whose tip is **exactly** that commit. This
convention is deliberately narrow:

- The branch exists **only as a pointer** to one exact, reviewed SHA — it
  must never gain its own commit history (no new implementation commits
  directly on it; if the candidate changes, move the branch to point at
  the new reviewed SHA instead).
- Authorisation checks **tip equality**, never mere ancestry — an earlier,
  superseded commit on the same branch is never itself deployable once
  the branch has moved on, and a commit that merely happens to be an
  ancestor of some other branch is never accepted.
- `APPROVED_CANDIDATE` mode requires the **exact full 40-character commit
  SHA** as the `ref` input — never a short SHA, never a branch/tag name.
- The same `beatmapped-collector-production` Environment, the same
  secrets, and the same `deploy/install.sh --ref=<sha>` transport are
  used — nothing about production access itself is weakened or
  duplicated for this mode.

**A second, orthogonal input, `post_deploy_action`** (`NORMAL_PUBLICATION`
default / `DEPLOY_ONLY`), controls what happens *after* the code is
installed. Exactly two combinations are ever valid, enforced fail-closed by
`deploy/ci/resolve-and-validate-deployment.sh` before any production
contact is even attempted — an invalid combination (e.g. `MAIN` +
`DEPLOY_ONLY`, or `APPROVED_CANDIDATE` + `NORMAL_PUBLICATION`) is rejected
outright, never silently inferred or silently ignored:

| `mode` | `post_deploy_action` | Behaviour |
|---|---|---|
| `MAIN` | `NORMAL_PUBLICATION` (the only allowed pairing) | Normal deployment, unchanged: installs the code, then triggers and verifies the full acquisition+publication cycle exactly as before. |
| `APPROVED_CANDIDATE` | `DEPLOY_ONLY` (the only allowed pairing) | Installs and verifies the exact candidate SHA; **never** triggers `botm-unattended.service`; **never** restarts `botm-publication.service` (passes `deploy/install.sh --skip-publication-restart`) — the live, public-facing publication process is left completely undisturbed. |

Before `BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01`, an
`APPROVED_CANDIDATE` trial already never triggered acquisition/publication,
but still had one undisclosed side effect: `install.sh` unconditionally
`systemctl restart`s `botm-publication.service` on every install, so even a
code-only candidate trial briefly bounced the live, public-facing
publication process. `DEPLOY_ONLY` closes that gap explicitly — via a
plain, operator-driven CLI flag (`--skip-publication-restart`), never
inferred from a branch name or any other heuristic — so a bounded runtime
trial (e.g. installing the city-worker candidate) can install code without
disturbing anything else already running on the host. Every other install
step (fetch/checkout/`npm ci`/systemd-unit install/reload/ownership) still
runs exactly as before regardless of this flag; only the
`botm-publication.service` enable/restart/health-check is skipped.

**Operator procedure:**

1. Review the exact candidate commit SHA (e.g. `fa64002...` — the full
   40-character form).
2. If it is not already on `origin`, push the branch that contains it.
3. Create (or move) an authorised pointer branch to that exact SHA:
   ```bash
   git push origin <candidate-sha>:refs/heads/candidate/deploy/<short-name>
   ```
4. GitHub → **Actions** → **Deploy BeatMapped Collector** → **Run workflow**.
5. Set **mode** to `APPROVED_CANDIDATE`.
6. Set **post_deploy_action** to `DEPLOY_ONLY` (the only value
   `APPROVED_CANDIDATE` accepts).
7. Paste the exact full 40-character SHA into **ref**.
8. Approve the protected `beatmapped-collector-production` Environment if
   GitHub Environment protection rules require it.
9. The workflow validates the SHA is the exact tip of an authorised
   `candidate/deploy/*` branch, deploys it via the existing installer with
   `--skip-publication-restart`, verifies the deployed HEAD matches
   exactly, confirms `botm-unattended.timer`/`botm-publication.service`
   remain healthy (untouched, whatever they were before), and records in
   its own summary that publication was **not** triggered and
   `botm-publication.service` was **not** restarted.
10. After the bounded trial, either:
    - **restore** the previous known-good state by re-running this same
      workflow in `MAIN` mode (`post_deploy_action: NORMAL_PUBLICATION`)
      with the last approved `main` SHA (no interactive SSH required —
      the standard rollback path, unchanged from `MAIN` mode's own), or
    - **integrate properly**: once satisfied, merge the candidate through
      the normal review process, then deploy the resulting `main` commit
      via `MAIN` mode as usual. A candidate branch is never itself the
      long-term deployment record.

A full bounded RUNTIME trial of the city-worker itself (installing the
`beatmapped-city-worker` systemd unit, enqueueing a job, starting/stopping
the worker) is a distinct, further step beyond what this section's
workflow does on its own — see "Bounded city-worker runtime trial" below
for the dedicated, single-purpose GitHub Action that performs that
entirely through this same protected Environment, with no interactive SSH
required at all.

## Bounded city-worker runtime trial (`BEATMAPPED-CITY-WORKER-BOUNDED-TRIAL-ACTION-01`)

[`.github/workflows/run-beatmapped-city-worker-trial.yml`](../.github/workflows/run-beatmapped-city-worker-trial.yml)
("**Run BeatMapped City Worker Trial**" in GitHub's Actions tab) is the
ONE sanctioned way to perform a bounded runtime proof of the unattended
city-worker (`ingestion/city-worker/**`, currently only on an unmerged
candidate line) against the real production host — entirely through the
protected `beatmapped-collector-production` Environment, never via
routine interactive SSH (prohibited by project policy), and without
broadening `deploy-beatmapped-collector.yml`'s own normal-deployment
semantics. It is `workflow_dispatch` only and accepts exactly ONE input,
the candidate's exact full 40-character commit SHA — `mode` and
`post_deploy_action` are not exposed here at all; this workflow always
performs `APPROVED_CANDIDATE` + `DEPLOY_ONLY`, reusing the exact same
`deploy/ci/resolve-and-validate-deployment.sh` authorisation (a
`candidate/deploy/*` branch's exact tip; an arbitrary feature-branch
commit or a superseded candidate commit is rejected exactly as it is for
a normal deployment trial).

**What it does, in order, every run:**

1. Resolves and validates the requested candidate SHA (shared script,
   identical rules to `APPROVED_CANDIDATE` + `DEPLOY_ONLY` above).
2. Checks out that exact commit and confirms it actually provides the
   city-worker deployment assets this trial needs
   (`deploy/systemd/beatmapped-city-worker.service`,
   `ingestion/city-worker/cli.mjs`, the real
   `programme-acquisition-resolver.mjs` adapter, and the trial estate
   fixture) — fails closed before any SSH if any are missing.
3. Validates that the trial estate
   (`fixtures/city-worker/real-estates/berlin-sample-01.json`) is
   **exactly** the five already-governed sources this trial is bound to
   (`tempodrom-berlin`, `a-trane-berlin`, `b-flat-berlin`,
   `uber-arena-berlin`, `columbiahalle-berlin`) — never all of Berlin,
   never another city. This estate/country/city are fixed values baked
   into the workflow, never operator inputs.
4. Deploys the exact candidate via the same sanctioned `DEPLOY_ONLY` path
   (`deploy/install.sh --ref=<sha> --skip-publication-restart`), verifies
   the deployed HEAD, and captures a pre-trial baseline of
   `botm-unattended.timer`/`botm-publication.service`'s state.
5. Installs/reconciles the `beatmapped-city-worker` systemd unit
   (`install -m 0644` + `daemon-reload`) — **never** `systemctl enable`s
   it; the unit is not wanted for boot-time operation during a bounded
   trial.
6. Enqueues exactly one job (`node ingestion/city-worker/cli.mjs
   enqueue-city DE Berlin fixtures/city-worker/real-estates/berlin-sample-01.json`,
   run as the `botm` user) and captures its `job_id`.
7. Starts the worker via `systemctl start beatmapped-city-worker.service`
   — never `nohup`/`tmux`/`screen`/a backgrounded SSH foreground process
   — confirms it is active, confirms it is still `disabled` for boot, and
   that SSH connection ends.
8. Polls for a terminal job state (`COMPLETE` / `COMPLETE_WITH_RESIDUE` /
   `FAILED`) via **later, independent SSH connections** — a genuinely new
   `ssh` invocation every poll — proving the worker survives entirely on
   its own as a systemd-owned process, not tied to any one shell. Bounded
   by both a script-level `MAX_WAIT_SECONDS` and a step-level
   `timeout-minutes`; a timeout stops the trial safely (cleanup still
   runs) rather than looping forever.
9. Collects durable evidence directly from
   `runtime/city-jobs/<job_id>/{job.json,sources/*.json}` — job-level
   counts/state plus, per source, status, the worker's own `attempts`
   counter **separately from** the collector's own internal `retry_count`
   (see `ingestion/programme-acquisition/worker-checkpoint-mapping.mjs`'s
   own "ONE RETRY OWNER" note) — printed to the run's own summary, never
   published anywhere.
10. **Always** (success, failure, or timeout) stops and disables the
    city-worker service again, re-checks
    `botm-unattended.timer`/`botm-publication.service` against the
    pre-trial baseline, and fails the run loudly if cleanup or that
    comparison cannot be confirmed.

Shares the exact same `concurrency: group: deploy-beatmapped-collector`
as the main deploy workflow, so a real `MAIN` deployment and this trial
can never run against the host at the same time.

**Exact sequence to run the bounded city-worker trial** (candidate
`fa64002`, once this workflow itself is Founder-approved and merged — see
this package's own final report):

1. Merge this trial-workflow infrastructure
   (`BEATMAPPED-CITY-WORKER-BOUNDED-TRIAL-ACTION-01`) to `main`, with
   Founder approval — `workflow_dispatch` only exposes whatever version of
   the workflow file lives on the branch/ref a run is dispatched against.
2. Push the exact city-worker candidate branch/SHA (`fa64002`,
   `work/beatmapped-unattended-city-worker-real-integration-01`) to
   `origin` if not already there.
3. Create the authorised pointer branch at that exact tip:
   `git push origin fa64002<...>:refs/heads/candidate/deploy/city-worker-trial-01`.
4. GitHub → **Actions** → **Run BeatMapped City Worker Trial** → **Run workflow**.
5. Paste the exact full 40-character SHA of `fa64002` into **ref**.
6. Approve the protected `beatmapped-collector-production` Environment if
   configured.
7. The workflow validates candidate authorisation, deploys the exact SHA
   via `DEPLOY_ONLY`, installs the city-worker unit (not enabled), enqueues
   the bounded five-source Berlin job, starts the worker via systemd, ends
   that connection, and polls independently until a terminal state or
   timeout.
8. Review the run's own summary for the collected evidence (job state,
   per-source outcomes, worker attempts vs collector retry_count).
9. The workflow's own cleanup step stops and disables
   `beatmapped-city-worker.service` and confirms
   `botm-unattended.timer`/`botm-publication.service` were undisturbed —
   no further manual action needed.
10. Restore the previous known-good `MAIN` deployment if required (via
    `deploy-beatmapped-collector.yml` in `MAIN` mode, unchanged).

### Production installer bootstrap (`PRODUCTION_INSTALLER_BOOTSTRAP_REQUIRED`)

A bounded candidate trial installs its candidate through the production
host's **already-deployed** `deploy/install.sh`, using that script's
`--skip-publication-restart` option. There is therefore a real version
boundary: the host can only honour that option once a deployment has
actually put a version of `install.sh` that supports it onto the host.

Because the host's checkout only moves during a deployment, a host whose
last deployment predates
`BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01` still runs an older
installer that rejects the flag outright. **This is exactly what happened
on the first live trial** (GitHub Actions run `33266172218`): the deploy
step failed with `Unknown argument: --skip-publication-restart`. Nothing
was mutated on the host, but the failure surfaced mid-deploy rather than
up front.

The trial workflow now performs a **read-only preflight** before any
mutation, and stops with `PRODUCTION_INSTALLER_BOOTSTRAP_REQUIRED` if the
host's installer does not support the option. When you see that:

1. Stop — do not re-run the bounded candidate trial yet; it will keep
   failing the same way, and re-running changes nothing on the host.
2. Determine the exact current approved `origin/main` SHA.
3. GitHub → **Actions** → **Deploy BeatMapped Collector** → **Run workflow**,
   with:
   - **mode** = `MAIN`
   - **post_deploy_action** = `NORMAL_PUBLICATION`
   - **ref** = that exact current approved `main` SHA
4. Let that normal deployment complete successfully. It updates the host
   checkout — and therefore the host's own `deploy/install.sh` — to the
   current supported version.
5. **Expect publication to run.** This is an ordinary `MAIN` deployment,
   so it performs the normal acquisition/publication lifecycle, including
   restarting `botm-publication.service`. That is correct and expected
   here.
6. Verify production is healthy (the run's own summary reports the fresh
   `generated_at` and listing counts).
7. Re-run **Run BeatMapped City Worker Trial** with the exact authorised
   candidate SHA. The preflight will now pass.

**Keep these two things separate when reporting.** The bootstrap step
above is a *normal `MAIN` deployment* and legitimately publishes. The
candidate trial that follows it remains entirely publication-free: it
never triggers `botm-unattended.service`, never runs publication
verification, and never restarts `botm-publication.service`. "The
candidate trial triggered no publication" stays true regardless of the
bootstrap deployment that preceded it.

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
reloads systemd. It does **not** touch `botm-unattended.timer`/`.service`'s
enabled/running state (see "Live deployment sequence" below for that
deliberate manual gate) — but it **does**, by default, enable and restart
`botm-publication.service` on every run; see "Publication service
lifecycle" below for why that unit is handled differently, and pass
`--skip-publication-restart` explicitly to skip that one step for a
bounded, code-only trial (`BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01`
— see "Approved-candidate deployment trials" above).

## Publication service lifecycle (`BEATMAPPED-PUBLICATION-SERVICE-DEPLOY-LIFECYCLE-01`)

`botm-publication.service` (`ingestion/publication-server/run.mjs`, `npm
run serve:map-data`) is a small, long-running Node process — the one thing
that actually answers `https://data.beatmapped.com/{health,map-data}` for
real visitors. Unlike `botm-unattended.service` (a bounded `oneshot` that
re-spawns fresh from whatever is on disk every time it runs), a
long-running process stays resident in memory for as long as it runs, and
**Node.js does not hot-reload ES modules** — so once `install.sh` checks
out new code underneath it, the already-running process keeps serving
requests with whatever logic (including schema-validation logic) was
loaded at its own last start, silently drifting from the code actually on
disk. This was a real, observed production incident: a schema change that
made Spain-aware publication artifacts valid was deployed, but the
still-running old process kept rejecting them with its old, single-country
validation rule, returning `502` to every visitor.

`install.sh` now closes this gap as one of its own ordinary steps, after
code and dependencies are in place and ownership is fixed:

1. `systemctl enable botm-publication.service` — idempotent; ensures this
   unit survives a host reboot (unlike the unattended timer, there is no
   "prove one run first" reason to leave this one un-enabled — it is
   stateless and safe to be always-on).
2. `systemctl restart botm-publication.service` — **not** `start`:
   `restart` is what actually forces an already-running process to reload
   the code just deployed; `start` alone would silently do nothing if the
   service was already active. Safe and idempotent either way — if the
   service was not already running, this starts it fresh.
3. A short, bounded `systemctl is-active` retry loop confirms the service
   actually came back up. If it did not (crash-looping on the new code, a
   port conflict, etc.), `install.sh` exits non-zero and prints the
   `systemctl status`/`journalctl` commands to investigate — a failed
   restart is never silently swallowed.

This does not change the timer's cadence, does not add a second
publication service, and does not touch `botm-unattended.service`/`.timer`'s
own deliberately-manual enable step described below.

**`--skip-publication-restart` (`BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01`):**
an explicit, operator-controlled flag that skips all three steps above
entirely — `install.sh` still clones/fetches, reconciles the working tree,
checks out the exact `--ref`, runs `npm ci`, installs/reloads all three
systemd unit files, and fixes ownership; only the
`botm-publication.service` enable/restart/health-check is skipped, leaving
that live, already-running process completely undisturbed. This is never
inferred from `--ref`, a branch name, or any other heuristic — omitting
the flag reproduces the exact prior unconditional-restart behaviour. See
"Approved-candidate deployment trials" above for the one supported use:
a bounded `APPROVED_CANDIDATE` + `DEPLOY_ONLY` runtime trial.

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
