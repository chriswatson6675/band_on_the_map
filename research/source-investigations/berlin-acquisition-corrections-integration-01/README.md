# Berlin acquisition corrections — integration candidate

Task: `BEATMAPPED-BERLIN-ACQUISITION-CORRECTIONS-INTEGRATION-01`
`origin/main` = `676b53d11d2669b2aa1100fa2d8b35e62226cb36` (**unchanged**;
re-verified at the start of this package)
Integration candidate: **`8de5398`**
Branch: `candidate/beatmapped-berlin-acquisition-corrections-integration-01`

Integration only. No new acquisition behaviour, no additional fix.

## Topology

Both lines descend **directly** from current main — `merge-base(3161494,
72e5b4d)` is exactly `676b53d`, and `3161494`'s parent is `676b53d`:

```
*   8de5398  integration candidate
|\
| * 3161494  A  static-card text dates
* | 72e5b4d  D  normalisation/proof date parity
* | 986aebb  C  proof date prefix parsing
* | f1e8b35  B  self-referential Event URL identity
|/
*   676b53d  origin/main
```

Ancestry verified on the candidate — all four are ancestors of `8de5398`:

| candidate | commit | ancestor of `8de5398` |
|---|---|---|
| A static-card text dates | `3161494` | **YES** |
| B self-referential identity | `f1e8b35` | **YES** |
| C proof date prefix | `986aebb` | **YES** |
| D normalisation parity | `72e5b4d` | **YES** |

Joined with a real merge commit (`--no-ff`). Nothing squashed, rebased,
cherry-picked or recreated.

## Conflicts: none

The two sides touch **disjoint** files — `ingestion/static-cards/` versus
`ingestion/programme-acquisition/` — so the merge was clean with zero
conflicted files and no manual resolution.

## Changed paths vs `origin/main`, attributed

| path | package |
|---|---|
| `ingestion/static-cards/card-date.mjs` | A |
| `ingestion/static-cards/collector.mjs` | A |
| `tests/static-card-date-text.test.mjs` | A |
| `tests/static-card-empty-fallback.test.mjs` | A |
| `ingestion/programme-acquisition/offline-proof.mjs` | B, C |
| `tests/self-referential-event-url-identity.test.mjs` | B, C |
| `ingestion/programme-acquisition/proof-date.mjs` | C |
| `tests/proof-date-prefix.test.mjs` | C |
| `ingestion/programme-acquisition/discovery.mjs` | D |
| `tests/normalisation-proof-date-parity.test.mjs` | D |

**No unexplained path, and category E is empty** — each parent's diff to the
merge commit is exactly the other parent's changes, so the merge introduced no
content of its own.

`sources/`, `venues/`, `data/`, `deploy/` and `.github/` are untouched. No
source definition changed. `orchestrator.mjs` and `source-execution.mjs` are
byte-identical to `origin/main`.

## Bounded local Berlin reconciliation (§18)

Not a production city run. Each source was run until two consecutive runs
agreed; all thirteen agreed.

