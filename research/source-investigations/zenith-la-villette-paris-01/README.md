# zenith-la-villette-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Zénith
Paris - La Villette (large concert arena, 211 Avenue Jean Jaurès, 75019
Paris). Official site: https://le-zenith.com/program

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. A single plain curl GET of the
"Programme" page renders 8 `.card-show` event blocks directly in static
HTML — artist name, a French-language date string (day-name + day +
abbreviated month + year, no time-of-day), and a `/shows/{Name}-{id}`
detail link.

One honest, non-trivial finding: at least one sampled card (BINI, and
separately Hexagone MMA) shows its date struck through (`<del>`) alongside
an explicit "Annulé" (Cancelled) / "Reporté" (Postponed) status label, with
no replacement date printed anywhere on the page. The collector still
extracts these cards (never silently drops them) but excludes them from
its published Observations, rather than asserting a struck-through date as
a still-valid fact.

This source shows no price of any kind on its list view — ticketing is
delegated entirely to third-party links (Ticketmaster, and a secondary
listing site) never resolved to a price on this page itself.

## Collector

Genuinely bespoke: `ingestion/zenith-la-villette/discovery.mjs` +
`observation-adapter.mjs`. Proven offline against the retained fixture by
`tests/zenith-la-villette.test.mjs` (5/5 passing), including an explicit
test that the cancelled/struck-through cards are correctly excluded.

## Decision

`READY_FOR_ACTIVATION` — identity, acquisition path, title/start_date
(both `DIRECT_SOURCE`), and source_record_id are all proven; a passing
`DETERMINISTIC_DERIVATION` offline test is retained; no `CRITICAL` blocker
exists (two `MINOR` ones are documented: unconfirmed calendar completeness,
and no machine-readable music/non-music category field on this source).
