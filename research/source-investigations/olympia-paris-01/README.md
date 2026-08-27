# olympia-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates
L'Olympia, 28 Boulevard des Capucines, 75009 Paris. Official site:
https://www.olympiahall.com/, events at `/en/upcoming-events/`.

## What was found

Level 1 (`PASSIVE_STATIC`) was genuinely insufficient: the retained page's
own listing container ships empty (`<div class="c-calendar__days"></div>`,
a `.t-programmation.loading--` state) — client-rendered, zero event cards
in the plain HTTP response.

Level 2 (`STRUCTURAL`) resolved it cleanly: fetching the page's own
referenced compiled JS bundle (a plain `.js` file, never executed) and
reading its literal endpoint-construction code revealed a real, public,
unauthenticated custom WordPress REST route,
`/wp-json/df-elastic-search/v1/search-evenements/`, plus the exact
`filter_periods[0][begin_date]=YYYY-MM-DD` query parameter the bundle
itself builds. Calling it directly (still a plain HTTP GET) returned 124
real, current, full event records — title, permalink, a genre taxonomy,
and a `meta` object with `begin_date`/`end_date` (full local date+time)
and a ready-made price-range string.

The source's own genre taxonomy includes one non-music value ("Comedy")
alongside real music genres (Rock, Pop, Rap/Hip-Hop, Jazz, Electronic
music, ...) — a direct, first-party classification signal, not a keyword
guess.

## Collector

`PARIS_BESPOKE` — this custom `df-elastic-search` plugin response shape is
unique to this source; no existing collector family matches it. A new
module, `ingestion/olympia-paris/observation-adapter.mjs`, was written.
`tests/olympia-paris.test.mjs` (5 passing tests, `node --test`, no network)
proves the parser deterministically against a bounded, disclosed real
subset of the live response
(`fixtures/olympia-paris/search-evenements-response-subset.json`).

## Decision

`READY_FOR_ACTIVATION` — identity, a genuinely escalated (Level 1
INSUFFICIENT -> Level 2 SUFFICIENT) acquisition path, title/start_date/
source_record_id/end/price all PROVEN with basis DIRECT_SOURCE, a known
collector family, and offline-proof evidence are all retained.
