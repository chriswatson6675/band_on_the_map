# UK High-Value Venue Estate Census

`BEATMAPPED-UK-HIGH-VALUE-VENUE-ESTATE-CENSUS-05`

The census of **permanent UK venues with a maximum normal public capacity of
at least 1,000**, and of the programme/calendar source that would serve each
one.

Artifacts: `research/high-value-venue-estate/uk-1000plus-05/`
(see that directory's `README.md` for the file-by-file guide).
Code: `ingestion/high-value-venue-census/`.
Tests: `tests/high-value-venue-census.test.mjs`.

## Why this exists

BeatMapped's canonical estate (`venues/uk.json`) was built primarily for the
earlier live-music and performing-arts programme work. It is large, and it
validates cleanly — but it was never built to be a list of the UK's
*commercially most valuable* venues, and it must not be assumed to be one.

This census establishes the high-value estate **first**, before further
effort goes into the long tail of small venues. It answers:

1. what the UK's ≥1,000-capacity permanent venues actually are;
2. which of them BeatMapped already knows;
3. where each one's public programme, conference calendar or fixture list
   would come from;
4. which acquisition integrations would cover the most of them.

It deliberately does **not** acquire any events.

## Relationship to the other venue work

| Artifact | Relationship |
|---|---|
| `docs/UK_MAJOR_EVENT_VENUE_CENSUS.md` / `research/major-event-venues/uk-major-event-census-01/` | **The primary input.** A committed, audited census already built at the same ≥1,000 threshold, with retained capacity evidence and fingerprinted calendar sources. Read, never modified. |
| `venues/uk.json` | Read only, for identity reconciliation. **Not modified.** |
| `docs/SOURCE_INVESTIGATION_POLICY.md` | Governs what happens *next* to anything this census surfaces. A census row is not an investigation. |
| `docs/SOURCE_REGISTRY.md` | Governs activation. A census row is not a source. |

### This census does not regenerate the earlier national programme work

`research/programme-acquisition/uk-national-01/` **cannot** safely be
regenerated from its currently committed checkpoint state — a test
regeneration moved `NO_SOURCE_FOUND` from 2,014 to 2,044 and destroyed 30
`SKIPPED_SHARED_WEBSITE` rows. That regeneration was reverted, and this
package does not repeat it. All prior research artifacts are treated as
read-only evidence.

## The inclusion rule

A venue qualifies if **any** established normal configuration reaches 1,000:
a 1,500 standing concert room, an 1,100-seat theatre, a 25,000 spectator
stadium, a 1,200-delegate plenary hall, a 4,000-attendee exhibition hall.
Every configuration does not have to exceed 1,000.

Capacity is never a bare unexplained number. Each row records the figure, its
kind (`STANDING` / `SEATED` / `SPECTATOR` / `DELEGATE` / `EXHIBITION` / …),
its context, its source URL, the authority of that source, and a confidence.

### Capacity we could not verify

A venue is not discarded merely because its capacity could not be evidenced.
`CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE` exists for venues that plainly
belong in the cohort but whose ≥1,000 threshold is not yet evidenced. **They
are held outside the confirmed count and reported separately.** Inflating the
headline with unevidenced venues is precisely the failure this design avoids.

## The honesty model

The census exists to produce a number the founder can act on. That is only
worth anything if the number is true, so the rules below are enforced by
`ingestion/high-value-venue-census/contract.mjs` and covered by tests —
not left to the care of whoever ran the research.

1. **A confirmed capacity needs a citable source.** `CONFIRMED_1000_PLUS`
   requires non-empty capacity evidence, a capacity source URL, and a figure
   that genuinely reaches 1,000.
2. **A negative claim needs evidence that somebody looked.** "No public
   calendar found" requires retained calendar evidence.
3. **Absence of research is never evidence of absence.** A row marked
   `NOT_YET_RESEARCHED` or `RESEARCH_BLOCKED` may carry *no* negative claim.
4. **A third-party source is never labelled official.** Wikipedia, Wikidata,
   directories, aggregators and ticketing sites are discovery leads
   (`HIGH_QUALITY_THIRD_PARTY`). A `READY_FIRST_PARTY` readiness claim may
   not rest on one.
5. **Claiming a venue is missing from canon is an identity claim** and needs
   identity evidence.
6. **Platform family is never guessed.** `UNKNOWN` is a valid answer.

### Rule 3 exists because it was broken

The previous national package published the headline *"2,014 UK venues have
no website."* It was false. The figure counted venues whose stored record did
not happen to contain a URL, and described that as the result of searching
for them. 1,757 of those venues had never been researched at all — and the
list included the London Palladium and Theatre Royal Drury Lane.

Tool exhaustion must never become a finding. When research cannot complete,
the row says so.

### A number and its definition cannot drift apart here

Every published count is computed by
`ingestion/high-value-venue-census/build.mjs` from cited inputs.
`ingestion/high-value-venue-census/validate.mjs` then re-derives each
headline directly from `census.json` and fails if the two disagree, proves
each view artifact is a genuine subset whose membership rule holds for every
member, and checks that every canonical venue the census cites actually
exists. `summary.json` is the single place headline counts are published;
everything else quotes it.

## Reading the leverage analysis correctly

`platform-families.json` carries a `reusable_integrations` block, and its
`integration_kind` matters more than its numbers:

| Kind | Meaning |
|---|---|
| `STANDARDS_BASED_GENERIC` | One parser genuinely covers every member, because acquisition is defined by a published standard (schema.org JSON-LD / microdata). |
| `SINGLE_OPERATOR_PLATFORM` | One host, one uniform platform. One implementation covers the estate. |
| `SHARED_FRAMEWORK_UPPER_BOUND` | **An upper bound, not an integration size.** A shared framework is not a shared platform. |
| `NOT_A_SINGLE_INTEGRATION` | A descriptive bucket of unrelated bespoke sites. Recorded explicitly so its large venue count cannot be misread as an opportunity. |

The distinction is not pedantry. Unrelated operators commonly build on the
same framework with different payload shapes — the prior census found ATG,
Academy Music Group and Trafalgar all fingerprinting as Next.js while being
three separate estates. A host serving a *mixed* platform estate (the Jockey
Club's 14 venues span three families) is likewise not one integration, and is
not reported as one.

## What a census row is not

Reaching `acquisition_readiness: "READY_FIRST_PARTY"` **changes nothing about
what BeatMapped collects.** It records that a usable public programme source
appears to exist. Turning any row into a live source still requires:

1. a full governed investigation under `docs/SOURCE_INVESTIGATION_POLICY.md`,
   with a real `probe_history`, retained evidence and an offline proof; then
2. a separate, explicitly-authorised registry admission
   (`docs/SOURCE_REGISTRY.md`).

The census narrows **where to spend investigation effort**. It never
substitutes for that investigation, and it never admits a venue to
`venues/uk.json`.

## Before claiming national completeness

Read `coverage-matrix.json`. A venue class with no researcher coverage
statement and no new research rows was carried entirely from the prior census
and was not independently re-researched here. Completeness is a claim like
any other, and the matrix is the only thing that supports it.

## Regenerating

```bash
npm run build:high-value-venue-census
npm run validate:high-value-venue-census
node --test tests/high-value-venue-census.test.mjs
```

The builder refuses to write anything if any row violates the contract, so a
partially-valid census cannot be published. Re-running it on unchanged inputs
reproduces the artifacts exactly.
