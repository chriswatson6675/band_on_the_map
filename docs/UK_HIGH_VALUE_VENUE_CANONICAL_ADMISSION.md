# UK High-Value Venue Estate — Canonical Admission

`BEATMAPPED-UK-HIGH-VALUE-VENUE-CANONICAL-ADMISSION-09`

The package that turned the researched UK high-value venue estate into
**canonical venues**. Packages 05–08 produced knowledge; this one produced
records.

- Artifacts: `research/high-value-venue-estate/uk-1000plus-09-admission/`
  (see that directory's `README.md` for the file-by-file guide)
- Code: `ingestion/high-value-venue-admission/`
- Tests: `tests/high-value-venue-admission.test.mjs`
- Predecessors: `docs/UK_HIGH_VALUE_VENUE_CENSUS_FINAL.md` (Package 07),
  `docs/UK_HIGH_VALUE_VENUE_CENSUS_COMPLETION.md` (Package 06),
  `docs/UK_HIGH_VALUE_VENUE_ESTATE_CENSUS.md` (Package 05)

## The lineage

| Package | Output | Verdict |
|---|---|---|
| 05 — estate census | 743 confirmed ≥1,000 | `PARTIAL` |
| 06 — completion | 803 confirmed | `PARTIAL` — one class, `STADIUM` |
| 07 — final closure | 800 confirmed, census frozen | `COMPLETE` |
| 08 — identity gate | 536 admission-ready, 4 held | `COMPLETE` |
| **09 — canonical admission** | **535 canonical venues minted** | **`COMPLETE`** |

## What this package did

It admitted the 536 rows of
`research/high-value-venue-estate/uk-1000plus-08-identity/admission-ready.json`
into `venues/uk.json` — and nothing else. No new venue research, no
population expansion, no event acquisition, no source activation.

```
canonical UK venues:  3,537  ->  4,072   (+535)
```

| | |
|---|---|
| Admission input rows | 536 |
| Minted as new canonical venues | 535 |
| Found already canonical at preflight | 1 |
| Pre-existing venues modified | 0 |
| Pre-existing venues removed | 0 |

By nation: England 309, Scotland 123, Wales 54, Northern Ireland 49.
By segment: `SPORT` 433, `CONFERENCE_EXHIBITION` 62, `ARTS_MUSIC_GENERAL` 40.

### Estate coverage

```
260 represented before
+ 535 admitted here
+   1 found already canonical at preflight
+   4 identity holds
= 800 confirmed high-value venues
```

Representation of the confirmed estate moved from **32.5% to 99.5%**. The
remaining 4 are Package 08's ambiguous identity holds, which only an
explicit later decision may resolve.

## How it works

The admission deliberately **adds no new admission machinery**. It reuses
the repository's existing governed primitives unchanged:

- `createVenueId()` / `validateVenue()` from `ingestion/venue/contract.mjs`
- `findExistingMatch()` from `ingestion/uk-venue-onboarding/dedupe.mjs`
- the append-only `venues/uk.json` write established by
  `ingestion/uk-venue-onboarding/run.mjs`

The only genuinely new code is the field adapter between the Package 08 row
shape and those primitives, plus the audit trail. `venues/uk.json` is a
source of truth that is appended to — not a generated file that is rebuilt —
so nothing here regenerates or rewrites existing entries.

```
npm run admit:high-value-venues                  # dry run — plans, writes nothing
npm run admit:high-value-venues -- --apply       # the governed canonical write
npm run reconcile:high-value-venue-admission     # closing reconciliation + summary
npm run validate:high-value-venue-admission      # read-only gate over the result
```

## The rules it holds itself to

**Every admitted venue is `UNRESOLVED`.** Package 08 carried no coordinates
and no street addresses for any of the 536 rows. Any other `location_status`
would require data this package does not have, and inventing it — including
inferring an address from coordinates — is prohibited. Postcodes are
preserved in each venue's admission evidence note so a later evidence-checked
geocoding pass (`ingestion/geocoding/run-uk.mjs`) can promote them properly.

**Capacity is not admitted.** The canonical Venue contract has no capacity
semantics and this package invents none. The qualifying ≥1,000 evidence stays
in the research corpus, referenced from each venue's admission evidence.

**Only a fetched first-party page earns `OFFICIAL_VENUE_WEBSITE`.** Of the
535, exactly **14** have a retained fetch whose URL matches the venue's own
declared site. The rest carry the URL as a research claim, not as the
venue's own voice. Wikipedia, league tables, fixture lists, ticketing pages
and social profiles are never promoted to official, however confidently the
research asserted them.

**Traceability lives in `canonical-id-map.json`.** The Venue contract has no
research-lineage field, so every minted `venue_id` is mapped back to its
Package 08 entity and Package 07 research rows in that artifact. No admitted
venue is untraceable.

## Two things the admission caught

### A cross-registry duplicate the whole programme had missed

**Eventim Apollo** reached the admission input marked `MISSING_FROM_CANON`.
It was not missing — it has been canonical in `venues/london.json` as
`venue-london-eventim-apollo` since long before this programme. Packages
05–08 reconciled only against `venues/uk.json`, so a venue canonical in a
*different* registry looked absent to all four of them.

Preflight dedupe runs against **every** canonical registry, so it was caught
and reused rather than duplicated. It is counted as represented exactly
once — neither minted, nor quietly folded into the 260 that Package 08
already knew about.

### Three false duplicates on a shared operator domain

Cheltenham, Epsom Downs and Aintree racecourses all publish under
`thejockeyclub.co.uk`, as does the already-canonical Newmarket. A bare
hostname match therefore claimed all four were the same venue, which would
have suppressed three legitimate admissions **and** asserted that Cheltenham
is Newmarket.

The fix is local to this package — `isSharedOperatorDomainFalsePositive()` —
and rejects a domain match only when both sides carry specific, *differing*
URL paths. The shared dedupe module is untouched, because the general
hostname rule is right for the single-venue domains it was written for. Each
rejection is retained in `already-canonical.json`, and the suite asserts that
every rejected match ended in an actual admission.

## What this package explicitly did not do

- No new venue research and no population expansion
- The 4 Package 08 identity holds were **not** admitted
- The 114 Package 07 capacity-unverified candidates were **not** admitted
- No Events, offers or observations were created — this is venue identity only
- No source was activated; no `sources/*.json` or registry was edited
- Packages 05, 06, 07 and 08 were read as immutable snapshots, never modified

Programme, fixture and conference acquisition against this estate is a
separate, explicitly-approved decision. This package activated nothing.
