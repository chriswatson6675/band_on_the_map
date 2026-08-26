# Barcelona Venue Population

This document explains the Barcelona (Spain) venue/event population added
under `ingestion/barcelona/`, `venues/barcelona.json`, and
`sources/barcelona.json` (package `BARCELONA-30-VENUE-POPULATION-01`), how it
fits the canonical objects in `docs/ARCHITECTURE.md`, and how it reuses the
same acquisition/publication machinery already proven for Lisbon/Porto.

Timezone for this population: `Europe/Madrid`.

## Why a separate entry point, not a rewrite of Lisbon/Porto

Barcelona is a **new, parallel** manual entry point —
`ingestion/barcelona/run.mjs` (`npm run ingest:barcelona`) — mirroring
`ingestion/lisbon-subset/run.mjs`'s own "bounded, city-scoped pipeline"
pattern. It never modifies `ingestion/lisbon-porto/run.mjs`, the unattended
runner, or any existing Portugal/Croatia code path. `ingestion/publish-map-
data/run.mjs` additively calls `acquireBarcelona()` alongside
`acquireLisbonPorto()` so the SAME publication artifact
(`data/public/lisbon-porto-map.json`) carries a new `countries.Spain` bucket
— never a second, independently-drifting publication path.

## Reused vs. new

Reused, byte-for-byte unchanged: `ingestion/observation/contract.mjs`,
`ingestion/venue/contract.mjs`, `ingestion/venue/resolver.mjs` (every
Barcelona source resolves via the existing DATA-DRIVEN table,
`venues/source-venue-mappings.json` — no new hardcoded resolver branch),
`ingestion/map/group-associated-listings.mjs`, `ingestion/map/projection.mjs`
(additively extended — see below), `ingestion/http/fetch.mjs`,
`ingestion/events-calendar-api/*` (reused for 5 venues with zero new code).

New, but **generic and reusable for any future city**, not Barcelona
-specific:

- `ingestion/json-ld/` — schema.org `Event`/`MusicEvent` JSON-LD extraction
  + Observation adapter. No generic JSON-LD parser existed in this
  repository before this package (`ingestion/lav/discovery.mjs` had a
  bespoke, single-source-shaped one). Handles `@graph`-wrapped documents,
  `ItemList`-wrapped Event lists, non-zero-padded ISO timestamps, and named
  `CEST`/`CET` offset abbreviations (all real, retained-evidence quirks
  found across Barcelona sources) — every one of these is a **mechanical,
  deterministic** normalisation, never a guess.
- `ingestion/fourvenues/` — the Fourvenues ticketing platform's own public,
  unauthenticated events API, used by several independently-operated
  Barcelona clubs.

New, deliberately venue-specific (matching this project's existing
bespoke-collector precedent, e.g. `ingestion/casa-da-musica/`):
`ingestion/paral-lel-62/`, `ingestion/city-hall-barcelona/`,
`ingestion/la-paloma/`, `ingestion/sala-apolo/`, `ingestion/sant-jordi-club/`,
plus `ingestion/byron/filter.mjs` (a title-keyword music-relevance filter for
one mixed-programme venue with no category taxonomy of its own).

## Publication plumbing extended additively

`ingestion/map/publication.mjs` gained `buildSpainMarkers()` (Barcelona's own
sibling of `buildPortugalMarkers()`) and `buildPublicationArtifact()` gained
an optional `spainMarkers` parameter — every existing caller that omits it
gets byte-identical behaviour to before this package. `validate
PublicationArtifact()` treats `countries.Spain` as **optional** at the schema
level (unlike Portugal/Croatia) so every pre-Barcelona fixture and test
remains valid unchanged; when present, it is validated identically and its
markers join the same global count/uniqueness cross-checks.
`ingestion/map/projection.mjs`'s `getMarkersForCountry()` gained an optional
third `spainMarkers` parameter, same backward-compatibility guarantee.
`isCatastrophicPublicationRun()` gained an optional `spainMarkerCount`
(default `0`) so the existing Portugal-only rule is exactly preserved for
every caller that doesn't pass it.

