# Proof-date prefix parsing — the IP-3 correction

Task: `BEATMAPPED-PROOF-DATE-PREFIX-PARSING-01`
`origin/main` = `676b53d11d2669b2aa1100fa2d8b35e62226cb36`
Base: `f1e8b35` (`work/beatmapped-jsonld-self-referential-event-url-identity-01`,
not on main). Nothing merged.

## Reproduction (§2)

`a-trane-berlin`: **11 normalized, 0 proven, `STABLE_IDENTITY_PROOF_FAILED`**.
11 detail documents fetched, 9 carrying JSON-LD Event nodes, **all publishing a
`rel=canonical`** — so identity comes from canonical proof and the
self-referential basis correctly never engages.

Of 58 observed Event nodes, **47 carry an unpadded `startDate`**
(`2026-8-31T20:30+2:00`, `2026-9-1T20:30+2:00`, …). The proof clause read the
date with `/^\d{4}-\d{2}-\d{2}/`, which requires a zero-padded month **and**
day, so each was treated as an absent date and rejected.

The 11 that did parse are the Oct/Nov events, whose month and day are naturally
two digits.

## The change

New `ingestion/programme-acquisition/proof-date.mjs` exporting
`proofDateFromStartDate()`, called from the two places in `offline-proof.mjs`
that previously inlined the regex. Three lines changed there; nothing else.

**Grammar (§4).** `YYYY-M-D`, `YYYY-MM-D`, `YYYY-M-DD`, `YYYY-MM-DD`, which must
be followed by end-of-string, `T`, or a space. Rejected as before:
`31-8-2026`, `31/8/2026`, `2026/8/31`, `Aug 31 2026`, `31 Aug`, `20260831`,
`2026-W35-1`, bare timestamps.

**Normalisation (§5).** Zero-padding only. No year, month, day, timezone,
locale or date order is ever inferred.

**Validation (§6).** Strict, by arithmetic: month 1–12, day within the real
month length, proleptic Gregorian leap years (2028-02-29 valid, 2027-02-29 and
1900-02-29 not). Never round-tripped through `Date`, whose rollover would turn
`2026-02-30` into 2 March.

**Timezone (§7).** Untouched. A published `+2:00` stays exactly as written —
only the date prefix is read, and `start_raw` on the proof object keeps the
verbatim source value (§17).

**Clock (§8).** `proof-date.mjs` contains no `Date.now`, `new Date`,
`getFullYear`, `toISOString` or `Intl`. Verified stable across `TZ=UTC`,
`Pacific/Kiritimati` and `Pacific/Niue`.

**Preserved behaviour (§9).** Across all **513** distinct `startDate` literals
in the repository, the only values whose extracted date changes are the **9**
unpadded a-trane values, each going from wrongly-`null` to the correct date.
No previously-extracted date changes, and none is newly rejected.

Two forms *are* newly rejected, deliberately: `2026-08-311` and
`2026-08-31garbage`. The old predicate had no terminator check and silently
truncated both to `2026-08-31`. Neither occurs anywhere in the corpus.

## Result (§10/§20) — and the honest limit

| source | normalized | proven before | proven after | identity basis | proof-date form | terminal state |
|---|---|---|---|---|---|---|
| `a-trane-berlin` | 11 | 0 | **0** (proofs 0 → **8**) | `CANONICAL` | unpadded, now read | `STABLE_IDENTITY_PROOF_FAILED` |
| `tempodrom-berlin` | 151 | 11 | 11 | `SELF_REFERENTIAL` | padded | `ACQUISITION_PROVEN` |
| `waldbuehne-berlin` | 14 | 11 | 11 | `SELF_REFERENTIAL` | padded | `ACQUISITION_PROVEN` |
| `b-flat-berlin` | 9 | 9 | 9 | `CANONICAL` | padded | `ACQUISITION_PROVEN` |
| `privatclub-berlin` | 30 | 11 | 11 | `CANONICAL` | padded | `ACQUISITION_PROVEN` |
| `konzerthaus-berlin` | 33 | 0 | 0 | — | — | `STABLE_IDENTITY_PROOF_FAILED` |

**The proof clause is fixed and works: a-trane goes from 0 proofs to 8**, each
with correct canonical identity. But its **proven event count stays 0**, and
this package cannot move it, because the *identical* date predicate still lives
at `ingestion/programme-acquisition/discovery.mjs:93`, inside
`proveJsonLdEvents()` — the normalisation path §19 puts out of scope.

Measured on the retained documents:

- 48 distinct events across the retained documents;
- **37** are dropped at normalisation for an unreadable date despite being
  valid and at or after the cutoff;
- **all 8 events that now have a proof are among those 37.**

So the record set (11 Oct/Nov events) and the proof set (8 Aug/Sept events) are
**disjoint**, and `collectAndProve()` intersects them to decide `proven`. The
same one-line helper applied at `discovery.mjs:93` would let those 8 intersect
and take a-trane to **8 proven** — not ~11; the remainder is bounded by
`detailLimit = 12` and candidate ordering, which remain a separate package.

### b-flat's 9 → 10, explained

One cohort run showed b-flat at 10 normalized / 10 proven instead of 9/9. That
is **not** this change:

- b-flat publishes **zero** unpadded dates — all 10 live Event nodes are padded,
  so `proofDateFromStartDate()` returns exactly what the old regex returned;
- the unmodified base returned 9/9 on three consecutive runs, and the modified
  build returned 9/9 on three consecutive runs, in the same window;
- the cutoff is the fetch timestamp's date, and b-flat has a real event on
  `2026-08-29T09:00`. A run either side of a UTC midnight includes or excludes
  it. Both runs proved 100% of what they normalized, via the canonical basis.

## IP-2 negative controls (§13)

`konzerthaus-berlin`: 33 normalized, **0 proven**, unchanged — its inspected
detail documents carry no JSON-LD Event nodes, and a date parser cannot
manufacture one.

`huxleys-neue-welt-berlin` and `radialsystem-berlin` normalize 0 on this base
(they need `3161494`'s text-date work, which is not on main and was not
merged). They were verified as negative controls on the base where they *do*
normalize during the preceding identity package — 111 and 14 normalized, 0
proofs before and after. Their detail documents carry no Event nodes, so this
change cannot reach them either. Reported here rather than re-run, since this
package changes only the date predicate they never get as far as.

## Explicitly unchanged

`detailLimit = 12`, candidate discovery/ordering, detail-fetch and retry
strategy, all collectors (`STATIC_HTML_CARDS`, JSON-LD acquisition), programme
routing and resolution, `sources/berlin.json`, the source registry, canonical
identity semantics, self-referential-URL identity semantics, cutoff semantics,
and every proof threshold. `git diff f1e8b35` over all of those paths is empty.
