# Unattended City Worker

Reviewed: 2026-08-29
Tasks: `BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01` (candidate
`8411a8d`), `BEATMAPPED-GENERIC-PER-SOURCE-ACQUISITION-BRIDGE-01`
(candidate `f1d6eb0`), `BEATMAPPED-UNATTENDED-CITY-WORKER-REAL-
INTEGRATION-01` (this package)

This is the first package proving the full unattended architecture end
to end, on the current collector line:

```text
CITY JOB -> DURABLE QUEUE -> REAL SOURCE TASK -> acquireSource()
  -> EXISTING COLLECTOR / NORMALIZATION / PROOF
  -> mapAcquisitionResultToCheckpoint() -> DURABLE SOURCE CHECKPOINT
  -> NEXT SOURCE -> CRASH -> RESTART -> SKIP COMPLETED SOURCES
  -> CONTINUE INCOMPLETE SOURCES -> COMPLETE / COMPLETE_WITH_RESIDUE
```

**Nothing here is deployed.** See `deploy/README-CITY-WORKER.md` for
exactly what a first DigitalOcean trial would still require.

## Topology (why this is a genuinely separate branch)

- `work/beatmapped-unattended-city-worker-foundation-01` (candidate
  `8411a8d`) was built from `botm-foundation-01` (81eb817) — an ancient,
  isolated base predating essentially all real ingestion code — so it
  proved worker semantics only against synthetic adapters.
