# truskel-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Truskel, a
live-music bar at 12 rue Feydeau, 75002 Paris. Official site:
https://www.truskel.fr/ (confirmed live and current — **not** truskel.com,
which was not probed and is out of scope per the task brief).

## What was found

The task-given events URL, `https://www.truskel.fr/copie-de-concerts-4`
(labelled "Live"), is confirmed **stale**: a plain GET returns HTTP 404 (a
Wix "classic-error-pages-statics" page) — exactly the concern the task
brief raised. Level 1 on that specific URL is therefore `INSUFFICIENT`.

The venue's homepage is live and current, built on Wix (confirmed via
`x-wix-request-id` headers, `static.parastorage.com`/`static.wixstatic.com`
asset hosts, and the Wix Events widget script), and links directly to a
handful of individual `/event-details/<slug>` pages. Escalating to Level 2
(`STRUCTURAL`) and fetching the site's own `sitemap.xml` ->
`event-pages-sitemap.xml` (a Wix-generated, publicly-referenced structural
endpoint) reveals the complete, current enumeration of every live
event-details page, each with a `lastmod` date.

Fetching two of those event-details pages directly (sampled independently)
confirms each embeds one full schema.org `Event` JSON-LD block — `name`,
a full ISO 8601 `startDate`/`endDate` **with an explicit `+02:00` UTC
offset** (a genuine `UTC_INSTANT`, not a floating-local guess), and a
`location` object naming "TRUSKEL" at "12 Rue Feydeau, 75002 Paris,
France" — an exact match to the task-given address. No numeric event ID is
exposed; the site's own `/event-details/{slug}` permalink slug is used as
`source_record_id`, the same judgement already established for
`moog-barcelona-01`/LAV and `tempodrom-berlin-01`. No price/offer data was
found on either sampled record.

The Wix Events widget script visible on the homepage was noted but never
exercised (no browser/headless probe was needed or used) — Level 2 static
inspection of the sitemap and per-event pages fully answered the
investigation question.

## Decision

`READY_FOR_OFFLINE_PROOF` — every field this project tracks (`title`,
`start_date`, `time`, `end`, `venue_location`, `source_record_id`,
`event_url`) is `PROVEN` with `basis: DIRECT_SOURCE`, using the project's
existing, fully generic `ingestion/json-ld/` collector family unchanged.
The only genuinely new code is a small, bespoke discovery step
(`ingestion/truskel-paris/discovery.mjs`) that enumerates event pages via
the sitemap rather than a single bulk listing page — see the parent
report's `collector` classification for the exact split between reused and
new code. `READY_FOR_ACTIVATION` was deliberately not claimed here; turning
this into an enabled source is a separate, later, explicitly-authorised
step outside this investigation's scope.
