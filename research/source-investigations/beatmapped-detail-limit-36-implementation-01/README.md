# BEATMAPPED-DETAIL-LIMIT-36-IMPLEMENTATION-01 — final report

Implementation candidate only. Not merged, not deployed, not pushed. This
document is the same section-16 report returned to the calling session,
retained here as governed evidence per `docs/SOURCE_INVESTIGATION_POLICY.md`
(this package is engineering work on an already-active, already-governed
acquisition pipeline, not a new-source activation investigation — no
`investigation.json`/`probe_history` record applies; the discipline that
does apply — retained evidence, no invented facts, no scratchpad-only
findings — is followed throughout).

## Evidence files

- `evidence/validate-detail-limit-36.mjs` — the real, bounded, sequential
  live-validation script. For each of the 8 named Berlin sources it fetches
  the real configured `programme_url` once and calls the real, unmodified
  (except for the new default) `acquireSource()` with `detailLimit: 36`
  explicitly (at most 36 real detail-page GETs per source), then *derives*
  (never re-fetches) the old-limit-12 checkpoint from the same already-
  fetched detail documents via `collectAndProve()` — the identical
  "fetch once, derive every checkpoint" technique the prior bounded
  experiment package used, so this validation made zero network calls
  beyond one real production run per source at the new cap.
- `evidence/berlin-8-source-validation-results.json` — its raw output.
- `tests/detail-limit-36-implementation.test.mjs` (repo root) — 14 new
  unit tests, no live network.

---

## 1. Starting origin/main SHA

`f584c01163cb6514b1511dfe4224c773da43234f` — confirmed via `git fetch
origin && git rev-parse origin/main` at the start of this session. Matches
the brief's expected starting baseline exactly; **main had not advanced**.

## 2. Branch/worktree

`work/beatmapped-detail-limit-36-implementation-01`, in the dedicated
worktree at `.worktrees/detail-limit-36-implementation-01`, checked out
clean from `origin/main` at the SHA above. Not merged, not pushed, not
deployed. Changes left **uncommitted** for the calling session to review.

## 3. Experiment evidence preservation status

