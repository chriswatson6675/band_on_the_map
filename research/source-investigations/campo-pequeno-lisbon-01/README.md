# campo-pequeno-lisbon-01

Non-authoritative explanation for a human reader. **`investigation.json` is
the authoritative record** — this file never overrides it, and the
validator never reads this file. See `docs/SOURCE_INVESTIGATION_POLICY.md`
for the governing policy.

## What was investigated

**Campo Pequeno (Sagres Campo Pequeno)**, a large multi-use arena/bullring
venue on Avenida da República, Lisboa, Portugal (stated capacity 100–9,000
people, sharing its historic building with a shopping centre). The task
came in with a loose prior-research lead already recorded in
`sources/lisbon.json` (`campo-pequeno` entry: `official_website
https://sagrescampopequeno.pt`, `events_url
https://sagrescampopequeno.pt/pt/agenda`, `research_notes: "Plain HTML list
with dated acts confirmed into 2027"`, `monitoring_status
READY_FOR_TECHNICAL_PROOF`). This investigation treated that entry as a
discovery lead only, and independently re-verified everything itself
against freshly retained evidence — `sources/lisbon.json` was never read as
authority and was never modified.

- Bare domain given in the registry (confirmed to 301-redirect to the
  canonical host): `https://sagrescampopequeno.pt`
- Canonical host used for every other fetch:
  `https://www.sagrescampopequeno.pt`
- Candidate events page: `https://www.sagrescampopequeno.pt/pt/agenda`

## What was found

The candidate agenda page is a plain, fully server-rendered HTML page on a
bespoke CMS (`Server: nuvem server/5.0` — not WordPress, Squarespace, or a
recognisable calendar plugin; no `<meta name="generator">` tag; no
JSON-LD `Event`/`MusicEvent` data anywhere, only a standard
`BreadcrumbList` block). As of the fetch (2026-08-27), it listed **28
distinct events**, spanning **12 September 2026 through 4 June 2027** —
independently confirming the prior loose note's "confirmed into 2027"
claim rather than merely trusting it.

Every event card carries a title, city (`Lisboa` — city only on the list
page), a full date, and its own distinct detail-page link. Four detail
pages were sampled (`alphaville`, `megadeth`, `the-nutcracker-ice-show`,
and — deliberately — the already-cancelled `brandi-carlile---cancelado`,
to observe how the source itself signals cancellation). Every sampled
detail page states, directly:

- the full venue name (`Lisboa - Sagres Campo Pequeno`, more precise than
  the list card's city-only text),
- a complete date + Portuguese weekday (e.g. `16 outubro 2026 ,
  sexta-feira`) — mechanically cross-checked against real Gregorian
  calendar arithmetic and matched 4/4,
- a start time and doors time (in free text, but in **two different,
  inconsistent formats** across the 4-event sample — a genuine data-quality
  finding, not smoothed over),
- a full multi-tier admission price list (named area + exact € price per
  tier — 4 to 10 tiers per sampled event),
- its own stable canonical URL slug, declared via `<link rel="canonical"
  href="https://www.sagrescampopequeno.pt/pt/{slug}">` and independently
  corroborated by the site's own `pt/sitemap.xml`.

The stable-identifier rule's own worked example (`docs
/SOURCE_INVESTIGATION_POLICY.md`'s "a permalink URL slug the source uses as
its own canonical path") is satisfied here almost exactly: the canonical
slug was proven three independent ways — zero duplicate slugs across all
28 agenda cards, independent sitemap corroboration, and an empirical
cross-fetch of the same event via both its agenda-relative and canonical
short URL forms, which returned identical content.

`robots.txt` discloses a `Disallow: /api` path. This was **deliberately
not probed** — Level 1 static HTML already answered every question this
investigation needed to answer, and there was no justification to
escalate past the site's own stated crawl preference for a path that
wasn't needed.

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was used, and it was `SUFFICIENT` — the
full agenda listing and every sampled event's complete field set were
already visible in the plain, unauthenticated HTTP response bodies. No
escalation to Level 2/3/4 was attempted or needed.

## Decision

**`READY_FOR_ACTIVATION`.** All of the mechanically-enforced activation
gates in `docs/SOURCE_INVESTIGATION_POLICY.md` (v1.2) are met: identity is
`PROVEN`, the acquisition class (`STATIC_HTML`) is a resolved/supported
class, the agenda page `data_paths` entry is `PUBLIC`/`CONFIRMED`, `title`
and `start_date` are both `PROVEN` with `basis: DIRECT_SOURCE`,
`source_record_id` is `PROVEN` (the canonical slug, corroborated three
independent ways), a known collector family (`STATIC_EVENT_LIST`) is
recommended, a `DETERMINISTIC_DERIVATION` evidence item exists
(`evidence/offline-proof.mjs` + its captured output), and no blocker is
`CRITICAL` — five `MINOR` blockers only (see `investigation.json`'s
`collector_assessment.blockers` for the full, honest list: inconsistent
free-text time format, multi-tier price structure, text-only cancellation
signalling, one stale sitemap entry, and an unverified multi-date-slug
edge case).

This is a research conclusion only. Reaching `READY_FOR_ACTIVATION` here
does **not** edit `sources/*.json`, any `venues/*.json` registry, or any
other live registry — turning this into an active collector is a
separate, explicitly-authorised step outside this investigation's scope.

## Evidence

All evidence lives under `evidence/`:

- `body-home.html` / `headers-home.txt` and `body-agenda.html` /
  `headers-agenda.txt` — the bare, non-www domain's 301 redirects to the
  canonical `www` host.
- `body-home-www.html` / `headers-home-www.txt` — the canonical homepage
  (identity).
- `body-agenda-www.html` / `headers-agenda-www.txt` — the candidate agenda
  page (the primary data path — all 28 event cards).
- `body-event-alphaville.html`, `body-event-megadeth.html`,
  `body-event-nutcracker.html`, `body-event-cancelado.html` (+ each
  `headers-*.txt`) — four sampled event detail pages, deliberately
  including one already-cancelled listing.
- `body-canonical-check.html` / `headers-canonical-check.txt` — the same
  `alphaville` event fetched via its short canonical URL form, to
  empirically cross-check slug stability across two URL shapes.
- `body-robots.txt` / `headers-robots.txt` — the site's own robots.txt.
- `body-sitemap.xml` / `headers-sitemap.txt` — the sitemap index.
- `body-sitemap-pt.xml` / `headers-sitemap-pt.txt` — the pt-locale
  sitemap (independent slug corroboration).
- `offline-proof.mjs` — dependency-free, no-network Node script that
  re-parses the retained files above and mechanically re-derives every
  claim in `investigation.json`'s `field_assessment`.
- `offline-proof-output.txt` — captured stdout of running that script;
  cited in `investigation.json` as the `DETERMINISTIC_DERIVATION`
  evidence item.
- `validate-mine.mjs` — a local, one-off sanity check (not itself a
  governed evidence item) that imports `validateInvestigation` from
  `ingestion/source-investigation/contract.mjs` and confirms
  `investigation.json` passes with zero errors.