`ingestion/geocoding/match-address.mjs` gained an optional `countryCode`
option (default `"pt"`, preserving every existing call's behaviour) so its
already-proven fail-closed acceptance rules (country/city/postcode/house
-number/specificity/name-compatibility checks) work for Spain (`"es"`) too,
without a second, parallel matcher implementation.

## Venue resolution

Every Barcelona venue is registered in `venues/barcelona.json` using the
exact same schema/`location_status` contract as Lisbon/Porto
(`ingestion/venue/contract.mjs`). Coordinates come from one of:

- **CONFIRMED** — a first-party coordinate the source's own booking
  platform supplies directly (City Hall Barcelona's own Wix Events geocode).
- **GEOCODED** — the venue's own evidenced official address, resolved live
  via Nominatim/OSM using the same `ingestion/geocoding/nominatim.mjs` +
  `match-address.mjs` machinery already proven for Portugal, with the new
  `countryCode: "es"` option.
- **ADDRESS_ONLY** — an evidenced address exists but no confident coordinate
  match could be established (never guessed) — one venue (KU Barcelona) is
  ADDRESS_ONLY for this reason.

Two rooms/sub-brands at the same physical building (Sala Apolo's own Nitsa
and La [2] de Apolo club nights; several Jamboree room-booking variants) are
treated as ONE canonical venue, matching this project's existing Casa da
Música "room is not a separate venue" precedent — never inflated into
separate venue records.

An honest, recorded (never silently resolved) discrepancy: Sala Apolo's own
live event JSON-LD states house number 113, while its `/en/contact` page
states 107; 113 could not be independently geocoded to a specific
address/POI, so 107 (which could) is used as the canonical coordinate. See
that venue's own evidence entry in `venues/barcelona.json`.

## Discovery sources researched but NOT activated

Documented honestly, not silently dropped:

- **Sidecar, Razzmatazz** — genuinely have machine-readable data (Sidecar:
  per-event JSON-LD reachable via a WP REST post-list discovery step;
  Razzmatazz: a public Sanity.io CMS API), but extracting a clean,
  reliable event feed requires materially more engineering (Sidecar: no
  bulk "future events" listing, only a publish-date-ordered post list
  requiring many exploratory per-page fetches; Razzmatazz: the public API
  returns heavily reference-based documents requiring GROQ dereferencing
  work not yet done) — deferred per this package's "don't fight one
  difficult source" instruction, not because no path exists.
- **Marula Café, Jazzsí (Taller de Músics), Sinestesia, La Deskomunal,
  Diobar** — each has a real, structured WordPress REST endpoint, but none
  of them expose the actual **event date** as a machine-readable field (only
  the CMS post-publish timestamp) — the real date lives only in free-text
  page content. Deferred rather than built on an unreliable date-extraction
  heuristic.
- **Heliogàbal** — its own official site is stale (most recent listed shows
  predate this package's proof date by months); a third-party aggregator
  (Songkick) does carry current dates, but `docs/SOURCE_INVESTIGATION_POLICY.md`
  explicitly treats third-party aggregators as discovery leads only, never
  as first-party fact authority — not activated on that basis.
- **Otto Zutz** — a real, structured feed (Wix + Fourvenues cross-listing),
  but its currently-scheduled events are generic recurring brand nights
  ("Friday By Otto Zutz") with no named performer in the machine-readable
  data at proof time — excluded for insufficient music-specificity, not a
  technical failure.
- **L'Auditori, Palau de la Música Catalana, Sala Upload, Sala Vol,
  Freedonia, Luz de Gas, and others** — real, current, genuine music
  programming, but no structured feed of any kind was found (JS-rendered
  ticketing widgets, or plain server-rendered HTML with no JSON-LD/API) —
  would require either browser automation (out of scope for this package)
  or a bespoke, fragile HTML scraper for a single venue each; deferred.
- **Sala Salamandra** (L'Hospitalet de Llobregat) — genuinely part of the
  Barcelona urban live-music ecosystem despite being just outside the
  municipal boundary, but no scriptable source was found (anti-bot
  protected).

## Adding another Barcelona-style source later

1. If it runs WordPress + "The Events Calendar", write a small config
   object and one `collect<Venue>()` function calling
   `ingestion/events-calendar-api/fetch-all.mjs` — no new collector code.
2. If it embeds schema.org JSON-LD (directly, as an `ItemList`, or via
   per-page crawling from a listing), use `ingestion/json-ld/` — no new
   parser code, only a small discovery/link-extraction step if needed.
3. If it runs on Fourvenues, add a config object — no new collector code.
4. Otherwise, a small bespoke `discovery.mjs` + `observation-adapter.mjs`
   pair, following any of `ingestion/paral-lel-62/`,
   `ingestion/city-hall-barcelona/`, `ingestion/la-paloma/`, or
   `ingestion/sant-jordi-club/` as a template.

Every new source needs: a `research/source-investigations/<id>/` record
(policy `BOTM-SOURCE-INVESTIGATION-v1.1`), a `sources/barcelona.json` entry,
a `venues/barcelona.json` entry (or reuse an existing one), and a
`venues/source-venue-mappings.json` resolver entry — never a new hardcoded
branch in `ingestion/venue/resolver.mjs`.
