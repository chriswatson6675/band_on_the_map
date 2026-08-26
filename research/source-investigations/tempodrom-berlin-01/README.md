# tempodrom-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 6-venue collector-reuse trial. Investigates Tempodrom
(concert/circus-tent-shaped multi-purpose venue, Möckernstraße, Kreuzberg,
Berlin). Official site: https://www.tempodrom.de/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient, and in the best-case way this
trial found: a single curl GET of the official "Programm & Tickets" page
embeds one `<script type=application/ld+json>` block containing a JSON
array of **150 full schema.org `Event` records** — name, startDate,
doorTime, endDate, a full postal-address location, performer, and an
`AggregateOffer` with a real price range. This is the exact same bulk-array
JSON-LD pattern already proven for `moog-barcelona-01`, requiring the
project's existing, fully generic `ingestion/json-ld/parse.mjs` collector —
zero new code.

One honest caveat found: JSON-LD's `endDate` was determined, by comparing a
single-day event against a genuine multi-day festival, to represent the
last calendar day of a (possibly multi-day) event run rather than a
performance end-time — so `end` is recorded `NOT_PRESENT` rather than
misread as a proven fact.

The retained evidence file is a disclosed, bounded excerpt: the original
page was 709,889 bytes, almost entirely navigation/CSS/image markup; only
the `<title>` and the full, verbatim JSON-LD block (all 150 records) were
kept (160,441 bytes).

## Decision

`READY_FOR_OFFLINE_PROOF` — every other `READY_FOR_ACTIVATION` gate is
satisfied against retained evidence, but no `DETERMINISTIC_DERIVATION`
offline-proof evidence item exists yet (separate follow-up collector-wiring
work, out of scope for this investigation task).
