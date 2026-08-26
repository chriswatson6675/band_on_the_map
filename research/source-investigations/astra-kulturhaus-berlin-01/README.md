# astra-kulturhaus-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 6-venue collector-reuse trial. Investigates Astra
Kulturhaus (mid-size venue on the RAW site, Revaler Str. 99, Friedrichshain,
Berlin). Official site: https://astra-berlin.de/

## What was found

A Rails/Turbolinks site. Level 1 (`PASSIVE_STATIC`) was sufficient: the
homepage itself server-renders upcoming events as static cards, and each
event's detail page embeds a real schema.org `MusicEvent` JSON-LD block
plus a fully structured two-tier price breakdown (Vorverkauf/Abendkasse).

**Important finding**: cross-checking two sampled events showed the JSON-LD
`startDate` field always carries a fixed, incorrect `+00:00` UTC-offset
suffix on the local wall-clock time, rather than the venue's true
Europe/Berlin offset — a real, reproducible bug in the source's own output.
A naive JSON-LD collector would silently record every event 1-2 hours late.
`time` was instead proven via a `DETERMINISTIC_CONTEXT` derivation combining
the homepage card's own correctly-offset `data-realdate` attribute (which
represents Doors, not Start) with the same card's separate Start
time-value — deliberately bypassing the buggy JSON-LD field. This is
recorded as a MAJOR blocker any future collector build must account for.

## Decision

`READY_FOR_OFFLINE_PROOF` — every other `READY_FOR_ACTIVATION` gate is
satisfied, but (1) the MAJOR JSON-LD-offset blocker is unresolved, and
(2) no `DETERMINISTIC_DERIVATION` offline-proof evidence item exists yet
for the `DETERMINISTIC_CONTEXT` `time` field. Both are separate follow-up
work, out of scope for this investigation task.
