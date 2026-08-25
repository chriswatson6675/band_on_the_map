# Unattended Collection Runner

Reviewed: 2026-08-25
Task: `BOTM-UNATTENDED-COLLECTION-RUNNER-01`

The ONE canonical, non-interactive command that runs Band on the Map's
entire production collection-and-publication cycle safely, suitable for
invocation by a future systemd timer/service on a DigitalOcean server.
This package builds the command only — **no systemd unit, cron job,
GitHub Actions schedule, or DigitalOcean configuration is added here**;
that is a separate, later package.

```bash
npm run unattended
# or, with an explicit date window (same flags as ingest:lisbon-porto /
# publish:map-data):
npm run unattended -- --from=2026-08-24 --to=2026-12-31
```

Entry point: `ingestion/unattended-runner/run.mjs`. This is orchestration
only — every real step is the SAME already-proven production component
every other entry point already uses (`acquireLisbonPorto()`,
`buildPortugalMarkers()`, `buildPublicationArtifact()`,
`writePublicationArtifactAtomic()`). Nothing here re-implements
acquisition, Observation creation, venue resolution, display projection,
or publication.

## What one run does

```text
1. acquire the single-run lock (runtime/unattended-run.lock)
     -> refuse safely and exit if another run already holds it
2. acquire all 14 active Lisbon+Porto sources
     -> ingestion/lisbon-porto/run.mjs's acquireLisbonPorto(), unchanged,
        now with a bounded retry policy for transient failures
     -> each source isolated in its own try/catch, exactly as today
3. resolve venues, build display markers
     -> ingestion/venue/resolver.mjs, ingestion/map/publication.mjs,
        unchanged (includes MANUAL_OPERATOR_ENTRY coordinate precedence)
4. publish (or safely refuse to publish)
     -> ingestion/map/publish-artifact-io.mjs's writePublicationArtifactAtomic(),
        unchanged — schema-validates BEFORE ever touching disk; a
        catastrophic or invalid run leaves the previous
        data/public/lisbon-porto-map.json completely untouched
5. write a machine-readable health report (runtime/health-reports/)
6. release the lock (always — success or handled failure)
7. exit with a deterministic code (see "Exit semantics" below)
```

## Files/artifacts it produces

| Path | What | Committed to git? |
|---|---|---|
| `data/public/lisbon-porto-map.json` | the public product artifact | YES (existing file, unchanged mechanism) |
| `runtime/unattended-run.lock` | the single-run guard, held only while a run is in progress | NO — ephemeral (`.gitignore`) |
| `runtime/health-reports/<run_id>.json` | one permanent-for-that-run health report | NO — ephemeral (`.gitignore`) |
| `runtime/health-reports/latest.json` | always the most recent run's report, overwritten each run | NO — ephemeral (`.gitignore`) |

## HEALTHY / DEGRADED / FAILED

Recorded as `overall_status` in the health report — this project's
governed vocabulary for this package (`ingestion/unattended-runner/health-report.mjs`'s `determineOverallStatus()`):

- **HEALTHY** — every active source succeeded AND publication succeeded.
- **DEGRADED** — one or more sources failed (isolated, never affecting
  the others), but publication still safely completed using the valid
  data the successful sources produced. **Never reported as HEALTHY.**
- **FAILED** — publication could not safely complete at all: either a
  catastrophic run (zero successful sources, or zero resulting map
  markers — `ingestion/map/publication.mjs`'s `isCatastrophicPublicationRun()`,
  unchanged) or the built artifact failed its own schema validation. The
  previously committed public artifact is always preserved untouched in
  this case.

## Retry behaviour

A small, deterministic, bounded policy for **transient** acquisition
failures only (`ingestion/unattended-runner/retry.mjs`):

- Initial attempt + up to 2 retries (3 attempts total, `DEFAULT_MAX_ATTEMPTS`).
- Linear backoff: `retryDelayMs`, `2 × retryDelayMs` between attempts
  (default `retryDelayMs = 500`ms).
- Only retried when the failure looks transient — a message-pattern
  classifier (`isTransientError()`) matching network/timeout/5xx/429-shaped
  errors (e.g. `transport failure:`, `ECONNRESET`, `HTTP 503`). A 4xx,
  parse/validation failure, or missing-registry-entry error is **never**
  retried — it will fail identically every time, so retrying would only
  waste time.
- Opt-in at the `acquireAll()`/`acquireLisbonPorto()` level
  (`ingestion/lisbon-porto/run.mjs`) — every other existing caller
  (`npm run ingest:lisbon-porto`, `npm run onboard:venues`, `npm run
  publish:map-data`) omits the retry policy and keeps today's exact
  single-attempt behaviour, byte-for-byte unchanged.
- Per-source `attempts` is recorded in every acquisition result and
  surfaced in the health report.

## Overlap protection

A local PID lockfile (`runtime/unattended-run.lock`,
`ingestion/unattended-runner/lock.mjs`) — no Redis, database, or queue.
Exclusive file creation (`open(path, "wx")`) is atomic at the filesystem
level, so two processes racing to start can never both proceed.

- A second invocation while a live run holds the lock is refused
  immediately (`ANOTHER_RUN_IN_PROGRESS`) — the public artifact and health
  reports are never touched.
- The lock is released after every normal completion (HEALTHY or
  DEGRADED) and after every handled failure (FAILED), via a `finally`
  block.
- **Stale/crashed-run handling**: if a previous run was killed hard
  (SIGKILL, OOM, host reboot) and never reached its own `finally`, its
  lock is reclaimed automatically the next time a run starts, if EITHER
  its recorded PID is no longer alive on the host, OR it is older than
  `staleAfterMs` (default 2 hours — comfortably longer than any real
  Lisbon+Porto cycle this project has observed). A live, fresh lock is
  never overridden.

## Exit semantics

- **FAILED** → exit code **1**. A genuine problem a systemd unit should
  treat as a failed service run.
- **Refused (overlap)** → exit code **2** — deliberately distinct from
  1, so logs/monitoring never conflate "didn't run because another
  instance was active" with "ran and failed".
- **HEALTHY or DEGRADED** → exit code **0**. This is a deliberate choice:
  one isolated small venue failing must never make systemd treat the
  whole scheduled service unit as crashed. The HEALTHY/DEGRADED
  distinction is surfaced in the health report file
  (`overall_status`), for a separate, future monitoring step to read —
  never hidden, just not encoded as a process exit code.

## What a future systemd timer needs to invoke

Exactly:

```bash
cd /path/to/band_on_the_map && npm run unattended
```

No interactive input, no browser, no manual coordinate entry, no Claude,
no local GUI/VS Code, no developer intervention. A non-zero exit (1) means
the service run genuinely failed and warrants attention; exit 2 means a
prior run was already in progress (expected, benign, under a
misconfigured overlapping schedule); exit 0 covers both a fully healthy
run and a degraded-but-safely-published one — check
`runtime/health-reports/latest.json`'s `overall_status` to tell those
apart. Deployment/scheduling itself (the systemd unit/timer, DigitalOcean
provisioning) is explicitly out of scope for this package.

## Logs

Every run emits concise, `[unattended]`-prefixed lines to stdout/stderr,
safe for `journalctl`: run start, per-source failures/retries (message
only, never a full source payload), publication result, and the final
HEALTHY/DEGRADED/FAILED status line.
