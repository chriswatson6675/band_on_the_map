# coliseu-ageas-porto-01

**This is a real trial investigation of a real venue/source candidate — not
activation.** Reaching `decision.status: "READY_FOR_ACTIVATION"` in
`investigation.json` is a research conclusion only. It does not edit
`sources/*.json`, any `venues/*.json` registry, or public map data. Turning
this into an active collector is a separate, explicitly-authorised step —
see "Investigation and activation are separate" in
`docs/SOURCE_INVESTIGATION_POLICY.md`.

`investigation.json` is the authoritative structured record. This file is
explanatory only, per policy.

## What was investigated

**Coliseu Porto Ageas** (R. de Passos Manuel 137, 4000-385 Porto) — a
large, well-known Porto concert hall. This repository already carried a
loose, non-governed note about this venue in `sources/porto.json`
(`coliseu-do-porto`), which concluded the site was "an entirely
client-rendered React single-page app... no server-rendered listing or
JSON/JSON-LD found... would require a headless-browser collector family
this project has not built" and stopped there ("not attempted further
tonight"). This investigation was explicitly told **not to simply trust
that old note** and to independently re-verify with its own retained
evidence — sites change, and the old note's own escalation had stopped at
Level 1.

## What actually happened: Level 1 confirmed the shell, Level 2 found a real API

**Level 1 (`PASSIVE_STATIC`) — `INSUFFICIENT`.** Plain `curl` GETs of the
home page, `/agenda`, and a candidate `/evento/:slug` detail route all
returned the exact same 3,817-byte HTML: a bare `<div id="root"></div>`
shell, no JSON-LD, no server-rendered event data. This **independently
reproduces** the old note's finding — it was not wrong about Level 1.

**Level 2 (`STRUCTURAL`) — `SUFFICIENT`.** The same public page loads its
own `/env-config.js`, which declares:

```js
GRAPHQL_API: "https://nest.coliseu.pt/graph/"
```

A plain GET to that endpoint returned `400 Bad Request` /
`"GET query missing."` with `Access-Control-Allow-Origin: *` — a live,
public, CORS-open GraphQL server that documents its own protocol in its
own error message. A minimal read-only `{__typename}` query confirmed it
executes ordinary GraphQL; standard, read-only GraphQL introspection (no
mutation, no credentials, no bypass of anything) then revealed a full
public schema with an `events`/`eventBySlug` query and an `Event` type
carrying `id`, `name`, `startDate` (a genuine UTC ISO instant),
`slug`, `category`, `room`, `promoter`, `ticketsSeller`, `ticketsUrl`, and
`estimatedDuration` — but **no price/cost field anywhere** in the
179-type schema.

None of this required executing the SPA's JavaScript or opening a browser.
Every GraphQL request made here is an ordinary, read-only,
already-publicly-referenced HTTP request — the same kind of request the
site's own public page makes to render itself for any visitor. Level 3
(`BROWSER_OBSERVATION`) was never attempted because it was never needed.

## Bounded sample

Five upcoming, visible, non-archived events were retrieved in one bounded
GraphQL query (`paging: {limit: 5}`, sorted by `startDate` ascending);
`totalCount` reported by the API was 72:

- He´s Back | Michael Jackson Tribute — 2026-09-12T20:00:00.000Z
- Sigur Rós - The Orchestral Tour — 2026-09-13T20:00:00.000Z
- Bruna Louise: Novo Show — 2026-09-17T20:00:00.000Z
- PROMENADE 2026 - Os Prelúdios de Liszt — 2026-09-20T10:00:00.000Z
- PRIMEIRA BOX apresenta: Ed + João Não & Lil Noon + Rodrigo 13 — 2026-09-21T20:00:00.000Z

Two of these five (`id` 1951 and 1923) were independently re-queried via a
completely separate path (`eventBySlug` instead of the `events` list
query) and reproduced the identical `id` both times — the empirical
stable-identifier proof this policy requires.

## Real nuances found and honestly recorded (not smoothed over)

- **`end` is deliberately not `PROVEN`.** The API exposes
  `estimatedDuration` (seconds), which can be mechanically combined with
  `startDate` to derive an approximate end — but the field is explicitly
  named "estimated" by the source itself, so this investigation kept
  `field_assessment.end.state` at `PARTIAL` rather than overselling a
  precise claimed value.
