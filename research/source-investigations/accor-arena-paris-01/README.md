# accor-arena-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Accor
Arena (large multi-purpose arena, 8 Boulevard de Bercy, 75012 Paris).
Official site: https://www.accorarena.com/en/events-and-tickets

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. This is an Angular Universal
(server-side-rendered) application, and a single plain curl GET of the
"Events" page already renders every visible event card as static markup —
title, an English-language date (day + full month name + year, no
time-of-day), a per-event detail link, and — for most events — an
indicative "From : €X" price. No client-side JS execution was needed to
read any of this.

The same page also embeds a much deeper, HTML-entity-escaped Angular
TransferState JSON blob (a normalized NgRx-style state tree). This was
retained as supplementary evidence (it directly confirms the venue's own
name, `room.full_name: "Accor Arena"`), but the actual collector
deliberately does NOT parse it — the same title/date/price/url fields are
already available, more simply and robustly, straight from the rendered
card markup.

One sampled card (a French national basketball qualifying match) is a
sports fixture, not music — excluded via a small, bounded, documented
keyword filter, since this source exposes no separate machine-readable
category field on its list page.

## Collector

Genuinely bespoke: `ingestion/accor-arena/discovery.mjs` +
`observation-adapter.mjs`. No existing collector family in this repository
already matches this exact card markup. Proven offline against the
retained fixture by `tests/accor-arena.test.mjs` (5/5 passing).

## Decision

`READY_FOR_ACTIVATION` — identity, acquisition path, title/start_date
(both `DIRECT_SOURCE`), and source_record_id (the site's own URL-slug
permalink) are all proven; a passing `DETERMINISTIC_DERIVATION` offline
test is retained; no `CRITICAL` blocker exists (two `MINOR` ones are
documented: unconfirmed calendar completeness, and the keyword-based
music/sport filter).
