# caveau-de-la-huchette-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Investigates Le Caveau de la Huchette (jazz/swing club, 5 rue de la
Huchette, 75005 Paris). Official site:
https://www.caveaudelahuchette.fr/

## What was found — re-verifying a prior "empty" finding

A prior pass reported this venue's month pages as empty in a fetch. This
investigation re-fetched directly and thoroughly: the September 2026
month page (`/1/concerts_septembre_2026_1483451.html`) is **genuinely
NOT empty** — it is real, static, server-rendered French free text
listing all 16 real September 2026 bookings, present directly in the
plain HTTP response body. Level 1 (`PASSIVE_STATIC`) was fully sufficient.

The page's own linked RSS feed (`/1/rss/1483451.xml`) was also checked —
it is genuinely empty (channel metadata only, zero `<item>`s), confirming
it is a page-template default, not a usable alternative feed.

Each booking is stated as one line: a French date phrase (a single day,
an "et"-joined pair of days, or a "(Du) ... au ..." day range — the month
name itself is repeated on most, but not all, lines) followed by the
performing act's name. The page states its own month/year exactly once
("Septembre 2026"), which mechanically governs any line that omits the
month — a genuine `DETERMINISTIC_CONTEXT` case per policy v1.2, with all
16 real bookings parsing deterministically via one fixed rule and zero
unparsed lines.

Two honest limitations documented, not concealed: (1) this source
declares no identifier or per-booking URL at all — `source_record_id`
uses a documented alternative strategy (slug of the act's own name +
its own start date) rather than a source-declared value, and `event_url`
can only be the shared month-page URL; (2) `time` stays `PARTIAL` — the
page states one generic, page-wide weekday/weekend set-time schedule, but
promoting it to a precise per-booking value would require computing each
booking's own day-of-week, which this investigation deliberately did not
build.

## Collector built

`ingestion/caveau-de-la-huchette/discovery.mjs` (page month/year heading
parsing + 4-shape French date-phrase parser, covering every real pattern
observed: single day, "et"-pair, "(Du) ... au ..." range with or without a
leading "Du") + `observation-adapter.mjs` (alternative-strategy
`source_record_id`, `DATE_ONLY` certainty, real multi-night `end` dates,
no fabricated venue/price/time). Fixture:
`fixtures/caveau-de-la-huchette-paris/month-septembre-2026-raw.html`.
Offline test: `tests/caveau-de-la-huchette.test.mjs` (5/5 passing,
`node:test`, zero network calls).

## Decision

`READY_FOR_ACTIVATION` — title and start_date both gate-satisfying
(`PROVEN`/`DETERMINISTIC_CONTEXT` with a genuine offline derivation
proof), source_record_id's documented alternative strategy satisfies
gate 6 explicitly, and no `CRITICAL` blocker exists.