- **`price` is honestly `NOT_PRESENT`.** No price/cost field exists on
  `Event`, nor anywhere else in the full 179-type schema (mechanically
  confirmed, not just eyeballed). Pricing presumably lives on the
  third-party ticketing pages (`ticketsUrl`, sellers TICKETLINE/BLUETICKET)
  this investigation did not fetch — using a third-party ticketing page as
  first-party price authority is exactly the kind of use this policy's
  "Third-party sources" section says must stay explicitly, separately
  governed.
- **`ticketsUrl` is not a consistent shape.** 3 of 5 sampled events
  returned a bare relative slug/path fragment; 2 returned a complete
  `https://` URL to a different domain (`bol.pt`). Recorded as a `MINOR`
  blocker, not silently normalised.
- **`event_url` was constructed, not guessed.** The React route pattern
  `/evento/:slug` was found verbatim in the retained main JS bundle (not
  invented), and a direct fetch of the constructed URL for one sampled
  event's slug resolved `200 OK`.
- **GraphQL introspection being enabled is itself notable** (many
  production APIs disable it) — recorded as a `MINOR` forward-looking
  blocker in case it is disabled later.

## Discrepancy with the older, loose repository note

`sources/porto.json`'s `coliseu-do-porto` entry records
`acquisition_method: "UNKNOWN"` and concludes a headless-browser collector
would be required, having stopped its own search at Level 1. This
investigation's own Level 1 re-fetch reproduces that same shell finding —
the old note was not wrong about what it actually checked. But its
escalation stopped where this investigation's began: the old note never
attempted a Level 2 structural check of the page's own referenced JS/config
files, which is exactly where the real, public GraphQL API was found. This
investigation does not edit `sources/porto.json` (per the hard constraints
of this task) — the disagreement is recorded here, transparently, as newer
and more deeply retained evidence superseding an incomplete older note, not
as a silent correction.

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script that re-parses every retained HTML/JS/JSON fixture in this
directory and mechanically re-derives every claim above: shell-emptiness
and byte-identity across routes, the `env-config.js` API-host discovery,
the literal route-pattern strings in the retained JS bundle, GraphQL
liveness and full schema introspection (including the absence of any
price/cost field or type), the 5-event sample's field completeness, the
2/2 empirical `id`-stability cross-check, and the `200 OK` resolution of
the constructed `event_url`. Run with `node evidence/offline-proof.mjs`;
its captured stdout is retained at `evidence/offline-proof-output.txt` and
cited as the investigation's `DETERMINISTIC_DERIVATION` evidence item. It
exited `0` with every check passing.

## Decision

`READY_FOR_ACTIVATION`. Identity is `PROVEN` (HIGH confidence),
`site_classification.acquisition_class` is `PUBLIC_JSON_API` (a resolved,
supported class), a `CONFIRMED`/`PUBLIC` GraphQL `data_paths` entry exists,
`title`/`start_date` are both `PROVEN`, `source_record_id` is `PROVEN`
under the stable-identifier rule with empirical proof, the recommended
collector family (`JSON_API`) is a known family, an offline
`DETERMINISTIC_DERIVATION` proof exists, and every blocker found is
`MINOR` — none `CRITICAL`. This decision is a research conclusion only; it
does not edit `sources/*.json` or any registry. Turning it into an active
collector is a separate, explicitly-authorised step.

## What a future investigator/collector-builder should know

- Recommended collector family: `JSON_API` — query
  `https://nest.coliseu.pt/graph/` for `events` (paged, filtered on
  `isVisible`/`isArchived`), reading `id`/`name`/`startDate`/`slug`/
  `category`/`room`/`promoter`/`ticketsSeller`/`ticketsUrl`/
  `estimatedDuration` per event.
- Treat any `end` derived from `estimatedDuration` as approximate only,
  never as a venue-confirmed end time.
- Handle `ticketsUrl`'s inconsistent shape per `ticketsSeller` rather than
  assuming it is always a ready-to-use absolute URL.
- No price data exists in this API; a price integration would require a
  separate, explicitly-governed third-party (ticketing-site) rights
  decision, out of scope here.
- A larger future sample should specifically check whether a multi-date
  production shares one `id` across performances (the pattern this
  repository already found at `gulbenkian-lisbon-01`) — this bounded
  5-event sample did not happen to include one.
- No `CRITICAL` blockers were found. Four `MINOR` blockers are recorded in
  `collector_assessment.blockers` (ticketsUrl format inconsistency,
  approximate-only `end`, introspection-availability fragility, and the
  unverified multi-date-id edge case) — all workable, none blocking a
  future collector build.
