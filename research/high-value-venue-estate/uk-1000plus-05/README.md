# UK high-value venue estate census — `uk-1000plus-05`

`BEATMAPPED-UK-HIGH-VALUE-VENUE-ESTATE-CENSUS-05`

This directory answers one question:

> **What permanent UK venues with a capacity of at least 1,000 should be in
> BeatMapped's high-value estate, and where would each one's programme come
> from?**

It is **research only**. It acquires no events, adds no canonical venues and
activates no sources.

---

## Read this first: what these files are NOT

| This directory does not | Where that actually lives |
|---|---|
| define canonical venues | `venues/uk.json` — **not modified by this package** |
| define or activate sources | `sources/*.json`, `docs/SOURCE_REGISTRY.md` |
| constitute a source investigation | `research/source-investigations/`, `docs/SOURCE_INVESTIGATION_POLICY.md` |
| contain events or observations | `docs/OBSERVATION_PIPELINE.md` |

A row here reaching `acquisition_readiness: "READY_FIRST_PARTY"` changes
nothing about what BeatMapped collects. It is a statement that a usable
public programme source appears to exist — **not** permission to acquire it.
Turning any row into a live source still requires a full governed
investigation under `docs/SOURCE_INVESTIGATION_POLICY.md`, followed by a
separate, explicitly-authorised registry admission.

This census tells you **where to spend investigation effort**. It never
substitutes for that investigation.

---

## Where the numbers live

**`summary.json` is the only place headline counts are published.** Every
other document — including this README and the founder-facing report —
should quote it rather than restate a number independently.

That is a deliberate response to a real failure: the previous national
package published the headline *"2,014 UK venues have no website"*, which was
false. The number had been computed one way (checking whether a URL happened
to already be embedded in a venue record) and described another (as the
result of searching for those venues). 1,757 of those venues had never been
researched at all.

Every count in `summary.json` is computed by
`ingestion/high-value-venue-census/build.mjs` from the cited inputs, and
`ingestion/high-value-venue-census/validate.mjs` re-derives each headline
from `census.json` and fails if the two disagree. A count and its definition
cannot drift apart here without a test failing.

---

## The files

`census.json` is authoritative. Every other file is a **view** over it, and
the validator proves each view is a genuine subset whose membership rule
actually holds for every member.

| File | What it holds |
|---|---|
| `manifest.json` | What this census is, its inputs, and an explicit `mutated: false` for each |
| `census.json` | **Authoritative.** Every census row |
| `summary.json` | The headline counts and the package's quality invariants |
| `confirmed-1000-plus.json` | Venues with retained capacity evidence reaching 1,000 |
| `capacity-unverified-candidates.json` | Obviously-major venues whose capacity could not be evidenced — deliberately **excluded** from the confirmed count |
| `existing-canonical.json` | High-value venues the canonical estate already knows |
| `missing-from-canonical.json` | High-value venues with no canonical counterpart found |
| `possible-duplicates.json` | Identity ambiguities, plus near-duplicate pairs **within** the canonical estate |
| `conference-venues.json` | The conference / convention / exhibition / university / hotel estate |
| `sports-venues.json` | The permanent spectator-sport estate |
| `general-programme-sources.json` | Venues with a general music/theatre/multi-purpose programme source |
| `conference-calendar-sources.json` | Venues with a public conference or exhibition calendar |
| `sports-calendar-sources.json` | Venues with a public fixture/event source |
| `platform-families.json` | Platform families ordered by **measurable** estate coverage, plus `reusable_integrations` — read that block, not the raw family counts |
| `operator-estates.json` | Shared hosts serving more than one high-value venue, plus `source_classification_updates` |
| `acquisition-readiness.json` | Research classification only |
| `coverage-matrix.json` | What was actually covered, per venue class — read this before trusting completeness |
| `unresolved.json` | Rows needing human review |
| `research-blocked.json` | Rows where research did not complete. **Carry no negative findings** |

---

## The honesty rules, and why they are mechanical

These are enforced by `ingestion/high-value-venue-census/contract.mjs` and
tested in `tests/high-value-venue-census.test.mjs`, not left to discipline.

1. **A confirmed capacity needs a citable source.** `CONFIRMED_1000_PLUS`
   requires non-empty `capacity_evidence`, a `capacity_source_url`, and a
   `capacity_max` that genuinely reaches 1,000.
2. **A negative claim needs evidence that somebody looked.**
   `NO_PUBLIC_CALENDAR_FOUND` and `PRIVATE_BOOKINGS_ONLY` both require
   non-empty `calendar_evidence`.
