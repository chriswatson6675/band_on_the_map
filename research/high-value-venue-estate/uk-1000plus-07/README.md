# UK high-value venue estate — final closure corpus `uk-1000plus-07`

`BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-FINAL-CLOSURE-07`

The **frozen** UK high-value venue census: permanent venues with a maximum
normal public capacity of at least 1,000, and the programme, conference or
fixture source that would serve each one.

It supersedes `uk-1000plus-06` as the working corpus. It does not replace it —
Packages 05 and 06 remain on disk, unmodified.

Research only. No events acquired, no canonical venues admitted, no sources
activated.

---

## Why this package existed

Package 06 reached `COMPLETE` or `MATERIAL_COMPLETE` on 22 of 23 venue classes.
One stayed `PARTIAL`: **`STADIUM`**.

`STADIUM` is a residual bucket — venues whose retained calendar sources named
neither rugby code, so they fell through to the generic class. It has no
national directory of its own; its completeness derives from the sport-specific
sweeps. Of its 8 rows, 5 were accounted for by league estates already audited.
**3 were not**, because two sweeps had never been run:

- **RFL Championship / League 1**
- **national athletics**

This package ran both, accounted for all 8 rows, and froze the census. It is
surgical: no other class was re-researched, and the coverage matrix says so
explicitly for each one.

---

## What the two sweeps actually found

**Zero new confirmed ≥1,000 venues.** That is the expected — and the good —
outcome of a closure package: it proves the omitted estates were not hiding
material high-value venues.

But the sweeps were far from a formality. Two substantive findings came out:

### 1. The RFL merged its two divisions

For the 2026 season the RFL merged Championship and League 1 into a single
20-club division. "RFL Championship" and "RFL League 1" are now the same
estate, so there is no separate League 1 list to walk. All 20 grounds were
already held — 14 directly, and 6 as legitimate groundshares already held under
`FOOTBALL_GROUND` or `RUGBY_UNION_GROUND`.

### 2. All three previously-uncovered rows had unsupportable capacities

This is the part that mattered. The three rows that had never been
source-family-checked were also the three carrying the weakest capacity
evidence — all `LOW` confidence — and the sweeps found none of the figures
held up:

| Row | Held figure | What the sweep found |
|---|---|---|
| **Queensway Stadium**, Wrexham | 8,256 | Traces to a single uncited Wikipedia infobox; Wikidata cites it *circularly* as "imported from" that same infobox. The tenant club's own page describes "two small all-seater stands". |
| **White Hart Lane Community Sports Centre**, London | 5,000 | Also an uncited Wikipedia infobox. The tenant athletics club's **own** matchday page states the main stand seats **1,040**. |
| **Post Office Road**, Featherstone | 9,850 | Sources conflict (6,954 vs 9,850), both undated. Featherstone Rovers entered administration in Dec 2025 and were not admitted to the 2026 Championship. |

All three had their held capacity **withdrawn**, moving from
`CONFIRMED_1000_PLUS` to `CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE`. No
replacement figure was invented for any of them.

The confirmed total therefore went **down**, from 803 to 800. A closure package
that only ever added venues would have been the suspicious result.

---

## The central guarantees

**Every one of Package 06's 924 rows has exactly one disposition here** —
proven by `reconcileAgainstPredecessor()`, enforced by the validator, asserted
by a test.

**Every headline count is recomputed, not carried.** The carry-forward
independently regenerated Package 06's exact figures (803 / 110 / 259 / 527 /
17) before any Package 07 research was applied. Nothing was copied across.

**The row rules cannot drift from Package 06's.** Rather than re-type the
honesty rules — a confirmed capacity needs a citable source, a negative claim
needs evidence, a blocked row may carry no negative claim, a planned capacity
is not a capacity, a confirmed venue must be permanent — `validateCensus07Row()`
projects each row into the Package 06 shape and **delegates to Package 06's own
validator**. A test asserts the delegation actually happens. A forked copy that
silently accepted a row Package 06 would reject is the failure this avoids.

---

## The COMPLETE gate

`COMPLETE` is deliberately hard to reach and is checked against
machine-readable evidence, not a report. Three things must all hold:

1. every venue class is `COMPLETE` or `MATERIAL_COMPLETE`;
2. **both** required source-family sweeps actually ran;
3. **all 8** predecessor `STADIUM` rows are covered — including the 3 that were
   the reason this package exists.

The required sweeps are named in `contract.mjs`, not in prose, so the check
cannot be satisfied by assertion. `stadium-source-estate-audit.json` records
every row, the source family that accounts for it, and its evidence; an entry
claiming coverage with empty evidence is rejected.

A coverage statement citing only our own estate is still disregarded — that
anti-circularity rule is carried forward from Package 06, where two classes had
claimed completeness by checking the estate against itself.

---

## The files

`census.json` is authoritative; every other file is a view over it.

| File | What it holds |
|---|---|
| `manifest.json` | What this corpus is, which predecessor artifacts it consumed, `mutated: false` on each |
| `predecessor-reconciliation.json` | Proof every Package 06 row is dispositioned, plus every state transition |
| `stadium-source-estate-audit.json` | **The point of the package**: all 8 STADIUM rows, their source family, their evidence |
| `rugby-league-source-estate.json` | The RFL Championship / League 1 sweep |
| `athletics-source-estate.json` | The national athletics sweep |
| `newly-discovered-venues.json` | What the sweeps surfaced; each names the family that found it |
| `census.json` | **Authoritative.** Every row |
| `summary.json` | Headline counts, cross-tabs, quality invariants |
| `confirmed-1000-plus.json` | Permanent venues with evidenced capacity ≥1,000 |
| `capacity-unverified-candidates.json` | High-value candidates without capacity proof — **outside** the confirmed count |
| `below-threshold.json` / `non-permanent-exclusions.json` | Researched negatives, retained |
| `existing-canonical.json` / `missing-from-canonical.json` | Canonical coverage |
| `identity-review.json` | **What blocks admission** — carried forward, deliberately unresolved here |
| `sports-venues.json` / `calendar-sources.json` | Segment and source views |
| `coverage-matrix.json` | Per class: Package 06's state, what Package 07 did, the final state |
| `coverage-evidence.json` | Source families walked, with members inspected vs known |
| `research-blocked.json` | Where research could not complete. **Carries no negative findings** |

---

## What this package deliberately does NOT do

It does not resolve the identity gate, and that is the next package's job:

- the **17 confirmed venues** whose canonical identity is ambiguous;
- the **Anglesey Showground / The Anglesey Showground** intra-corpus duplicate;
- any rows held out pending permanence.

Admitting a venue whose identity is ambiguous creates a duplicate in the
canonical estate, which is materially harder to undo than to avoid. Those must
be settled before governed canonical admission runs.

---

## Regenerating

```bash
npm run build:high-value-venue-census-07
npm run validate:high-value-venue-census-07
node --test tests/high-value-venue-census-07.test.mjs
```

The builder refuses to write if any row violates the contract, if any
predecessor row lacks a disposition, or if the stadium audit does not account
for all 8 rows.
