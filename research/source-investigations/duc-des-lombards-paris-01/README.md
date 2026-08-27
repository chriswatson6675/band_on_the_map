# duc-des-lombards-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Le Duc
des Lombards (42 rue des Lombards, 75001 Paris). Official site:
https://ducdeslombards.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was fully sufficient: the official "L'Agenda"
page is genuine server-rendered Drupal HTML with 39 real event cards, each
stating its own title, showtimes (with a distinct Drupal `data-nid` node
id per showtime), and a permalink. A separate `sonic-tickets-app` widget
handles checkout only, not event discovery.

The one honest gap: each card's own date text states only a day name +
day number + month abbreviation (e.g. `"01 sept."`) — **never a year**.
This is the framework's own textbook `v1.2` `DETERMINISTIC_CONTEXT` case:
the page's own month/year separator headings are real DOM anchors with a
directly machine-readable `id="YYYY-MM"` attribute (e.g. `id="2026-09"
aria-label="septembre 2026"`), confirmed to genuinely precede the cards
they govern in document order (4 real separators found: `2026-08`,
`2026-09`, `2026-10`, `2026-11`). Combining the nearest preceding
separator's `id` with a card's own day number mechanically and
reproducibly yields the full date — never a guess from today's date.

Multi-night runs (e.g. "Du mar. 1 au jeu. 3 sept.") repeat this
day+time+node-id structure once per night; each night's own node id is
genuinely distinct, so this project models each (day, time, node-id)
triple as one Observation.

## Decision

`READY_FOR_ACTIVATION`. Identity `PROVEN`; `acquisition_class`
`STATIC_HTML`; `title` `PROVEN` with `basis: DIRECT_SOURCE`; `start_date`
`PROVEN` with `basis: DETERMINISTIC_CONTEXT` and a cited `derivation`
(the separator-id + card-day-number combination, reproduced for all 9
real showtimes across the 3 retained cards); `source_record_id` `PROVEN`
via Drupal's own permanent node id; `recommended_family`
`STATIC_EVENT_LIST` (bespoke, matching this project's `badehaus-berlin-01`
precedent); `DETERMINISTIC_DERIVATION` offline-proof evidence retained
(`tests/duc-des-lombards.test.mjs`, 4/4 passing); no unresolved `CRITICAL`
blocker. `price` honestly `NOT_PRESENT` for the sampled record (this
site's own body-class taxonomy directly states `no-tarifs`) — optional,
does not block activation.

Coordinates: `GEOCODED` via `ingestion/geocoding/nominatim.mjs`. A
name+address query returned zero candidates (no matching OSM name tag);
an address-only fallback query returned a single, exact house_number/
road/postcode match, used as this venue's coordinate.
