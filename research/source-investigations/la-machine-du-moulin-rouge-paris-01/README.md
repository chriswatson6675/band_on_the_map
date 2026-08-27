# la-machine-du-moulin-rouge-paris-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`. Investigates La
Machine du Moulin Rouge (club/concert venue, 90 Boulevard de Clichy, 75018
Paris — a distinct venue adjacent to, and NOT part of, the Moulin Rouge
cabaret itself). Official site:
https://www.lamachinedumoulinrouge.com/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient, and richer than most: the
official `/agenda/` page exposes 42 real, current static event cards
(`<article class="evenement-item">`), each with a machine-readable
`<time datetime=...>`, a title, and a room name within the venue's own
complex (Central / Bar à Bulles / Chaufferie). One linked detail page
additionally exposed an explicit end time.

**Important honesty finding**: every sampled card's `<time datetime=...>`
attribute carries a `+00:00` suffix regardless of calendar date — but the
sample spans a real Europe/Paris DST transition (late October 2026), where
a genuine UTC conversion would show a mix of `+02:00`/`+01:00`, not a
constant `+00:00`. This proves the suffix is a fixed placeholder, not a
real UTC conversion, so `time`/`end` are recorded `PROVEN`/`DIRECT_SOURCE`
for their wall-clock digits only, with certainty `FLOATING_LOCAL` — never
upgraded to a false UTC instant. This is the same category of "looks
stable but isn't" finding already logged for Hot Clube de Portugal's ICS
`UID`.

No price is exposed on the venue's own pages (ticketing is delegated to
shotgun.live, a third party, already bounded-checked — HTTP 429 — during
the `le-trabendo-paris-01` investigation and not repeated here).

## Collector

`recommended_family: STATIC_EVENT_LIST` — code (`ingestion/la-machine-du-moulin-rouge/`)
is genuinely bespoke to this venue's own markup. Offline-proved against
the retained fixture by `tests/la-machine-du-moulin-rouge.test.mjs` — no
live network call.

## Decision

`READY_FOR_ACTIVATION` — every activation gate is satisfied against
retained evidence, including a `DETERMINISTIC_DERIVATION` offline-proof
test. Turning this into an enabled source is a separate, explicitly
authorised action outside this investigation's scope.
