# glazart-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates
Glazart (live music venue and club), 7-15 Avenue de la Porte de la
Villette, 75019 Paris. Official site: https://www.glazart.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient: a single curl GET of the
official `/agenda-concerts/` page found 21 real, current, dated event
cards — a WordPress "portfolio" custom post type, not a calendar plugin
or JSON-LD Event block (the page's own JSON-LD is generic AIOSEO
Organization/Breadcrumb metadata only). Each card states its own date as
a `DD.MM.YY` prefix in both its `<h3>` title text and its own permalink
URL slug (e.g. `15-09-26-concert-funebrarum`), self-consistently across
all 21 sampled cards. Two individual event detail pages were also fetched
to check field consistency: both confirm the venue's own footer address
matches this task's assigned address exactly, and both state a ticket
price and some form of time-of-day in free text — but only reachable
per-event, and inconsistently formatted between "concert" and "after"
categories, so this bounded collector does not harvest them.

One honest data-quality note: one sampled event's own free-text body copy
states a conflicting date (`Mardi 17.09.26`) elsewhere on the same page
that also correctly states `15.09.26` (matching its title/slug) — an
inconsistency in the venue's own copy, not in this investigation's
parsing. Recorded as a MINOR blocker, not treated as invalidating the
structured date field this collector actually relies on.

## Collector

`PARIS_BESPOKE` — no existing collector family in this project matches
this exact WordPress-portfolio-card HTML shape. A new, small module,
`ingestion/glazart/observation-adapter.mjs`, mirrors
`ingestion/badehaus/observation-adapter.mjs`'s convention.
`tests/glazart.test.mjs` (4 passing tests, `node --test`, no network)
proves the parser deterministically against the retained fixture
(`fixtures/glazart-paris/agenda-page.html`).

## Decision

`READY_FOR_ACTIVATION`. `ingestion/glazart/observation-adapter.mjs`
(new, bespoke `STATIC_EVENT_LIST` collector — `extractEventCards()` +
`toObservation()`/`toObservations()`) parses the retained fixture
deterministically; `tests/glazart.test.mjs` proves this offline, with no
network access, and passes (4/4).
