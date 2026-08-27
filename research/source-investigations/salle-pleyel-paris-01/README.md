# salle-pleyel-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Salle
Pleyel (concert hall, 252 Rue du Faubourg Saint-Honoré, 75008 Paris).
Official site: https://www.sallepleyel.com/concerts-spectacles/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient, in two plain curl GETs. The
list page (a WordPress site) exposes event titles and permalinks
(`/evenement/{slug}/`) but no date/price data of its own. A second plain
curl GET of one real linked detail page (`/evenement/fkj/`) then exposed
the actual date/time/price data — but NOT via schema.org JSON-LD (this
page's own `<script type="application/ld+json">` is
WebPage/BreadcrumbList/WebSite/Organization only, carrying no Event type
at all). The real fields instead live in the detail page's own schema.org
**microdata** (`itemprop="startDate"`/`"endDate"`/`AggregateOffer`
attributes) and a plain HTML price-tier table — genuinely different markup
from anything this project's existing `ingestion/json-ld/` family reads.

One honest finding: the page's own `itemprop="endDate"` element, per its
own "First and last date of the event" comment, actually represents the
single-day event's own date again (not a distinct end-time) — recorded
`NOT_PRESENT` rather than misread, mirroring this project's `tempodrom-
berlin-01` precedent for the same kind of finding. Similarly, the page's
own `datetime="...UTC..."` attribute is NOT treated as a confirmed UTC
instant — a 20:00 Paris concert is far more consistent with local time,
so this is recorded `FLOATING_LOCAL`.

## Collector

List → detail discovery can reuse the EXISTING, unmodified
`ingestion/html-link-discovery/discovery.mjs` (zero code change — only
configuration). The actual field-extraction parser
(`ingestion/salle-pleyel/discovery.mjs` + `observation-adapter.mjs`) is
genuinely new. Proven offline against the retained fixture by
`tests/salle-pleyel.test.mjs` (5/5 passing).

## Decision

`READY_FOR_ACTIVATION` — identity, acquisition path, title/start_date
(both `DIRECT_SOURCE`), and source_record_id are all proven; a passing
`DETERMINISTIC_DERIVATION` offline test is retained; no `CRITICAL` blocker
exists (two `MINOR` ones are documented: only one detail page and not the
full paginated list were fetched in this bounded investigation).