3. **Absence of research is never evidence of absence.** A row whose
   `research_status` is `NOT_YET_RESEARCHED` or `RESEARCH_BLOCKED` may not
   carry *any* negative claim — not "no calendar", not "below threshold",
   not "missing from canon". This is the rule the previous package's
   headline broke.
4. **A third-party source may never be labelled official.** Wikipedia,
   Wikidata, directories, aggregators and ticketing sites are discovery
   leads (`HIGH_QUALITY_THIRD_PARTY`), never `OFFICIAL_*`. A
   `READY_FIRST_PARTY` claim may not rest on a third-party or ticketing
   source.
5. **Claiming a venue is missing from canon is an identity claim** and needs
   identity evidence like any other.
6. **Platform family is never guessed.** A `platform_family` without
   `platform_evidence` is rejected. `UNKNOWN` is a valid, respected answer.

### Capacity that the prior census recorded but this one does not confirm

The prior census sometimes recorded a capacity whose "source" is prose rather
than a retained URL — for example *"WebSearch result summary citing <site>
(page not directly fetched)"*, or an explicit statement that no figure was
ever established. It recorded those **honestly**, and this census does not
launder them into confirmed facts: a capacity with no citable source URL is
not treated as established, and the venue moves to
`CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE`. The original prose is preserved
in the row's `notes`, so the reason survives rather than disappearing.

---

## Three things that are easy to misread

### 1. A platform family is not an integration

`platform-families.json` shows large venue counts against families like
`OTHER_EMBEDDED_APP_STATE`. **That is not an opportunity of that size.** It
is a descriptive bucket of unrelated bespoke sites, each needing its own
work. Prioritise from the `reusable_integrations` block, whose
`integration_kind` says explicitly which families are genuinely one
implementation (`STANDARDS_BASED_GENERIC`, `SINGLE_OPERATOR_PLATFORM`),
which are only an upper bound (`SHARED_FRAMEWORK_UPPER_BOUND` — a shared
framework is not a shared platform), and which are
`NOT_A_SINGLE_INTEGRATION`.

### 2. Some counted venues are open-air sites, not buildings

`summary.json`'s `permanence_review` lists event *sites* — city parks, a
castle esplanade, showgrounds — carried from the prior census. Each has
retained capacity evidence, but whether they are "permanent venues" is
arguable. They are counted **and** flagged, so the headline can be adjusted
deliberately rather than by someone quietly changing a mapping table.

### 3. Where this package's own fetches contradict the prior census

`operator-estates.json`'s `source_classification_updates` records where a
live fetch by this package disagreed with the classification the prior
census retained — including one league source whose flagged URL has since
been **restructured away entirely**, and one classified as client-rendered
that is actually plain server-rendered HTML.

Those rows are **not** rewritten. The prior census's fingerprint is retained
evidence from a completed package; silently overwriting it would destroy the
audit trail that makes either classification checkable. Both observations are
kept, and a future acquisition package should re-verify before building.

## Provenance of each row

Every row carries a `provenance` field:

- **`PRIOR_COMMITTED_CENSUS`** — carried forward from
  `research/major-event-venues/uk-major-event-census-01/`, a committed,
  audited census already built at the same ≥1,000 threshold, with retained
  capacity evidence and fingerprinted calendar sources. Read, never modified.
- **`PACKAGE_05_NEW_RESEARCH`** — new national research by this package,
  targeting the venue classes the prior census demonstrably under-covered.

Rows also keep `prior_venue_type` and `prior_census_id` where they came from
the prior census, so the mapping between the two vocabularies stays auditable.

### One derivation worth knowing about

The prior census records a single `RUGBY_STADIUM` type and does not
distinguish union from league. Rather than guess, this census derives the
code **mechanically** from the `sport` field on that venue's own retained
calendar sources (`rugby_union` / `rugby_league`). A venue with both becomes
`MULTI_SPORT_ARENA`; a venue whose retained sources name neither stays the
honest generic `STADIUM`. Every other type mapping is a documented static
table in `build.mjs` (`PRIOR_TYPE_TO_VENUE_CLASS`), covered by a test that
fails if the prior census ever uses a type the table does not handle.

---

## Reproducing this directory

```bash
npm run build:high-value-venue-census        # regenerate from committed inputs
npm run validate:high-value-venue-census     # validate what is published
node --test tests/high-value-venue-census.test.mjs
```

The builder refuses to write anything if any row violates the contract, so a
partially-valid census cannot be published.

---

## Before trusting "the UK high-value estate is complete"

**Read `coverage-matrix.json` first.** A venue class with no researcher
coverage statement and no new research rows was carried entirely from the
prior census and was *not* independently re-researched by this package. The
coverage matrix records, per class, which source families were actually
checked and what was deliberately left undone.

Completeness is a claim like any other here, and it is only as good as that
matrix.
