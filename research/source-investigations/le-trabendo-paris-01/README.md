# le-trabendo-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Le
Trabendo (concert/club venue, Parc de la Villette, 19th arrondissement,
Paris). Official site: https://www.letrabendo.net/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. A plain curl GET of the
official `/programmation/` page exposes real, current static event cards
(`class="link-act event"`), each with a full date directly on the card
(`"05 ― septembre 2026"`), a title, and its own canonical URL — no
JSON-LD Event data anywhere (only generic Yoast SEO schema). The page
renders every one of **67 distinct real events twice** (the main
chronological grid plus a server-rendered "Votre sélection" filter-section
duplicate carrying extra JS-filter classes) — 134 total card anchors,
de-duplicated by event URL in the built collector. One linked detail page
(Spectrum Waves) confirmed the same title/date and added a door-opening
time.

As due diligence, `/wp-json/` and `/sitemap.xml` were also fetched (still
plain, unauthenticated GETs) to check for a cleaner structured feed —
`sitemap.xml` confirms `programmation` is a distinct WordPress custom post
type, but no `/wp/v2/programmation` REST route is exposed, so the static
HTML cards remain the only public path. This did not change the
`SUFFICIENT` Level 1 verdict.

Honest caveats retained: only a door-opening time is stated (no
performance start time), so `time` stays `PARTIAL`; no end time/date is
ever given (`NOT_PRESENT`); no price is exposed on the venue's own pages
at all (ticketing is entirely delegated to a third-party, shotgun.live,
which itself returned HTTP 429 on a single bounded check and was not
retried, per policy). `venue_location` is `PROVEN`/`DETERMINISTIC_CONTEXT`
(single-venue domain + sitewide footer address), not `DIRECT_SOURCE`,
since no page repeats the full venue name+address beside the event data
itself.

## Collector

`recommended_family: STATIC_EVENT_LIST` — an existing named family in this
project's vocabulary, but the actual field-extraction code
(`ingestion/le-trabendo/`) is genuinely bespoke to this venue's own
markup, matching the `badehaus-berlin-01`/`zenner-berlin-01` precedent.
Offline-proved against the retained fixture by `tests/le-trabendo.test.mjs`
— no live network call.

## Decision

`READY_FOR_ACTIVATION` — every activation gate is satisfied against
retained evidence, including a `DETERMINISTIC_DERIVATION` offline-proof
test. Turning this into an enabled source is a separate, explicitly
authorised action outside this investigation's scope.
