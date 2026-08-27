# adidas-arena-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates adidas
arena (multi-purpose arena, 56 Boulevard Ney, 75018 Paris). Official site:
https://www.adidasarena.com/programmation

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. This is a Nuxt (Vue)
server-side-rendered application, and a single plain curl GET of the
"Programmation" page already renders dozens of `.app-programmation-card`
event blocks as static markup — each with its own category tag (concert,
sport, mma, ...), a French-language date+time string (day + full month
name, uppercase, + year + time), a title, and an indicative "À partir de
{X}€" price. No client-side JS execution was needed.

The card's own wrapper class directly states its category — a genuinely
direct classification signal (not a keyword guess over free text), used
to keep only `concert` cards and exclude sport/mma fixtures. One sampled
card's own date text spans two dates ("2 & 3 OCTOBRE 2026") rather than
this source's usual single-date format; the parser honestly falls back to
`TEXT_ONLY` for that record rather than guessing which date is meant.

## Collector

Genuinely bespoke: `ingestion/adidas-arena/discovery.mjs` +
`observation-adapter.mjs`. Proven offline against the retained fixture by
`tests/adidas-arena.test.mjs` (4/4 passing).

## Decision

`READY_FOR_ACTIVATION` — identity, acquisition path, title/start_date
(both `DIRECT_SOURCE`), and source_record_id are all proven; a passing
`DETERMINISTIC_DERIVATION` offline test is retained; no `CRITICAL` blocker
exists (two `MINOR` ones are documented: unconfirmed calendar completeness,
and one genuinely multi-date card falling back to `TEXT_ONLY`).
