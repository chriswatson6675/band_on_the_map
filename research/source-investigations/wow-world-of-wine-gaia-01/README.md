# wow-world-of-wine-gaia-01

Investigation of the candidate "WOW — World of Wine" (Cais de Gaia, Vila
Nova de Gaia, Portugal), a large cultural quarter of museums, restaurants,
bars, and event spaces on the Vila Nova de Gaia riverfront. Prompted by a
loose, never-verified lead already recorded in `sources/porto.json`
(`wow-world-of-wine-gaia`, `monitoring_status: READY_FOR_TECHNICAL_PROOF`).
This investigation independently discovers and verifies everything from
freshly retained evidence, per `docs/SOURCE_INVESTIGATION_POLICY.md`; it
does not edit `sources/porto.json` or any other registry.

## Summary

`www.wow.pt` is genuinely WOW's own official site (independently
re-confirmed via its own `og:title`/`og:description` meta tags and a
self-referential GraphQL `storeConfig.base_url`), and it runs on Magento
Open Source + PWA Studio — a fully client-rendered React storefront in
front of a real, public, unauthenticated GraphQL API at
`https://www.wow.pt/graphql`.

The given candidate lead URL, `https://www.wow.pt/pt/agenda-cultural`,
turned out to be a **dead lead**: it returns HTTP 200 (like every route on
this single-page app), but a live, read-only GraphQL `urlResolver` query
proves it does not resolve to any page in the store at all. The real,
resolvable "Agenda" page — found via the site's own client bundle
redirect map and independently confirmed via `urlResolver` — is a Magento
**category** (`id: 163`, `experiencias/agenda`, 19 products).

Inspecting that category in full — its 19 products, its own facet/attribute
taxonomy (`ticket_type`, `category_uid`, `time_of_day`, `visitor_type`),
and its two most music-adjacent sub-groupings — showed it is a **generic
ticketed-admissions catalog for the entire multi-attraction complex**: day
passes, museum tickets, a kids' workshop, an annual membership card, and
only a handful of dated dinner-shows/parties (a Fado dinner-show, a
comedy-club night, Oktoberfest, a "Great Gatsby" dinner-theatre show, a
recurring sunset DJ session, a film-club series) bundled together under a
single "Gastronomia e Eventos" (Gastronomy & Events) grouping. **No
dedicated, filterable live-music/concert category exists anywhere in the
source's own structure** — not as a `ticket_type` facet option, not as a
`category_uid` facet option, and not as a per-product category tag (the
sampled Fado product's own categories are `Restaurantes` / `Visita o WOW`
/ `Agenda` / `Gastronomia e Eventos` — no music tag at all).

The one detailed product sampled (Fado Show & Dinner) confirms this is
framed entirely as a dinner-and-wine-pairing restaurant experience at
"restaurante 1828," not a concert listing — and even for this and the
other dated products, **no year is stated anywhere** in connection with
the event's own date (only a day + month, e.g. "25 SETEMBRO"); the only
4-digit numbers present in the retained description are wine-vintage
years (2023, 2019) in the menu text, unrelated to the show's own date.

## Decision

`REJECT`. This is *not* an identity or technical-acquisition failure —
`identity.status` is `PROVEN` and a real, reachable, well-structured
`PUBLIC_JSON_API` was genuinely found and queried (several
`field_assessment` fields are honestly `PROVEN`: `title`,
`source_record_id`, `event_url`). The rejection is a **content-scope**
finding: per this project's own scope rule (do not treat restaurants/bars
as candidates merely because they occasionally host music) and this
task's explicit instruction to only recommend activation when a
genuinely identifiable, filterable music-event category exists, WOW's
"Agenda" is a generic multi-attraction ticketing catalog with only
incidental, dinner-bundled music content — it fails that bar. See
`collector_assessment.blockers` (one `CRITICAL` entry) and `decision.reasons`
in `investigation.json` for the full reasoning.

If WOW ever adds a genuinely dedicated, filterable concert/live-music
listing, a **new** investigation (citing `supersedes:
"wow-world-of-wine-gaia-01"`) would be required — this record is never
rewritten in place.

## Evidence

All evidence lives under `evidence/` and is cited by `investigation.json`.
Highlights:

- `body-agenda.html`, `body-home-pt.html` — the given candidate URL and
  the site's own PT homepage, both empty React client-rendered shells
  (Level 1 — `INSUFFICIENT`).
- `body-client.js` — the site's own webpack client bundle, fingerprinting
  Magento PWA Studio and revealing the `/graphql` endpoint plus an
  old-URL redirect map pointing at the real "Agenda" path (Level 2
  discovery lead).
- `body-urlresolver-pt_agenda-cultural.json` /
  `body-urlresolver-pt_experiencias_agenda.json` — the decisive
  dead-lead-vs-real-category `urlResolver` contrast.
- `body-graphql-category163.json`, `body-graphql-products163.json`,
  `body-graphql-aggregations163.json` — the full "Agenda" category content
  and its facet/attribute taxonomy (no music-specific filter).
- `body-graphql-category438.json` / `body-graphql-products438.json` and
  `body-graphql-category453.json` / `body-graphql-products453.json` — the
  two sub-groupings closest to music content, both confirmed mixed/generic.
- `body-graphql-product-fado.json`, `body-graphql-product-fado-desc.json`,
  `body-graphql-urlresolver-fado.json`, `body-product-fado-page.html` — a
  single sampled product's full detail, id-stability cross-check, and
  constructed detail-page URL.
- `offline-proof.mjs` / `offline-proof-output.txt` — a dependency-free,
  no-network re-parse of every retained fixture, mechanically reproducing
  every claim above (run via `node evidence/offline-proof.mjs`).
- `validate-mine.mjs` — runs `validateInvestigationV1_2()` from
  `ingestion/source-investigation/contract.mjs` against this
  investigation's own `investigation.json` (run via
  `node evidence/validate-mine.mjs`); passes with zero errors.
