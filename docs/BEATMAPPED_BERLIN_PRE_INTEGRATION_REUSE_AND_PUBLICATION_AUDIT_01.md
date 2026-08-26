# Berlin Pre-Integration Reuse & Publication Audit (BEATMAPPED-BERLIN-PRE-INTEGRATION-REUSE-AND-PUBLICATION-AUDIT-01)

A bounded, forensic pre-integration audit of
`work/berlin-30-40-venue-collector-reuse-trial-01` (candidate commit
`8ed56fe`, base `e0cfc4d`) — no new Berlin venues added, no second Berlin
population pass, no merge to `main`. This document records the corrected
findings; `sources/berlin.json`'s own `berlin_collector_classification`
field is left untouched (original governed evidence/provenance, not
overwritten) — this document is the audited correction layered on top of
it, exactly as `docs/BARCELONA_PRE_INTEGRATION_DATE_AUDIT_01.md` did for
the prior Barcelona pre-integration audit.

## 1. Why this audit exists

The Berlin trial's own report classified some venues that depend on
collector capabilities **created during the Berlin task itself**
(`ingestion/html-link-discovery/`, `ingestion/per-event-ics/`,
`ingestion/sveltekit-data/`) as `EXISTING_COLLECTOR_ZERO_CODE` /
`CONFIGURATION_ONLY` — conflating "existed before Berlin" with "reused
within Berlin". The clearest example: Verti Music Hall reuses
`ingestion/per-event-ics/`, a family built earlier in the **same** Berlin
task for Uber Arena, yet was labelled `EXISTING_COLLECTOR_ZERO_CODE` as if
that family had predated Berlin.

This audit recomputes the reuse metric mechanically against the actual
repository contents at the Berlin branch's own base commit, `e0cfc4d`
(`git ls-tree`/`git diff e0cfc4d 8ed56fe`), not from labels already stored
in `sources/berlin.json`.

## 2. What genuinely existed at `e0cfc4d`

`git diff --stat e0cfc4d 8ed56fe -- ingestion/` shows these directories are
entirely NEW (did not exist at `e0cfc4d`):

```
ingestion/ausland/            ingestion/heimathafen-neukoelln/
ingestion/badehaus/           ingestion/html-link-discovery/
ingestion/berlin/             ingestion/kunstfabrik-schlot/
ingestion/bi-nuu/             ingestion/per-event-ics/
ingestion/festsaal-kreuzberg/ ingestion/sveltekit-data/
                               ingestion/urban-spree/
                               ingestion/zenner/
```

These families existed at `e0cfc4d` and are used unchanged (0-diff)
during Berlin: `ingestion/ics/`, `ingestion/events-calendar-api/`,
`ingestion/http/`, `ingestion/rss/`.

