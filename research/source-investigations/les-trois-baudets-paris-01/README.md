# les-trois-baudets-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01. Investigates Les Trois
Baudets (concert venue/cabaret, 64 boulevard de Clichy, 75018 Paris).
Official site: https://lestroisbaudets.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. The site is Drupal (confirmed:
`/sites/all/themes/t_ltb/` theme paths). The homepage's own JSON-LD is only
a generic `Article` schema (no event data), and neither the homepage nor
the full `/l-agenda` listing page (34 event links found) embeds any
event-level JSON-LD — but each individual `/l-agenda/{slug}` event detail
page embeds a complete, clean schema.org `Event` JSON-LD block: name,
startDate, endDate, location, offers (with real price), performer. Two
detail pages were sampled and matched the same shape.

This is the exact same "list page supplies URLs, detail page supplies
JSON-LD" pattern already proven and wired for four Berlin venues
(Konzerthaus, Lido, b-flat, SO36) via the existing
`ingestion/html-link-discovery/` + `ingestion/json-ld/` modules. Every
gated field (title, start_date, time, end, venue_location,
source_record_id, event_url, price) reached `PROVEN` with
`basis: DIRECT_SOURCE` as source facts — an unusually complete field set
for this cohort.

One honest, real finding from writing the offline proof test: this
source's own `startDate`/`endDate` omit a seconds component
(`"2026-09-03T20:00"`, not `"...T20:00:00"`). The EXISTING, unmodified
`ingestion/json-ld/observation-adapter.mjs`'s `ISO_NO_OFFSET_RE` currently
requires seconds, so with **zero code changes** this source's dates
normalise to certainty `TEXT_ONLY` (raw text preserved, but no date/time
extracted) rather than the richer `DATE_ONLY`/`FLOATING_LOCAL` the source
data actually supports — see `tests/les-trois-baudets.test.mjs`, which
asserts this real, current behaviour on purpose. This is
`PARIS_EXISTING_FAMILY_WITH_SMALL_FIX`, not `PARIS_ZERO_CODE`.

## Decision

`READY_FOR_OFFLINE_PROOF` (not yet `READY_FOR_ACTIVATION`) —
`recommended_family: JSON_LD`. Per this task's "do not edit shared generic
modules yourself" instruction, the shared-module fix was **not** applied
here; it is described precisely in `collector_assessment.blockers`
(`MAJOR`, not `CRITICAL`): widen both `ISO_NO_OFFSET_RE` and
`ISO_WITH_OFFSET_RE` in `ingestion/json-ld/observation-adapter.mjs` to make
the seconds group optional (`(?::\d{2})?`, defaulting to `:00`) — the same
kind of small, backward-compatible widening already made once before for
Tempodrom Berlin's unquoted `<script>` tag. Once that lands, this
investigation's own PROVEN fields already support
`READY_FOR_ACTIVATION` with zero further new code — only reuse of
`ingestion/html-link-discovery/discovery.mjs` (`extractLinksMatching`) to
enumerate `/l-agenda/{slug}` URLs, then the existing `ingestion/json-ld/`
parser/adapter per detail page, exactly `ingestion/berlin/run.mjs`'s
`collectListDetailJsonLd()` pattern. Offline-proved against retained
fixtures in `tests/les-trois-baudets.test.mjs`.
