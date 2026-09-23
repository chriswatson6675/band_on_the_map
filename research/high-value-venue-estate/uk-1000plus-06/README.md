# UK high-value venue estate — completion corpus `uk-1000plus-06`

`BEATMAPPED-UK-HIGH-VALUE-VENUE-CENSUS-COMPLETION-06`

The **current working estate** of permanent UK venues with a maximum normal
public capacity of at least 1,000, and of the programme, conference or
fixture source that would serve each one.

It supersedes `uk-1000plus-05` as the working corpus. It does **not** replace
it: Package 05 remains on disk, unmodified, as an immutable predecessor
snapshot.

Research only. No events acquired, no canonical venues admitted, no sources
activated.

---

## Why this package exists

Package 05 built a genuinely useful estate but terminated
`UK_HIGH_VALUE_VENUE_CENSUS_PARTIAL`, because material coverage was
incomplete: the conference/exhibition segment held only 60 venues nationally,
the concert-hall differential was never run, 163 high-value candidates had no
capacity evidence (including 60 of 61 racecourses and all 23 motorsport
venues), and ten open-air sites sat inside the confirmed total with their
permanence unresolved.

This package closes those gaps so that a **governed canonical admission**
package can run next against a defensible estate.

---

## The two things that changed structurally

### 1. Permanence is now its own axis, not a caveat

The inclusion rule says **permanent** venue. Package 05 counted public parks,
a castle esplanade, bandstands, a museum and a showground inside its confirmed
total and flagged them in a `permanence_review` block for someone to look at
later.

Here, `permanence_class` is a first-class evidenced field, and the contract
enforces it: a row cannot be `CONFIRMED_1000_PLUS` unless its permanence class
is one that actually denotes a permanent venue.

The distinction that matters is **not** indoor versus outdoor:

- a bandstand, an amphitheatre, a dedicated events arena or an esplanade with
  an established configured annual event has its own stable venue identity and
  **remains** in the estate (`OPEN_AIR_SITE_WITH_STABLE_VENUE_IDENTITY`);
- a public park that merely hosts an occasional temporary concert is **not** a
  permanent 1,000-capacity venue just because one temporary event once held
  that many (`PUBLIC_SPACE_NOT_A_VENUE`).

Rows whose permanence could not be resolved are held **out** of the confirmed
estate as `IDENTITY_REVIEW` rather than counted. That is deliberate: we would
rather under-claim than assert a venue we have not established is one.

### 2. Every row has a terminal disposition

`capacity_state` is now exhaustive — `CONFIRMED_1000_PLUS`,
`CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE`, `CONFIRMED_BELOW_THRESHOLD`,
`NOT_A_PERMANENT_VENUE`, `IDENTITY_REVIEW`, `RESEARCH_BLOCKED`. Nothing sits
in an implied residue, and the validator proves the states sum to the corpus.

---

## The central guarantee

**Every one of Package 05's 911 rows has exactly one disposition here.**

`reconcileAgainstPredecessor()` proves it, the validator enforces it, and a
test asserts it. A predecessor row cannot be silently dropped to improve a
headline, and cannot be claimed by two successors.

`predecessor-reconciliation.json` also resolves Package 05's own reported
arithmetic, with no unexplained remainder:

| Question | Answer |
|---|---|
| 911 research rows vs 906 high-value | The extra 5 are `BELOW_THRESHOLD` audit rows — venues researched and **proven** below 1,000, retained honestly rather than deleted. 743 + 163 + 5 = 911. |
| Sports 547 vs displayed 534 | The report's sports-by-type list omitted the `STADIUM` class entirely (8 rows) and excluded the 5 below-threshold sports rows. 534 + 8 + 5 = 547. |
| 906 high-value across match states | 251 exact + 13 probable = 264 in canon; 614 missing; the remaining **28 are `AMBIGUOUS_IDENTITY`**. |
| 743 confirmed across match states | 231 exact + 12 probable = 243 in canon; 486 missing; the remaining **14 are `AMBIGUOUS_IDENTITY`**. |

---

## Where the numbers live

`summary.json` is the only place headline counts are published; everything
else quotes it. Every count is computed by
`ingestion/high-value-venue-census-06/build.mjs` from cited inputs, and
`validate.mjs` re-derives each headline from `census.json` and fails if the
two disagree.

That discipline is inherited from Package 05 for a specific reason: the
national package before it published *"2,014 UK venues have no website"*,
which was false — the number was computed one way and described another, and
1,757 of those venues had never been researched at all.

---

## The files

`census.json` is authoritative; every other file is a view over it, and the
validator proves each view is a genuine subset whose membership rule holds.

