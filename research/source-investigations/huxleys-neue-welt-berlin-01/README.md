# huxleys-neue-welt-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 6-venue collector-reuse trial. Investigates Huxleys Neue
Welt (mid-size concert hall, Hasenheide, Neukölln, Berlin). Official site:
https://huxleysneuewelt.de/

## What was found

A WordPress site running the "Events Manager" plugin. Level 1
(`PASSIVE_STATIC`) was sufficient: the events listing page statically
renders 111 upcoming events, and each event's own detail page directly
states a full date and start/doors time, plus (via its own
server-generated `og:description` meta tag) an explicit end time.

The plugin's own REST API namespace (`events-manager/v1`) was confirmed
present via the public `/wp-json/` root, but its `/events` endpoint itself
returned HTTP 401 (`rest_forbidden`) on a plain unauthenticated GET — a
legitimate access boundary, correctly not bypassed. The site's own JSON-LD
is generic Yoast SEO `WebPage`/`Organization` schema only, with no
per-event `MusicEvent` type, so it was not useful for event data.

## Decision

`READY_FOR_OFFLINE_PROOF` — every other `READY_FOR_ACTIVATION` gate is
satisfied against retained evidence, but no `DETERMINISTIC_DERIVATION`
offline-proof evidence item exists yet (separate follow-up collector-wiring
work, out of scope for this investigation task).
