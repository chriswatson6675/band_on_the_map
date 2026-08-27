# alhambra-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates
Alhambra (Théâtre Music-Hall, 21 rue Yves Toudic, 75010 Paris). Official
site: https://www.alhambra-paris.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. The homepage itself functions
as the full programmation listing (the nav's "Programmation" link is a
same-page anchor, not a separate URL) and directly embeds 45 individual
event links in the site's own proprietary `TITLE-lo<numeric-id>.html`
scheme — confirmed as a custom platform integrated with the French
"Rodrigue" box-office/reservation system (`?goreservation=rodrigue` query
parameters), not a recognised off-the-shelf CMS.

**Important structural hazard found and retained**: a naive extraction of
the homepage alone would misattribute each event's date to the *wrong*
title, because this theme emits a card's date/status footer *after* its
own title+image but *before* the next card's title begins — a
first-appearance-order parse ends up pairing each date with the
*following* event, not its own. This was caught empirically: a naive
parse paired `"MERCREDI 14 OCTOBRE 2026"` with Kaarija, but Kaarija's own
detail page states `"VENDREDI 16 OCTOBRE 2026"` twice (a hero badge and
body text). A mechanical Gregorian weekday computation (not model
judgement) confirms `2026-10-16` is genuinely a Friday and `2026-10-14` is
genuinely a Wednesday — consistent with the hazard, not a coincidence.
Because of this, the investigation and the built collector both treat the
homepage as reliable **only** for title+href discovery, and each event's
own detail page as the sole authority for `start_date`.

Otherwise this is the strongest of the four Paris venues in this batch:
the venue's own detail page states its own venue name, an explicit start
time (with a stated door-opening rule), and a real flat ticket price
(`30,65€ Tarif Unique`) directly — no third-party ticketing delegation
was found.

## Collector

`recommended_family: STATIC_EVENT_LIST`. The link-discovery step reuses
the **existing**, unmodified `ingestion/html-link-discovery/discovery.mjs`
verbatim (zero new code); only the per-event detail-page field parser
(`ingestion/alhambra/`) is genuinely bespoke. Offline-proved by
`tests/alhambra.test.mjs`, which also regression-tests that the
homepage-ordering hazard is correctly avoided.

## Decision

`READY_FOR_ACTIVATION` — every activation gate is satisfied against
retained evidence, including a `DETERMINISTIC_DERIVATION` offline-proof
test. Turning this into an enabled source is a separate, explicitly
authorised action outside this investigation's scope.
