# a-trane-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Berlin jazz-club investigation trial (BOTM-BERLIN-30-40-VENUE-COLLECTOR-REUSE-
TRIAL-01). Investigates A-Trane (Charlottenburg, Berlin — Bleibtreustrasse 1),
one of Berlin's classic international jazz clubs.

## Outcome

Level 1 PASSIVE_STATIC alone was sufficient. A-Trane runs WordPress with the
EventON 4.4 calendar plugin, which renders a full `schema.org` `Event`
JSON-LD block for every upcoming concert directly into the page HTML — both
the homepage and the `/programm/` page. A plain `curl` GET (no browser, no
authentication) exposed 49–55 real upcoming events with `name`, `startDate`,
`endDate`, `url`, and `location` (venue name + street address) all present
per event.

This maps directly onto this project's existing, fully generic `JSON_LD`
collector family (`ingestion/json-ld/parse.mjs`) — no new code required.

One honest caveat retained in the record: the source's own `startDate`/
`endDate` strings use a non-zero-padded, non-standard-but-unambiguous
ISO-like format (e.g. `2026-8-26T20:30+2:00` rather than
`2026-08-26T20:30:00+02:00`). A future collector needs to tolerate this
rather than assume strict RFC 3339.

`price` is genuinely `NOT_PRESENT` in the JSON-LD data path (checked across
all 55 blocks on the programme page) — ticket prices exist only as plain
rendered page text, which this investigation did not retain as structured
evidence.

Decision: `READY_FOR_OFFLINE_PROOF` (not `READY_FOR_ACTIVATION`) — this
investigation deliberately did not build or run an offline parser/test
against the retained fixture, so gate 9 (a `DETERMINISTIC_DERIVATION`
evidence item) is not met. That offline-proof/collector-wiring step is
separate follow-up work.

## Evidence

`evidence/programm-page-excerpt.html` — a bounded, byte-faithful excerpt of
the real `curl` GET response from `https://a-trane.de/programm/`: the page
`<title>`, all 3 `<meta name="generator">` tags, 5 representative
`wp-json`-referencing lines, and the first 5 (of 55 total) JSON-LD `Event`
blocks verbatim. The full raw response was 1,455,777 bytes; this excerpt is
a genuine literal substring of it, not a summary or re-serialization.
