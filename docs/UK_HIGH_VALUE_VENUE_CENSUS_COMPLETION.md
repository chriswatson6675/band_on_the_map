# UK High-Value Venue Census — Completion Corpus

`BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-COMPLETION-06`

The current working census of **permanent UK venues with a maximum normal
public capacity of at least 1,000**.

- Artifacts: `research/high-value-venue-estate/uk-1000plus-06/` (see that
  directory's `README.md` for the file-by-file guide)
- Code: `ingestion/high-value-venue-census-06/`
- Tests: `tests/high-value-venue-census-06.test.mjs`
- Predecessor: `docs/UK_HIGH_VALUE_VENUE_ESTATE_CENSUS.md` /
  `research/high-value-venue-estate/uk-1000plus-05/`

## Why a second package

Package 05 established a genuinely useful national estate and then terminated
`UK_HIGH_VALUE_VENUE_CENSUS_PARTIAL` — correctly, because material coverage
was still missing:

- the conference/exhibition segment held only 60 venues for the entire UK;
- the concert-hall differential was never run;
- 163 high-value candidates had no capacity evidence, including **60 of 61
  racecourses** and **all 23 motorsport venues**;
- ten open-air sites sat inside the confirmed total with their permanence
  unresolved.

This package closes those gaps so that a **governed canonical admission**
package can run next against an estate that will survive scrutiny.

## Package 05 is preserved, not rewritten

`research/high-value-venue-estate/uk-1000plus-05/` is an **immutable
predecessor snapshot**. This package reads it and never writes to it. A test
asserts the manifest declares every consumed artifact `mutated: false`.

The corpora coexist deliberately. Superseding a research conclusion by writing
a new record, rather than editing the old one, is the same principle
`docs/SOURCE_INVESTIGATION_POLICY.md` applies to investigations under "History
and supersession".

## The central guarantee

**Every one of Package 05's 911 rows has exactly one disposition here.**

This is enforced in three places: `reconcileAgainstPredecessor()` in the
contract, the repository validator, and a test over the published corpus. A
predecessor row cannot be silently dropped to improve a headline, and cannot
be claimed by two successors.

`predecessor-reconciliation.json` additionally resolves Package 05's own
reported arithmetic with no unexplained remainder — the 911-vs-906 row gap,
the 547-vs-534 sports gap, and the canonical-match residues of 28 and 14.
All four turn out to be legitimate audit rows or a class omitted from a
report table, not errors in the underlying data.

## What changed structurally

### Permanence is its own axis

The inclusion rule says **permanent** venue. Package 05 counted public parks,
a castle esplanade, bandstands, a museum and a showground inside its confirmed
total, flagged in a `permanence_review` block for later.

Here `permanence_class` is a first-class evidenced field, and the contract
refuses `CONFIRMED_1000_PLUS` unless the permanence class actually denotes a
permanent venue.

The distinction is **not** indoor versus outdoor:

- a bandstand, amphitheatre, dedicated events arena, or an esplanade with an
  established configured annual event has its own stable venue identity and
  **stays** in the estate;
- a public park that merely hosts an occasional temporary concert is **not** a
  permanent 1,000-capacity venue because one temporary event once held that
  many.

Rows whose permanence could not be resolved are held **out** of the confirmed
estate as `IDENTITY_REVIEW`. Under-claiming is the right failure direction
here: the alternative is asserting a venue we have not established is one.

### Every row has a terminal disposition

`capacity_state` is exhaustive — `CONFIRMED_1000_PLUS`,
`CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE`, `CONFIRMED_BELOW_THRESHOLD`,
`NOT_A_PERMANENT_VENUE`, `IDENTITY_REVIEW`, `RESEARCH_BLOCKED`. The validator
proves the states sum to the corpus, so nothing hides in a residue.

## Honesty model

Inherited from Package 05 and extended. Enforced by
`ingestion/high-value-venue-census-06/contract.mjs`, not left to discipline:

1. A confirmed capacity needs a citable source that was actually fetched. A
   search-engine snippet is not capacity evidence.
2. A negative claim — below threshold, no public calendar, not a permanent
   venue — needs evidence that somebody looked.
3. A `RESEARCH_BLOCKED` row may carry **no** negative claim. Tool exhaustion
   and access blocks are never absence.
4. A third-party source is never labelled official.
5. A missing-from-canon claim is an identity claim and needs identity evidence.
6. Platform family is never guessed.
7. A confirmed venue must be a permanent venue.
8. **A researcher promotion its own evidence does not support is refused by
   the builder**, and the refusal is recorded in
   `predecessor-reconciliation.json` rather than silently dropped. Repairs
   always move a row towards the weaker claim, never the stronger.

## The completeness rule

`COMPLETE` is deliberately hard to reach and cannot be earned merely by every
row having a state.

A class reaches `MATERIAL_COMPLETE` only when every nationally material
discoverable source estate for it was checked **and** the residual gap is
explicitly bounded. A class with no Package 06 research statement never
inherits a complete state — it stays `PARTIAL`.

The overall verdict cannot be `COMPLETE` while any class is `PARTIAL` or
`BLOCKED`, and the validator rejects a corpus claiming otherwise.

A small bounded number of genuinely unverifiable capacities does not make the
census partial — many racecourses and circuits simply do not publish a
spectator capacity, and recording that honestly is the correct outcome. **An
entire material source family left unexplored does.**

## Why the verdict is PARTIAL, and why that is fine

22 of 23 venue classes reach `COMPLETE` or `MATERIAL_COMPLETE`. `STADIUM` does
not, and it alone holds the verdict at `PARTIAL`.

`STADIUM` is a residual bucket — venues whose retained calendar sources named
neither rugby code, so they fell through to the generic class. It has no
national directory of its own; its completeness derives from the sport-specific
sweeps. Five of its eight rows are accounted for by league estates already
audited. Three are not covered by any sweep actually performed here, because
the RFL Championship/League 1 and a national athletics sweep were not run.

That is a named, three-venue gap, not a hole of unknown size. It does **not**
undermine the 803 confirmed venues, none of which depend on it.

The more important point is how the verdict got there. When asked to close
`STADIUM`, the researcher declined to upgrade it on estate-only evidence and
said so. An honest `PARTIAL` with a precisely bounded gap is worth more than a
`COMPLETE` resting on a coverage claim that checked our own estate against
itself — and the completeness rule is written so that the second outcome is not
reachable.

## What this is not

A census row is not a source, and not a canonical venue. Reaching a "ready"
readiness state changes nothing about what BeatMapped collects. Activation
still requires a full governed investigation under
`docs/SOURCE_INVESTIGATION_POLICY.md` and then a separate, explicitly
authorised registry admission (`docs/SOURCE_REGISTRY.md`).

Admission of these venues to `venues/uk.json` is a **separate, later,
explicitly-approved package**. This one admits nothing.

## What blocks admission

`identity-review.json`. Ambiguous canonical identities and unresolved
permanence are what a governed admission package must settle first — admitting
a venue whose identity is ambiguous risks creating a duplicate in the
canonical estate, which is materially harder to undo than to avoid.

## Regenerating

```bash
npm run build:high-value-venue-census-06
npm run validate:high-value-venue-census-06
node --test tests/high-value-venue-census-06.test.mjs
```

The builder refuses to write if any row violates the contract or any
predecessor row lacks a disposition.