| source | mechanism | normalized | proven | identity basis | terminal state | vs census |
|---|---|---|---|---|---|---|
| `tempodrom-berlin` | JSON_LD_EVENT | 151 | **11** | SELF_REFERENTIAL ×11 | **`ACQUISITION_PROVEN`** | FAILED → PROVEN |
| `waldbuehne-berlin` | STATIC_HTML_CARDS | 14 | **11** | SELF_REFERENTIAL ×11 | **`ACQUISITION_PROVEN`** | FAILED → PROVEN |
| `a-trane-berlin` | JSON_LD_EVENT | **48** | **8** | CANONICAL ×8 | **`ACQUISITION_PROVEN`** | FAILED → PROVEN, 11 → 48 norm |
| `huxleys-neue-welt-berlin` | STATIC_HTML_CARDS | **111** | 0 | — | `STABLE_IDENTITY_PROOF_FAILED` | 0 → 111 normalized |
| `radialsystem-berlin` | STATIC_HTML_CARDS | **14** | 0 | — | `STABLE_IDENTITY_PROOF_FAILED` | 0 → 14 normalized |
| `b-flat-berlin` | STATIC_HTML_CARDS | 8 † | 8 † | CANONICAL ×8 | `ACQUISITION_PROVEN` | unchanged |
| `privatclub-berlin` | OTHER_EMBEDDED_APP_STATE | 30 | 11 | CANONICAL ×11 | `ACQUISITION_PROVEN` | unchanged |
| `konzerthaus-berlin` | STATIC_HTML_CARDS | 33 | 0 | — | `STABLE_IDENTITY_PROOF_FAILED` | unchanged |
| `zig-zag-jazz-club-berlin` | STATIC_HTML_CARDS | 0 | 0 | — | `SUPPORTED_COLLECTOR_NO_VALID_EVENTS` | unchanged |
| `tresor-berlin` | STATIC_HTML_CARDS | 0 | 0 | — | `SUPPORTED_COLLECTOR_NO_VALID_EVENTS` | unchanged |
| `cassiopeia-berlin` | STATIC_HTML_CARDS | 0 | 0 | — | `SUPPORTED_COLLECTOR_NO_VALID_EVENTS` | unchanged |
| `ausland-berlin` | STATIC_HTML_CARDS | 0 | 0 | — | `SUPPORTED_COLLECTOR_NO_VALID_EVENTS` | unchanged |
| `quasimodo-berlin` | STATIC_HTML_CARDS | 0 | 0 | — | `SUPPORTED_COLLECTOR_NO_VALID_EVENTS` | unchanged |

† **b-flat's 9 → 8 is live drift, not a regression.** It publishes no unpadded
dates, and the cutoff is the fetch timestamp's date; b-flat has real events on
`2026-08-29` and `2026-08-30` which fell out of window as UTC advanced. It was
observed at 10, then 9, then 8 across this work — including on unmodified
bases. Every run proved **100% of what it normalized**, via the canonical basis.

**Fail-closed evidence, no guessing.** `konzerthaus` rejected **52 of 85** cards
for no resolvable date; `radialsystem` rejected 3 of 19; `zig-zag`, `tresor`,
`cassiopeia`, `ausland` and `quasimodo` normalized **0**. Not one date was
invented.

## Semantics audits

**Proof hierarchy (§12).** `SOURCE_PUBLISHED_CANONICAL_EVENT_URL` first; the
self-referential basis is reachable only past `if (canonicalLinkDeclared(...))
continue;`, so a declared canonical — agreeing, disagreeing or unreadable — can
never be bypassed. Relative and malformed URLs stay rejected, the fetched URL
alone is never identity, no title+date identity exists, and collision/dedupe
and cutoff rules are untouched.

**Date parity (§13).** `proofDateFromStartDate()` is the single implementation,
called from `discovery.mjs:105` (normalisation) and `offline-proof.mjs:134` and
`:173` (both proof paths). **No padded-only date-prefix regex remains anywhere
in `ingestion/programme-acquisition/`.** Grammar and strict validation unchanged;
no clock, locale or timezone inference.

**Static-card hierarchy (§14).** `resolveCardDate()` still resolves
machine-readable datetime → complete text date → deterministic context year →
deterministic numeric order → reject. `card-date.mjs` contains no `Date.now`,
`new Date`, `getFullYear` or `Intl` outside the comment asserting that.

**Coverage (§15).** `detailLimit = 12` unchanged; candidate discovery, ordering
and fetch strategy unchanged; `orchestrator.mjs` and `source-execution.mjs`
byte-identical to main. The 291-unretrieved-event issue is untouched.

## Deferred (§16)

`ingestion/embedded-state/collector.mjs:23` still carries a padded-only
date-prefix predicate. **Not fixed here.** Deferred as
`BEATMAPPED-EMBEDDED-STATE-DATE-PREFIX-PARITY-01`. It is structurally
susceptible to the same normalisation/proof disjointness, and it does govern a
live proven source (`privatclub-berlin`, `OTHER_EMBEDDED_APP_STATE`) — but that
source publishes only padded dates, so there is no current payoff and no
blocker.

## Tests

**2586 pass / 0 fail / 0 skipped.** Lineage: main 2505 → B/C 2531 → 2551 → D
2559, plus A's 27 static-card tests = **2586**. Nothing weakened or skipped.
