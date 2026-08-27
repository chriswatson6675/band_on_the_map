# le-bateau-phare-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Le
Bateau Phare (bar/club/live-music boat on the Seine, formerly Batofar; a
genuine same-site rebrand after a 2024 reopening — batofar.fr is dead,
not a duplicate venue), 3 Port de la Gare, 75013 Paris. Official site:
https://lebateauphare.paris/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient, and in the best-case way: a
single curl GET of the official `/en/programmation/` page embeds one
`<script type="application/ld+json">` block whose `@graph` contains BOTH
a `Restaurant`/`NightClub`/`BarOrPub` self-description (own address AND
own `geo` coordinates, directly stated) AND all 9 currently-listed
`MusicEvent` records — the exact same bulk-`@graph` JSON-LD pattern
already proven for `tempodrom-berlin-01`/`waldbuehne-berlin-01`, requiring
the project's existing, fully generic `ingestion/json-ld/` collector —
zero new code.

This genuinely resolves the prior pass's uncertainty about the dates: each
`MusicEvent`'s own `startDate` is a full ISO 8601 datetime with an
explicit `+02:00` UTC offset (e.g. `2026-09-12T18:00:00+02:00`),
independently corroborated by the venue's own per-event URL slugs (e.g.
`providence-le-bateau-phare-12-09-26`) and by the static page's own month
-section headers (`Août 2026`, `Septembre 2026`, `Octobre 2026`). Every
sampled date is genuinely 2026, not a misread year.

The venue's own ticketing for every event runs through Shotgun.live (an
external `url`/`offers.url` per record) — the venue's own official page is
still the authoritative first-party source for title/date/location, only
the actual purchase flow is external, and Shotgun.live itself was never
relied upon or fetched for this investigation.

## Collector

`PARIS_ZERO_CODE` — no new ingestion code. `ingestion/json-ld/parse.mjs` +
`ingestion/json-ld/observation-adapter.mjs` (this project's existing,
fully generic JSON-LD family, already proven for tempodrom-berlin-01/
waldbuehne-berlin-01) parse this source's own retained fixture completely
unmodified.

## Decision

`READY_FOR_ACTIVATION`, `PARIS_ZERO_CODE`. No new ingestion code —
`tests/le-bateau-phare.test.mjs` proves the EXISTING, completely
unmodified `ingestion/json-ld/parse.mjs` + `ingestion/json-ld/
observation-adapter.mjs` reproduce every claimed field offline, with no
network access, and passes (3/3).
