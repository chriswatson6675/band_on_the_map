# hkw-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

## Summary

HKW's official domain (`https://www.hkw.de/en`) runs Magnolia CMS with a
Nuxt.js frontend. The aggregate `/en/programme` listing page turned out to
be client-rendered (an empty loading placeholder server-side) — but the
site's own public `sitemap.xml` lists 4,153 real `/en/programme/...` URLs
with `<lastmod>` dates, a genuine static discovery path, and every
individual event page server-renders a full schema.org Event-family
(`MusicEvent`, `EducationEvent`, etc.) `application/ld+json` block with
`startDate`/`endDate` as real UTC ISO instants and a fully qualified
location.

Two independent event pages were sampled, confirming the JSON-LD schema is
used consistently: one with `startDate == endDate` (no real duration
tracked) and one with a genuine multi-hour range.

## Decision

`READY_FOR_OFFLINE_PROOF`. `title`, `start_date`, `time`, `venue_location`,
`source_record_id`, and `event_url` are all `PROVEN` with `basis:
DIRECT_SOURCE`. No offline parser reproduction was built in this
investigation task (out of scope), so activation gate 9 is not yet met.
Recommended collector family: `JSON_LD` (this project's own existing,
already-proven family — matches the Moog Barcelona precedent).

## Note on evidence bounding

`evidence/sitemap-excerpt.xml` is a deliberately bounded excerpt (60 of the
4,153 real `/en/programme/` URLs) of the live 4.6MB `sitemap.xml`, per this
policy's "bounded evidence, not an uncontrolled full-site dump" guidance —
see the file's own header comment for the full live counts.

## Evidence

See `evidence/` — the homepage, the (client-rendered) programme listing
page, the sitemap excerpt, and 2 independent event detail pages, all
retained via `curl`.
