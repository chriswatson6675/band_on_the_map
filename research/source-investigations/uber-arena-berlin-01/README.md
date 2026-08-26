# uber-arena-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 6-venue collector-reuse trial. Investigates Uber Arena
(formerly Mercedes-Benz Arena Berlin, renamed 2024; large multipurpose
arena, Uber-Platz, Friedrichshain, Berlin). Official site:
https://www.uber-arena.de/

## What was found

Same AEG-operated venue CMS platform already found for the sibling
investigation `verti-music-hall-berlin-01` (uber-eats-music-hall.de) —
independently confirmed here, not assumed. Level 1 (`PASSIVE_STATIC`) was
sufficient: the events listing page (`/events/all`) is fully server-rendered
static HTML with 134 distinct upcoming events.

This venue's per-event "Add to Calendar" ICS output goes further than the
sibling site: it directly states its own `LOCATION` and `GEO` fields on
every event, giving a directly-provable `venue_location` per record (not
just per-source). `end` is again `NOT_PRESENT` — the ICS `DTEND` is a fixed
`DTSTART + 2h` default, the same synthetic pattern already documented for
the sibling investigation.

## Decision

`READY_FOR_OFFLINE_PROOF` — every other `READY_FOR_ACTIVATION` gate is
satisfied against retained evidence, but no `DETERMINISTIC_DERIVATION`
offline-proof evidence item exists yet (separate follow-up collector-wiring
work, out of scope for this investigation task).
