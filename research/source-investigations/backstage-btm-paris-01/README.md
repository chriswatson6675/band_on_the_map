# backstage-btm-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates
Backstage By The Mill. Official site: https://www.backstage-btm.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. The official `/en/calendar/`
list page is a WordPress custom "agenda" post type with no calendar
plugin and no schema.org Event JSON-LD (only Yoast SEO boilerplate) — its
own repeated static card markup states **30 real events** with
title+genre+full DD/MM/YYYY date directly, but no time-of-day anywhere,
and no venue address on the list page itself.

**Address established from real evidence, correcting an unconfirmed
prior note:** both sampled event detail pages state the venue's address
directly ("O'Sullivans By The Mill, 92 bis bd de Clichy - Paris"), and
the venue's own separate `/en/information/` page states the full address
with postcode ("92 Boulevard de Clichy 75018 Paris") plus a distinct
"Concert Access: Face au 7 Cité Véron 75018 Paris" note. This confirms
the task's hint (near/behind O'Sullivans Pigalle, 18th arrondissement)
with a real, retained street number and postcode, rather than assuming
it.

**Honest date caveat:** 28 of 30 sampled cards state a full 4-digit-year
date; 2 ("Any Given Day" 07/11/26, "Mispyrming" 23/10/26) state a bare
2-digit year — an inconsistent formatting quirk on the source's own page.
The retained collector never expands "26" to "2026" (that would depend
on an assumed century) — those 2 records are honestly left unresolved.

## Collector

`ingestion/backstage-btm-paris/discovery.mjs` (list-page cards) +
`ingestion/backstage-btm-paris/observation-adapter.mjs` (detail-page
address/title, Observation construction) — new, bespoke; classified
`STATIC_EVENT_LIST`. Offline-proven by `tests/backstage-btm.test.mjs`
against retained fixtures (`fixtures/backstage-btm-paris/`).

## Decision

`READY_FOR_ACTIVATION` — identity, acquisition class, confirmed public
data paths, title/start_date (both `DIRECT_SOURCE` for 28/30 sampled
events), a proven source_record_id (URL-slug permalink), and venue
address are all established against retained evidence, with no
unresolved `CRITICAL` blocker, and an offline `DETERMINISTIC_DERIVATION`
proof is retained.
