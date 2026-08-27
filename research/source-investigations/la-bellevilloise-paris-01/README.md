# la-bellevilloise-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates La
Bellevilloise (multi-room concert hall, club and cultural venue), 19-21
rue Boyer, 75020 Paris. Official site: https://labellevilloise.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient: a single curl GET of the
official `/agenda/` page found 58 real, current, dated event cards
(`<article class="c-tile">`), spanning August-December 2026, with real
touring acts (Poliça, Josh Smith, Des Rocs, Gang of Youths, and more).

The interesting finding is the date field: each card's visible date text
never states a year (e.g. "Mer 2 septembre"), but the SAME card's own
`data-categories` HTML attribute directly carries a machine-readable
`YYYY-MM` tag (e.g. `concert;club;2026-09`) alongside its other tags. This
is a textbook `DETERMINISTIC_CONTEXT` case under policy `v1.2` — two
retained, first-party pieces of the same card, combined by a fixed rule,
with the visible month name cross-checked against `data-categories`' own
month number as a safety check. This was verified reproducible across all
58 sampled cards, with zero disagreement, not merely asserted for one.

Each card's own per-event detail page (`/evenement/{slug}/`) additionally
states an explicit local start/end time directly (e.g. "20h00 à 22h00"),
and, for some events, a starting price ("À partir de 13€") — both used to
enrich, never to discover, an already-found card. The venue's own
`/infos-pratiques/` page directly states its full address, matching this
task's assigned address exactly.

## Collector

`PARIS_BESPOKE` — no existing collector family in this project matches
this exact `data-categories`-plus-visible-date card shape. A new, small
module, `ingestion/la-bellevilloise/observation-adapter.mjs`, mirrors
`ingestion/badehaus/observation-adapter.mjs`'s convention, adding a
dedicated `deriveCardDate()` function implementing the `DETERMINISTIC_
CONTEXT` combination rule. `tests/la-bellevilloise.test.mjs` (7 passing
tests, `node --test`, no network) proves the parser deterministically
against the retained fixtures (`fixtures/la-bellevilloise-paris/`).

## Decision

`READY_FOR_ACTIVATION`. `ingestion/la-bellevilloise/observation-adapter.mjs`
(new, bespoke `STATIC_EVENT_LIST` collector — `deriveCardDate()`,
`extractEventCards()`, `extractDetailFields()`, `toObservation()`/
`toObservations()`) parses the retained fixtures deterministically,
including refusing to derive a date when a card's two fields disagree;
`tests/la-bellevilloise.test.mjs` proves this offline, with no network
access, and passes (7/7).
