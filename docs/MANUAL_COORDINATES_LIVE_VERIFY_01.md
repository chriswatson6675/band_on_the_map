# Manual Coordinates Live Verification (BOTM-MANUAL-COORDINATES-LIVE-VERIFY-01)

This document records the verification of **human, operator-entered** manual
venue coordinates against the real Lisbon/Porto display pipeline. It is a
verification/preservation record, not an implementation change — no source
collector, resolver, or coordinate-composition logic was modified.

**The coordinate values themselves were entered by a human operator** through
the local dashboard at `/operator/venues`, not generated, geocoded, or
invented by any automated process in this package. This package only reads,
validates, and preserves that human input.

## 1. Operator-entered coordinate count

At verification time, `venues/manual-coordinates.json` contained **7**
entries (not the full outstanding set of 19 — the operator completed 7 of
the 19 rows). All 7:

- have a unique `venue_id`, each referencing a real canonical Venue in
  `venues/lisbon.json` or `venues/porto.json`
- have `method: "MANUAL_OPERATOR_ENTRY"`
- have valid, in-range, numeric latitude/longitude
- have a valid ISO 8601 `entered_at` timestamp
- reference venues whose canonical `location_status` is `ADDRESS_ONLY`
  (never `CONFIRMED`, `GEOCODED`, or `UNRESOLVED`)

No duplicates, no invalid entries, no unknown `venue_id`s, no conflicts with
canonical status. See §2 for the full structural check.

The 7 completed venues: Village Underground Lisboa, BOTA Anjos, Super Bock
Arena — Pavilhão Rosa Mota, Galeria Zé dos Bois (ZDB), LAV – Lisboa ao Vivo,
Centro Cultural Malaposta, Biblioteca Municipal D. Dinis.

## 2. Queue before → after

| | Outstanding venues |
|---|---|
| Historical (pre-operator-entry) baseline | 19 |
| Current (`npm run report:manual-coordinate-queue`) | 12 |

12 = 19 − 7, exactly consistent with the 7 new entries. The 12 remaining
outstanding venues: Igreja e Convento da Graça, Casa Capitão, Hot Clube de
Portugal, Fama d'Alfama, Museu do Fado, Casa Independente, Clube de Fado,
Teatro São Luiz, Centro Cultural de Belém (CCB), Aula Magna (Reitoria da
Universidade de Lisboa), Hot Five Jazz & Blues Club, Capela Incomum.

## 3. Live ingestion: before/historical vs. current

A live HTTP run (`npm run ingest:lisbon-porto -- --from=2026-08-24
--to=2026-12-31`) was executed at 2026-08-24T21:05:59.191Z. All 13 sources
(9 Lisbon + 4 Porto) succeeded; none failed.

| Metric | Historical baseline (approx., point-in-time) | Current live run |
|---|---|---|
| Observations in window | ~297 | 299 |
| Resolved | — | 269 |
| Unresolved | — | 30 |
| Resolved-but-unmapped | ~114 | 2 |
| Raw map-eligible | — | 267 |
| Display listings | ~152 | 266 |
| Map markers | ~5 | 12 |

The historical figures are a point-in-time comparison only, not an
invariant — live source websites can and do change between runs. The
current live run is authoritative.

## 4. Display listing change

- Historical: 152
- Current: 266
- **Delta: +114**

This delta (+114) matches the historical resolved-but-unmapped count (114)
almost exactly, and independently matches the sum of the 7 newly-unlocked
venues' current listing counts (36 + 25 + 8 + 6 + 12 + 10 + 17 = 114) — a
consistent, cross-checked result, not a coincidence of rounding.

## 5. Map marker change

- Historical: ~5 (canonical CONFIRMED/GEOCODED only)
- Current: 12 (5 canonical + 7 newly manual-coordinate-eligible)

## 6. Remaining blocked observations

Resolved-but-unmapped fell from ~114 to **2**, both classified exactly:

| Venue | Blocked count | Reason |
|---|---|---|
| Igreja e Convento da Graça | 1 | `ADDRESS_ONLY`, still in the outstanding manual-coordinate queue — no manual entry yet |
| Casa Capitão | 1 | `ADDRESS_ONLY`, still in the outstanding manual-coordinate queue — no manual entry yet |

Both are purely coordinate-gap blocked, not unresolved-venue-identity
blocked or blocked by any other map-eligibility rule. No other reason
category applies to either.

## 7. Geographic sanity result

All 7 operator-entered coordinate pairs were checked for plausibility
(not re-researched or altered):

| Venue | Lat, Lon | Plausibility |
|---|---|---|
| Village Underground Lisboa | 38.70222, -9.18056 | Plausible — Alcântara/Avenida da Índia riverside area, Lisbon |
| BOTA Anjos | 38.72693, -9.13642 | Plausible — Anjos/Arroios, central Lisbon |
| Super Bock Arena — Pavilhão Rosa Mota | 41.146878, -8.625989 | Plausible — central Porto, near Jardins do Palácio de Cristal |
| Galeria Zé dos Bois (ZDB) | 38.709608, -9.153918 | Plausible — Bairro Alto, Lisbon |
| LAV – Lisboa ao Vivo | 38.75734, -9.11058 | Plausible — Olivais area, Lisbon |
| Centro Cultural Malaposta | 38.787263, -9.170259 | Plausible — Olival Basto, Odivelas |
| Biblioteca Municipal D. Dinis | 38.76784, -9.20107 | Plausible — within Odivelas municipality |