Already done by the calling session before this package began — verified,
not redone. The bounded experiment's evidence (`research/source-
investigations/beatmapped-detail-limit-coverage-experiment-01/**` +
`tests/detail-limit-coverage-experiment.test.mjs`) is committed as its own
self-contained commit, `f7262d858e9bf2322c0fb2a0080f859663c9d491`
("BOTM-DETAIL-LIMIT-COVERAGE-EXPERIMENT-01 retain bounded detailLimit
coverage-curve experiment evidence"), on its own branch
`work/beatmapped-detail-limit-coverage-experiment-01`. **Unpushed,
unmerged**, deliberately separate from this implementation branch. This
implementation branch's own diff against `origin/main` contains **none**
of that experiment evidence — confirmed via `git diff --stat origin/main
HEAD` returning empty before any of this package's own edits were made.
Experiment evidence and production limit implementation are therefore two
independently-reviewable, non-overlapping units, as the brief requires.

## 4. Exact changed paths

Production code (2 files):
- `ingestion/programme-acquisition/source-execution.mjs` — added and
  exported `DEFAULT_DETAIL_LIMIT = 36`; changed `acquireSource()`'s default
  parameter from `detailLimit = 12` to `detailLimit = DEFAULT_DETAIL_LIMIT`.
- `ingestion/programme-acquisition/city-batch.mjs` — imports
  `DEFAULT_DETAIL_LIMIT` from `source-execution.mjs`; changed
  `runCityAcquisition()`'s default parameter from `detailLimit = 12` to
  `detailLimit = DEFAULT_DETAIL_LIMIT`.

`git diff --stat` (production files only):
```
ingestion/programme-acquisition/city-batch.mjs       |  6 +++---
ingestion/programme-acquisition/source-execution.mjs | 19 ++++++++++++++++++-
2 files changed, 21 insertions(+), 4 deletions(-)
```

New test file: `tests/detail-limit-36-implementation.test.mjs` (14 tests).

New evidence directory: `research/source-investigations/beatmapped-detail-
limit-36-implementation-01/**` (this README + `evidence/`).

**Confirmed unchanged** (`git diff --stat origin/main -- <path>` returns
empty for both):
- `ingestion/programme-acquisition/orchestrator.mjs`
- `ingestion/programme-acquisition/offline-proof.mjs`

`ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs` was
read but not edited (see architecture below — it is a pure passthrough
with nothing to duplicate).

## 5. Previous limit architecture

Read directly from the pre-change files (not merely trusted from prior
orientation):

- `source-execution.mjs:109` — `acquireSource(source, { fetchDocument,
  detailLimit = 12 } = {})` was the **one canonical place** `detailLimit`
  had a default AND was actually used: it flowed straight into
  `discoverDetailCandidates(programme, { limit: detailLimit })` at line
  197.
- `city-batch.mjs:37` — `runCityAcquisition({ sources, fetchDocument,
  concurrency = 4, perHost = 1, detailLimit = 12 } = {})` declared its
  **own independent default of 12**, used only to pass through explicitly
  into `acquireSource(source, { fetchDocument, detailLimit })` at line 40.
  This was a genuine **duplicated default** (two separately-hardcoded `12`
  literals), not "one default plus one override" — calling
  `runCityAcquisition` with no `detailLimit` passed an *explicit* `12`
  into `acquireSource`, which only coincidentally matched
  `acquireSource`'s own default; the two literals could have silently
  drifted apart if only one were ever edited.
- `ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs:74`
  — `resolveSourceTasks(job, { root, detailLimit, fetchDocument =
  defaultFetchDocument } = {})` has **no independent default at all** —
  `detailLimit` is a plain destructured parameter passed straight through
  to `acquireSource(source, { fetchDocument, detailLimit })` at line 88.
  Called without one, `detailLimit` is `undefined` and `acquireSource`'s
  own default parameter fires correctly. This file needed no change.

## 6. Implemented limit architecture

Single shared, narrowly-scoped named constant, exported from the file that
actually canonically *uses* the value:

```js
// source-execution.mjs
export const DEFAULT_DETAIL_LIMIT = 36;
export async function acquireSource(source, { fetchDocument, detailLimit = DEFAULT_DETAIL_LIMIT } = {}) { ... }

// city-batch.mjs
import { acquireSource, DEFAULT_DETAIL_LIMIT } from "./source-execution.mjs";
export async function runCityAcquisition({ ..., detailLimit = DEFAULT_DETAIL_LIMIT } = {}) { ... }
```

**Why this approach over keeping two synced literals:** the two 12s were
already a real, evidenced duplication (see §5) — not "one default plus one
override" — so synchronizing them as two literals would have preserved
exactly the drift risk the brief asked to investigate. Importing one
constant from the file that actually uses the value removes that risk
entirely with a minimal, narrowly-scoped change (one new export, two
call-site edits), does not touch `programme-acquisition-resolver.mjs`
(which needs no default), and does not introduce any new configuration
mechanism, env var, or config file — satisfying §5's explicit ban on a
broader configuration refactor. `resolveSourceTasks()` was deliberately
left as a plain passthrough (no default) since it never needed one.

## 7. Old production limit

`12` (both `source-execution.mjs`'s `acquireSource()` default and
`city-batch.mjs`'s `runCityAcquisition()` default).

## 8. New candidate production limit

`36` (`DEFAULT_DETAIL_LIMIT`, defined once in `source-execution.mjs`,
imported by `city-batch.mjs`).

## 9. Confirmation hard cap = 36

Confirmed both structurally and by live/synthetic test:
- `discoverDetailCandidates(programme, { limit })` (unchanged,
  `orchestrator.mjs`) always ends in `uniqueLinks(recordCandidates,
  linkCandidates).slice(0, limit)` — a hard slice, not a soft target.
- `acquireSource()`'s detail-fetch loop iterates exactly the array
  `discoverDetailCandidates()` returns — one fetch attempt per candidate,
  never more, regardless of retries (each candidate's `withRetries()` call
  produces exactly one entry in `details`, success or failure).
- New test `tests/detail-limit-36-implementation.test.mjs`: "(b) HARD CAP"
  tests prove exactly 36 detail fetches with 60 and 200 available
  candidates; that overlapping duplicate candidate classes (normalized-
  record + raw anchor links to the same 50 URLs) still cap at exactly 36
  distinct URLs; and that retry attempts on one flaky candidate never add
  an extra candidate slot beyond 36 distinct URLs.
- Live validation: all 8 Berlin sources' `detail_fetch_attempts` in
  `evidence/berlin-8-source-validation-results.json` are `<= 36`
  (`detail_fetch_attempts_hard_cap_respected: true` on every row).

## 10. Confirmation first 12 ordering unchanged

Confirmed structurally: `discoverDetailCandidates()`'s two link-extraction
helpers (`extractProgrammeLinks()` in `discovery.mjs`, and
`discoverEmbeddedStateDetailLinks()` in `embedded-state/collector.mjs`)
both stop scanning early via a simple in-order `if (links.length >= limit)
break;` — raising `limit` never reorders already-found links, it only lets
the same in-order scan run longer. `deterministicRecordCandidates()`'s own
sort is computed once over the full pool and is independent of `limit`.

Confirmed empirically by new tests: "(d) DETERMINISM" in
`tests/detail-limit-36-implementation.test.mjs` calls
`discoverDetailCandidates(programme, {limit:12})` and `{limit:36}` against
the identical 60-event fixture and asserts the first 12 URLs of the
36-result are identical, in order, to the full 12-result.

**One genuine, pre-existing nuance surfaced by this testing** (not caused
by this package, and not fixed here since `orchestrator.mjs` is out of
scope): `uniqueLinks()`'s `Map`-based dedup keeps a URL's first-seen
*position* but its *last-seen* metadata `role` value. Because
`discoverEmbeddedStateDetailLinks()`/`extractProgrammeLinks()` are
themselves bounded by the same `limit`, a URL that legitimately appears in
both the normalized-record tier and the raw-link tier can have its `role`
label (`NORMALIZED_RECORD_EVENT_URL_CANDIDATE` vs.
`EMBEDDED_STATE_EVENT_DETAIL_CANDIDATE`) differ between `limit:12` and
`limit:36` — **the URL and its ordinal position never change**, only this
internal bookkeeping label can. `acquireSource()` only ever consumes
`link.url` when fetching (see its detail-fetch loop), so this has zero
effect on what gets fetched, in what order, on proof, or on any observable
production behaviour. Documented in the test file at the point it was
discovered; not filed as a defect since it pre-dates this package and
changing it would require editing `orchestrator.mjs`, which §8/§13 of the
brief and this package's own scope forbid.

## 11. Confirmation no adaptive behaviour added

`acquireSource()` and `runCityAcquisition()` still take `detailLimit` as a
single plain numeric default parameter — no source-size check, no
proof-success loop, no per-`source_id`/`venue` branch, no percentage or
dynamic computation exists anywhere in either changed file. New test "(e)
no adaptive/source-aware/percentage/per-source-override detail-limit logic
exists in the changed files" scans both files for forbidden fragments
(`source_id ===`, `percentageLimit`, `while (proof`, etc.) and asserts
none are present. A separate test confirms an explicit `detailLimit`
override still works exactly as before (proving no new mandatory adaptive
parameter was introduced).

## 12. Confirmation candidate-selection algorithm unchanged

`git diff --stat origin/main -- ingestion/programme-acquisition/
orchestrator.mjs` is empty — the file is byte-identical to `origin/main`.
`discoverDetailCandidates()`, `deterministicRecordCandidates()`,
`deriveProgrammeLevelEventRecords()`, `routeProgrammeSource()`, and
`collectAndProve()` (PR #31's already-integrated candidate-selection
algorithm) are completely untouched.

## 13. Confirmation proof engine unchanged

`git diff --stat origin/main -- ingestion/programme-acquisition/
offline-proof.mjs` is empty. `SOURCE_PUBLISHED_CANONICAL_EVENT_URL`,
`SOURCE_PUBLISHED_SELF_REFERENTIAL_EVENT_URL`, proof-date parsing, cutoff
semantics, collision policy, and dedupe semantics are all byte-identical
to `origin/main`. Every additional document fetched at the new limit
passes through the exact same, unmodified `collectAndProve()` →
`proveCanonicalDetailEvents()` chain as before. The full existing
`tests/offline-proof.test.mjs` and
`tests/self-referential-event-url-identity.test.mjs` suites (63 tests
combined) still pass unchanged.

## 14. Maximum per-source fetch increase

Old maximum: 12 detail-page fetch attempts/source.
New maximum: 36 detail-page fetch attempts/source.
Maximum increase: **+24 attempts/source**, a **3x** previous cap.
(Programme-document and homepage-discovery fetches, when needed, are
unaffected — this change only bounds the *detail*-page fetch budget.)

## 15. Theoretical 38-source Berlin worst-case fetch change

Theoretical worst case (every one of 38 sources having >=36 safe
candidates, which is not the measured reality — see §16-23):
- Old: 38 x 12 = 456 detail-page fetch attempts.
- New: 38 x 36 = 1,368 detail-page fetch attempts.
- Increase: **+912 detail-page fetch attempts**, a 3x multiplier — the
  same 3x per-source ratio as §14, simply scaled across the estate.

This is a **theoretical ceiling**, not an expected value: any source with
fewer than 36 safe candidates exhausts its own candidate pool earlier and
fetches only what exists (proven directly in this package — see §9's
hard-cap tests and Waldbühne's own live result in §20, which fetched only
15 documents because only 15 safe candidates exist, not 36). Concurrency
(`concurrency = 4`) and per-host throttling (`perHost = 1`) in
`city-batch.mjs` are **completely unchanged** — this package alters only
the per-source fetch *count* ceiling, never scheduling, pacing, or
parallelism.

## 16-23. Targeted local validation (§11/§12 of the brief)

All 8 sources validated with real, live, sequential GETs — one
programme-document fetch plus up to 36 real detail-page fetches per
source, `detailLimit: 36` passed explicitly, no added concurrency, ~1.5s
pacing between sources. Raw results retained in `evidence/berlin-8-source-
validation-results.json`. `derived_proof_at_12` in each row was computed
from the *same* fetched evidence (zero extra network calls) by re-running
the unmodified `collectAndProve()` over just the first 12 already-fetched
detail documents — i.e. it reproduces exactly what today's `detailLimit=12`
production configuration would have proven, from real, live-fetched
documents, not a guess.

| Source | proof@12 (derived, this run) | proof@12 (prior retained experiment baseline) | proof@36 (this run, live) | proof@36 (prior experiment) | detail fetches made | state@36 |
|---|---|---|---|---|---|---|
| **16. Tempodrom** | 12 | 12 | **36** | 36 | 36 | ACQUISITION_PROVEN |
| **17. A-Trane** | 12 | 12 | **36** | 36 | 36 | ACQUISITION_PROVEN |
| **18. Konzerthaus** | 12 | 12 | **33** | 33 | 36 | ACQUISITION_PROVEN |
| **19. Privatclub** | 12 | 12 | **30** | 30 | 36 | ACQUISITION_PROVEN |
| **20. Waldbühne** | 12 | 12 | **14** | 14 | 15 (only 15 safe candidates exist — none padded) | ACQUISITION_PROVEN |
| **21. b-flat** | 8 | 8 | **27** | 27 | 36 | ACQUISITION_PROVEN |
| **22. Huxleys** | 0 | 0 | **0** | 0 | 36 | STABLE_IDENTITY_PROOF_FAILED (unchanged — 111 normalized events, none corroborated by their own detail pages; no live change) |
| **23. Radialsystem** | 0 | 0 | **0** | 0 | 36 | STABLE_IDENTITY_PROOF_FAILED (unchanged — only 2 normalized events on the live page currently; no live change) |

Every single derived proof@12 value and every proof@36 value **matches the
retained prior experiment evidence exactly**, live-fetched today
(2026-08-31) against production sites, not merely re-derived from stale
experiment documents. Konzerthaus, Privatclub, and Waldbühne's backlogs
remain fully closed (proof@36 == their entire normalized-event count) at
this new limit, exactly as the experiment predicted. Tempodrom and A-Trane
both continue proving 1:1 through all 36 fetched candidates (Tempodrom's
`normalized_event_count_at_36` is 152 and A-Trane's is 48 — both still
have a substantial unexploited backlog beyond rank 36, consistent with the
experiment's own note that Tempodrom's 1:1 conversion continued well past
rank 48; not pursued here per §7 of the brief, which explicitly excludes
adaptive/larger-than-36 behaviour from this package).

**Huxleys and Radialsystem investigation (§12 of the brief):** neither
became newly proven. Huxleys' live page currently yields 111 normalized
event records and 36 fetched detail documents, none of which pass the
proof engine's stable-identity requirement — no live change occurred that
would newly qualify it, and nothing was fixed or suppressed. Radialsystem
currently normalizes only 2 events at all (down from higher counts the
programme page may have shown in the experiment's own retained snapshot;
not a regression this package introduces, since candidate-selection and
proof are both byte-identical to `origin/main` — this reflects the live
page's own current content, not this change). Both are exactly the
"remaining known-hard sources" the brief explicitly says not to fix here.

## 24. Targeted tests

Ran `tests/detail-candidate-selection.test.mjs`,
`tests/source-execution.test.mjs`, `tests/city-batch.test.mjs`,
`tests/offline-proof.test.mjs`,
`tests/self-referential-event-url-identity.test.mjs`,
`tests/programme-acquisition-discovery.test.mjs`,
`tests/city-worker/programme-acquisition-resolver.test.mjs`, and the new
`tests/detail-limit-36-implementation.test.mjs` together: **75 passing, 0
failing**.

## 25. Full npm test count

- This branch's own clean baseline (`origin/main`, before any of this
  package's edits): **2599 passing, 0 failing** — confirmed by running
  `npm test` on the untouched worktree before making any change.
- After this package's production change (2 files) plus its own 14 new
  tests in `tests/detail-limit-36-implementation.test.mjs`: **2613
  passing, 0 failing**.
- Reconciliation: 2599 (this branch's real baseline) + 14 (this package's
  own new tests) = **2613**, exactly matching the actual final count. This
  is **not** the experiment's own previously-reported "2611" figure — that
  number included the *experiment's* 12 tests
  (`tests/detail-limit-coverage-experiment.test.mjs`), which live only on
  the separate `work/beatmapped-detail-limit-coverage-experiment-01`
  branch (commit `f7262d8`), not on this implementation branch. 2599 (this
  branch's own main-derived baseline) + 12 (experiment's tests, on the
  other branch) = 2611 is the experiment branch's own total, a different
  branch's count entirely — not double counted here, and not conflated
  with this package's 2613. Zero unexplained failures either way.

## 26. Confirmation no source-specific exception

Neither changed file references any `source_id`, `venue` name, or city
name in relation to `detailLimit` — the value is one global default,
identical for every source. (The pre-existing test
`tests/source-execution.test.mjs`'s own "12: no London/Berlin/Paris/
Lisbon/Barcelona hostname or city logic" test, unaffected by this change,
continues to pass.)

## 27. Confirmation no registry change

`sources/berlin.json` and every other `sources/*.json`/`venues/*.json`
file was only read (to confirm the 8 source shapes for validation),
never written. `git status --short` shows no modification to any registry
file.

## 28. Confirmation no deployment

No merge, no push, no DigitalOcean/Vercel change, no workflow dispatch was
performed. All changes remain uncommitted in this local worktree for the
calling session's own review.

## 29. Confirmation no production Berlin acquisition

No city job, no `runCityAcquisition()` batch run, and no worker
enqueue/dispatch was performed. Validation used direct, per-source,
sequential calls to `acquireSource()` (the single-source interface) for
exactly the 8 named sources — never a full-estate batch, never
`city-batch.mjs`'s scheduler, never `ingestion/city-worker`'s runner.

## 30. Estimated event-coverage effect if subsequently merged/deployed

Based on the retained experiment's own 8-source cohort (unchanged) and
this package's own fresh live confirmation of the same 8 sources: moving
production `detailLimit` from 12 to 36 is expected to materially increase
proven event coverage for sources whose real backlog exceeds 12 events and
is reachable within 36 fetches — concretely, on this validation cohort,
proven events rose from a combined 68 (at the old limit-12 baseline) to a
combined 176 (at the new limit-36 confirmed live today: 36+36+33+30+14+27+
0+0 = 176), holding Huxleys and Radialsystem at 0 with no fabricated proof.
This exactly reproduces the experiment's own headline cohort numbers (68 →
176, +108) using fresh live fetches rather than only the experiment's
earlier retained snapshot. Applied illustratively across a wider,
similarly-shaped estate this would suggest materially higher event
coverage without any change to what "proven" means — the underlying
per-source ceiling (Tempodrom's 152 normalized events, A-Trane's 48) shows
real remaining headroom beyond even 36 for future, separate investigation
(§7's excluded adaptive-limit territory), but that is out of this
package's scope.

## 31. Recommended next step

Merge review of this implementation candidate (2-file production diff +
14 new tests + this retained evidence) as its own, separate PR from the
experiment-evidence commit on the other branch — matching the same
two-unit separation the brief asked for in §2. No further code change is
needed to realize the measured coverage gain; deployment/enqueue is a
separate, explicitly-authorised action this package deliberately does not
take.

## 32. Whether adaptive-limit investigation should remain a later separate package

Yes. Tempodrom's own live result today (152 normalized events, 1:1 proof
conversion through all 36 fetched candidates, same pattern the experiment
observed through rank 48) is direct, fresh evidence that a bounded, global
constant leaves real headroom on at least one source. Per §7 of the brief,
any adaptive/per-source/percentage/exhaustion-based limit is explicitly
out of scope for this package and was not implemented, prototyped, or
even sketched here — it should remain its own, later, separately-governed
investigation.

---

DETAIL_LIMIT_36_IMPLEMENTATION_READY
