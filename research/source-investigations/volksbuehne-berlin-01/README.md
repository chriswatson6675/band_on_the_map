# volksbuehne-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

## Summary

Volksbühne am Rosa-Luxemburg-Platz's search-discovered domain
(`www.volksbuehne.berlin`) redirects to its canonical
`https://www.volksbuehne-berlin.de/`. Individual production/performance
pages (`/en/productions/{slug}/{YYYYMMDD-HHMM}/`, one URL per specific
performance — the date/time is even encoded in the URL path itself) each
server-render a full schema.org Event-family (`DanceEvent`/`MusicEvent`)
`application/ld+json` block with a UTC-offset-qualified `startDate`/
`endDate`, a self-referencing canonical `url`, and a named location.

Three real events were sampled across three different internal rooms — the
Main Stage, **Roter Salon** (this investigation's specific target
sub-venue), and Vorbühne — confirming the schema is used consistently. The
site's own public `sitemap.xml` (320 URLs total) provides comprehensive
static discovery: 92 URLs match the dated-performance pattern.

## Decision

`READY_FOR_OFFLINE_PROOF`. `title`, `start_date`, `time`, `end`,
`venue_location`, `source_record_id`, and `event_url` are all `PROVEN` with
`basis: DIRECT_SOURCE`. No offline parser reproduction was built in this
investigation task (out of scope), so activation gate 9 is not yet met.
Recommended collector family: `JSON_LD`.

## Evidence

See `evidence/` — the homepage, the concerts listing page, the sitemap, and
3 independent event detail pages (Main Stage, Roter Salon, Vorbühne), all
retained byte-faithfully via `curl`.