No reversed lat/lon, no zero/zero, no wrong-country, no offshore/ocean
coordinates, no hundreds-of-kilometres errors. **No suspicious entries
found.** Nothing was corrected or altered.

## 8. Browser verification

- `/operator/venues` (before and after app restart): header reads "12 need
  coordinates · 7 manually completed · 5 already map-enabled", matching
  the file exactly. Search, city filter, and status filter all behaved
  correctly. The 7 completed venues render under "Manually completed"
  with their exact saved coordinates and a "Remove manual coordinates"
  action. Zero console errors/warnings.
- Public homepage (`/`): loads and functions correctly, zero console
  errors/warnings. **Important finding (see §9): this page is wired to a
  separate, older, single-city demo fixture — not the live Lisbon/Porto
  pipeline the operator dashboard and `npm run ingest:lisbon-porto` use —
  so it does not currently reflect manual coordinates or Porto sources at
  all.** This is a pre-existing architectural gap, not something this
  package introduced or was asked to fix.

## 9. Public homepage is not wired to the live/manual-coordinate pipeline

`app/page.tsx` imports `fixtures/map/lisbon-map-proof.json`, a fixture
generated by `ingestion/map/generate-proof.mjs` from only 3 offline,
retained fixture sources (AgendaLX, Hot Clube, Capitólio) — a narrower,
pre-Porto, pre-manual-coordinates pipeline predating
`ingestion/lisbon-porto/run.mjs`. It makes no live network requests, does
not accept `manualCoordinatesByVenueId`, and does not include any of the 7
newly-completed venues among its underlying Observations. This is why the
homepage widget shows "6 real source listings across 1 venue" regardless
of the operator's coordinate entries.

This is **not a defect in the manual-coordinates feature** — the feature
works correctly and is fully verified end-to-end through
`ingestion/lisbon-porto/run.mjs` (§3–§6) and the operator dashboard (§8).
It is a separate, pre-existing gap: the public-facing homepage has never
been wired to the newer, full 13-source Lisbon+Porto pipeline. Recorded
here for visibility; no code was changed to address it, as it is out of
this package's verification-only scope.

## 10. Persistence / restart proof

| | Entry count | SHA256 |
|---|---|---|
| Pre-restart | 7 | `4a1934fdedc89a5ac55d4c2a6d7c6f17bade906c9f82d2368f2d36c7197b5df2` |
| Post-restart | 7 | `4a1934fdedc89a5ac55d4c2a6d7c6f17bade906c9f82d2368f2d36c7197b5df2` |

Byte-identical. The dev server was fully stopped and restarted between
reads; both `/operator/venues` and the canonical file were re-checked
after restart with no reliance on any browser-held state.

## 11. Coordinate file SHA256 and backup

- Canonical: `venues/manual-coordinates.json`
- SHA256: `4a1934fdedc89a5ac55d4c2a6d7c6f17bade906c9f82d2368f2d36c7197b5df2`
- Size: 2659 bytes
- Backup (outside the repository, protection copy only — not canonical):
  `C:\Users\chris\Dev\band_on_the_map-coordinate-backup-2026-08-24.json`
  (same SHA256, confirmed byte-identical to the source at backup time)

## 12. Test suite: 3 pre-existing failures investigated (not a regression)

`npm test` produced 670/673 passing (down from the 673/673 baseline). All
3 failures share one root cause, and none relate to a defect in the
coordinate data, the queue-generation code, or the display pipeline:

- `tests/manual-coordinate-queue-exclusion.test.mjs`: "against the REAL
  committed registries + committed (currently empty) manual store, the
  queue is unaffected by this exclusion change"
- `tests/manual-coordinate-queue.test.mjs`: "against the REAL committed
  registries, the queue matches the live ADDRESS_ONLY set exactly"
- `tests/venue-estate-01.test.mjs` test 10: "...the manual-coordinate
  queue includes every newly admitted ADDRESS_ONLY venue"

All three hardcode an assumption — true when they were written — that the
committed `venues/manual-coordinates.json` ships empty and/or that every
`ADDRESS_ONLY` venue must unconditionally appear in the generated queue.
That assumption is now correctly falsified by real operator data: the
queue's documented exclusion behaviour (§3 of
`docs/OPERATOR_VENUE_COORDINATES.md` — a venue with a valid manual entry
is excluded from the outstanding queue) is working exactly as designed.
This is expected, correct system behaviour surfacing a stale test
assumption, not a bug in the coordinate feature or the queue generator.

Per this package's verification-only scope, these test assertions were
**not modified** — doing so is a test-maintenance change, out of scope
here. They are reported precisely rather than bypassed, silently skipped,
or worked around. A follow-on package should update these three
assertions to reflect the correct, documented exclusion behaviour once
real operator coordinates exist.

`npm run lint`: clean. `npm run build`: succeeds (one pre-existing,
unrelated Turbopack tracing warning, unchanged from prior packages).
