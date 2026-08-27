# supersonic-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates
Supersonic (9 rue Biscornet, 75012 Paris), including its sister room
"Supersonic Records" — same operator, same building, treated as one venue
entity. Official site: https://supersonic-club.fr/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient, and in the best-case way: the
official `/events/` page's own JSON-LD already carries structured Event
data for the current week, and that same page's own static markup
directly links to the underlying WordPress plugin's own public REST API
(The Events Calendar / Events Calendar Pro — `wp-json/tribe/events/v1/`),
the SAME generic family already proven for `ccb-lisbon-01` and
`yaam-berlin-01`. A plain GET of that publicly-linked endpoint returned
the venue's **full 95-event schedule across 2 pages**, each event
carrying id/title/local+"UTC" start/end/venue/cost/url directly.

Both `SUPERSONIC` and `Supersonic Records` appear as distinct venue names
in the same feed, but every single record for both names states the
identical address (9 Rue Biscornet, 75012 Paris) — confirming this task's
own note that they are one operator/room, not two venues.

**One honest, load-bearing caveat found:** this source's own "UTC"
fields (`utc_start_date` and the JSON-LD's `+01:00` offset) do not appear
to account for French Summer Time — comparing local `19:00:00` against
stated `utc_start_date` `18:00:00` for a late-August event implies a
fixed UTC+1 offset, when the real correct offset for that calendar date
is UTC+2 (CEST). The existing generic collector's default behaviour
(trust a present `utc_start_date` as a confirmed UTC instant) would be
subtly wrong for this specific source during DST months. This is
recorded as a MINOR blocker with a documented (not applied) mitigation:
the eventual Paris wiring should omit/null this source's own UTC fields
and rely on its local date/time fields instead.

## Collector

**PARIS_ZERO_CODE.** No new collector code exists or is needed —
`ingestion/events-calendar-api/client.mjs` + `ingestion/events-calendar-
api/observation-adapter.mjs` + `ingestion/events-calendar-api/fetch-
all.mjs` (unmodified) fully cover this source, following the exact
pattern already wired for `yaam-berlin` in `ingestion/berlin/run.mjs`'s
`collectYaam()`. Offline-proven by `tests/supersonic-paris.test.mjs`
against retained fixtures (`fixtures/supersonic-paris/`), using the
existing modules only.

## Decision

`READY_FOR_ACTIVATION` — identity, acquisition class, a confirmed public
data path (2 pages of the REST API), title/start_date (both
`DIRECT_SOURCE`), and a proven source_record_id (platform-stable numeric
post id) are all established against retained evidence, with no
unresolved `CRITICAL` blocker (the DST-offset finding is MINOR), and an
offline `DETERMINISTIC_DERIVATION` proof is retained.