One pre-existing family, `ingestion/json-ld/`, required a real one-line
regex fix during Berlin (`ingestion/json-ld/parse.mjs`,
`LD_JSON_SCRIPT_RE`: made the `type` attribute's quotes optional) because
Tempodrom's real page emits `<script type=application/ld+json>` with no
quotes at all — a genuine collector-implementation bug fix, not
configuration. The fix is backward compatible: every page it already
matched (quoted) still matches identically.

## 3. Audited classification (definitions)

- **PREEXISTING_ZERO_CODE** — used acquisition implementation already
  present, unmodified, at `e0cfc4d`. The strict headline metric.
- **PREEXISTING_FAMILY_WITH_FIX** — the family existed at `e0cfc4d`, but
  Berlin required a real collector-implementation bug fix/capability
  change to it.
- **BERLIN_NEW_REUSABLE_FAMILY** — depends on a reusable collector
  capability created during Berlin (even if later reused by another
  Berlin venue — that reuse is real evidence the family is genuinely
  reusable, but it is not *pre*-Berlin reuse).
- **BERLIN_BESPOKE** — a venue-specific parser/adapter introduced during
  Berlin.
- **NOT_SUCCESSFULLY_POPULATED** — onboarded but not part of the
  successful denominator in the authoritative proof run
  (`fixtures/map/berlin-30-40-venue-collector-reuse-trial-01-live-run-proof.json`,
  21 map markers).

## 4. Venue reclassification table (all 24 onboarded sources)

| Venue | Collector/family used | Existed unmodified at `e0cfc4d`? | Audited classification | Successful (of 21)? | Differs from original label? |
|---|---|---|---|---|---|
| Waldbühne | `json-ld` | Yes | PREEXISTING_ZERO_CODE | Yes | No |
| A-Trane | `json-ld` | Yes | PREEXISTING_ZERO_CODE (but proof run itself failed — see below) | **No** — proof run: `"This operation was aborted"` | No (successful-flag only) |
| Privatclub | `json-ld` | Yes | PREEXISTING_ZERO_CODE | Yes | No |
| Yaam | `events-calendar-api` | Yes (0-diff) | PREEXISTING_ZERO_CODE | Yes | No |
| Tempodrom | `json-ld` | Required a real regex fix | **PREEXISTING_FAMILY_WITH_FIX** | Yes | **Yes** — was `CONFIGURATION_ONLY`, a category that hid the fact a real fix was needed |
| Konzerthaus Berlin | `html-link-discovery` (origin) + `json-ld` | html-link-discovery is Berlin-new | BERLIN_NEW_REUSABLE_FAMILY | Yes | Taxonomy only (was `CONFIGURATION_ONLY`) |
| Lido | `html-link-discovery` (reused) + `json-ld` | Berlin-new | BERLIN_NEW_REUSABLE_FAMILY | Yes | Taxonomy only |
| b-flat | `html-link-discovery` (reused) + `json-ld` | Berlin-new | BERLIN_NEW_REUSABLE_FAMILY | Yes | Taxonomy only |
| SO36 | `html-link-discovery` (reused) + `json-ld` | Berlin-new | BERLIN_NEW_REUSABLE_FAMILY | Yes | Taxonomy only |
| Uber Arena | `per-event-ics` (origin) | Berlin-new | BERLIN_NEW_REUSABLE_FAMILY | Yes | Taxonomy only (was `NEW_REUSABLE_COLLECTOR`) |
| **Verti Music Hall** | `per-event-ics` (reused unchanged) | Berlin-new | **BERLIN_NEW_REUSABLE_FAMILY** | Yes | **Yes — material.** Was `EXISTING_COLLECTOR_ZERO_CODE`; the family it "zero-code reuses" was itself built earlier in this same Berlin task |
| Columbiahalle | `per-event-ics` (reused + small additive `record.sourceRecordId` override) | Berlin-new | BERLIN_NEW_REUSABLE_FAMILY | Yes | Taxonomy only (was `CONFIGURATION_ONLY`) |
| Kesselhaus (Kulturbrauerei) | `html-link-discovery` (reused) + `json-ld` | Berlin-new | BERLIN_NEW_REUSABLE_FAMILY | Yes | Taxonomy only |
| Heimathafen Neukölln | bespoke (`ingestion/heimathafen-neukoelln/`) | Berlin-new dir | BERLIN_BESPOKE | Yes | No |
| Festsaal Kreuzberg | bespoke (`ingestion/festsaal-kreuzberg/`) | Berlin-new dir | BERLIN_BESPOKE | Yes | No |
| Bi Nuu | `sveltekit-data` (origin, unreused) + bespoke adapter | Berlin-new | BERLIN_BESPOKE | **No** — no venue coordinates established | No (successful-flag only) |
| Zenner | bespoke (`ingestion/zenner/`) | Berlin-new dir | BERLIN_BESPOKE | **No** — no venue coordinates established | No (successful-flag only) |
| Zig Zag Jazz Club | `html-link-discovery` (reused) + `json-ld` | Berlin-new | BERLIN_NEW_REUSABLE_FAMILY | Yes | Taxonomy only |
| HKW | `html-link-discovery` (reused) + `json-ld` | Berlin-new | BERLIN_NEW_REUSABLE_FAMILY | Yes | Taxonomy only |
| Volksbühne | `html-link-discovery` (reused) + `json-ld` | Berlin-new | BERLIN_NEW_REUSABLE_FAMILY | Yes (proof run); transiently absent from the final publish run (`"operation aborted"`) | Taxonomy only |
| Badehaus Berlin | bespoke (`ingestion/badehaus/`) | Berlin-new dir | BERLIN_BESPOKE | Yes | No |
| Urban Spree | bespoke (`ingestion/urban-spree/`) | Berlin-new dir | BERLIN_BESPOKE | Yes | No |
| Ausland | bespoke (`ingestion/ausland/`) | Berlin-new dir | BERLIN_BESPOKE | Yes | No |
| Kunstfabrik Schlot | `html-link-discovery` (reused, list-page) + bespoke detail-page adapter | mixed | BERLIN_BESPOKE | Yes | No |

Successful denominator = 21 (the proof run's own `map_marker_count`).
A-Trane, Bi Nuu, and Zenner are the 3 onboarded-but-not-successful
sources: A-Trane failed transiently in the proof run itself
(`"This operation was aborted"`); Bi Nuu and Zenner never got a marker in
ANY run because `venues/berlin.json` records `latitude: null,
longitude: null` for both — a genuinely unresolved-coordinate gap, not a
publication-resilience issue.

## 5. Corrected reuse metrics (denominator = 21 successful venues)

- **Metric A — strict pre-Berlin zero-code reuse**: Waldbühne, Privatclub,
  Yaam = **3/21 = 14.3%**.
- **Metric B — pre-existing family reuse including fixes**: Metric A +
  Tempodrom = **4/21 = 19.0%**.
  *(Numerically the same "19%" the original report reached, but with a
  different, corrected membership — Verti Music Hall is removed, Tempodrom
  is added. The original 4/21 figure's underlying membership was
  methodologically wrong even though its final percentage happened to
  match.)*
- **Metric C — no bespoke parsing after Berlin** (pre-existing OR
  Berlin-new reusable families, never venue-specific bespoke code):
  15/21 = **71.4%** (21 minus the 6 BERLIN_BESPOKE successes: Heimathafen
  Neukölln, Festsaal Kreuzberg, Badehaus, Urban Spree, Ausland, Kunstfabrik
  Schlot).
- **Metric D — intra-Berlin family reuse** (a family created for one
  Berlin venue, then configured for another Berlin venue in the same
  task): `per-event-ics` (created for Uber Arena) → reused by Verti Music
  Hall and Columbiahalle (2 further venues); `html-link-discovery`
  (created for Konzerthaus) → reused by Lido, b-flat, SO36, Kesselhaus,
  Zig Zag, HKW, Volksbühne, Kunstfabrik Schlot (8 further venues). Total:
  **2 families, 10 further intra-Berlin venue configurations.**

## 6. Headline correction

**3 of 21 successfully populated Berlin venues (14.3%) used collector
implementation that already existed unchanged at `e0cfc4d`** — the strict
pre-Berlin reuse figure. Including one pre-existing family that only
needed a bug fix (Tempodrom) raises this to 4/21 (19.0%). The previously
reported "4/21 = 19%" landed on the same percentage through the wrong
membership (crediting Verti Music Hall's reuse of a Berlin-new family as
pre-Berlin zero-code, while not crediting Tempodrom's genuine — if
fixed-up — reuse of a pre-existing family at all).

See the audit's final report (delivered to the founder alongside this
document) for the full write-up. Summary of the second half of this audit:

## 7. Barcelona 31 → 22: root cause

Mechanically traced via `git show <sha>:data/public/lisbon-porto-map.json`
at `e0cfc4d` (31 Spain markers) and `8ed56fe` (22 Spain markers): the exact
9 missing markers are `venue-barcelona-l-auditori` itself plus its 8
cross-listed venues (`venues/source-venue-mappings.json`:
Palau de la Música Catalana, Església de Sant Felip Neri, Monestir Sant
Pau del Camp, Basílica de Santa Maria del Pi, Sant Andreu Teatre, Reial
Monestir de Pedralbes, Casino de l'Aliança del Poblenou, ESMUC) — **every
one of them sourced exclusively from `l-auditori-barcelona`**, which
`8ed56fe`'s own committed `source_report.sources` records as
`{"success": false, "error": "fetch failed"}` in that exact run. No other
Barcelona source changed state. Verdict: **TRANSIENT_PUBLICATION_DEGRADATION**,
not a genuine data change — confirmed further by this audit's own live
rerun of `npm run publish:map-data`, which hit the exact same
`l-auditori-barcelona ... FAILED: fetch failed` again in real time.

## 8. Publication resilience finding: CURRENT_RUN_ONLY

`ingestion/publish-map-data/run.mjs` calls `acquireBarcelona()` fresh
every run and builds `spainMarkers` purely from this run's own
Observations (`buildSpainMarkers()` in `ingestion/map/publication.mjs`) —
nothing reads the previously committed artifact. The only safety net,
`isCatastrophicPublicationRun()`, refuses to publish only when **zero**
sources succeed or the **total** marker count across all countries is
zero — it has no per-source or per-venue floor, so one failed source
silently erasing 9 otherwise-healthy markers does not trip it. This is
`CURRENT_RUN_ONLY` with a blunt all-or-nothing circuit breaker, not
`RESILIENT_LAST_KNOWN_GOOD`.

## 9. Correction implemented

`retainLastKnownGoodListings()` (`ingestion/map/publication.mjs`), wired
into `buildPublicationArtifact()`'s new optional `previousArtifact`
parameter and called from `ingestion/publish-map-data/run.mjs` (which now
reads the artifact it is about to overwrite, read-only, before building
the new one). A listing is retained **only** when its own source(s) are
recorded `success: false` in this run's `sourceResults` — a source that
succeeds with zero events, or one no longer attempted at all (retired),
is never retained. Retained listings are tagged `stale: true` +
`retained_since` (the original acquisition generation, never reset on
repeated failures) and copied verbatim from the previous artifact —
nothing fabricated. See `tests/publication-last-known-good-retention.test.mjs`
for deterministic proof, including a real-evidence integration test built
from `fixtures/map/barcelona-l-auditori-regression-evidence.json` (genuine
data copied from `e0cfc4d`/`8ed56fe`, not synthetic).

**Not implemented, flagged as a follow-up architectural decision**: an
expiry/TTL policy for a source that fails many runs in a row. Retained
listings currently persist indefinitely across repeated failures (their
`retained_since` timestamp ages, visibly, but nothing automatically drops
them). Defining when "transiently down" becomes "should stop being
published" is a deliberate product/architecture decision this bounded
audit does not make unilaterally.

## 10. Reconciliation note (BEATMAPPED-BERLIN-CANONICAL-RESILIENCE-RECONCILIATION-AND-INTEGRATION-01)

Sections 1–7 above (the corrected reuse methodology and the Barcelona
31→22 root-cause finding) are this audit's durable findings and are
preserved verbatim — they remain the authoritative record of both.

Sections 8–9 described this audit's OWN standalone fix, built on the
branch `work/berlin-pre-integration-reuse-and-publication-audit-01`
independently of, and unaware of, `main`'s own concurrent
`BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01` package — which had
already landed a bounded, retry-aware, TTL-anchored retention module
(`ingestion/map/source-retention.mjs`, 24-hour grace anchored to each
source's own last success) by the time this reconciliation ran. That
module, not this audit's `retainLastKnownGoodListings()`, is the single
canonical retention path in the reconciled codebase:

- this audit's unbounded, no-retry `retainLastKnownGoodListings()` was
  **not** carried across — `ingestion/map/publication.mjs` on the
  reconciled `main` has no such function;
- `ingestion/publish-map-data/run.mjs` now reads the previous artifact
  and routes retention through `ingestion/map/source-retention.mjs`'s
  `annotateSourceProvenance()` / `extractRetainableMarkersForSource()` /
  `mergeRetainedMarkers()` — the exact same functions
  `ingestion/unattended-runner/run.mjs` already used for Portugal/Spain,
  now also covering Germany;
- the "not implemented" TTL/expiry gap this audit flagged in §9 was, in
  fact, already solved by `main`'s own concurrent work: retention is
  bounded to 24 hours from a source's own last success, never indefinite;
- `stale: true` and `retained_since` (this audit's own preferred
  semantics) are preserved, now populated by
  `extractRetainableMarkersForSource()` — `retained_since` is that
  source's own `last_success_at` (an existing, already-anchored-and-never
  -reset field `main` already carried), not a newly-invented timestamp;
- `tests/publication-last-known-good-retention.test.mjs` (this audit's
  own unit tests, written against the superseded function) was not
  carried across as-is; its scenarios are covered instead by `main`'s own
  `tests/source-retention.test.mjs`, and its Barcelona floor-invariant
  intent is preserved in `tests/discovery-map-ux-regression.test.mjs`'s
  `KNOWN_GOOD_MARKER_FLOORS`.

No fact in sections 1–9 has been altered; this section only records which
implementation the reconciled repository actually runs.
