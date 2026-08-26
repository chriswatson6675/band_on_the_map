# razzmatazz-barcelona-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BAND-ON-THE-MAP-BARCELONA-30-VENUE-POPULATION-02`. Resolves the
prior investigation's (`BARCELONA-30-VENUE-POPULATION-01`,
`docs/BARCELONA_VENUE_POPULATION.md`) deferred Razzmatazz finding — the
site's public Sanity.io CMS API is queried directly via GROQ's own `->`
dereference operator (server-side reference resolution, no client-side
GROQ-dereferencing work required), using a new, deliberately reusable
generic module (`ingestion/sanity/client.mjs`) rather than a one-off
per-venue hack.
