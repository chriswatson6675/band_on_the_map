# petit-bain-paris-01

Investigation of Petit Bain (floating venue/barge, 7 Port de la Gare, 75013
Paris), part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`.

## Summary

Petit Bain's official `/agenda/` page is a static WordPress agenda built on
a bespoke theme (`petitbain`) with a custom post type `evenement`. All 59
currently-listed events are visible as static HTML cards in a single page
fetch — no JavaScript rendering or pagination required.

Every card states its own WordPress post ID, first-party detail-page URL,
and title(s) directly. **The one genuine, honest limitation**: neither the
agenda list nor any sampled per-event detail page ever states a year
anywhere — cards read e.g. "mar 20 octobre" (weekday + day + month, no
year). A Level 2 check of this WordPress site's own `/wp-json/` REST route
index confirmed no structured JSON path exists that improves on this (no
`wp/v2/evenement` route is registered; the one event-adjacent route present
is an unrelated Facebook-Pixel conversion-tracking callback).

Per policy, a year cannot be filled in here without either (a) inventing it
from today's date/season plausibility (`AI_INFERENCE`, never permitted to
reach `PROVEN`), or (b) treating a third-party ticketing domain's own URL
slug (billetterie.seetickets.fr, which does embed a full date+year) as
first-party fact authority, which this policy does not allow. `start_date`
is therefore honestly recorded `PARTIAL` with no claimed value.

## Decision

`READY_FOR_OFFLINE_PROOF`. Identity, venue location, source_record_id,
title, and event_url are all `PROVEN` (`DIRECT_SOURCE`). A bespoke
collector family was required (`NEW_FAMILY_REQUIRED`) — this theme's own
card markup does not match the existing `ingestion/wp-evenement-cards/`
family (Le Trianon / Élysée Montmartre), whose cards always state a full
day+month+year string.

## Collector

`ingestion/petit-bain-paris/discovery.mjs` + `observation-adapter.mjs` — a
new bespoke family, handling both of this theme's card sub-templates
("concert" cards with `titartprog` spans for headliner + support acts, and
"soirée/club" cards with a single `nomsoiree` title). Deliberately never
promotes `start.date` past `null`/`TEXT_ONLY` certainty when no year is
present — see the adapter's own doc comment.

Offline proof: `tests/petit-bain.test.mjs` (6/6 passing), against the
retained fixture `fixtures/petit-bain-paris/agenda-page-sample.html` (a
byte-faithful excerpt of 3 real cards, including one sold-out concert card
with a support act and one soirée/club-template card).

## Coordinates

`GEOCODED` via a live, one-off Nominatim query ("Petit Bain, 7 Port de la
Gare, 75013 Paris, France") — two independent Nominatim results, both
explicitly named "Petit Bain" at the exact same address, converge on
essentially the same point (48.8354–48.8356 N, 2.3765–2.3767 E).

## Evidence

- `evidence/agenda-raw.html` — full retained `/agenda/` page (214,180 bytes).
- `evidence/detail-boris-raw.html` — one sampled per-event detail page.
- `evidence/wp-json-index-raw.json` — this site's own REST route index.
- `evidence/wp-json-pys-facebook-raw.json`, `evidence/wp-json-evenement-raw.json`
  — Level 2 structural probes confirming no useful JSON path exists.
