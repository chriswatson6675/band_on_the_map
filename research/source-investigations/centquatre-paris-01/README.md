# centquatre-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates
CENTQUATRE-PARIS ("Le 104"), a multidisciplinary cultural venue at 5 rue
Curial (public entrance) / 104 rue d'Aubervilliers, 75019 Paris. Official
site: https://www.104.fr/

## What was found

The task-given events page (`/programme?genre=concerts`) is Nuxt 3
(server-rendered). Its own JSON-LD block is only an `ItemList` of 62
programme items (title + URL, no dates) — not enough alone. The page also
embeds a `<script id="__NUXT_DATA__">` SSR payload, a devalue-encoded flat
array (the same general encoding family SvelteKit uses, though Nuxt's own
reactive-wrapper tags needed a small variant of the existing
`ingestion/sveltekit-data/decode.mjs` resolver to unwrap). Decoding it
revealed the frontend's own state already embeds a genuine **Hydra
(API Platform / Symfony) JSON-LD collection** of `Event` resources — and,
crucially, that the `?genre=concerts` query string has **no effect
server-side**: the embedded collection is unfiltered (62 items spanning
every discipline) regardless of that query parameter.

Escalating to Level 2 and calling the underlying API directly
(`https://www.104.fr/api/events`) confirmed it is **public, unauthenticated,
and fully self-documenting** — its own `hydra:search` field lists every
supported filter parameter as an IRI template. Resolving the site's own
"Concert" tag (`GET /api/tags?search=concert` → `/api/tags/14`) and then
querying `/api/events?taggedEntities.tag[]=/api/tags/14&sortingFirstDateTime
[after]=<today>&order[sortingFirstDateTime]=asc` returns exactly the
future, concert-tagged events — 22 at investigation time — each with a
complete, richly structured record: a stable `@id` resource IRI (e.g.
`/api/events/90`), full UTC-offset `arrayDates` (start **and** end),
`placesNames`, and both `minPrice`/`maxPrice` and a human-readable
`priceRange`. This is a genuinely complete field set — better than most
sources already investigated in this project's Berlin/Barcelona trials.

## Decision

`READY_FOR_OFFLINE_PROOF`. No existing collector family/module in this
repository implements a Hydra/API-Platform-style JSON API
(`ingestion/events-calendar-api/` is specific to the WordPress "The Events
Calendar" REST shape, a different vocabulary and pagination model), so a
new, small adapter (`ingestion/centquatre-paris/`) was written and proven
offline against the retained fixture (`tests/centquatre-paris.test.mjs`).
`collector_assessment.recommended_family` is the existing generic
`JSON_API` vocabulary member, even though its concrete implementation here
is new code. `READY_FOR_ACTIVATION` was deliberately not claimed; turning
this into an enabled source is a separate, later, explicitly-authorised
step outside this investigation's scope.

One honest caveat carried into the decision: any future activation must
call `/api/events` directly with the documented `taggedEntities.tag[]`
filter — the task-given URL's own `?genre=concerts` query string does
nothing server-side and must not be relied on.