- `work/beatmapped-generic-per-source-acquisition-bridge-01` (candidate
  `f1d6eb0`) was built from the current London collector-line HEAD
  (`work/beatmapped-london-autonomous-pass-01`'s `7c2bfa4`) and exposed
  the real single-source execution boundary
  (`ingestion/programme-acquisition/source-execution.mjs`'s
  `acquireSource()`).
- This package (`work/beatmapped-unattended-city-worker-real-
  integration-01`) branches from `f1d6eb0` — the current, real,
  modern-line collector code — and PORTS the worker's own
  `ingestion/city-worker/` tree onto it, reconciling (not blindly
  merging) every place the old foundation's assumptions no longer apply.
  `8411a8d` itself was never altered and is not merged anywhere.

## How `8411a8d` was reconciled (not blindly merged)

`8411a8d`'s entire diff against its own base (81eb817) was inspected file
by file:

- **`package.json` / `.gitignore`**: these were entirely NEW files on
  the ancient base (it had none). On this branch, both already exist as
  full, real files — `package.json` gained the two missing scripts
  (`"city-worker"`, `"city-worker:daemon"`) merged into its existing
  `scripts` block; `.gitignore` needed no change at all (`/runtime/` was
  already ignored by the existing single-city unattended package).
  Bringing either file over wholesale would have discarded this
  repository's real dependencies, real npm scripts, and real ignore
  rules — not done.
- **`ingestion/city-worker/*.mjs`**: ported largely unchanged — this
  code was already self-contained and made no assumption that depended
  on the ancient base being empty.
- **`ingestion/city-worker/retry.mjs`**: DROPPED. It was a deliberate,
  documented duplicate of `ingestion/unattended-runner/retry.mjs`'s
  pattern, written only because that real module did not exist on
  `8411a8d`'s own base. On this branch it does exist — `runner.mjs` now
  imports `withRetries`/`DEFAULT_MAX_ATTEMPTS`/`DEFAULT_RETRY_DELAY_MS`
  from `../unattended-runner/retry.mjs` directly. One fewer duplicate
  retry implementation in the repository.
- **`ingestion/city-worker/runner.mjs`**: ported with ONE deliberate,
  additive change — a third non-throwing `SourceTask` outcome kind,
  `FAILED` — see "One retry owner" below. `ingestion/city-worker/job.mjs`
  gained one deliberate additive change — a `PROGRAMME_EMPTY` residue
  reason — see "PROGRAMME_EMPTY decision" below. Neither change touches
  `8411a8d`; both are new, tested behaviour on this branch only.
- **`deploy/`**: `beatmapped-city-worker.service` and
  `README-CITY-WORKER.md` ported and rewritten to reference the real
  resolver and this repository's real sibling systemd units
  (`botm-unattended.service`/`.timer`, `botm-publication.service`) —
  neither existed to reference on the ancient base.
- **`docs/UNATTENDED_CITY_WORKER.md`** (this file): substantially
  rewritten — the ancient version's "existing execution architecture
  found" section was written from a read-only audit of another branch it
  could not actually import from; this version describes the real,
  present, integrated architecture.

## Real `resolveSourceTasks` / `SourceTask` adapter

`ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs` is
the one piece both prior packages identified as missing. For each
governed source in a job's estate:

```js
run: async () => {
  const result = await acquireSource(source, { fetchDocument });          // real collector routing/normalization/proof
  const checkpoint = mapAcquisitionResultToCheckpoint(result);           // real, tested compatibility contract
  return toSourceTaskOutcome(checkpoint);                                // {outcome: "SUCCESS"|"RESIDUE"|"FAILED", ...detail}
}
```

No acquisition logic is duplicated — `acquireSource()` and
`mapAcquisitionResultToCheckpoint()` are imported unchanged from
`ingestion/programme-acquisition/`. The only new code in this file is
plumbing: reading a durable estate reference, mapping a registry entry's
field names, and reshaping this repository's existing
`ingestion/http/fetch.mjs`'s `fetchText()` into the `fetchDocument`
contract `acquireSource()` expects.

## One retry owner

**Mandatory architectural rule, now enforced, not just documented.**
`acquireSource()` already owns a complete, bounded retry policy — by the
time it returns ANY result, that budget is exhausted. The adapter above
therefore never throws for an ordinary acquisition outcome; every
`mapAcquisitionResultToCheckpoint()` result — including a mapped
`FAILED` — is passed straight through as a non-throwing `SourceTask`
outcome.

This required one small, additive change to `runner.mjs`'s
`processSourceTask()`: a `SourceTask.run()` that RETURNS `{outcome:
"FAILED", ...}` (never throws) is now recorded on the FIRST call, with
no outer retry — exactly like the pre-existing `RESIDUE` handling. Only
a genuinely THROWN exception is still subject to this runner's own,
separate, orthogonal outer retry policy (reserved for a real,
unexpected runtime bug — never for an already-terminal acquisition
result). See `tests/city-worker/one-retry-owner.test.mjs` for four
explicit tests proving this distinction, and the real bounded proof
below for live evidence: a real source's checkpoint recorded
`attempts: 1` (worker-level — one call) alongside `retry_count: 2`
(the collector engine's own, already-exhausted internal retry count) —
never conflated, never doubled.

## PROGRAMME_EMPTY decision

**Decision: (B) — added the smallest project-consistent residue state,
rather than continuing to overload an existing one.**

The bridge package's `worker-checkpoint-mapping.mjs` mapped
`PROGRAMME_EMPTY` (a supported, already-identified programme surface
with genuinely no current listings) to the worker's existing
`SOURCE_UNRESOLVED` residue reason, as the closest available category,
and flagged this as a compatibility gap. Auditing the vocabulary: the
two cases are structurally different in a way an operator triaging
residue genuinely cares about — "this source is healthy but quiet right
now" (`PROGRAMME_EMPTY`) versus "this source's discovery/identification
is broken" (`SOURCE_UNRESOLVED`) — and conflating them would hide a
useful signal. `job.mjs`'s `RESIDUE_REASONS` gained one new, frozen
entry, `PROGRAMME_EMPTY`; `worker-checkpoint-mapping.mjs`'s mapping table
now maps it directly (no more overload). This is deterministic
(a pure lookup table entry) and tested
(`tests/worker-checkpoint-mapping.test.mjs`).

## Current-line job estate format

A job's `estate_ref` names a small, durable JSON file (never a live
collector implementation, never an in-memory closure):

```json
{ "registry": "sources/<city>.json", "source_ids": ["<id-1>", "<id-2>", ...] }
```

`registry` points at one of this repository's OWN existing, canonical,
already-durable source registries (`docs/SOURCE_REGISTRY.md`) — read-only,
never mutated by this worker. `source_ids` selects which of that
registry's already-ACTIVE entries this job covers. Durable identity is
carried at every layer:

- **country / city/area**: plain fields on the job record (`job.mjs`),
  descriptive metadata only — never a branch the runner or resolver
  takes (proven by `tests/city-worker/runner.test.mjs`'s item H and this
  package's own real proof using a real `country`/`city` pair).
- **estate/reference**: `job.estate_ref`, the path above.
- **source identity/fingerprint**: `source_id` (the registry's own
  `id`) plus, once acquired, `acquireSource()`'s own
  `fingerprint`/`collector` fields, retained in every checkpoint.
- **job/run identity**: `job.job_id`, generated once at enqueue time.
- **runner SHA/configuration**: `job.runner_version_sha`
  (`ingestion/city-worker/version.mjs`'s `resolveRunnerVersionSha()` —
  real `git rev-parse HEAD` in production) and `job.configuration`.

On restart, `resolveSourceTasks(job)` re-reads both the estate file and
the registry file fresh from disk every single call — nothing about
source-task reconstruction depends on what a previous process held in
memory (proven directly by
`tests/city-worker/programme-acquisition-resolver.test.mjs`'s item 11).

## Bounded real-source proof

**5 real, currently-ACTIVE, already-governed `sources/berlin.json`
entries** — not the full London (or any full city) estate, no
population metrics generated:

| source_id | registry `acquisition_method` | why chosen |
|---|---|---|
| `tempodrom-berlin` | JSON_LD_EVENT | largest JSON-LD programme page found in this registry (151 records) |
| `a-trane-berlin` | JSON_LD_EVENT | a second, independent JSON-LD real-world site, different platform |
| `b-flat-berlin` | JSON_LD_EVENT | exercises this package's generic fingerprint routing against a real site the registry itself classified differently than the generic system ultimately resolved it (see result below) |
| `uber-arena-berlin` | ICS | registry-labelled ICS mechanism, to test a second mechanism family |
| `columbiahalle-berlin` | ICS | a second ICS-labelled real site |

Estate file: `fixtures/city-worker/real-estates/berlin-sample-01.json`.
Live run: `node ingestion/city-worker/cli.mjs enqueue-city DE Berlin
fixtures/city-worker/real-estates/berlin-sample-01.json` then `node
ingestion/city-worker/cli.mjs run-worker --resolver=ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs`
— genuine live HTTP requests to each source's real public website, 2026-08-29.

**Real, honest result — nothing manufactured (per this package's own
brief, section 8):**

```json
{
  "state": "COMPLETE_WITH_RESIDUE",
  "total_sources": 5, "successful_sources": 1, "residue_sources": 2, "failed_sources": 2
}
```

| source_id | checkpoint status | collector routed | detail |
|---|---|---|---|
| `b-flat-berlin` | **SUCCESS** | `STATIC_HTML_CARDS` | 10 normalized, 10 proven |
| `tempodrom-berlin` | FAILED | `JSON_LD_EVENT` | 151 normalized, 0 proven — `STABLE_IDENTITY_PROOF_FAILED` |
| `a-trane-berlin` | FAILED | `JSON_LD_EVENT` | 11 normalized, 0 proven — `STABLE_IDENTITY_PROOF_FAILED`; `retry_count: 2` internally, `attempts: 1` at the worker (see "One retry owner" above) |
| `uber-arena-berlin` | RESIDUE (`BROWSER_REQUIRED`) | `CLIENT_RENDERED_UNKNOWN` | the page is a client-rendered shell — correctly refused rather than guessed |
| `columbiahalle-berlin` | RESIDUE (`BROWSER_REQUIRED`) | `CLIENT_RENDERED_UNKNOWN` | same |

This is a genuinely valuable, honest finding, not a shortcoming of this
package: `b-flat-berlin` proves the generic engine can independently
acquire and prove a real venue never specifically coded for it. The two
`JSON_LD_EVENT` sources found real event records (151 and 11
respectively) but could not cross-prove them against a fetched detail
page within this run's bounds — a genuine collector-accuracy question
for a SEPARATE, later package, not something this execution-layer
package should fix. The two ICS-labelled sources' real public pages
render client-side — the fingerprint system correctly, safely classified
them as `BROWSER_REQUIRED` residue rather than guessing at their
content, exactly per this repository's "never guess" design philosophy.
One success, two residue, two failed — the city job still correctly
reached `COMPLETE_WITH_RESIDUE`, never `FAILED` (item J below, and this
package's own section 8 item I: one residue/failure never halted the
others).

## Crash / restart proof (the most important proof in this package)

`tests/city-worker/crash-restart-real-process.test.mjs` — a GENUINE
process-lifetime interruption, not a same-process `shouldStop()`
simulation: the real operator CLI (`node ingestion/city-worker/cli.mjs
run-worker`) is spawned as an actual child OS process against a bounded
5-source instrumented job (`concurrency=1`, deterministic per-source
delay), `SIGKILL`ed the moment durable state shows exactly 2 sources
`SUCCESS` and a 3rd `RUNNING` (attempted, never reaching its own
terminal checkpoint — the harder boundary, section 10, not merely
"between sources"), then a FRESH child process is spawned to resume.

Proven from durable state and an independent, append-only acquisition
log alone (never a same-process boolean):

- **Acquisition calls before crash**: sources 1–2 each show exactly one
  `attempt-start` + `attempt-done` log line pair; source 3 shows an
  `attempt-start` with NO matching `attempt-done`.
- **Durable checkpoint state at crash**: 2 `SUCCESS`, 1 `RUNNING`, 2
  sources never yet attempted; job state `RUNNING` (never terminal after
  a hard kill).
- **The killed child process**: confirmed terminated by `SIGKILL`
  (`signal === "SIGKILL"` on its own exit event) — not a cooperative
  stop.
- **Acquisition calls after restart** (a genuinely separate OS process,
  different PID): sources 4–5 each acquired for the first time; source
  3 safely re-attempted exactly once more; sources 1–2 NOT re-invoked —
  their log shows exactly ONE `attempt-done` each, total, across both
  processes combined.
- **Completed sources skipped**: sources 1–2's checkpoints are read as
  already-terminal by the resumed process and never re-run — proven by
  the log's own completion counts, not merely by a "resume=true" flag.
- **Final state**: `COMPLETE`, all 5 sources `SUCCESS`.

Distinction this proof makes explicit (per section 10 of this package's
own brief): the guarantee is NOT exactly-once external HTTP execution —
it is that completed terminal source work is never unnecessarily
repeated, and incomplete/uncheckpointed work is always safely
recoverable. Run 4 times consecutively with zero flakiness.

## Two-city queue proof

`tests/city-worker/worker-loop.test.mjs`'s item K (ported unchanged) —
two independent synthetic city jobs enqueued, drained sequentially by
`drainQueueOnce()` in strict enqueue order, without a process restart or
any city-specific code change. Small fixtures, per this package's own
brief (does not require two live city populations).

## Health / status

`node ingestion/city-worker/cli.mjs health` — worker liveness (lock-file
liveness, not just presence), active job (id/country/city/counts/current
source/last progress), queued/running counts. `show-job <id>` — full
per-job detail including `runner_version_sha`. Both demonstrated live
against the real Berlin proof job above. CLI/JSON only, no frontend.

## Operator CLI

`enqueue-city`, `list-jobs`, `show-job`, `resume-job`, `cancel-job`,
`run-worker`, `health` — all demonstrated live above against the real
integrated stack (enqueue → show (QUEUED) → run-worker (real network) →
show (COMPLETE_WITH_RESIDUE) → resume-job (idempotent no-op) →
cancel-job (no-op, already terminal) → list-jobs --state=...). One
additive CLI change this package made: `--root=<path>` (or env
`BEATMAPPED_CITY_WORKER_ROOT`) lets every command target an alternate
`runtime/` tree — used only by tests and isolated proof runs; every real
invocation omits it.

## Systemd readiness

See `deploy/systemd/beatmapped-city-worker.service` and
`deploy/README-CITY-WORKER.md`. Runs as the existing non-root `botm`
user, explicit `WorkingDirectory=/opt/band-on-the-map`, `Restart=
on-failure` with a floor delay, clean `SIGTERM` handling
(`worker-loop-main.mjs`'s own handler finishes the current batch before
exiting), structured journal logs, no interactive SSH required for
normal processing, exact runner SHA exposed via every job record. Not
installed.

## No publication yet

This package deliberately does not connect city-job completion to
publication — no map artifact regenerated, no Vercel/Netlify change, no
live-site change. Acquisition confidence first; publication is a
separate, later, explicitly-scoped package.

## No AI / browser workers

The two `BROWSER_REQUIRED` residue sources in the real proof above were
left as residue, exactly as designed — this package does not attempt to
resolve them. Proven structurally (no `playwright-session.mjs`/AI-SDK
import anywhere in the deterministic path — `tests/source-execution.test.mjs`)
and behaviourally (the real proof's own residue sources never blocked
`b-flat-berlin`'s success or the job's own completion).

## Remaining known limitations

- The two `STABLE_IDENTITY_PROOF_FAILED` real results above are a
  genuine collector-accuracy question (detail-page cross-proof against
  real JSON-LD programme pages) worth its own future investigation — not
  addressed here.
- Per-host throttling at real production scale (a full city, not this
  package's bounded 5-source proof) has not been re-validated against a
  large real estate's actual host diversity.
- No dashboard; CLI/JSON only (by design, per this package's own brief).
- Publication is not connected (by design, per this package's own
  brief).
