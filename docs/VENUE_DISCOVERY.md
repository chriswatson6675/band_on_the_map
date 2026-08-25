# Venue Discovery Engine

This document explains the venue discovery engine added under
`ingestion/venue-discovery/` and `ingestion/area/`, how it relates to the
canonical objects in `docs/ARCHITECTURE.md`, and the hard boundary between
discovering a candidate venue and doing anything with it.

Venue discovery is repository-controlled JSON/code, not a database — like
`docs/SOURCE_REGISTRY.md`, it introduces no Supabase dependency, migration,
scheduler, or live collector.

## Why discovery is a separate concern from onboarding

`ingestion/venue-onboarding/` already answers "given Observations we already
collect, which real-world Venue do they belong to?" — it never searches for
a venue BeatMapped doesn't already have a source for.

Venue discovery answers a different, earlier question: "for a whole
city/metro area, what live-music venues plausibly exist AT ALL, whether or
not BeatMapped has a Source for them yet?" It never assumes a source already
exists; it goes looking geographically and via city-level registries.

The two pipelines meet at one deliberate, currently-unbuilt boundary — see
"What discovery is not" below.

## AREA CONFIG -> DISCOVERY SOURCES -> RAW CANDIDATES -> NORMALISATION -> DEDUPLICATION -> CANDIDATE VENUE ESTATE

```text
areas/<area_id>.json (ingestion/area/)
  -> discovery_sources[] (one collector per entry, ingestion/venue-discovery/<source>/)
  -> raw leads (source-shaped, evidence preserved)
  -> normalised discovery Candidates (candidate-contract.mjs + normalise.mjs + classify.mjs)
  -> deduplicated Candidate Venue Estate (dedupe.mjs)
  -> runtime/discovery/<area_id>/{candidates.json,report.md} (git-ignored, generated)
```

Adding a new managed area (Madrid, Berlin, Amsterdam, Prague, ...) means
adding `areas/<area_id>.json` — never touching the collector, candidate,
classification, or dedup code, all of which are area-agnostic.

## Area config

`ingestion/area/contract.mjs` defines the Area shape: `area_id`, `country`,
`country_code`, `city`, optional `metro_name`, `centre` (`{latitude,
longitude}`), a configurable `radius_km` (never hardcoded anywhere in the
engine — see `ingestion/venue-discovery/overpass/query-builder.mjs`),
`languages`, a non-exhaustive `discovery_keywords` map, `discovery_sources`
(which collector(s) run for this area and their config), `active_status`,
and `created_at`. `ingestion/area/registry.mjs` loads `areas/<area_id>.json`
by ID, matching the "one file per city" pattern already used for
`sources/*.json`/`venues/*.json` (see `docs/SOURCE_REGISTRY.md`).

The first managed area is `areas/barcelona-es.json`: centre `41.383333,
2.183333` (Barcelona's Wikipedia infobox coordinate — a widely-accepted
reference, not a precise centroid), `radius_km: 25`, languages `ca`/`es`/`en`.

## Discovery candidate model

`ingestion/venue-discovery/candidate-contract.mjs` defines a Candidate —
deliberately never a canonical Venue (`ingestion/venue/contract.mjs`), never
a Source, and never itself the trigger for an Observation/Event. Fields:
`candidate_id` (deterministic, `dcand-<area>-<source_kind>-<source_id>-
<source_record_id>` — a distinct namespace from venue-onboarding's `cand-`
IDs, since a discovery candidate has never been an Observation), `area_id`,
`name`/`normalised_name`, `country`/`country_code`/`city`, `address`,
`latitude`/`longitude`, `website_url`/`normalised_domain`,
`source_kind`/`source_id`/`source_record_id`/`source_url`/`source_tags`
(mirroring the primary/first evidence entry), `source_evidence[]` (the full,
never-destroyed multi-source provenance trail — see "Deduplication" below),
`discovery_status`/`discovery_status_reasons`, `first_seen_at`/
`last_seen_at`, and `merged_candidate_ids[]`. Missing values are always
`null` — nothing here is ever invented.

## Discovery sources researched

