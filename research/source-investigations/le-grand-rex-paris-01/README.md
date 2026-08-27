# le-grand-rex-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Le Grand
Rex (historic single-screen cinema and concert hall), 1 Boulevard
Poissonnière, 75002 Paris. Official site: https://www.legrandrex.com/,
events at `/evenement`. **Note:** a separate basement nightclub, "Rex
Club", is a DIFFERENT venue/source and is investigated separately
(`research/source-investigations/rex-club-paris-01/`) — out of scope here.

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient: a single curl GET of the
venue's own official events listing page returns genuinely static HTML —
48 real, current event rows, each one repeated
`<div class='row row-fe row-event ...'>` block. Two independent, redundant
first-party signals both state the full calendar date directly: the row's
own `class` attribute embeds it as a literal token (`date-2026-09-19`, or
two tokens for a multi-day run), and the row's own visible
`<h5 class='date-tout'>` text restates it in French, always including the
year. No JS execution or escalation was needed.

The venue also hosts non-concert stage shows (ballet, conferences, comedy)
on the same "Concerts & Spectacles" listing page. This source's own row
markup already distinguishes them: a literal, standalone `concerts` class
token (distinct from the non-discriminating compound class
`concerts-spectacles`, present on every row) marks the shows this venue
itself classifies as concerts. 31 of the 48 sampled rows carry it.

## Collector

`PARIS_BESPOKE` — no existing collector family in this project matches
this exact class-attribute-embedded-date HTML shape. A new, small module,
`ingestion/le-grand-rex/observation-adapter.mjs`, mirrors
`ingestion/badehaus/observation-adapter.mjs`'s convention. `tests/le-grand-rex.test.mjs`
(6 passing tests, `node --test`, no network) proves the parser
deterministically against the retained fixture
(`fixtures/le-grand-rex-paris/evenement-listing.html`), covering both the
single-day and multi-day date shapes.

## Decision

`READY_FOR_ACTIVATION` — identity, acquisition path, title/start_date/
source_record_id, a known collector family, and offline-proof evidence are
all retained. `end` and `price` are honestly `PARTIAL` (genuinely present
on some rows, absent on others) — `price` is this project's one optional
field and does not gate activation.