| File | What it holds |
|---|---|
| `manifest.json` | What this corpus is, which Package 05 artifacts it consumed, `mutated: false` on each |
| `predecessor-reconciliation.json` | Proof every Package 05 row is dispositioned, plus the arithmetic above |
| `census.json` | **Authoritative.** Every row |
| `summary.json` | Headline counts, cross-tabs, quality invariants |
| `confirmed-1000-plus.json` | Permanent venues with evidenced capacity ≥1,000 |
| `capacity-unverified-candidates.json` | High-value candidates without capacity proof — **outside** the confirmed count |
| `below-threshold.json` | Researched and proven below 1,000 |
| `non-permanent-exclusions.json` | Excluded as not permanent venues. Retained in full |
| `permanence-review.json` | The permanence axis and what remains unresolved |
| `existing-canonical.json` / `missing-from-canonical.json` | Canonical coverage |
| `identity-review.json` | Ambiguous identity + unresolved permanence — **what blocks admission** |
| `conference-venues.json` / `sports-venues.json` / `music-general-venues.json` | The three strategic segments |
| `operator-estates.json` | Shared hosts covering several venues |
| `platform-families.json` | Families by measured coverage |
| `generic-extraction-shapes.json` | What one implementation would actually cover |
| `calendar-sources.json` | Every row with a public programme source |
| `coverage-matrix.json` | Per class: what was covered, and the completeness assessment |
| `coverage-evidence.json` | Source families walked, members inspected vs known |
| `research-blocked.json` | Where research could not complete. **Carries no negative findings** |

---

## Reading the leverage analysis correctly

`generic-extraction-shapes.json` preserves Package 05's distinction, which
must not be collapsed:

| Kind | Meaning |
|---|---|
| `STANDARDS_BASED_GENERIC` | One parser genuinely covers every member (schema.org JSON-LD / microdata) |
| `SINGLE_OPERATOR_PLATFORM` | One host, one uniform platform — one implementation |
| `SHARED_FRAMEWORK_UPPER_BOUND` | **An upper bound, not an integration size.** A shared framework is not a shared platform |
| `NOT_A_SINGLE_INTEGRATION` | A bucket of unrelated bespoke sites |

Unrelated operators commonly build on the same framework with different
payload shapes — Package 05 found ATG, Academy Music Group and Trafalgar all
fingerprinting as Next.js while being three separate estates.

---

## Three defects this package found in its own machinery

Worth knowing about, because each one silently produced a wrong number before
it was caught, and each is now covered by tests.

### 1. A planned capacity is not a capacity

A racecourse reached `CONFIRMED_1000_PLUS` at 20,000 on a source saying the
*developers planned for the venue to have* that capacity. A figure someone
intended is not evidence of what a venue holds.

The guard targets the capacity **evidence note**, not the free-text context —
deliberately, because a venue with a valid current figure whose context
mentions a future extension must not be demoted. A *record attendance* is
explicitly allowed: it is genuine evidence the venue held that many at least
once, which is a legitimate floor. A plan is not.

### 2. Review corrections were being discarded

The builder originally kept the **first** update per row. So when a researcher
revisited a row after review, the correction was thrown away and the flawed
verdict preserved — the exact opposite of what review is for.

Later updates now win, and are applied to the *original* carried row rather
than layering on top of an earlier verdict. Superseded updates are recorded in
`predecessor-reconciliation.json`, not lost.

### 3. Completeness rested partly on circular evidence

Two classes claimed `MATERIAL_COMPLETE` citing only
`"EXISTING-ESTATE.txt inspection only"` — checking our own estate against
itself, which evidences nothing about the world outside it.

A coverage statement citing no external source can no longer raise a class's
coverage state. The rule is precise in **both** directions: a statement naming
a real external estate that *also* mentions the held estate as the diff target
still counts, because discarding it would push honestly-researched work back
to `PARTIAL`. Disregarded statements are recorded with their reason in
`coverage-matrix.json`, never silently dropped.

## Honesty rules, enforced mechanically

Enforced in `contract.mjs`, covered by `tests/high-value-venue-census-06.test.mjs`:

1. A confirmed capacity needs a citable source that was actually fetched.
2. A negative claim — below threshold, no public calendar, not a permanent
   venue — needs evidence that somebody looked.
3. A `RESEARCH_BLOCKED` row may carry **no** negative claim. Tool exhaustion
   and access blocks are never recorded as absence.
4. A third-party source is never labelled official.
5. A missing-from-canon claim is an identity claim and needs identity evidence.
6. Platform family is never guessed; `UNKNOWN` is a respected answer.
7. A confirmed venue must be a **permanent** venue.
8. A researcher promotion that its own evidence does not support is **refused**
   by the builder, and the refusal is recorded in
   `predecessor-reconciliation.json` rather than silently dropped.

---

## Before trusting a completeness claim

Read `coverage-matrix.json`. `MATERIAL_COMPLETE` means every nationally
material discoverable source estate for that class was checked **and** the
residual gap is explicitly bounded in `residual_gap`. A class with no Package
06 research statement never inherits a complete state — it stays `PARTIAL`.

The overall verdict in `completeness_assessment` cannot be `COMPLETE` while
any class is `PARTIAL` or `BLOCKED`, and the validator rejects a corpus that
claims otherwise.

---

## Regenerating

```bash
npm run build:high-value-venue-census-06
npm run validate:high-value-venue-census-06
node --test tests/high-value-venue-census-06.test.mjs
```

The builder refuses to write anything if any row violates the contract or if
any predecessor row lacks a disposition, so a partially-valid corpus cannot be
published.

---

## What still stands between this corpus and canonical admission

`identity-review.json`. Ambiguous canonical identities and unresolved
permanence are the two things a governed admission package must settle before
admitting anything — admitting a venue whose identity is ambiguous risks
creating a duplicate in the canonical estate.
