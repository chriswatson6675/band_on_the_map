# point-ephemere-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates Point
Éphémère (200 Quai de Valmy, 75010 Paris). Official site:
https://www.pointephemere.org/

## What was found

Level 1 (`PASSIVE_STATIC`) was genuinely insufficient: the homepage and its
`/agenda` page render programme content through a Next.js React Server
Components bootstrap stream, not plain static HTML a Level 1 reading can
parse as structured event data. Escalating to Level 2 (`STRUCTURAL`) paid
off immediately: that same bootstrap payload contains a literal reference
to `pointf.cdn.prismic.io/api/v2/documents/search` — this site is built on
[Prismic](https://prismic.io/), a headless CMS, with its own dedicated
repository named `pointf` (independently corroborated by every
`images.prismic.io/pointf/...` asset on the site).

Prismic's own Content API v2 is fully public and unauthenticated — no
`access_token`, no login, no CAPTCHA. Querying its own documented
`documents/search` endpoint for `document.type = "event"` returns clean,
structured, fully-paginated JSON: `name`, `start_date`
(`YYYY-MM-DD`), `end_date`, `display_date`, `time` (free text, e.g. `20h`,
`19h30`, `22H - 03H`), `prix` (free text, e.g. `10€ / 12€`, `ENTRÉE
LIBRE`), `ticket_link` (third-party, e.g. DICE), and `category`. As of
retrieval, 66 genuinely future events exist across the whole repository
(1,042 total including historical events).

This is a genuinely new, reusable collector family — the first source in
this project built on Prismic — so a generic `ingestion/prismic-api/client.mjs`
was built (URL building + response-envelope parsing only, no
Point-Éphémère-specific field knowledge), plus this venue's own
`ingestion/point-ephemere/{discovery,observation-adapter}.mjs`.

Two honest gaps, neither blocking activation (only `title`/`start_date`
are gated fields): no confirmed first-party `pointephemere.org` permalink
exists per event (the site's own agenda is a single listing/modal page),
so `event_url` falls back to each document's own third-party
`ticket_link.url` (DICE) when present, and stays `PARTIAL` rather than
`PROVEN`; and `end` is honestly `NOT_PRESENT` (the schema's `end_date`
field is always null on this source).

`source_record_id` uses Prismic's own permanent, immutable per-document
`id` — documented by the Prismic platform itself to remain stable for the
life of the document (distinct from `uid`, an editable slug) — satisfying
the policy's stable-identifier rule via "documented by the source itself."

## Decision

`READY_FOR_ACTIVATION`. Identity `PROVEN`; `acquisition_class`
`PUBLIC_JSON_API` reached via a genuine Level 1 (`INSUFFICIENT`) → Level 2
(`SUFFICIENT`) escalation; a `CONFIRMED` public data path retained; `title`
and `start_date` both `PROVEN` with `basis: DIRECT_SOURCE`;
`source_record_id` `PROVEN`; `collector_assessment.recommended_family`
`NEW_FAMILY_REQUIRED` (Prismic is genuinely new to this project);
`DETERMINISTIC_DERIVATION` offline-proof evidence retained
(`tests/point-ephemere.test.mjs`, 5/5 passing against
`fixtures/point-ephemere-paris/prismic-events-sample.json`); no unresolved
`CRITICAL` blocker.

Coordinates: `GEOCODED` via `ingestion/geocoding/nominatim.mjs`
(`searchNominatimLive`, one-off call) — a confident single-cluster match
("Le Point Ephémère" at house_number 200 / Quai de Valmy / postcode
75010).
