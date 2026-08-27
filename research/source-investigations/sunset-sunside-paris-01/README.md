# sunset-sunside-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates
Sunset / Sunside (60 rue des Lombards, 75001 Paris) — **one single
venue/business with two named performance rooms**, "Sunset" and
"Sunside", sharing one address; modeled as one venue, never two. Official
site: https://www.sunset-sunside.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was already sufficient on its own: the official
"Agenda" page is server-rendered HTML with real event cards, each
carrying a machine-readable `data-horaire="YYYYMMDDHHmm"` timestamp, a
room name ("Sunset" or "Sunside"), and a permalink. A confirmatory check
(a `single-tribe_events` CSS class on one event's own detail page)
revealed this WordPress install runs "The Events Calendar" plugin, whose
own bundled REST API (`/wp-json/tribe/events/v1/events`) is genuinely
public and unauthenticated — and returns an even richer, fully structured
JSON record per event: a confirmed true-UTC `start`/`end` pair alongside
an explicit IANA timezone, a real `cost` range, and a nested `venue`
object stating its own name/address/city/zip directly.

This is the **same existing, already-generic**
`ingestion/events-calendar-api/` family this project already proved for
`ccb-lisbon-01` in Lisbon — **PARIS_ZERO_CODE**: no new ingestion
directory, no new collector code, only a per-source config object.

Both room names ("Sunset" and "Sunside") were confirmed, across sampled
records, to share the *identical* address — directly confirming the
task's own one-venue-two-rooms model.

## Decision

`READY_FOR_ACTIVATION`. Identity `PROVEN`; `acquisition_class`
`PUBLIC_JSON_API`; `title`/`start_date` both `PROVEN` with
`basis: DIRECT_SOURCE` (start_date additionally backed by a confirmed
`UTC_INSTANT`, this project's strongest date/time certainty tier);
`source_record_id` `PROVEN` via the platform's own permanent WordPress
post ID; `recommended_family` `JSON_API` (the existing family, zero new
code); `DETERMINISTIC_DERIVATION` offline-proof evidence retained
(`tests/sunset-sunside.test.mjs`, 4/4 passing, exercising the existing
family against this source's own retained fixture); no unresolved
`CRITICAL` blocker.

Coordinates: `GEOCODED` via `ingestion/geocoding/nominatim.mjs` — a
single, confident match ("Sunset sunside" at the exact house_number/road/
postcode).
