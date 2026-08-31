# BEATMAPPED-DETAIL-CANDIDATE-SELECTION-COVERAGE-01 — final report

Explanatory only — not authoritative. This package is engineering work on
an existing acquisition/proof pipeline for already-active sources (not a
new-source activation investigation), so no formal `investigation.json`
record was produced, per the calling brief. All measurements below are
retained, reproducible evidence under this directory's `evidence/`, not
scratchpad/report-only claims.

## Evidence files

- `evidence/reproduce-candidate-selection.mjs` — live, bounded reproduction
  script (BEFORE the code change): for each of the 8 sources, runs the
  real unmodified `acquireSource()` (old selection) and a standalone
  measurement of the proposed normalized-record-driven selection.
- `evidence/candidate-selection-results-before-implementation.json` — its
  raw output (captured before `orchestrator.mjs` was changed).
- `evidence/reproduce-after-implementation.mjs` — live reproduction script
  (AFTER the code change): runs the real, now-updated `acquireSource()`
  end to end for all 8 sources.
- `evidence/after-implementation-results.json` — its raw output.
- New unit tests: `tests/detail-candidate-selection.test.mjs` (13 tests,
  no live network).

All live fetches used this repository's own real production fetch helper
(`ingestion/http/fetch.mjs`'s `fetchText()`, wrapped exactly as
`ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs`'s
`defaultFetchDocument()` already does), a 20s timeout, no browser, no AI
interpretation of page content, and no more than `detailLimit` (12)
additional detail GETs per source per run. Two runs per source were made
(before-code-change measurement, after-code-change confirmation) — not
dozens.

## 1. Starting main SHA

`a592ed890b16813f4c79bf3bc3eaafc4a0dddd26` (confirmed via `git rev-parse
origin/main`; unchanged from the expected starting SHA — main had not
advanced).

## 2. Branch/worktree

`work/beatmapped-detail-candidate-selection-coverage-01`, in the
dedicated worktree at
`.worktrees/detail-candidate-selection-coverage-01`. Not merged, not
pushed, not deployed.

## 3. Files changed

- `ingestion/programme-acquisition/orchestrator.mjs` — the only production
  file changed (140 insertions / 9 deletions vs. main). Adds one new
  exported function (`deriveProgrammeLevelEventRecords`), two new private
  helpers (`deriveEventRecords` — a pure extraction of `collectAndProve`'s
  existing embedded/static-card/JSON-LD dispatch chain, used by both
  `collectAndProve` and the new candidate derivation; `resolveRecordCandidateUrl`,
  `deterministicRecordCandidates`), and changes `discoverDetailCandidates()`'s
  body to prefer record-derived candidates ahead of the pre-existing
  link-based ones. `collectAndProve()`'s own proof/observation computation
  is untouched in substance — only refactored to share the extracted
  dispatch helper, verified byte-for-byte behaviour-preserving by the full
  test suite (2586 pre-existing tests still pass unchanged).
- `tests/detail-candidate-selection.test.mjs` — new, 13 tests (determinism,
  bounding, dedup, first-party safety, fallback-when-no-records, ordering,
  zero-fetch-increase).
- `research/source-investigations/beatmapped-detail-candidate-selection-coverage-01/`
  — this report and its evidence.

No other file was modified. `sources/berlin.json`, `venues/*.json`, and
every other production/registry file were only read, never written.

## 4. Existing candidate-selection algorithm (before this package)

