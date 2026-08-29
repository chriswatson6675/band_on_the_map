# Generic Per-Source Acquisition Bridge

Reviewed: 2026-08-29
Task: `BEATMAPPED-GENERIC-PER-SOURCE-ACQUISITION-BRIDGE-01`

This package exposes the smallest real execution boundary needed for a
future unattended city worker (branch
`work/beatmapped-unattended-city-worker-foundation-01`, candidate SHA
`8411a8d`) to drive **the existing BeatMapped collector architecture**
one governed source at a time. **Nothing is merged, deployed, or run
against the real London estate.**

## Audit: the real path for one source

`ingestion/programme-acquisition/city-batch.mjs`'s `runCityAcquisition()`
already traces exactly the path this package needed to expose:

```text
source definition (source_id, venue, website?, programme_url?)
  -> programme resolution      programme-resolver.mjs's resolveProgrammeSource()
                                 (bounded same-origin homepage navigation,
                                 only when no programme_url is already known)
  -> fingerprint/source identity  venue-discovery/programme-fingerprint.mjs's
                                 fingerprintProgrammeSurface() — hostname-free,
                                 pattern-based technical mechanism detection
  -> collector selection/routing  routeProgrammeSource() (orchestrator.mjs) —
                                 maps a detected mechanism to either a
                                 residue state or a real collector route
  -> acquisition                collectAndProve() -> collectEmbeddedStateEvents()
                                 (embedded-state/collector.mjs) or
                                 proveJsonLdEvents() (discovery.mjs), per the
                                 routed mechanism
  -> normalization               json-ld/observation-adapter.mjs's
                                 toObservations() (via the above)
  -> proof/evidence              offline-proof.mjs's proveCanonicalDetailEvents()
                                 — cross-checks detail-page evidence before
                                 any observation counts as PROVEN
  -> exact terminal outcome      one of this repository's OWN existing
                                 state names (see below) — never invented
```

Also traced and confirmed unchanged:
- **Transient retry**: `ingestion/unattended-runner/retry.mjs`'s
  `withRetries()` — 3 attempts, transient-message classifier — already
  wraps every individual fetch stage (homepage/programme/detail),
  independently.
- **Access-blocked / unsupported outcomes**: `orchestrator.mjs`'s
  `RESIDUE_BY_MECHANISM` — a fixed, hostname-free mapping from detected
  mechanism to residue state, already in place.
- **Source investigation state**: separate and untouched
  (`ingestion/source-investigation/`) — a different, human/AI-research
  workflow, not this execution path.
- **Retained/stale evidence**: every retained document (`homepage`,
  `programme`, each `detail`) is carried through in the result's own
  `evidence` array, unchanged.
- **Logging/provenance**: `started_at`/`completed_at` timestamps,
  `retry_provenance`, `fingerprint`, `candidate_routes`, `collector`,
  `collector_provenance` — all already present, all preserved.
