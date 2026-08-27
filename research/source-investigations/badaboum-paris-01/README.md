# badaboum-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates
Badaboum. Official site: https://badaboum.paris/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. The official `/agenda/` list
page is WordPress with a custom "evenement" post type, no calendar
plugin, and no schema.org Event JSON-LD (only Yoast SEO boilerplate) —
its own repeated static card markup states **39 real events** with
title+category+full French date directly.

Each event's own detail page additionally embeds a genuinely structured,
machine-readable calendar-data block — `<div class="google-event"
data-date-start data-date-end data-h-start data-h-end>` — the same block
the page's own front-end JS reads to power its "Add to Google Calendar"
link. This gives a complete, first-party start **and** end instant (both
date and time-of-day), which is rare among this task's four venues.

The site's own public WordPress REST API (`wp-json/wp/v2/evenement/{id}`,
linked from every page's own `<head>`) was also checked as a further
passive Level-1 step and honestly rejected as a data path: it carries
only WordPress's own post-management timestamps and a free-text content
blob, never a structured event date/time field.

**Honest address discrepancy recorded, not silently resolved:** the
source's own homepage and both sampled detail pages consistently state
"2 Rue des Taillandiers — 75011 Paris" (no "bis"), differing from this
task's assigned "2 bis rue des Taillandiers". The source's own retained
statement is used as the governing fact.

## Collector

`ingestion/badaboum-paris/discovery.mjs` (list-page cards) +
`ingestion/badaboum-paris/observation-adapter.mjs` (detail-page structured
calendar-data block, Observation construction) — new, bespoke; classified
`STATIC_EVENT_LIST`. Offline-proven by `tests/badaboum.test.mjs` against
retained fixtures (`fixtures/badaboum-paris/`).

## Decision

`READY_FOR_ACTIVATION` — identity, acquisition class, confirmed public
data paths, title/start_date/end (all `DIRECT_SOURCE`), and a proven
source_record_id (URL-slug permalink) are all established against
retained evidence, with no unresolved blocker, and an offline
`DETERMINISTIC_DERIVATION` proof is retained.
