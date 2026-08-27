# dome-de-paris-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Le Dôme
de Paris (Palais des Sports), 34 Boulevard Victor, 75015 Paris. Official
site: https://www.ledomedeparis.com/, events at
`/fr/spectacles/a-laffiche`.

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient: a single curl GET of the
venue's own official listing page returns 26 real, current, repeated
static HTML cards — title, a self-stated category ("Concert" / "Comédie
musicale" / "One man show" / "Spectacle"), a French date text, and a
stable numeric-id permalink (`/fr/spectacle/{id}/{slug}`). A second plain
GET of one show's own detail page confirmed this source's genuine two-page
structure: time-of-day and a full price breakdown are stated there, not on
the listing page.

Date-text honesty (policy v1.2): single-day cards state the full date
directly ("05 septembre 2026" — `DIRECT_SOURCE`). Multi-day cards state
their year exactly once, trailing the second date ("Du 12 septembre au 18
octobre 2026", or "Du 06 au 07 novembre 2026") — that single trailing
year (and month, when the leading fragment omits it too) mechanically
governs the leading date within the same row. This one fixed rule was
verified to parse every single one of the 26 real retained cards
correctly (`tests/dome-de-paris.test.mjs`), so `start_date` is recorded
`PROVEN`/`DETERMINISTIC_CONTEXT` for the multi-day case, with a full
`derivation` object citing the exact rule and inputs.

The venue's own embedded Google Maps iframe directly names this exact
venue ("Le Dome de Paris") at its own coordinates — used both for identity
confirmation and as first-party `CONFIRMED` location evidence (see the
proposed `venues/paris.json` entry in the final report).

## Collector

`PARIS_BESPOKE` — a genuinely two-page (listing + per-event detail) static
HTML shape; no existing collector family matches it. A new module,
`ingestion/dome-de-paris/observation-adapter.mjs`, was written.
`tests/dome-de-paris.test.mjs` (9 passing tests, `node --test`, no
network) proves the parser deterministically against both retained
fixtures.

## Decision

`READY_FOR_ACTIVATION` — identity, acquisition path, title/start_date/
source_record_id/time/price all PROVEN (start_date via a documented,
offline-proven `DETERMINISTIC_CONTEXT` derivation for the multi-day case),
a known collector family, and offline-proof evidence are all retained.
`end` is honestly `PARTIAL` (present only for multi-day cards).