`discoverDetailCandidates(programme, {limit})` (orchestrator.mjs) computed
the union of three raw-link extractors — `extractProgrammeLinks()` (anchor
tags whose URL/text match a generic event-signal keyword regex),
`extractJsonLdEventLinks()` (JSON-LD Event nodes' own `url`, same-origin
only), and `discoverEmbeddedStateDetailLinks()` (structurally-proven
embedded-state tuples' own `event_url`) — each independently capped at
`limit`, deduplicated by URL (`uniqueLinks()`, a `Map` keyed by URL,
first-insertion order wins), THEN sliced to `limit`. Because
`extractProgrammeLinks()`'s results were concatenated first, generic
anchor-tag hits (day-navigation pages, "all concerts" search pages, a
CMS's internal event editor, ticket-service pages — anything whose URL or
link text merely contains an event-signal word) could occupy slots ahead
of genuine per-event detail URLs, and the relationship between "this URL"
and "this specific already-normalized event record" was never
represented at all — link discovery and record normalization were two
completely independent passes over the same document.

## 5. Exact cause of the normalized/detail mismatch

Confirmed by direct measurement (not assumed): for Tempodrom, Waldbühne,
A-Trane, Privatclub and Konzerthaus, the programme document itself already
carries the FULL, precisely dated event inventory (151 / 14 / 48 / 30 / 33
records respectively) via JSON-LD, embedded app state, or accepted static
cards — each record's own `event_url` is a genuine, safe, same-origin
detail-page URL. But `discoverDetailCandidates()` never consulted those
records' own URLs — it re-derived a *different* candidate set from raw
anchor-tag text matching, independently capped at 12 before slicing. For
Konzerthaus specifically, the old anchor-scan's top 12 candidates were
`/programm/26-08-2026` (the page itself), `/programm`, `/tickets-service`,
`/de/programm` (a different-locale duplicate listing), `/mkhb/event-editor`
(an internal editor tool), and six more `/programm/DD-MM-2026` **day**
navigation pages — **zero** of the 12 were genuine per-event detail pages,
even though 33 real, dated, same-origin event URLs existed in the page's
own normalized records the whole time. For Radialsystem, the old 12 were
entirely category/series/accessibility pages (`/barrierefreiheit/`,
`/publikationen/`, `/kunstler-innen-a-z/`, four different `/reihen/...`
series pages) — again zero genuine event pages, even though 2 real event
URLs existed. For A-Trane, 4 of the old 12 were listing/search pages
(`/alle-konzerte/`, `/suche-alle-konzerte-alle-kuenstler/`,
`/past-live-concerts/`, a duplicate residency-day variant) crowding out 4
genuine, still-unproven event pages.

## 6. Normalized-event URL coverage by source (measured)

| Source | Normalized records | Unique usable first-party `event_url`s | Present among OLD 12 candidates | Missed despite having a usable URL |
|---|---|---|---|---|
| tempodrom-berlin | 151 | 151 | 11 | 140 |
| waldbuehne-berlin | 14 | 14 | 11 | 3 |
| a-trane-berlin | 48 | 48 | 8 | 40 |
| privatclub-berlin | 30 | 30 | 11 | 19 |
| b-flat-berlin | 0 (see note) | 0 | 0 | 0 |
| huxleys-neue-welt-berlin | 111 | 111 | 10 | 101 |
| radialsystem-berlin | 2 | 2 | 0 | 2 |
| konzerthaus-berlin | 33 | 33 | 0 | 33 |

Note on b-flat-berlin: its **listing page carries no JSON-LD and no
accepted static cards at all** (0 cards accepted out of the cards
inspected — a pre-existing, documented fact, see
`BEATMAPPED-STATIC-CARD-EMPTY-FALLBACK-CORRECTION-01` in
`orchestrator.mjs`). Its normalized records exist **only** as a
byproduct of already having fetched some detail pages (each of which
independently embeds its own JSON-LD Event). There is no
normalized-record pool that exists independently of, and prior to,
candidate selection for this source — this is a real, structural
limitation this package's evidence surfaced, not an oversight; see
§14 and §22.

## 7. Old candidate set by source

Full URL lists are retained verbatim in
`evidence/candidate-selection-results-before-implementation.json`
(`sources.<id>.old_selection.candidate_urls`). Summarised: tempodrom and
waldbuehne's old 12 were already almost entirely genuine event pages (11
of 12 each); a-trane's old 12 were 8 genuine + 4 listing/search pages;
privatclub's were 11 genuine + 1 non-detail; b-flat's were 12 genuine
(booking-widget hashed-ID detail URLs — already correctly targeted by
the anchor scan for this source); huxleys' were 10 genuine event pages +
2 listing pages; radialsystem's and konzerthaus' were **12 of 12 entirely
non-event pages** (see §5).

## 8. Proposed candidate set by source

Full URL lists in `evidence/candidate-selection-results-before-implementation.json`
(`sources.<id>.proposed_selection.candidate_urls`) and confirmed live via
the real, now-updated `acquireSource()` in
`evidence/after-implementation-results.json`. For every source with a
non-empty normalized-record pool, the new candidate set is exactly the
12 earliest-dated, deduplicated, same-origin `event_url`s already present
in that source's own normalized records. For b-flat-berlin (no
independent record pool), the new algorithm's output is **byte-identical
to the old algorithm's** — the fallback path, not a distinct set.

## 9. Deterministic ordering rule

Record-derived candidates are ordered ascending by
`proofDateFromStartDate(record.start_raw)` (the exact same clock-
independent date-prefix reader the proof layer already uses — no new
date parsing), tie-broken by the record's original discovery-order index.
This depends on nothing but the record's own already-cutoff-filtered
date and its position in the already-retained document — never on
runtime randomness, network timing, object-insertion accident beyond
original document order, or the wall clock beyond the existing event
cutoff. Verified deterministic by direct repeated-invocation tests
(`tests/detail-candidate-selection.test.mjs`, "determinism:" test) and by
construction (a pure function over already-computed inputs).

