# cafe-de-la-danse-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Café de
la Danse (concert venue, 5 Passage Louis-Philippe, 75011 Paris). Official
site: https://www.cafedeladanse.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. The official `/programmation/`
page carries **no** schema.org JSON-LD Event data at all — this venue's
WordPress install runs the "eventchamp" theme, whose own repeated static
`gt-event-listing` card markup already states, per event, a complete
French-language date (day + month name + 4-digit year, e.g.
"5 septembre 2026"), a start time ("20h00"), the title, and the event's
own canonical `/event/{slug}/` URL — no per-event detail-page fetch
needed for those fields.

47 raw card matches were found, but 12 of them are exact duplicates: the
page also renders a "Nouvelles dates !" ("New dates!") promotional widget
further down the same page that re-lists a subset of already-listed
events with byte-identical data. Deduplicated by URL slug, this yields
**35 unique real events**, all dated in September–October 2026.

The venue's own homepage separately states its full postal address
directly in page text ("05 Passage Louis-Philippe 75011 Paris") — an
exact match to this task's assigned address.

No price value is ever printed anywhere sampled — only a "TICKET" button
per card linking out to one of several third-party ticketing platforms
(SeeTickets, Weezevent, Ticketmaster, dice.fm all observed), confirming
this task's note that ticketing is fragmented across several third
parties per event.

## Collector

`ingestion/cafe-de-la-danse-paris/observation-adapter.mjs` (new, bespoke —
this exact "eventchamp" theme card markup is not shared by any other of
this task's 4 venues; classified `STATIC_EVENT_LIST`, a known family in
this project's vocabulary, but genuinely bespoke code). Offline-proven by
`tests/cafe-de-la-danse.test.mjs` against the retained fixture
`fixtures/cafe-de-la-danse-paris/programmation.html`.

## Decision

`READY_FOR_ACTIVATION` — identity, acquisition class, a confirmed public
data path, title/start_date (both `DIRECT_SOURCE`), and a proven
source_record_id (URL-slug permalink) are all established against
retained evidence, with no unresolved `CRITICAL` blocker, and an offline
`DETERMINISTIC_DERIVATION` proof is retained.