**A. OpenStreetMap / Overpass** — implemented
(`ingestion/venue-discovery/overpass/`), the required generic, reusable
collector family. `query-builder.mjs` builds a centre+radius Overpass QL
query from any Area config. It deliberately does NOT pull every
`amenity=bar`/`pub`/`nightclub`/`theatre` in the radius (that would return
thousands of ordinary places with zero music evidence) — instead it fetches
`amenity=music_venue`, `leisure=music_venue`, `amenity=concert_hall`,
`amenity=events_venue`, `amenity=nightclub`, `amenity=theatre`,
`amenity=arts_centre`/`community_centre`/`social_centre`, and every element
carrying a `live_music` key at all (any amenity). `tag-rules.mjs` reduces an
element's raw tags to explainable strong/medium/weak signals (e.g.
`amenity=music_venue` is STRONG; `amenity=nightclub` alone is WEAK, +
`live_music=yes` is MEDIUM; `live_music=no` is negative evidence, never a
signal). `client.mjs` isolates the network POST behind an injectable
`fetchImpl`; `parse.mjs` turns a response into raw leads, using `out center`
so ways/relations always carry a coordinate.

**B. Barcelona official tourism material** — researched, not implemented as
a collector. `barcelonaturisme.com`'s "Live music" page names venues
including Jamboree, Harlem Jazz Club, Jazz Man, Milano Jazz Club, and Balius
— useful confirmation that these are genuinely known live-music venues, but
the page is editorial prose, not a paginated/structured directory with
stable record IDs — there is no deterministic, repeatable way to collect it
without browser-driven scraping of an unstable page layout. Documented here
as a seed/research source for manual cross-checking, not an API.

**C. Ajuntament de Barcelona Open Data — "Espais de música i copes"** —
implemented as a SECOND, area-specific collector
(`ingestion/venue-discovery/barcelona-open-data/`), because it is
unusually good: a real per-venue dataset (not just aggregate statistics),
CC-BY 4.0, updated weekly, JSON-downloadable with no API key
(`https://opendata-ajuntament.barcelona.cat/data/en/dataset/culturailleure-espaismusicacopes`),
carrying explicit official category tags per record (`secondary_filters_data[].name`)
including `"Locals de música en viu"` (live-music venues), `"Espais de
concerts"`/`"Auditoris i sales de concert"` (concert spaces/halls),
`"Tablaos flamencs"` (flamenco tablaos — PRODUCT INTENT's "flamenco/live-
performance rooms where music is genuinely programmed"), and `"Bars i pubs
musicals"` (music bars) alongside purely non-music categories (restaurants,
tapas, karaoke) that correctly classify as `EXCLUDED`.
`category-rules.mjs` maps these categories to the same strong/medium/weak
signal vocabulary as the OSM adapter. This collector is NOT part of the
generic engine — every city has its own open-data portal with its own
schema, so it is expected to need a wholly new module (not a config tweak)
for Madrid or Berlin, unlike the Overpass family.

We separately found **"Dades de les sales de música en viu"**
(`opendata-ajuntament.barcelona.cat/data/ca/dataset/dades-sales-musica-viu-agrup-dimensions`)
— NOT usable for candidate discovery: it is annual aggregate counts by venue
size dimension, with no venue names, addresses, or coordinates at all.

No paid commercial API was added, per this package's brief.

## Confidence / classification

`ingestion/venue-discovery/classify.mjs` combines a candidate's signals
(each `{level: STRONG|MEDIUM|WEAK, reason}`, produced by the source-specific
tag/category rule modules above) into one of four `discovery_status`
values — never an opaque score:

- `LIKELY_LIVE_MUSIC_VENUE` — at least one STRONG signal (explicit
  music-venue classification, concert hall, explicit official live-music
  category, or a flamenco tablao).
- `POSSIBLE_LIVE_MUSIC_VENUE` — at least one MEDIUM signal, no STRONG one
  (e.g. a nightclub/bar with `live_music=yes`, a cultural centre with music
  evidence, a municipal "music bar" category).
- `WEAK_CANDIDATE` — only WEAK signals (e.g. a plain nightclub or theatre
  with no further music evidence). Retained for later human research, never
  silently promoted.
