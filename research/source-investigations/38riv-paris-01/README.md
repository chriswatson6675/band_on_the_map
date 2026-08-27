# 38riv-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Investigates 38Riv (38Riv Jazz Club & Bar, 38 rue de Rivoli, 75004
Paris). Official site: https://38riv.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. The `/en/concerts` listing
page is real static HTML (24 event cards, each with
`data-day`/`data-month`/`data-year` attributes and a real
`/en/concerts/{slug}` detail link — Drupal, a custom booking module, not
the `/en/node/{id}` pattern a prior pass reported). Each detail page
embeds a full schema.org JSON-LD `EventSeries` block: a genuine
UTC-offset `startDate`/`endDate` (`+02:00`, not floating-local — richer
than most sources this project has investigated), full venue name +
address, and structured per-tier `Offer` pricing nested inside its own
`subEvent[]` array.

## Reuse, not new code

Both acquisition steps (listing → detail-link discovery; detail-page
JSON-LD extraction) are fully covered by this project's **existing,
completely unmodified** `ingestion/html-link-discovery/discovery.mjs`
and `ingestion/json-ld/parse.mjs`. The one difference from those modules'
usual callers is that this source's own top-level JSON-LD node is typed
`EventSeries`, not the default `Event`/`MusicEvent` — resolved entirely by
widening the `types` option `extractEventNodes()` already exposes at the
call site, not by editing either shared module.

One honest, documented gap: real structured pricing exists, but only
nested inside `subEvent[].offers` — the top-level `EventSeries` node
itself has no top-level `offers`, so `price` is `PARTIAL` via this exact
zero-code path (not required for activation).

## Offline proof

`evidence/offline-proof.mjs` imports the two existing shared modules
unmodified, re-parses only the retained fixtures, and reproduces every
claimed field exactly (24 discovered links; title/start/end/venue/
event_url/source_record_id all matching `investigation.json`).

## Decision

`READY_FOR_ACTIVATION` — title/start_date/time/end/venue_location/
event_url/source_record_id all `PROVEN` with `basis: DIRECT_SOURCE`, an
offline `DETERMINISTIC_DERIVATION` proof retained, and no `CRITICAL`
blocker (the one `MINOR` blocker concerns only the optional `price`
field).
