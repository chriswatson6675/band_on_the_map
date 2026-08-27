# philharmonie-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates the
Philharmonie de Paris' Grande Salle Pierre Boulez (221 Avenue
Jean-Jaurès, 75019 Paris). Official site: https://philharmoniedeparis.fr/,
calendar page:
https://philharmoniedeparis.fr/en/calendar-selection/next-events-grande-salle-pierre-boulez

## What was found

Level 1 (`PASSIVE_STATIC`) was **insufficient**: the calendar page's raw
HTML server-renders no event data at all — only hidden form inputs and a
spinner around an empty container. This matched the prior pass's own
finding.

Level 2 (`STRUCTURAL`) was sufficient, reached honestly rather than by
guessing:

1. The site's Drupal JSON:API module IS enabled, but enumerating every
   exposed resource type found **no** event/concert/seance/programme
   content type among them — the one node type this page is built from
   (`node--filtered_agenda`, id 982) has an **empty** `field_agd_events`
   relationship. JSON:API is a dead end for the actual schedule.
2. Inspecting the page's own publicly-referenced Drupal-aggregated JS
   bundles (linked directly from the page itself) found the real
   client-side call target: `/{lang}/agenda-ajax`, with a `place_i` query
   parameter built from checked filter checkboxes.
3. Cross-referencing that same node's own JSON:API `field_agd_places`
   value (`["45"]`) as a reasoned candidate, a direct curl GET of
   `/en/agenda-ajax?place_i=45` returned real event data — confirmed
   correctly scoped (60/60 sampled venue-name mentions read exactly
   "Grande salle Pierre Boulez - Philharmonie").
4. Each event's own detail-page link carries a **complete, well-formed
   schema.org `MusicEvent` JSON-LD block** — title, full ISO start/end
   instants with explicit UTC offsets, venue name+address, and priced
   ticket offers.

No browser/headless observation was used at any point — every step was a
plain, unauthenticated `curl` request, matching the task brief's
constraint.

**One genuine parsing obstacle, honestly documented rather than worked
around silently:** this source's own real JSON-LD contains literal,
unescaped control characters (raw newlines) inside string values, which
the EXISTING `ingestion/json-ld/parse.mjs`'s `JSON.parse()` call rejects
outright. The exact minimal shared-module fix is described in
`collector_assessment.blockers` (never made here, per this project's
"don't edit shared generic modules during an investigation" rule); the new
per-venue module carries its own small, local, non-shared sanitisation
step in the meantime.

## Decision

`READY_FOR_ACTIVATION`. Identity, acquisition path, and every gated field
(`title`, `start_date`, `source_record_id`) are `PROVEN`, plus `end`,
`venue_location`, `event_url`, and `price` beyond what activation strictly
requires. A `DETERMINISTIC_DERIVATION` offline-proof test
(`tests/philharmonie-paris.test.mjs`) re-parses the retained fixtures and
reproduces every claimed field. Collector family: `JSON_LD`, reusing TWO
existing generic families unchanged (`ingestion/html-link-discovery/` +
`ingestion/json-ld/`) behind one small, local, non-shared sanitisation
step — classified `PARIS_EXISTING_FAMILY_WITH_SMALL_FIX`.
