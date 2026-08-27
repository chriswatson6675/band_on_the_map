# le-hasard-ludique-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01. Investigates Le Hasard
Ludique (bar/concert/culture venue on the former Petite Ceinture rail site,
128 avenue de Saint-Ouen, 75018 Paris). Official site:
https://www.lehasardludique.paris/

## What was found

Level 1 (`PASSIVE_STATIC`) — the homepage and `/infos-pratiques` were
insufficient: only a 6-item teaser carousel with no structured data at all.
`/programmation` (a further plain static fetch) showed a fuller 12-card
listing and exposed a `data-api="/api/events"` attribute on its own listing
container. Following that publicly-referenced endpoint (Level 2
`STRUCTURAL`) returned **all 54 currently-listed events in one JSON
response** — a custom Ruby on Rails app's own internal API, whose `items`
are pre-rendered HTML card fragments (title, `DD.MM.YYYY` date, named
sub-room, permalink href), not a structured field-per-event schema.

Title, start_date, venue (single-venue source, plus a named sub-room:
"La Salle"/"La Gare"/"Le Quai"), source_record_id (the site's own permalink
path), and event_url are all `PROVEN`/`DIRECT_SOURCE` straight from this one
list endpoint. One bounded, single-sample per-event detail-page fetch
confirmed that time-of-day and price ("TARIFS: prévente 12€ / sur place
14€") both exist on individual event pages, but that pattern was not
exercised at scale within this investigation, so both fields are honestly
recorded `PARTIAL` rather than `PROVEN`.

## Decision

`READY_FOR_ACTIVATION`. `recommended_family: STATIC_EVENT_LIST` — the same
per-card regex-extraction pattern already used for Badehaus Berlin, applied
here to card fragments delivered inside a JSON wrapper. A bespoke collector
(`ingestion/le-hasard-ludique/`) was written and offline-proved against the
retained `/api/events` fixture (`tests/le-hasard-ludique.test.mjs`).