## 10. Dedupe rule

Reused, not reinvented: record-derived candidates are deduplicated by
exact resolved absolute URL (first occurrence wins), then unioned with
the pre-existing link-based candidates via the SAME `uniqueLinks()`
(`Map` keyed by URL, first-insertion wins) orchestrator.mjs already used
before this package. No new equivalence system, no query-string
stripping, no print-variant collapsing.

## 11. First-party safety rule

A record's `event_url` is only accepted as a candidate when: (a) it
resolves to an `http`/`https` URL, (b) its origin exactly matches the
programme document's own origin (identical restriction
`extractJsonLdEventLinks()` already applied), and (c) it does not
degenerate to the programme page's own URL (the case where a record
published no `url` at all and silently fell back to the document URL).
Never constructs, guesses, or infers a URL a record did not already
carry. Verified by dedicated tests: cross-origin ticketing URLs rejected,
`javascript:` URLs rejected, genuinely unparsable URLs skipped without
throwing.

## 12. detailLimit confirmation

Unchanged at 12 everywhere (`source-execution.mjs`'s `acquireSource()`
default, `city-batch.mjs`'s `runCityAcquisition()` default, and every live
reproduction run in this package's evidence). Every post-implementation
live run in `evidence/after-implementation-results.json` fetched exactly
12 detail documents (`detail_fetch_count: 12`, `detail_fetch_count_within_limit: true`)
for every source with 12+ candidates, and fewer only where fewer than 12
candidates genuinely exist (radialsystem: 2). Fetch volume never
increased.

## 13. Tempodrom before/after

151 normalized, 12 candidates fetched both before and after (unchanged
budget). Before: 11 proven. After: **12 proven** (+1). State:
`ACQUISITION_PROVEN` both before and after.

## 14. Waldbühne before/after

14 normalized (near-complete control), 12 candidates fetched both times.
Before: 11 proven. After: **12 proven** (+1) — the small remaining gap
closed within the same 12-fetch budget, confirming §13 of the brief's
question. State: `ACQUISITION_PROVEN` both before and after.

## 15. A-Trane before/after

48 normalized, 12 candidates fetched both times. Before: 8 proven
(4 of the old 12 candidates were listing/search pages, not events —
the "listing/outbound-node problem" the brief warned about; this
package's selection draws candidates exclusively from normalized
records' own `event_url`s, which never include such pages). After:
**12 proven** (+4). State: `ACQUISITION_PROVEN` both before and after.

## 16. Huxleys result

111 normalized, 12 candidates fetched both times (10 of the old 12 were
already genuine event pages; the new selection's 12 are also all genuine
event pages, 9 shared with the old set). Proven: **0 before, 0 after** —
honestly unchanged. Their individual detail pages genuinely carry no
JSON-LD Event data (confirmed by direct inspection of the fetched
bodies), so no candidate-selection improvement can create proof evidence
that does not exist on the page. This is `DETAIL_DOCUMENT_LACKS_PROOF_EVIDENCE`,
not a selection defect — proof logic was not weakened to force a result.

## 17. Radialsystem result

Only 2 usable normalized event URLs exist in total (the old 12 candidates
were 100% category/series/accessibility pages, none of them events).
New selection correctly surfaces both real event URLs
(`/en/veranstaltungen/heiner-goebbels-walden/`,
`/en/festivals/20-years-radialsystem-for-everyone/`). Proven: **0 before,
0 after** — both real event pages were inspected and genuinely carry no
JSON-LD Event data. Same honest `DETAIL_DOCUMENT_LACKS_PROOF_EVIDENCE`
conclusion as Huxleys — not weakened, not fixed here.

## 18. Konzerthaus result

33 normalized (via the STATIC_HTML_CARDS family, not JSON-LD — see §6),
but the old anchor-scan's 12 candidates were **100% non-event pages**
(day-navigation, ticket-service, locale duplicate, an internal editor
tool — see §5). New selection surfaces 12 genuine, real per-event detail
pages, and all 12 carry valid, self-consistent JSON-LD Event data.
Proven: **0 before, 12 after**. State flips from
`STABLE_IDENTITY_PROOF_FAILED` to `ACQUISITION_PROVEN` — a full
source-level success, achieved purely by better-targeted candidate
selection within the unchanged 12-fetch budget, with zero change to
proof logic. This is the single largest measured gain in this package.

## 19. b-flat control

12 candidates fetched both before and after — **byte-identical candidate
list**, because b-flat has no independent normalized-record pool (§6),
so the new algorithm's record-derived tier contributes nothing and the
implementation falls back to exactly the pre-existing link-based
selection. Proven: **8 before, 8 after** — zero regression, confirmed by
the real, post-implementation `acquireSource()` run
(`evidence/after-implementation-results.json`). Identity basis, date
semantics, proof thresholds, and dedupe semantics are all untouched.

## 20. Privatclub control

30 normalized, 12 candidates fetched both times (11 of 12 already
genuine before). Proven: **11 before, 12 after** (+1) — a small,
honest improvement, not a regression, and not a special-cased fix
(the same generic algorithm applied uniformly). Identity basis, date
semantics, proof thresholds and dedupe semantics unchanged.

## 21. Total additional proofs

**+19** distinct proven event identities across the 8 measured sources,
within the exact same fetch budget (12 per source, same as before):
tempodrom +1, waldbuehne +1, a-trane +4, privatclub +1, b-flat +0,
huxleys +0, radialsystem +0, konzerthaus +12. Verified two ways: (a) a
rigorous per-source ID set-difference (gained ∪ lost) computed in the
before-implementation measurement, confirming zero proofs were ever LOST
by the new selection on any of the 8 sources; (b) an independent,
end-to-end confirmation via the real, unmodified, now-updated
`acquireSource()` in the after-implementation run, which reproduces the
identical before/after proof counts for all 8 sources.

## 22. Candidate-selection loss remaining

Zero, for every source where a non-empty normalized-record pool exists:
tempodrom, waldbuehne, a-trane, privatclub, konzerthaus, huxleys, and
radialsystem all now select from their own full, correctly-dated,
first-party record inventory, and (Huxleys/Radialsystem aside, where the
loss is evidentiary, not selection — see §16/§17) achieve 100% proof
success on every selected candidate. b-flat has no measurable
candidate-selection loss either, since its selection is (correctly, per
§6) unchanged from before.

## 23. detailLimit loss remaining

Substantial and expected — this package deliberately did not touch
`detailLimit`. Normalized events that exist but remain unfetched at
`detailLimit=12`: tempodrom 139, waldbuehne 2, a-trane 36, privatclub 18,
konzerthaus 21, huxleys 99 (moot given §16's evidentiary gap),
radialsystem 0 (only 2 exist, both already fetched), b-flat unmeasurable
(no independent normalized count — see §6). Raising `detailLimit` is the
next lever for these sources' remaining unproven events; this package
does not do that.

## 24. Evidence-deficient detail documents remaining

14, confirmed: Huxleys' 12 selected detail pages and Radialsystem's 2
selected detail pages all genuinely lack any JSON-LD Event structured
data — a real, retained-evidence finding, not a proof-engine weakening.
No new collector family was added or proposed for these (per the brief's
§19 scope boundary) — they remain a separate, future package's problem
(a bespoke static-HTML parser, matching what `sources/berlin.json`
already documents for both venues).

## 25. Fetch-volume before/after

Unchanged: 1 programme GET + up to 12 detail GETs per source, both
before and after. Confirmed directly in
`evidence/after-implementation-results.json` (`detail_fetch_count: 12`,
or fewer only when fewer than 12 real candidates exist) and by the
dedicated regression test in `tests/detail-candidate-selection.test.mjs`
("zero-fetch-increase assertion...", asserting `result.length <= 12` for
programme documents synthetically carrying 0 through 200 candidate
events).

## 26. Determinism tests

13 new tests in `tests/detail-candidate-selection.test.mjs`, all offline
(no live network), covering: fewer than 12 / exactly 12 / more than 12
record-derived candidates; duplicate URLs; cross-origin URLs; non-http(s)
(`javascript:`) URLs; genuinely unparsable URLs; a programme page with NO
normalized records at all (full fallback to old behaviour, unchanged);
priority ordering (record-derived candidates first, link-derived filling
remaining budget); repeated-invocation determinism (byte-identical
output); the zero-fetch-increase bound across 0–200 synthetic events;
non-mutation of the input programme document; and that `collectAndProve`'s
own proof/observation computation is unaffected. All 13 pass; the full
suite (2599 tests, up from the 2586 baseline) passes with zero failures.

## 27. Proof semantics confirmation

Untouched. `SOURCE_PUBLISHED_CANONICAL_EVENT_URL`,
`SOURCE_PUBLISHED_SELF_REFERENTIAL_EVENT_URL`, `proofDateFromStartDate`
(cutoff/date parsing), the collision/dedupe `Map`-by-`source_record_id`
policy, and title/date identity logic in `offline-proof.mjs` were not
modified at all (the file was not touched — confirmed via `git diff
--stat`, only `orchestrator.mjs` changed). `collectAndProve()`'s own
proof/observation-filtering logic (the `proofIds`/`provenRecordIds`/
`observations` computation) is byte-identical to before the refactor —
only the JSON-LD/embedded/static-card *record derivation* dispatch was
extracted into a shared helper, verified behaviour-preserving by the full
pre-existing test suite passing unchanged.

## 28. Full test count

2599 passing, 0 failing (2586 pre-existing + 13 new
`tests/detail-candidate-selection.test.mjs` tests). Baseline main was
2586 passing / 0 failing in this exact worktree before any change; the
only delta is the 13 additive tests this package introduced. Zero
unexplained failures.

## 29. Confirmation no unrelated acquisition capability changed

Confirmed. `offline-proof.mjs` (proof engine), `discovery.mjs` (JSON-LD
extraction/normalization), `embedded-state/collector.mjs`,
`static-cards/collector.mjs`, `source-execution.mjs`, `city-batch.mjs`,
and every collector-family module are byte-identical to main (`git diff
--stat` shows only `orchestrator.mjs` modified). No `PUBLIC_REST_JSON`,
embedded-state date-parity, `STATIC_HTML_CARD` detection, or
browser-required acquisition logic was touched, per the brief's explicit
scope exclusion.

## 30. Confirmation no production action occurred

Confirmed. No deploy, no Berlin job enqueued, nothing published, no
production workflow dispatched, `sources/*.json`/`venues/*.json` were
only read, no browser automation was used anywhere in this package, and
no AI was used to interpret any fetched page's content as fact — every
judgement in the new candidate-selection code (URL resolution,
same-origin check, date comparison for ordering) is mechanical, over
already-governed, already-normalized record fields. All network access
was bounded, deterministic public GETs via this repository's own
existing `fetchText()` helper.

## 31. Estimated Berlin event-coverage improvement if merged

Measured, not extrapolated beyond its evidence: across the 8 sources
investigated, +19 additional proven event identities within the same
fetch budget, and one full source-level flip from FAILED
(`STABLE_IDENTITY_PROOF_FAILED`) to successful (`ACQUISITION_PROVEN`,
Konzerthaus) — worth noting against the production baseline of
"successful: 5, residue: 13, failed: 20" (before the first Berlin
learning cycle already moved tempodrom/waldbuehne/a-trane to
`ACQUISITION_PROVEN`). This package's own contribution beyond that first
cycle is: deeper per-source coverage on the 4 sources that already
succeed via this generic JSON-LD/embedded/static-card + detail-proof
pipeline (tempodrom, waldbuehne, a-trane, privatclub), one additional
source-level success (konzerthaus), and two honestly-confirmed non-wins
(huxleys, radialsystem) where the limiting factor is proven to be
missing JSON-LD Event evidence on the detail pages themselves, not
candidate selection. This package makes no claim about the other ~30
Berlin sources outside this cohort (ICS, PUBLIC_JSON_API, and other
collector families this package did not touch) — extrapolating this
result to the full 38-source estate without measuring each source
individually would itself be exactly the kind of un-evidenced inference
this project's governance rules exist to prevent.

## 32. Exact recommended next package

Two independent, separately-scoped follow-ups, matching this package's
own measured `DETAIL_LIMIT_LOSS` (§23) and `DETAIL_DOCUMENT_LACKS_PROOF_EVIDENCE`
(§24) findings — neither should be combined with this one:

1. **A bounded `detailLimit` increase experiment**, scoped narrowly to
   the sources this package proved have a real, large, already-targeted
   normalized-record backlog beyond the current cap (tempodrom: 139
   unfetched; a-trane: 36; privatclub: 18; konzerthaus: 21) — now that
   candidate selection is correctly targeted, raising the budget would
   translate directly into more proofs rather than more wasted fetches
   on junk links. This should independently re-measure real third-party
   load/politeness implications before recommending a specific new
   limit.
2. **A genuinely new, bespoke collector investigation for Huxleys and
   Radialsystem** (or confirmation their existing bespoke
   `ingestion/huxleys-neue-welt/` / future Radialsystem adapters already
   planned in `sources/berlin.json` remain the right path) — this
   package proved their blocker is the complete absence of JSON-LD Event
   data on their own per-event detail pages, not discovery/selection, so
   the correct next step is a `docs/SOURCE_INVESTIGATION_POLICY.md`-governed
   look at what structured (or reliably parseable static) data those
   specific detail pages actually do publish.

---

DETAIL_CANDIDATE_SELECTION_COVERAGE_READY
