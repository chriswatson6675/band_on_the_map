# UK High-Value Venue Census — Final Closure

`BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-FINAL-CLOSURE-07`

The **frozen** UK high-value venue census: permanent venues with a maximum
normal public capacity of at least 1,000.

- Artifacts: `research/high-value-venue-estate/uk-1000plus-07/` (see that
  directory's `README.md` for the file-by-file guide)
- Code: `ingestion/high-value-venue-census-07/`
- Tests: `tests/high-value-venue-census-07.test.mjs`
- Predecessors: `docs/UK_HIGH_VALUE_VENUE_CENSUS_COMPLETION.md` (Package 06),
  `docs/UK_HIGH_VALUE_VENUE_ESTATE_CENSUS.md` (Package 05)

## The lineage

| Package | Confirmed ≥1,000 | Verdict |
|---|---|---|
| 05 — estate census | 743 | `PARTIAL` — conference/exhibition thin, concert halls unresearched, permanence unresolved |
| 06 — completion | 803 | `PARTIAL` — one class, `STADIUM`, with a named three-venue gap |
| **07 — final closure** | **800** | **`COMPLETE`** |

Each package preserves its predecessor as an immutable snapshot rather than
rewriting it, and proves every predecessor row has exactly one disposition in
the successor. That is the same principle
`docs/SOURCE_INVESTIGATION_POLICY.md` applies to investigations under "History
and supersession".

## Why this package existed

Package 06 reached `COMPLETE` or `MATERIAL_COMPLETE` on 22 of 23 classes.
`STADIUM` stayed `PARTIAL` because two source-family sweeps had never been run
— **RFL Championship / League 1**, and **national athletics** — leaving 3 of
its 8 rows uncovered.

`STADIUM` is a residual bucket: venues whose retained calendar sources named
neither rugby code. It has no national directory of its own, so its
completeness derives from the sport-specific sweeps.

## What closing the gap actually revealed

The sweeps found **zero new confirmed ≥1,000 venues**, which is the expected
outcome of a closure package — it proves the omitted estates hid nothing
material. Two findings did come out, and the second is the important one.

**The RFL merged its divisions.** For 2026, Championship and League 1 became a
single 20-club division, so there is no separate League 1 list to walk. All 20
grounds were already held, 6 of them as groundshares under `FOOTBALL_GROUND`
or `RUGBY_UNION_GROUND`.

**All three uncovered rows had unsupportable capacities.** The rows that had
never been source-family-checked were also the three carrying the weakest
evidence — all `LOW` confidence — and none of the figures survived:

- **Queensway Stadium** (8,256) traced to a single uncited Wikipedia infobox,
  with Wikidata citing it *circularly* as "imported from" that same infobox.
- **White Hart Lane Community Sports Centre** (5,000) likewise — while the
  tenant club's own matchday page states the main stand seats **1,040**.
- **Post Office Road** (9,850) has conflicting undated sources, and its club
  was not admitted to the 2026 season after entering administration.

All three had their capacity withdrawn. No replacement figure was invented.
The confirmed total therefore went **down**, 803 → 800.

That direction of travel matters: a coverage gap is not just missing venues,
it is also unchallenged claims. A closure package that only ever added venues
would be the suspicious result.

## How the COMPLETE verdict is gated

Checked against machine-readable evidence, never a report. Three conditions:

1. every venue class is `COMPLETE` or `MATERIAL_COMPLETE`;
2. **both** required sweeps actually ran;
3. **all 8** predecessor `STADIUM` rows are covered.

The required sweeps are named in `contract.mjs` as data, so the check cannot be
satisfied by assertion. `stadium-source-estate-audit.json` records every row,
its source family and its evidence, and an entry claiming coverage with empty
evidence is rejected outright.

Carried forward from Package 06: a coverage statement citing only our own
estate is disregarded, because checking the estate against itself evidences
nothing about the world outside it.

## The rules cannot drift

Package 07 does **not** re-type Package 06's honesty rules. `validateCensus07Row()`
projects each row into the Package 06 shape and delegates to Package 06's own
validator, and a test asserts the delegation happens.

A forked copy of those rules would be worse than no copy: it could silently
accept a row Package 06 would have rejected. Only the genuinely new things —
the id namespaces, the provenance vocabulary, and the requirement that a newly
discovered venue names the sweep that found it — are Package 07's own.

## What still blocks admission

Not coverage. **Identity.**

`identity-review.json` holds the **17 confirmed venues** whose canonical
identity is ambiguous, plus the **Anglesey Showground / The Anglesey
Showground** intra-corpus duplicate carried forward from Package 06.

This package deliberately resolves none of them. Admitting a venue whose
identity is ambiguous creates a duplicate in the canonical estate, which is
materially harder to undo than to avoid. Settling that gate is the next
package's job, and it must happen before governed canonical admission runs.

## What this is not

A census row is not a source and not a canonical venue. Activation still
requires a full governed investigation under
`docs/SOURCE_INVESTIGATION_POLICY.md`, then a separate, explicitly authorised
registry admission (`docs/SOURCE_REGISTRY.md`). Admission to `venues/uk.json`
is a separate, later, explicitly-approved package.

## Regenerating

```bash
npm run build:high-value-venue-census-07
npm run validate:high-value-venue-census-07
node --test tests/high-value-venue-census-07.test.mjs
```
