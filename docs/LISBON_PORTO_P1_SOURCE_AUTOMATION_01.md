# Lisbon/Porto P1 Source Automation (LISBON-PORTO-P1-SOURCE-AUTOMATION-01)

Task: LISBON-PORTO-P1-SOURCE-AUTOMATION-01
Date: 2026-08-24
Branch: `work/lisbon-porto-p1-source-automation-01`

## 1. Purpose

`LISBON-PORTO-VENUE-ESTATE-01` was venue-first discovery: it found 69
credible venue candidates and recorded, honestly, which already had a
real event feed and which did not. This package is the opposite
direction — **source automation**: take the strongest researched-but-not-
yet-automated P1 venues and turn them into live, deterministic
Observation-pipeline sources, integrated into the existing
`npm run ingest:lisbon-porto` orchestrator.

This is not another discovery sweep. No new broad venue search was run;
every source assessed here was already named in
`research/venue-estate/lisbon-porto-venue-estate-01.json` and/or
`sources/lisbon.json` / `sources/porto.json`.

## 2. Baseline (before this package, live run 2026-08-24T14:24:38Z)

| | Lisbon | Porto | Combined |
|---|---|---|---|
| Active sources | 7 | 3 | 10 |
| Observations in bounds (2026-08-24..2026-12-31) | 150 | 107 | 257 |
| Resolved | 127 | 102 | 229 |
| Unresolved | 23 | 5 | 28 |
| Resolved-but-unmapped (ADDRESS_ONLY/no coords) | 76 | 0 | 76 |
| Display listings | 50 | 102 | 152 |
| Map markers | 2 | 3 | 5 |

Canonical venues before: **23** (17 Lisbon-area + 6 Porto-area).
Manual-coordinate queue before: **18** entries.

## 3. P1 source list assessed

From `research/venue-estate/lisbon-porto-venue-estate-01.json`'s own §10
P1/P2/P3 backlog, cross-checked against `sources/lisbon.json` /
`sources/porto.json`'s own `source_priority` field:

