# theatre-de-la-ville-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Théâtre
de la Ville (Sarah Bernhardt hall, 2 place du Châtelet, 75004 Paris), and
its sister hall Théâtre des Abbesses (31 rue des Abbesses, 75018 Paris) —
treated as one Venue/operator for this pass. Official site:
https://www.theatredelaville-paris.com/fr

## What was found

Level 1 (`PASSIVE_STATIC`) was **insufficient**: the homepage only exposes
schema.org `Article` JSON-LD (blog/interview posts), no `Event` data.

Level 2 (`STRUCTURAL`) was sufficient, and unexpectedly generous: the
site's own response headers named its platform (`X-Powered-By: Roadiz
CMS`) and referenced a ticketing subdomain in its CSP header. A direct,
reasoned probe of `api.theatredelaville-paris.com` (the operator's own
separate API subdomain — a documented Roadiz/API-Platform pattern)
revealed a full, public, unauthenticated Hydra/JSON-LD REST API with
`/events`, `/event_dates`, `/seasons`, and `/taxons` collections. Querying
these directly returned complete first-party records: title, a full ISO
start **and end** instant with explicit UTC offsets, hall/place name,
price range, and a stable per-performance resource ID.

**Music-programming verification (the task's central question):** the
site's own "Musiques" taxonomy (id `63`) carries **279 events across this
source's full history**, and at least 13 distinct works are already listed
for the current 2026-27 season alone (Abdullah Miniawy, Ballaké Sissoko,
Marja Mortensson, Jennifer Walshe/Ensemble Contrechamps, Le Sankyoku,
Flore Benguigui, etc. — see `ev-musiques-season-2627-links.txt`). This is
a genuine, substantial, recurring world/chamber/contemporary-music
programme, not a generalist theatre with one incidental concert per year.

One honest naming caveat, in the same spirit as Tempodrom Berlin's
`endDate` finding: the API's own field is literally named `doorTime`, but
cross-checking the same record's `arrayDates`/`sortingDateTime`/
`humanHours` fields confirms it is actually used as the performance start
instant on this record, not a genuinely separate door-opening time.

## Both halls, one operator

The homepage's own `<title>` names BOTH "Théâtre de la Ville" and "Théâtre
des Abbesses" together, and the API's own place-entity naming convention
prefixes every place with `TDV-` (e.g. `TDV-Sarah Bernhardt_Grande salle`)
— confirming both halls are modelled as places within one single operator
API, not two separate sources. No evidence was found requiring two
separate canonical Venue records for this pass.

## Decision

`READY_FOR_ACTIVATION` — identity, acquisition path, and every gated field
(`title`, `start_date`, `source_record_id`) are `PROVEN`, plus `end`,
`venue_location`, `event_url`, and `price` beyond what activation strictly
requires. A `DETERMINISTIC_DERIVATION` offline-proof test
(`tests/theatre-de-la-ville.test.mjs`) re-parses the retained fixtures and
reproduces every claimed field deterministically. Collector family:
`JSON_API`, genuinely bespoke (`ingestion/theatre-de-la-ville/`) — no
existing generic module in this repository models this Hydra
events+event_dates split-entity shape.