- `EXCLUDED` — zero qualifying signals (e.g. a restaurant with only food
  categories). Still recorded as a Candidate (with its evidence) so the
  discovery run's diagnostics honestly show what was found and rejected,
  rather than disappearing silently.

## Deduplication

`ingestion/venue-discovery/dedupe.mjs` merges candidates only on one of a
small set of conservative, explainable evidence types (never name
resemblance alone): (1) an identical `source_kind`+`source_id`+
`source_record_id` (trivially the same candidate_id, never reaches pairwise
comparison), (2) the same normalised website domain, (3) coordinates within
10m of each other, or an identical normalised address string, or (4) an
EXACT normalised-name match combined with coordinates within 60m. Pairs that
are close (within 150m) and share a name token, but meet none of the above,
are reported as `uncertainPairs` diagnostics — never auto-merged, never
dropped. A merge concatenates every contributing candidate's
`source_evidence[]` (nothing is discarded), keeps the strongest
`discovery_status` among the merged members, and records every merged
candidate's ID in `merged_candidate_ids`.

## Barcelona + 25km proof (PHASE 7)

A real, live run (`npm run discover:venues -- barcelona-es`) against both
implemented sources produced (exact figures vary run-to-run as the live
sources change; see the actual run recorded in the final report for this
package):

- ~1,068 raw OSM Overpass elements + ~344 raw Barcelona Open Data records
- ~1,383 candidates after normalisation (29 raw records dropped for having
  no name evidence at all)
- ~1,260 candidates after deduplication (~123 merged, ~217 uncertain pairs
  flagged for review)
- status breakdown across LIKELY/POSSIBLE/WEAK/EXCLUDED

Recognised venues (checked ONLY for the human sanity-check report, never
injected into discovery itself — see `run.mjs`'s
`KNOWN_VENUE_NAMES_FOR_SANITY_CHECK` comment) that these sources naturally
recovered included **Jamboree**, **Harlem Jazz Club**, and **Heliogàbal** at
`LIKELY_LIVE_MUSIC_VENUE`, and **Teatre Apolo**/**Palau Dalmases**/
**L'Auditori** at `WEAK_CANDIDATE` (present in the data, but without an
explicit music-venue tag/category in these two sources — legitimate
candidates for later human research, not false negatives to "fix" by
lowering the bar). Sidecar, Jazz Man, Milano Jazz Club, and Balius were NOT
found under those exact names by either source in this run — reported
honestly rather than papered over.

## What discovery is not (PHASE 9 — the hard stop)

Producing a discovery Candidate never, by itself:

- creates a canonical Venue in `venues/*.json`;
- creates or activates a Source in `sources/*.json`;
- creates an Observation, Event, or Offer;
- publishes anything to `data/public/*` or the live map;
- touches the unattended runner, its systemd units, or any deployment.

The next, deliberately separate and not-yet-built layer takes a discovery
Candidate through: candidate -> identity confirmation -> official-site
discovery -> programme-source discovery -> governed investigation
(`ingestion/source-investigation/`) -> collector-family match -> activation.
Each of those steps requires its own explicit authorisation, exactly like
`docs/SOURCE_INVESTIGATION_POLICY.md` already requires for activating any
Source.

## Adding a new area

1. Add `areas/<area_id>.json` (validated by `areas/registry.schema.json` /
   `ingestion/area/contract.mjs`) with the new area's centre, radius_km,
   languages, and `discovery_sources` (at minimum
   `{"source_kind": "OSM_OVERPASS"}` — reusable unmodified).
2. If the city publishes its own useful structured open dataset (as
   Barcelona does), add a new area-specific collector under
   `ingestion/venue-discovery/<new-source>/` following the
   `barcelona-open-data/` module shape (client/parse/category-rules), and
   reference it from that area's `discovery_sources`.
3. Run `npm run discover:venues -- <area_id>`.

No change to `ingestion/venue-discovery/run.mjs`'s orchestration,
`candidate-contract.mjs`, `normalise.mjs`, `classify.mjs`, or `dedupe.mjs`
is required.