**Named P1 priorities (this task's brief):**
1. Super Bock Arena — Pavilhão Rosa Mota
2. LAV – Lisboa ao Vivo
3. Hot Five Jazz & Blues Club
4. Hot Clube de Portugal "own venue" resolution — already `TECHNICAL_PATH_PROVEN` before this package (ICS_CALENDAR); the venue-estate package only gave it a canonical Venue record. No new acquisition work needed or done here.

**Secondary P1 backlog (`source_priority: "P1"` in `sources/lisbon.json`, verified against the actual registry, not invented from memory):**
5. Galeria Zé dos Bois (ZDB)
6. Fama d'Alfama
7. Museu do Fado

**Also assessed (P2, not P1, checked anyway as part of the same secondary-backlog pass):**
8. Casa Independente

### Super Bock Arena — findings

Current site (`https://www.superbockarena.pt/agenda/`) runs "The Events
Calendar" WordPress plugin's list view. A single fetch (no pagination
link exists) returns all 40 currently-booked events, September 2026
through November 2027, each in a `<div id="post-{id}" class="type-
tribe_events post-{id} tribe-events-category-{slug}...">` block carrying
the plugin's own first-party category taxonomy. 24 of 40 carry a genuine
music-genre category (`pop-rock`, `musica-brasileira`, `musica-
portuguesa`, `eletronica`, `fado`, `classica`, `forro`, `sertanejo`,
`concertos-en`); 16 are this venue's own non-music programming (gaming/
esports, circus, stand-up comedy, dance, children's shows, stage
musicals) and are genuinely excluded. Each card's own date text omits
the year for a same-calendar-year event and includes it for a different-
year one; this collector combines the card's text with its own governing
month/year section header (never today's date) to derive a full date,
after discovering and fixing a real off-by-one in how a header can
render as trailing content inside the PRECEDING event's own HTML block
(see `ingestion/super-bock-arena/discovery.mjs`'s doc comment). Verified
directly against the source: Placebo → 2026-09-28, Bryan Adams →
2026-11-17 and 2026-11-18, matching this task's brief exactly.
**Classification B (small static-HTML adapter). Implemented.**

### LAV — findings

Current site (`https://lisboaaovivo.com/agenda/`) also runs "The Events
Calendar", but additionally emits a genuine first-party
`<script type="application/ld+json">[{"@type":"Event",...}]</script>`
array directly on the page — read as structured JSON, not HTML-scraped.
10 upcoming events, `startDate`/`endDate` carry a confirmed `+00:00` UTC
offset (the only source in this whole project so far with a genuinely
confirmed UTC instant rather than a floating-local guess). No per-event
category exists at all; every record becomes an Observation, matching
the existing MEO Arena/Village Underground precedent for a single music/
nightlife venue with no per-event taxonomy. Two of the ten records'
own `location.address` carry a fully-populated first-party
`PostalAddress` (the same address `LISBON-PORTO-VENUE-ESTATE-01` had
found only via secondary ticketing-site sources and declined to admit).
**Classification C (JSON/structured data). Implemented — and this
package's own agenda-page evidence let LAV be admitted as a brand-new
ADDRESS_ONLY canonical Venue via the existing `npm run onboard:venues`
pipeline.**

### Hot Five — findings

Current site (`https://hotfive.pt/`, its `/shows/` page, and its
`wp-json` root) exposes **no dated calendar of individual performances
anywhere in server-rendered HTML** — only a static "Quinta à domingo,
21h30-02h30" recurring-hours line. No JSON-LD, no iframe, no third-party
ticketing embed, no custom REST endpoint carrying show dates was found.
This matches this venue's own event-evidence records in
`LISBON-PORTO-VENUE-ESTATE-01` being honestly flagged low-confidence
("year inferred from retrieval context"). **Classification F
(date-inadequate). Deferred — not implemented.** Remains the strongest
named-P1 opportunity still unautomated if a future session finds a
genuinely dated source (an Instagram/Facebook feed, or a booking
platform not reached this session).

### Every remaining P1 decision

| Candidate | Verified finding | Classification | Decision |
|---|---|---|---|
| Galeria Zé dos Bois (ZDB) | `/en/programme/` lists 26 raw items with a genuine `area`+`categorias` taxonomy; 14 are `area="Music"`+`category="Concerts"`, each with a full DD.MM.YY date + 12-hour time | B | **Implemented** |
| Fama d'Alfama | `/agenda-de-fados-em-lisboa/` publishes a real day-by-day performer roster, but every date is a bare weekday NAME ("Sábado") with no month/year anywhere | F | Deferred (date-inadequate) |
| Museu do Fado | `/eventos` lists 6 raw items with a real category (`Concerto`/`Workshop`/`Visitas`/none) and full "D month, YYYY" dates including year; only 2 are `Concerto`-tagged, both off-site at CCB | B | Not attempted this package — see §12 |
| Casa Independente (P2) | `/agenda/` lists dated cards ("SEXTA FEIRA / 21 AGO / 23H") but **no year anywhere on the page** | F | Deferred (date-inadequate) |

## 4. Collector families reused

- **Existing "The Events Calendar" WordPress-plugin HTML-listing pattern**
  (already proven for Casa da Música) reused/extended for Super Bock
  Arena's own category-class + month-header parsing.
- **Existing exact-string, first-party category/venue-name filtering
  pattern** (already proven for CM Gaia Eventos, Teatro Municipal do
  Porto) reused for ZDB's `area`/`categorias`/`local` fields.
- **Existing fixed-single-venue resolution pattern**
  (`SOURCE_ID_TO_FIXED_CANONICAL_VENUE`-equivalent, already proven for
  Casa da Música/MEO Arena/Village Underground) reused for both Super
  Bock Arena and LAV — `venue_name`/`location_text` intentionally null,
  resolved by `source_id`.
- **Existing data-driven venue-onboarding pipeline**
  (`ingestion/venue-onboarding/`, `venues/source-venue-mappings.json`)
  reused for all three new sources' venue resolution — **zero new
  hardcoded branches were added to `ingestion/venue/resolver.mjs`.**
- `ingestion/http/fetch.mjs`'s shared `fetchText()` helper, the shared
  `ingestion/observation/contract.mjs` Observation contract, and the
  shared `ingestion/map/group-associated-listings.mjs` projection are
  all reused completely unchanged.

## 5. New collector families and justification

Three new small directories were added: `ingestion/super-bock-arena/`,
`ingestion/lav/`, `ingestion/galeria-ze-dos-bois/` — each a
`discovery.mjs` + `observation-adapter.mjs` pair, following the exact
existing convention (see `ingestion/casa-da-musica/`,
`ingestion/cm-gaia-eventos/`). These are venue-specific adapters, not new
architecture: each reuses the existing Observation contract, the
existing venue-resolution layer, and the existing orchestrator
(`ingestion/lisbon-porto/run.mjs`) unchanged in structure — only three
new `collect*()` functions and three new registry entries were added
there. No new shared module, no new pagination/HTTP/date-parsing
primitive, no browser automation.

## 6. Headless/client-rendered deferrals

None of the three implemented sources required headless/client-rendered
handling. Hot Five was deferred for date-inadequacy, not client
rendering (its markup is genuinely static; it simply carries no dated
performance calendar anywhere in server HTML).

## 7. Date-inadequate deferrals

Hot Five Jazz & Blues Club, Fama d'Alfama, Casa Independente — all
verified live this package (not assumed from memory), all genuinely
lack a safely-derivable full calendar date anywhere in their current
server-rendered markup. See §3's table for the exact evidence.

## 8. Implemented sources

### 8.1 Super Bock Arena — Pavilhão Rosa Mota

| Field | Value |
|---|---|
| source_id | `super-bock-arena` |
| City / municipality | Porto / Porto |
| Official source URL | `https://www.superbockarena.pt/agenda/` |
| Acquisition mechanism | Bounded server-rendered HTML — "The Events Calendar" WordPress plugin list view, single fetch (no pagination) |
| Stable ID | WordPress post id, from `id="post-{id}"` |
| Full date derivation | Card's own "D Month[, YYYY], HH:MM" combined with its governing month/year `<h2>` section header; card/header month mismatch fails closed |
| Music filtering | First-party `tribe-events-category-{slug}` classes — `MUSIC_CATEGORY_SLUGS` allowlist |
| Venue resolution | Fixed single venue, resolved by `source_id` via a new data-driven mapping entry to the already-canonical `venue-porto-super-bock-arena-pavilhao-rosa-mota` |
| Raw records (live) | 40 total; 24 music-tagged |
| In-window observations (2026-08-24..2026-12-31) | 17 |
| Resolved | 17 |
| Unresolved | 0 |
| Displayable listings attributable to this source | 0 (venue is ADDRESS_ONLY, not GEOCODED/CONFIRMED — see §14) |

### 8.2 LAV – Lisboa ao Vivo

| Field | Value |
|---|---|
| source_id | `lav-lisboa-ao-vivo` |
| City / municipality | Lisboa / Lisboa |
| Official source URL | `https://lisboaaovivo.com/agenda/` |
| Acquisition mechanism | Bounded first-party JSON-LD Event array embedded in the agenda page |
| Stable ID | Permalink slug from each Event's own `url` |
| Full date derivation | `startDate`/`endDate` ISO 8601 with confirmed `+00:00` UTC offset — `UTC_INSTANT` certainty |
| Music filtering | None available (no per-event category anywhere) — every record retained, matching the MEO Arena/Village Underground precedent for a single music-venue source |
| Venue resolution | Fixed single venue, resolved by `source_id` via a new data-driven mapping entry to the newly-admitted ADDRESS_ONLY `venue-lisboa-lav-lisboa-ao-vivo` |
| Raw records (live) | 10 |
| In-window observations | 10 |
| Resolved | 10 |
| Unresolved | 0 |
| Displayable listings attributable to this source | 0 (venue is ADDRESS_ONLY — see §14) |

### 8.3 Galeria Zé dos Bois (ZDB)

| Field | Value |
|---|---|
| source_id | `galeria-ze-dos-bois` |
| City / municipality | Lisboa / Lisboa |
| Official source URL | `https://zedosbois.org/en/programme/` |
| Acquisition mechanism | Bounded server-rendered HTML listing, single fetch (no pagination) |
| Stable ID | Permalink slug from `/en/programa/{slug}/` |
| Full date derivation | "DD.MM.YY" day + 12-hour time (two-digit year is a literal transcription of the source's own text, not an inferred value); a multi-day range with no year on its own leading portion fails closed |
| Music filtering | First-party `area="Music"` + `categorias` includes `"Concerts"` |
| Venue resolution | Genuinely multi-location; only the exact string `"Galeria Zé dos Bois"` resolves (new data-driven mapping to the already-canonical `venue-lisboa-galeria-ze-dos-bois-zdb`); off-site strings ("Igreja St. George", "LAV - Lisboa Ao Vivo") are honestly left unmapped |
| Raw records (live) | 26 total; 14 music-tagged |
| In-window observations | 14 |
| Resolved | 12 |
| Unresolved | 2 (the two off-site venue-text entries) |
| Displayable listings attributable to this source | 0 (venue is ADDRESS_ONLY — see §14) |

## 9. Venues

- Canonical venue count: **23 → 24** (17→18 Lisbon-area, 6 Porto-area unchanged).
- New canonical venues: **1** — `venue-lisboa-lav-lisboa-ao-vivo` (ADDRESS_ONLY, admitted via `npm run onboard:venues` from LAV's own first-party JSON-LD address evidence).
- Newly represented canonical venues (now reachable by an automated source that were not before): `venue-lisboa-lav-lisboa-ao-vivo`, `venue-lisboa-galeria-ze-dos-bois-zdb`, `venue-porto-super-bock-arena-pavilhao-rosa-mota` (the latter two already existed as canonical Venues from `LISBON-PORTO-VENUE-ESTATE-01` but had no automated source until now).
- New ADDRESS_ONLY venues: **1** (LAV). A live Nominatim geocoding attempt was made by the existing, unmodified `onboard:venues` pipeline (bounded cap, 1/15 requests used) and found no acceptable building-level match (only road-level candidates) — left honestly `ADDRESS_ONLY`, per this task's closed coordinate-research boundary.
- Manual-coordinate queue: **18 → 19** entries (`venue-lisboa-lav-lisboa-ao-vivo` added).
- Confirmation: **zero** hardcoded venue-specific resolver branches were added to `ingestion/venue/resolver.mjs` — verified both by direct diff (that file is untouched) and by `tests/venue-estate-01.test.mjs`'s own existing invariant #11.

## 10. Venue estate coverage

- Total research candidates: **69** (unchanged, frozen snapshot).
- `VENUE_ESTATE_AUTOMATED_COUNT`: **12 → 15** (of 69 research candidates whose canonical venue is now reachable by a wired-in automated source).
- `CANONICAL_VENUES_WITH_AUTOMATED_SOURCE`: **11 → 14** (distinct canonical `venue_id`s reachable by a wired-in automated source; lower than the candidate count because a few venue-estate candidates are duplicate/alias entries pointing at one venue_id).
- `P1_AUTOMATION_BACKLOG` remaining: **3** — Hot Five Jazz & Blues Club, Fama d'Alfama, Museu do Fado (all verified live this package, all genuinely date-inadequate or not yet attempted — see §3).
- P1 venues automated this package: **3** — Super Bock Arena, LAV, Galeria Zé dos Bois.
- See `research/venue-estate/lisbon-porto-automation-status-01.json` for the full per-candidate record (a new file — the original `lisbon-porto-venue-estate-01.json` / `lisbon-porto-event-evidence-01.json` snapshots are unmodified).

## 11. Before → after (live run, 2026-08-24T14:35:00Z)

| | Lisbon | Porto | Combined |
|---|---|---|---|
| Active sources | 7 → **9** | 3 → **4** | 10 → **13** |
| Observations in bounds | 150 → **173** | 107 → **124** | 257 → **297** |
| Resolved | 127 → **148** | 102 → **119** | 229 → **267** |
| Unresolved | 23 → **25** | 5 → **5** | 28 → **30** |
| Resolved-but-unmapped | 76 → **97** | 0 → **17** | 76 → **114** |
| Display listings | 50 → **50** | 102 → **102** | 152 → **152** |
| Map markers | 2 → **2** | 3 → **3** | 5 → **5** |
| Distinct canonical venues represented (resolved, any status) | — | — | (see §10) |

Display listings and map markers are honestly unchanged: every newly
automated venue (Super Bock Arena, LAV, Galeria Zé dos Bois) is
`ADDRESS_ONLY`, not `GEOCODED`/`CONFIRMED`, so their 39 newly resolved
in-window observations land in the `resolved_but_unmapped` bucket, not
in display listings — exactly the honest outcome the closed
coordinate-research boundary implies. This is a real, useful gain
(venue-attributed, deterministic Observations that did not exist
before) even though it does not move the map-marker count.

## 12. Blockers

- **Hot Five**: no dated calendar exists anywhere in server-rendered
  HTML on the current site — a genuine data blocker, not a technical one.
- **Fama d'Alfama / Casa Independente**: dates exist but omit year
  (Fama) or omit year entirely (Casa Independente) — genuine data
  blockers.
- **Museu do Fado**: not a blocker, a scope decision — genuinely
  deterministic and implementable, but this package's own "quality over
  count" rule favoured the three higher-yield sources actually built.
  Recorded as the strongest remaining opportunity in
  `research/venue-estate/lisbon-porto-automation-status-01.json`.
- **LAV geocoding**: the existing bounded Nominatim pass found only
  road-level (not building-level) candidates for LAV's own address —
  left `ADDRESS_ONLY`, not a package failure; coordinate research stays
  closed per this task's own rule.

## 13. P1 backlog after this package

Hot Five Jazz & Blues Club, Fama d'Alfama, Museu do Fado remain
P1-priority and unautomated. Museu do Fado is the strongest of the
three for a future pass (real dates, real category, real venue-name
field, small and clean).

## 14. Quality invariants confirmed

- Invented dates: **0** — every derived date traces to two or more
  pieces of the source's own text (card text + governing header, or a
  literal DD.MM.YY transcription); every ambiguous case (ZDB date
  ranges, Hot Five, Fama d'Alfama, Casa Independente) fails closed
  instead.
- Fuzzy venue matching: **0** — every resolution is an exact-string or
  exact-`source_id` data-driven mapping; unmapped strings stay honestly
  unresolved (ZDB's off-site venues).
- Fuzzy event dedupe: **0** — no deduplication logic was added anywhere.
- New coordinate research: **0** — only the existing, already-bounded
  `onboard:venues` Nominatim pass ran (1 live request, no match
  promoted); no manual coordinate hunting, no other geocoder.
- Research evidence copied directly to live observations: **0** — every
  Observation traces to this package's own fresh fixture/live fetch,
  never to `lisbon-porto-event-evidence-01.json`.
- BOTA GEO: unchanged (untouched by this package).
- Existing confirmed/geocoded coordinates: unchanged (verified via
  `git diff venues/porto.json` showing zero changes, and
  `venues/lisbon.json`'s diff showing only one new venue appended).

## 15. Files

- `ingestion/super-bock-arena/discovery.mjs`, `observation-adapter.mjs`
- `ingestion/lav/discovery.mjs`, `observation-adapter.mjs`
- `ingestion/galeria-ze-dos-bois/discovery.mjs`, `observation-adapter.mjs`
- `ingestion/lisbon-porto/run.mjs` (extended: 3 new `collect*()` functions, 3 new registry ids)
- `fixtures/super-bock-arena/`, `fixtures/lav/`, `fixtures/galeria-ze-dos-bois/` (excerpt HTML + `metadata.json` each)
- `fixtures/geocoding/nominatim/venue-lisboa-lav-lisboa-ao-vivo.json` (bounded live geocode attempt, no match)
- `fixtures/geocoding/manual-coordinate-queue.json` (regenerated: 18 → 19 entries)
- `fixtures/map/lisbon-porto-overnight-coverage-01-live-run-proof.json` (regenerated live-run snapshot)
- `sources/lisbon.json` (+`lav-lisboa-ao-vivo`; `galeria-ze-dos-bois` technical-proof update)
- `sources/porto.json` (+`super-bock-arena`)
- `venues/lisbon.json` (+`venue-lisboa-lav-lisboa-ao-vivo`)
- `venues/candidate-research.json` (+3 entries)
- `venues/source-venue-mappings.json` (+3 entries)
- `research/venue-estate/lisbon-porto-automation-status-01.json` (new)
- `tests/super-bock-arena-observation.test.mjs`, `tests/lav-observation.test.mjs`, `tests/galeria-ze-dos-bois-observation.test.mjs` (new)
- `tests/lisbon-registry.test.mjs`, `tests/porto-registry.test.mjs`, `tests/hot-clube-fixtures.test.mjs`, `tests/manual-coordinate-queue.test.mjs` (updated expectations only)
