# Le Bataclan (Paris) — source investigation

See `investigation.json` for the authoritative record. This file is
explanatory only.

## Summary

Le Bataclan's official `/programmation/` page is a Nuxt 3 (SSR) build. The
static HTML shell alone carries no event data (Level 1 PASSIVE_STATIC:
`INSUFFICIENT`) — but the page's own `<script data-src="/programmation/
_payload.json?...">` tag publicly references this SPA's own build-time
data endpoint. A plain GET of that same endpoint (confirmed to work
identically with or without its query-string build hash) returns the
venue's full, real 114-event schedule (Level 2 STRUCTURAL: `SUFFICIENT`).

## What was found

The payload is encoded with Nuxt's own "devalue" flat-array wire format —
the same general encoding SvelteKit's `__data.json` convention uses. This
investigation reuses the **existing, unmodified**
`ingestion/sveltekit-data/decode.mjs`'s `resolveDevalueRef()` for the
low-level array-index resolution; only the Nuxt-specific envelope
navigation (`root.data[1]`, unwrapping one `["ShallowReactive", ref]` tag)
and the event-record field mapping are new, bespoke code
(`ingestion/le-bataclan/`).

Each decoded event record directly states:

- `title` (`attributes.title`)
- a genuine **UTC-instant** start (`attributes.date`, e.g.
  `2026-09-15T17:00:00.000Z` — verified against the record's own
  free-text description as 19:00 Europe/Paris local time)
- venue (`attributes.meetings[].venue`, always `"Bataclan"`)
- price (`attributes.meetings[0].price_min`/`price_max`, corroborated by
  the record's own description text repeating the same amounts next to a
  `€` symbol)
- a first-party ticketing URL (`attributes.ticketingUrl`, hosted at
  `billetterie.bataclan.fr`, a subdomain of the venue's own domain)
- a stable CMS record ID (`id`)

`dateEnd` was investigated and found to duplicate `date` for the large
majority of records, with no evidence proving what it means for the small
remainder — recorded honestly `NOT_PRESENT`, matching the same finding
already made for Tempodrom Berlin's analogous field.

## Decision

`READY_FOR_ACTIVATION`. `collector_assessment.recommended_family` is
`NEW_FAMILY_REQUIRED` (no existing `COLLECTOR_FAMILIES` member matches this
list-shell + discoverable devalue-payload shape), implemented as
`ingestion/le-bataclan/` (`discovery.mjs` + `observation-adapter.mjs`),
with offline proof in `tests/le-bataclan.test.mjs` against the full,
byte-faithful retained fixture (`fixtures/le-bataclan-paris/payload-sample.json`).
