# `uk-1000plus-09-admission` — canonical admission audit

`BEATMAPPED-UK-HIGH-VALUE-VENUE-CANONICAL-ADMISSION-09`
Predecessor: `uk-1000plus-08-identity` at main `3cb2a4c5`.

This directory is the **audit trail of a canonical write**, not a research
corpus. Packages 05–08 recorded what was found; this one records what was
done to `venues/uk.json` and why, in enough detail to reconstruct or dispute
every one of the 535 records it created.

Narrative context: `docs/UK_HIGH_VALUE_VENUE_CANONICAL_ADMISSION.md`.

```
canonical UK venues:  3,537  ->  4,072   (+535)
admission input: 536 rows  =  535 minted  +  1 already canonical
```

## The files

| File | What it holds |
|---|---|
| `manifest.json` | What the package is, the rules it bound itself to, what it consumed and what it refused to admit. Read this first. |
| `input-snapshot.json` | The admission input exactly as consumed — declared vs observed counts, and the breakdown by nation, segment and venue class. |
| `dry-run.json` | The deterministic plan, computed **before** any canonical write. The write only proceeded because this was green. |
| `admission-decisions.json` | One decision per input row, so all 536 are accounted for. Every row is `ADMITTED`, `ALREADY_CANONICAL` or `HELD` — never unaccounted. |
| `admitted-venues.json` | The 535 canonical Venue records as written, plus their distribution. |
| `canonical-id-map.json` | **The provenance bridge.** Every minted `venue_id` mapped back to its Package 08 entity and Package 07 research rows. The Venue contract stores no lineage field, so traceability lives here. |
| `already-canonical.json` | Rows found to already exist in a canonical registry — reused, never duplicated. Also records the shared-operator-domain matches that were **rejected** as false duplicates. |
| `held-or-rejected.json` | Rows not minted for any reason other than already being canonical, plus the four upstream identity holds, listed so the exclusion is visible from here too. |
| `post-admission-reconciliation.json` | The closing reconciliation, recomputed from `venues/uk.json` **as it now stands** rather than from what the plan expected. |
| `summary.json` | Headline figures, estate coverage, and the quality invariants — all of which must be zero. |

## How to re-verify this rather than trust it

```
npm run validate:high-value-venue-admission
```

The validator is read-only and re-derives every claim from the registry
itself, so a hand-edit to `venues/uk.json` or to any artifact in this
directory fails it rather than being believed. It checks, among other
things, that every venue in the whole 4,072-row registry satisfies the Venue
contract, that no two venues share an id or a real-world identity, that no
admitted venue carries an invented address or coordinates, that no
third-party URL is labelled official, and that **re-running the admission
admits nothing** — the write is idempotent.

## Reading the numbers correctly

- **`already_canonical` is 1, and that is a finding, not noise.** Eventim
  Apollo was canonical in `venues/london.json` all along. Packages 05–08
  reconciled only against `venues/uk.json` and so all four reported it
  missing. It is counted as represented exactly once.
- **Three rejected domain matches are in `already-canonical.json`, not
  `held-or-rejected.json`.** They were rejected *as duplicates* and then
  admitted normally. Cheltenham, Epsom and Aintree share
  `thejockeyclub.co.uk` with the already-canonical Newmarket; a bare
  hostname match would have suppressed three real venues.
- **Every admitted venue is `UNRESOLVED`.** Package 08 carried no
  coordinates and no street addresses. Postcodes are kept in each venue's
  admission evidence note for a later geocoding pass.
- **Only 14 of 535 carry `OFFICIAL_VENUE_WEBSITE` evidence.** That is the
  number with a retained fetch of their own site. The others have a research
  claim about their website, which is a different thing.
- **There is no capacity field.** The canonical Venue contract has none and
  this package invented none; the ≥1,000 evidence stays in Packages 05–07.

## Immutability

This directory is a snapshot. Do not edit it to reflect later changes to the
venue estate — a successor package supersedes it by recording its own
dispositions, exactly as this package superseded `uk-1000plus-08-identity`
without modifying it.