- **Run/candidate SHA provenance**: not part of this layer at all (it is
  a job/run-level concern, owned by whatever invokes acquisition — see
  the worker's own `version.mjs` on the foundation branch) — correctly
  out of scope here.

## The exact batch-only boundary found

`runCityAcquisition()`'s own per-source logic — resolve, fetch, route,
collect, prove, return one result — was a **correct, complete, but
anonymous closure**, reachable only from inside `mapBounded()`'s
concurrency/per-host scheduling loop. No other code anywhere in the
repository could acquire one source without first constructing a
`sources` array and going through that scheduler. That is the entire
gap this package closes.

## Files changed

- **`ingestion/programme-acquisition/source-execution.mjs`** (new) — the
  extracted, named, independently callable `acquireSource(source, {
  fetchDocument, detailLimit })`. Byte-for-byte the same logic
  `city-batch.mjs` ran inline, plus one documented addition (see below).
- **`ingestion/programme-acquisition/city-batch.mjs`** (modified) —
  `runCityAcquisition()` now calls `acquireSource()` once per source
  instead of containing its own copy of that logic; `mapBounded()` keeps
  only bounded concurrency + per-host throttling, a genuine batch-level
  concern this generic interface deliberately does not own.
- **`ingestion/programme-acquisition/worker-checkpoint-mapping.mjs`**
  (new) — the pure, tested compatibility contract with worker candidate
  `8411a8d` (see below). Does not touch that branch.
- **`tests/source-execution.test.mjs`**, **`tests/worker-checkpoint-mapping.test.mjs`**
  (new) — 25 tests, all against small inline fixtures matching this
  repository's own existing convention for this module family
  (`tests/city-batch.test.mjs`, `tests/programme-orchestrator.test.mjs`).

**One small, deliberate behavioural addition**: every `acquireSource()`
result now always carries `retry_provenance` (an array, possibly empty).
The pre-extraction inline version omitted this field on two early-return
branches (no `programme_url`/no `website` at all; programme-discovery
came back unresolved) — an oversight, not a deliberate design choice,
since `retry_count` was already computed uniformly across every branch
either way. `retry_count`'s own computation moved from `city-batch.mjs`'s
post-map fixup into `acquireSource()` itself (the same arithmetic,
applied in the same place its own inputs now live) — no result's
`retry_count` value changes.

## Generic single-source interface

```js
import { acquireSource } from "ingestion/programme-acquisition/source-execution.mjs";

const result = await acquireSource(
  { source_id, venue, website, programme_url },
  { fetchDocument, detailLimit },
);
```

- **Geography-neutral**: never branches on `venue`/`source_id`'s value —
  proven by test items 1 and 6 (identical fixture through two different
  "venues" yields identical routing/state) and item 12 (a literal
  source-scan: no London/Berlin/Paris/Lisbon/Porto/Barcelona/Manchester/
  Liverpool string anywhere in this file or its city-batch/worker-mapping
  siblings).
- **Collector-family-neutral**: routing is entirely a function of the
  retained document's own fingerprint (`routeProgrammeSource()`), never a
  per-source special case.
- **Deterministic only**: no AI, no browser automation — proven by a
  scan of every import specifier in the whole call chain (test item 7/8).
  The one import from `ingestion/browser-resolution/` (via
  `embedded-state/collector.mjs`) is `classify.mjs`'s
  `extractEmbeddedState()` — pure text/JSON structural inspection, no
  network, no Playwright; that directory's actual browser-driving module
  (`playwright-session.mjs`) is never reached from this path.
- **Reusable by current city runners**: `city-batch.mjs` now calls it
  directly (the representative batch-runner integration this package's
  brief asked for).
- **Reusable later by `ingestion/city-worker`**: see the compatibility
  contract below.
- **Safe to call independently, source A then source B then source C**:
  proven by test items 5 and 10 — no shared mutable state across calls,
  and a single call never fetches anything beyond the one source given.

## Terminal result contract

This repository's **own, already-existing** terminal-state vocabulary —
nothing invented:

| State | Meaning |
|---|---|
| `ACQUISITION_PROVEN` | success — this repo's own equivalent of "SUCCESS" |
| `NETWORK_FAILURE` | a fetch exhausted its retry budget or hit a non-transient network error |
| `PROGRAMME_SOURCE_UNRESOLVED` | no programme could be identified at all |
| `ACCESS_BLOCKED` | fingerprinted as access-limited (401/403/429) |
| `BROWSER_REQUIRED` | client-rendered surface with no resolved public data path |
| `SOCIAL_FIRST_PROGRAMME` | official programme is social-first |
| `IMAGE_OR_POSTER_ONLY` | programme exists only as an image/poster link |
| `SOURCE_FINGERPRINT_UNSUPPORTED` | detected mechanism has no collector route at all |
| `STABLE_IDENTITY_PROOF_FAILED` | a supported collector ran but nothing could be proven against detail evidence |
| `SUPPORTED_COLLECTOR_NO_VALID_EVENTS` | a supported collector ran and found no event-like records at all |

Every result also carries `residue` (`true` for every state except
`ACQUISITION_PROVEN`), `evidence` (every retained document, unabridged),
`fingerprint`/`candidate_routes`/`collector`, `retry_provenance`/
`retry_count`, and `started_at`/`completed_at`. No unhandled source-level
failure ever terminates a batch — every branch returns, none throws
(the one exception being a genuine programming error: a missing
`source.source_id` or `fetchDocument`, which throws synchronously before
any work begins, matching this repository's existing convention for
required-argument validation).

## Existing semantics preserved

Verified directly: `tests/city-batch.test.mjs` (untouched, still passing)
and this package's own equivalent test in `tests/source-execution.test.mjs`
(item 9) both assert the exact same three-source scenario produces the
exact same three states before and after this extraction. The full
repository test suite — 2163 tests before this package, 2188 after (the
25 this package adds) — passes with zero regressions.

## Representative batch-runner integration

`ingestion/programme-acquisition/city-batch.mjs`'s `runCityAcquisition()`
is the one integration this package performs, per its own brief ("one
representative integration is sufficient"). The older, bespoke per-city
scripts (`ingestion/berlin/run.mjs`, `ingestion/paris/run.mjs`,
`ingestion/lisbon-porto/run.mjs`, `ingestion/barcelona/run.mjs`) use a
structurally different, older architecture (hardcoded per-venue collector
imports, no programme-fingerprint routing at all) and were **not**
touched — rewiring them is a separate, later decision, not attempted
here.

## Small real-source proof

`tests/source-execution.test.mjs` proves items A–G of this package's own
brief against small, inline, `*.example` fixtures — a JSON-LD source
(the same fixture shape `tests/city-batch.test.mjs` and
`tests/programme-orchestrator.test.mjs` already use), an embedded
Next.js-state source, and a deliberately unreachable one. The real
London/Berlin/Paris estate was never run through this branch; no
population metrics were generated.

## Failure isolation proof

Test item 5: a source whose fetch throws is returned as a structured
`NETWORK_FAILURE` result; an independent, subsequent `acquireSource()`
call for a different source succeeds normally — no shared state, no
poisoning. Test item 9 additionally confirms this at the batch level
(unchanged from the pre-extraction behaviour): one unresolved/unreachable
source in a batch never prevents the others from completing.

## Compatibility contract with worker candidate 8411a8d

`ingestion/programme-acquisition/worker-checkpoint-mapping.mjs`'s
`mapAcquisitionResultToCheckpoint(result)` — a pure function, fully
tested (`tests/worker-checkpoint-mapping.test.mjs`), mapping every one of
this repository's own terminal states above to the `{ status, attempts,
startedAt, completedAt, ...detail }` shape worker candidate 8411a8d's
`checkpoint-store.mjs`'s `recordSourceResult()` expects:

- `ACQUISITION_PROVEN` → `SUCCESS`
- `ACCESS_BLOCKED` / `BROWSER_REQUIRED` / `SOCIAL_FIRST_PROGRAMME` /
  `IMAGE_OR_POSTER_ONLY` / `SOURCE_FINGERPRINT_UNSUPPORTED` /
  `PROGRAMME_SOURCE_UNRESOLVED` / `PROGRAMME_EMPTY` → `RESIDUE`, with a
  `residue_reason` drawn from the worker's own existing
  `RESIDUE_REASONS` vocabulary
- `NETWORK_FAILURE` / `STABLE_IDENTITY_PROOF_FAILED` /
  `SUPPORTED_COLLECTOR_NO_VALID_EVENTS` → `FAILED`

## Changes worker candidate 8411a8d will require during later integration

Documented, not made (this package does not touch that branch):

1. **`PROGRAMME_EMPTY` has no exact `RESIDUE_REASONS` equivalent** on the
   worker branch. Mapped here to `SOURCE_UNRESOLVED` as the closest
   existing category; if this state proves common in real integration,
   the worker's `job.mjs` should gain a dedicated `PROGRAMME_EMPTY` entry
   rather than keep overloading `SOURCE_UNRESOLVED`.
2. **Retry-layering**: this collector engine already retries each
   individual fetch internally (up to 3 attempts) before ever returning
   `NETWORK_FAILURE` — that budget is fully exhausted by the time a
   result reaches the worker. A real adapter built on `acquireSource()`
   must never throw to trigger the worker's own outer
   `SourceTask.run()`-retry — every outcome (including `NETWORK_FAILURE`)
   is already terminal and should map through
   `mapAcquisitionResultToCheckpoint()` on the first call, with
   `attempts` fixed at `1` (this engine's own `retry_count` is preserved
   separately, inside `detail`, never conflated with the worker's own
   attempt counter). This requires no code change to 8411a8d — only that
   a future adapter is written this way — but is worth stating explicitly
   so nobody wraps `acquireSource()` in a second, redundant outer retry
   loop at integration time.

## Exact next integration step

Write the actual `resolveSourceTasks(job)` adapter the worker foundation
documents as its own missing piece
(`docs/UNATTENDED_CITY_WORKER.md`'s "Integration dependency on the
collector branch", on the worker branch): for each of a job's sources,
call `acquireSource()`, then `mapAcquisitionResultToCheckpoint()` on its
result, and return a `SourceTask` whose `run()` resolves to that mapped
checkpoint directly (never throws) — per the retry-layering note above.
This is a small, mechanical adapter; no further extraction from the
collector engine should be required first.
