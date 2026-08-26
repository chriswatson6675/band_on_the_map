# sisyphos-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

## Summary

Sisyphos's official domain (`https://www.sisyphos-berlin.net/`) is a Shopify
merch/ticket shop ("Shopyphos"), not a venue events calendar. Its own
Impressum (Sisyphos Event GmbH, Hauptstr. 15, 10317 Berlin) proves official
identity with high confidence.

Level 1 (homepage + linked TICKETS page) found only generic
Organization/WebSite `application/ld+json` (Shopify theme boilerplate, no
`Event`/`MusicEvent` schema), no ICS link, no WordPress/Tribe signature, no
Fourvenues script, no Sanity config.

Level 2 (Shopify's own public REST endpoints — `/products.json`,
`/collections/tickets.json`, `/collections/tickets/products.json`) confirmed
a working public JSON API, but it exposes only 2 sparse, occasional
"generationS" day-party door-ticket products at time of investigation — not
the club's actual regular programme (Sisyphos is known to run continuously
Friday–Monday with door/cash entry and no published lineup calendar). Dates
exist only as unstructured substrings inside free-text product titles; there
is no dedicated date, time, end, or venue field on the Shopify product
schema at all.

No headless browser tool was available to attempt a Level 3 probe, and
nothing in the retained Level 1/2 evidence suggests a richer client-side
data path exists to justify one.

## Decision

`DEFER`. The official source does not expose a genuine, comprehensive,
machine-readable events feed — building a collector against 1-2 sparse
special-event ticket products would not represent Sisyphos's actual
programme and risks silently under-reporting nearly all of its real
activity.

## Evidence

See `evidence/` — homepage, the TICKETS page, and 3 Shopify public JSON
endpoint responses, all retained byte-faithfully via `curl`.
