# Normalisation / proof date-prefix parity — the IP-3 completion

Task: `BEATMAPPED-NORMALISATION-DATE-PREFIX-PARITY-01`
`origin/main` = `676b53d11d2669b2aa1100fa2d8b35e62226cb36`
Base: `986aebb` (linear: `986aebb` → `f1e8b35` → `676b53d`, so both preceding
proof corrections are retained). Nothing merged.

## The defect (§2, reproduced before coding)

`collectAndProve()` decides an acquisition by **intersecting** the normalized
record set with the detail-proof set. Each side read the same source-published
`startDate` through its own copy of the calendar-date predicate. Once the proof
side learned to read an unpadded month/day and normalisation did not, the two
sides disagreed about which events exist.

Measured on `a-trane-berlin` at base `986aebb`:

| | |
|---|---|
| terminal state | `STABLE_IDENTITY_PROOF_FAILED` |
| normalized | 11 |
| detail proofs | 8 |
| **proven** | **0** |
| records ∩ proofs | **0** |
| discarded at normalisation, valid and in-window | **37** |
| …of which already had a detail proof | **8** |

`proofDateFromStartDate("2026-8-31T20:30+2:00")` → `"2026-08-31"`, while the
normalisation predicate `/^\d{4}-\d{2}-\d{2}/` → `null`.

**Same-event demonstration** — these identities were simultaneously a detail
proof and an event normalisation threw away:

- `2026-8-31T20:30+2:00` → `…/Events-Directory/a-trane-praesentiertandreas-schmidt-friendsheute-mit-161/`
- `2026-9-1T20:30+2:00` → `…/a-trane-praesentiert-artist-in-summer-residency-day1…/`
- `2026-9-2T20:30+2:00` → `…/a-trane-praesentiert-artist-in-summer-residency-day2…/`

## The change (§3–§6)

`discovery.mjs:93`, inside `proveJsonLdEvents()` — one predicate replaced:

```
- const date = /^\d{4}-\d{2}-\d{2}/.exec(record.start_raw)?.[0] ?? null;
+ const date = proofDateFromStartDate(record.start_raw);
```

plus the import and an explanatory comment. That is the entire behavioural
diff: **13 insertions, 1 deletion, one file.** No second parser, no widened
grammar, no new regex — the accepted grammar, the strict calendar validation
and the clock-independence are the existing helper's, unchanged.

What normalisation already did, and still does unchanged: `start_raw` is the
verbatim `node.startDate`; the extracted date is used **only** for the cutoff
comparison and is never stored; `source_record_id`/`event_url` come from
`eventUrl(node, document.url)`; dedupe is by `source_record_id`, last wins.

**§7 raw evidence.** Nothing is rewritten. `2026-8-31T20:30+2:00` is retained
verbatim on the record; only the comparison uses `2026-08-31`.

## Result (§9–§13, §21)

| source | normalized before → after | proven before → after | identity basis | terminal state |
|---|---|---|---|---|
| `a-trane-berlin` | 11 → **48** | 0 → **8** | `CANONICAL` ×8 | `STABLE_IDENTITY_PROOF_FAILED` → **`ACQUISITION_PROVEN`** |
| `tempodrom-berlin` | 151 → 151 | 11 → 11 | `SELF_REFERENTIAL` ×11 | `ACQUISITION_PROVEN` |
| `waldbuehne-berlin` | 14 → 14 | 11 → 11 | `SELF_REFERENTIAL` ×11 | `ACQUISITION_PROVEN` |
| `b-flat-berlin` | 9 → 8 † | 9 → 8 † | `CANONICAL` | `ACQUISITION_PROVEN` |
| `privatclub-berlin` | 30 → 30 | 11 → 11 | `CANONICAL` ×11 | `ACQUISITION_PROVEN` |
| `konzerthaus-berlin` | 33 → 33 | 0 → 0 | — | `STABLE_IDENTITY_PROOF_FAILED` |

**a-trane detail:** 48 distinct usable Event records, of which **37 were
admitted solely by the shared date parsing**. The remaining events on the page
are still rejected for the reasons they always were — before the cutoff, or no
usable title/url. Proven is bounded at 8 by `detailLimit = 12` and candidate
ordering, not by date handling: only 8 of the 48 records have their own detail
document retrieved. Identity is `SOURCE_PUBLISHED_CANONICAL_EVENT_URL`
throughout — no relative `@id`, no listing node, no title+date, and no
self-referential fallback (every a-trane detail document publishes a canonical).

Verified stable: four consecutive runs returned `ACQUISITION_PROVEN` 48/8/8
with byte-identical identities.

† **b-flat 9 → 8 is live drift, not this change.** b-flat publishes **zero**
unpadded dates, so `proofDateFromStartDate()` returns exactly what the old
predicate returned for every one of its values. The cutoff is the fetch
timestamp's date, and b-flat has real events on `2026-08-29` and `2026-08-30`;
as the UTC date advanced from 08-30 to 08-31 during this work, those fell out
of window. The preceding package observed the same source at 10, then 9, on the
unmodified base for the same reason. Every run proved 100% of what it
normalized, via the canonical basis.

**a-trane host flakiness (pre-existing, out of scope).** a-trane consistently
fails 1 of its 13 fetches even on successful runs. One cohort run lost enough
detail documents to return 0 proofs; four consecutive direct runs returned 8.
Retry policy is §18-excluded and was not touched.

## IP-2 negative controls (§14)

`konzerthaus-berlin`: 33 normalized, **0 proofs, 0 proven** — and the direct
cause is retained: **0 JSON-LD Event nodes across all its retained documents.**

`huxleys-neue-welt-berlin` and `radialsystem-berlin` require `3161494`
(static-card text dates) to normalize at all; that candidate is not on main and
was not merged. On this lineage both return `SUPPORTED_COLLECTOR_NO_VALID_EVENTS`
with 0 normalized. The only thing *this* package could change for them is
whether their documents carry JSON-LD Event nodes whose dates the shared helper
newly makes readable: **0 Event nodes, 0 newly readable.** They were verified on
the text-date base during the preceding identity package (111 and 14 normalized,
0 proofs before and after).

## §16 — one date implementation

After the change, **no padded-only date-prefix regex remains anywhere in
`ingestion/`.** One occurrence remains in the wider tree that controls the same
normalized calendar-date concept:

`ingestion/embedded-state/collector.mjs:23` —
`/^\d{4}-\d{2}-\d{2}/.test(record.start_raw ?? "") && record.start_raw.slice(0, 10) >= cutoff`

This is the `EMBEDDED_STATE` collector, whose records are intersected with
detail proofs by the *same* `collectAndProve()`. It is therefore structurally
susceptible to the identical disjointness: an embedded-state source publishing
an unpadded date would be proven by its detail document and discarded at
normalisation. **It was not changed here**, because §16 licenses reuse only
where strictly necessary for parity and no currently-known source exercises it
— the corpus scan in the preceding package found unpadded `startDate` values at
`a-trane-berlin` only, a `JSON_LD_EVENT` source. It is the recommended next
package.

## Explicitly unchanged

`detailLimit = 12`, candidate discovery/ordering, detail-fetch and retry
strategy; canonical proof, self-referential-URL proof, collision handling,
dedupe policy, `source_record_id` identity policy, proof thresholds; the
static-card text-date work and `3161494`; `sources/`, `venues/`, `data/`,
`deploy/`, `.github/`, browser resolution and AI onboarding. `git diff 986aebb`
over all of those paths is empty.
