# BeatMapped City Worker — DigitalOcean Deployment Readiness

Reviewed: 2026-08-29
Tasks: `BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01`,
`BEATMAPPED-GENERIC-PER-SOURCE-ACQUISITION-BRIDGE-01`,
`BEATMAPPED-UNATTENDED-CITY-WORKER-REAL-INTEGRATION-01`

This package integrates the generic execution/control layer
(`docs/UNATTENDED_CITY_WORKER.md`) with this repository's real,
already-existing per-source acquisition engine
(`ingestion/programme-acquisition/source-execution.mjs`) on the current
collector line, and bounded-proves the result against 5 real, already-
governed sources (see "Bounded real-source proof" in
`docs/UNATTENDED_CITY_WORKER.md`). **Nothing here is deployed, installed,
or started.** This file states precisely what deploying it safely to the
existing BeatMapped DigitalOcean environment would still require.

## What already exists (read this first)

This repository already documents and designs a real DigitalOcean
deployment for a **single-city, twice-daily, oneshot** collector
(`deploy/README.md`, `deploy/install.sh`,
`deploy/systemd/botm-unattended.service` + `.timer`) and a small
**long-running** read-only publication endpoint
(`deploy/systemd/botm-publication.service`). This package's
`deploy/systemd/beatmapped-city-worker.service` is a THIRD, independent
sibling unit, not a replacement for either — it runs the generic,
queue-draining, multi-city worker
(`ingestion/city-worker/worker-loop-main.mjs`) alongside (never instead
of) the existing single-city timer, until an explicit, later decision is
made to migrate the existing Lisbon+Porto schedule onto this queue
instead. This package does not make that decision.

## What this package closed (previously open, now resolved)

The two prior packages' own "still required" list is now done, on this
branch:

1. ~~Merge `ingestion/city-worker/` with the collector line's
   `package.json`/`.gitignore`/`deploy/`~~ — done. `package.json` gained
   `"city-worker"`/`"city-worker:daemon"` scripts (merged into the real,
   full `package.json`, not substituted for it); `.gitignore` needed no
   change (`/runtime/` was already ignored by the existing single-city
   package).
2. ~~Write the real `resolveSourceTasks(job)` resolver~~ — done:
   `ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs`,
   wired to `acquireSource()` +
   `mapAcquisitionResultToCheckpoint()`, bounded-proven live against 5
   real `sources/berlin.json` entries.

## SUPERSEDED — read this before the checklist below

`BEATMAPPED-MAINLINE-CITY-WORKER-SYSTEMD-OWNERSHIP-01` and
`BEATMAPPED-MAINLINE-CITY-JOB-OPERATOR-CONTROL-01` closed this checklist.
The sanctioned path is now entirely through GitHub Actions, and **routine
interactive SSH to production is prohibited** — the manual commands below
are retained only as a description of what those Actions do on the host,
never as instructions to run by hand.

- **Step 1 (install the unit) is now owned by normal deployment.**
  `deploy/install.sh` installs and reconciles
  `beatmapped-city-worker.service` on every deploy — present, not
  running, not enabled — and `Deploy BeatMapped Collector` verifies that
  read-only. See `deploy/README.md`, "City-worker unit ownership".
- **Steps 2–3 (start the worker, enqueue a city) are now one operator
  Action**: `Enqueue BeatMapped City Job`, whose only input is a governed
  estate key. Progress is read via `Check BeatMapped City Jobs`. See
  `docs/UNATTENDED_CITY_WORKER.md`, "Operator controls".
- **Step 4 is WITHDRAWN. Do not `systemctl enable` this unit.** The
  requirement that the city worker is never enabled for boot is now
  absolute and enforced: `install.sh` never enables it, the deployment
  Action fails closed on `enabled`/`enabled-runtime`, and so does the
  operator control. Acquiring a city is always a deliberate operator act,
  never something a reboot resumes on its own. The reboot-resilience
  concern the original step 4 was reaching for is instead answered by the
  job model itself — a job's state and per-source checkpoints are durable
  on disk, so a job interrupted by a reboot is resumed, under its
  original job id, by the next operator wake.

## Exact steps a later deployment package would still need (HISTORICAL — see "SUPERSEDED" above)

1. **Install the new systemd unit alongside the existing two**: copy
   `deploy/systemd/beatmapped-city-worker.service` to
   `/etc/systemd/system/`, `systemctl daemon-reload`. Its
   `BEATMAPPED_CITY_WORKER_RESOLVER` already points at the real resolver
   by default in the shipped unit file.
2. **Prove one manual run** before enabling anything persistently:
   ```bash
   sudo systemctl start beatmapped-city-worker.service
   systemctl status beatmapped-city-worker.service   # must show active (running), not failed
   journalctl -u beatmapped-city-worker.service -n 100 --no-pager
   ```
3. **Enqueue exactly one real city job** via the operator CLI and confirm
   it reaches `COMPLETE` or `COMPLETE_WITH_RESIDUE` (never leave a job
   queued against a service that has not yet been proven to drain it):
   ```bash
   node ingestion/city-worker/cli.mjs enqueue-city DE Berlin <estate-ref-json-path>
   node ingestion/city-worker/cli.mjs show-job <job-id>
   ```
   An `<estate-ref-json-path>` is a small JSON file of the shape
   `{ "registry": "sources/<city>.json", "source_ids": [...] }` — see
   `fixtures/city-worker/real-estates/berlin-sample-01.json` for the
   exact one this package's own bounded proof used, and
   `docs/UNATTENDED_CITY_WORKER.md`'s "Current-line job estate format"
   for the full contract.
4. **Only after step 3 succeeds**, enable the service for reboot
   resilience: `systemctl enable --now beatmapped-city-worker.service`.
5. Confirm the same "publication gap" already documented for the
   existing single-city package (`deploy/README.md`, "The publication
   gap") still applies here too: this worker's job/checkpoint state
   lives on the droplet's local disk under `runtime/` only — this
   package deliberately does not connect city-job completion to
   publication (see this package's own brief, "No publication yet").
   Making any of this reach the live public site is a genuinely separate,
   later, explicitly-scoped package.
6. Decide (separately, later, explicitly) whether the existing
   `botm-unattended.timer`/`.service` for Lisbon+Porto should keep running
   independently, or be retired in favour of enqueueing Lisbon+Porto as a
   city job on this same worker. This package takes no position on that.
7. Once a real production estate (a full city, not this package's
   bounded 5-source proof) is ready to run unattended, confirm the
   per-host/rate-limiting posture is adequate for that estate's real
   size — this package's own bounded proof exercised 5 sources with
   default concurrency=1; a full city's sequencing/host-throttling
   posture at the collector-engine level
   (`ingestion/programme-acquisition/city-batch.mjs`'s own `perHost`) is
   unchanged by this package and should be reviewed against the specific
   estate's own host diversity before a first full unattended run.

## What this package deliberately did NOT do

- SSH to any real server.
- Modify any DigitalOcean resource.
- Install any systemd service.
- Deploy any code.
- Start a persistent production worker.
- Change any firewall rule.
- Modify publication, Vercel, or the live website.
- Touch `work/beatmapped-london-autonomous-pass-01` or its worktree.
- Run the full London (or any full city) estate.
- Merge this branch, or worker candidate `8411a8d`, anywhere.
