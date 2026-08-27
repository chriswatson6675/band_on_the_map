# institut-du-monde-arabe-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates the
Institut du Monde Arabe (1 rue des Fossés-Saint-Bernard, Place Mohammed V,
75005 Paris). Official site: https://www.imarabe.org/

## What was found

The task's central question was whether "Les Escales musicales" is a
genuine recurring music series, as opposed to an occasional cultural event.
**Confirmed**: the institute's own "Les Escales musicales du musée" listing
page carries **4 upcoming, individually dated instances** (16 September, 7
October, 18 November, 16 December 2026), each with its own dedicated event
page — a real, recurring monthly series, described on its own detail page
as "Une fois par mois" (once a month). The broader "Musique" agenda
category also lists other genuine concerts (Souad Massi, Camélia Jordana,
etc.) with an apparently similar template, though those were not
individually field-assessed in this pass (see `collector_assessment
.blockers`).

Level 1 (`PASSIVE_STATIC`) was fully sufficient: every page investigated —
homepage, the "Musique" category listing, the Escales listing, and one
event detail page — is plain, server-rendered static HTML (Drupal). The
listing card states a full day/month/year date directly. The linked detail
page's own "Dates & horaires" sidebar accordion states BOTH the exact time
of day AND the event's own duration in plain text for that specific event
(e.g. "Mercredi 16 septembre à 19h" / "Durée : 1h") — `end` is mechanically
derived (start + duration), never guessed. A separate "Lieu" accordion
states the specific in-building location. No JSON-LD Event, REST API, or
ICS feed exists — only generic Article/Organization/WebSite/BreadcrumbList
JSON-LD (SEO boilerplate).

## Decision

`READY_FOR_ACTIVATION`, scoped specifically to the "Les Escales musicales
du musée" card family (the series the task asked about). Identity,
acquisition path, and every gated field (`title`, `start_date`,
`source_record_id`) are `PROVEN`, plus `time`/`end`/`venue_location`/
`event_url` beyond what activation strictly requires. A
`DETERMINISTIC_DERIVATION` offline-proof test
(`tests/institut-du-monde-arabe.test.mjs`) re-parses the retained fixtures
and reproduces every claimed field, including the start+duration -> end
derivation. Collector family: `STATIC_EVENT_LIST`, genuinely bespoke
(`ingestion/institut-du-monde-arabe/`) — this exact Drupal card+accordion
markup shape is unique to this venue in this pass.
