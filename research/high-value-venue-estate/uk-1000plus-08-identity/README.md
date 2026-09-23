# UK high-value venue estate — identity gate `uk-1000plus-08-identity`

`BEATMAPPED-UK-HIGH-VALUE-VENUE-IDENTITY-GATE-08`

The last gate before governed canonical admission. Package 07 closed the
**coverage** phase; this closes the **identity** phase and produces the
admission-ready population.

**It admits nothing.** `venues/uk.json` is not modified and no venue is minted.

---

## The headline

| | Package 07 | Package 08 |
|---|---|---|
| Confirmed research rows | 800 | — |
| **Final unique real-world venues** | — | **800** |
| Already in BeatMapped | 259 | **260** |
| **Admission-ready** | 524 | **536** |
| Ambiguous hold | 17 | **4** |

`260 + 536 + 4 = 800`, with no unexplained remainder.

`admission-ready.json` is the **sole input** to the next package.

---

## What the gate actually caught

The 17 ambiguous rows were not a formality. Fourteen of them carried a flag from
an earlier census which had **merged two separately-researched records because
they shared an alternative name** — and for four of those, the merge was wrong.
The result was rows whose own capacity and programme URL describe a *different
venue* from the one the row is named after.

| Held row | What it actually is | The conflation |
|---|---|---|
| **Newcastle Greyhound Stadium** | Greyhound stadium, Fossway, Byker, **NE6 2XJ** | Carried Utilita Arena Newcastle's capacity and programme. That arena is at Arena Way, **NE4 7NA** — a different postcode and district. |
| **Owlerton Greyhound Stadium** | Greyhound stadium, Penistone Road, Hillsborough, **S6 2DE** | Carried Utilita Arena Sheffield's capacity and programme. That arena is at 45 Broughton Lane, **S9 2DF**. |
| **AMT Headingley Rugby Stadium** | The rugby league ground at the Headingley complex | Shares a site with Headingley Cricket Ground, but they are two separately-owned grounds (Leeds Rugby vs Yorkshire CCC). The row holds the rugby capacity but the **cricket club's** programme URL. |
| **Liverpool Experience Campus** | The 2026 rebrand of the *operating organisation* (formerly ACC Liverpool Group) — an umbrella brand, not a bookable venue | Its capacity and programme both describe **M&S Bank Arena**, which the corpus already holds separately. |

Admitting any of these would have minted a canonical venue with another venue's
capacity and another venue's programme source. All four are **held**.

One row survived the same suspicion: **bp pulse LIVE**. Its capacity source is a
shared NEC Group hall listing, which looked like the same defect — but the page
genuinely includes that arena as an entry, and its own site, programme and
address (Perimeter Rd, Marston Green, B40 1NT) are all self-consistent. That is
imprecise sourcing, not a merged identity, so it is admission-ready.

---

## The direction of failure

Every rule in this package fails towards **holding** rather than admitting.

A venue held back is safe — the next package can revisit it. A venue wrongly
admitted creates a canonical duplicate, or a canonical record carrying the wrong
capacity, and that is materially harder to undo than to avoid.

Concretely:

- an ambiguous row with **no** identity decision holds, so nothing reaches
  admission by omission;
- a decision whose evidence does not support it is **refused**, and the row
  holds;
- a canonical match cannot rest on `LOW` confidence, or on a search snippet —
  it needs a fetched page;
- a research-row duplicate collapses to **one** entity, never two admissions.

---

## Every decision was independently re-verified

Researcher conclusions are not copied. `reverifyDecision()` re-checks each one
before it may affect the estate:

- a canonical match must name a canonical venue that **actually exists** in
  `venues/uk.json`, and cite at least one `FETCHED_URL`;
- a same-venue claim must point at a **real** Package 07 confirmed row;
- a distinct-and-missing claim must not contradict Package 07's own match.

**Three decisions were refused** on that basis. All three were the racecourses
(Cheltenham, Epsom Downs, Aintree), and the refusal was correct: their only
evidence was a path to an ephemeral **scratch file**, which this repository's
own `docs/SOURCE_INVESTIGATION_POLICY.md` prohibits as durable evidence.

The substance was right, so those three were re-decided by the **coordinator**
against the committed canonical registry itself — see
`coordinator-decisions` provenance in `identity-decisions.json`. A coordinator
decision passes exactly the same re-verification as any other; it gets no
special treatment.

---

## The racecourse ambiguity, explained

Cheltenham, Epsom and Aintree were flagged only because every Jockey Club course
shares one operator domain, and one canonical venue cites it. The collision is
with **Newmarket Racecourses** alone, at `thejockeyclub.co.uk/newmarket/` — and
the course-specific paths (`/cheltenham/`, `/epsom/`, `/aintree/`) disambiguate
completely. The canonical estate holds exactly four racecourses: Chelmsford
City, Chester, Newmarket, York. None of these three.

---

## The Anglesey pair

`Anglesey Showground` and `The Anglesey Showground` are **the same venue** —
same postcode (LL65 4RW), same operator, same official domain, same Welsh name
(*Maes Sioe Môn*), corroborated independently against Companies House.

It does **not** change the count. Only one of the two rows was ever
`CONFIRMED_1000_PLUS`; the other is capacity-unverified and was never part of
the 800.

---

## The files

| File | What it holds |
|---|---|
| `manifest.json` | What this gate is, what it consumed, `mutated: false` on each |
| `predecessor-reconciliation.json` | Proof every Package 07 confirmed row is dispositioned, plus the arithmetic |
| `identity-decisions.json` | Every decision, accepted and **refused**, with evidence |
| `identity-review-resolved.json` | The 17, each with its Package 07 reason, decision and admission effect |
| `identity-holds.json` / `admission-holds.json` | What is deliberately held, and why |
| `canonical-matches.json` / `represented-in-canon.json` | Venues BeatMapped already has |
| `canonical-duplicate-candidates.json` | Canonical-estate duplicates. **Nothing is merged** |
| `research-row-duplicates.json` | Where two research rows proved to be one venue |
| `anglesey-showground-decision.json` | The known pair, explicitly decided |
| `unique-confirmed-estate.json` | The authoritative unique-entity layer (`HVUK-*`) |
| **`admission-ready.json`** | **The sole input to the next package** |
| `suggested-alias-enrichment.json` | Aliases for canonical venues — suggestions only, **never applied** |
| `summary.json` | Headline counts and quality invariants |

---

## What admission-ready guarantees

Every row is, and is mechanically checked to be:

- confirmed **≥1,000** capacity;
- **permanent** under Package 07 semantics;
- a **unique** real-world identity (no two rows are the same entity);
- **definitely not already canonical**;
- not a research duplicate, not an unresolved canonical duplicate, not
  identity-ambiguous;
- carrying **identity evidence**, so the next package can admit
  deterministically rather than mint blind.

---

## Regenerating

```bash
npm run build:high-value-venue-identity-gate
npm run validate:high-value-venue-identity-gate
node --test tests/high-value-venue-identity-gate.test.mjs
```

The builder refuses to write if any row violates the contract or if any
Package 07 confirmed row lacks a disposition.
