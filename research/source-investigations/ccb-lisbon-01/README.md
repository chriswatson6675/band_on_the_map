# ccb-lisbon-01

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

**Centro Cultural de Belém (CCB)** (Lisboa, Portugal) is a large,
multidisciplinary cultural centre — museum/exhibition spaces, a congress
centre, gardens, and a broad performing-arts programme spanning music,
theatre, dance, performance, and family/schools activities. This
investigation targeted only the site's own `musica` (music) event
category, not its full programme.

## Correcting the given candidate URL

The given candidate URL, `https://ccb.pt/eventos/categoria/musica`, works
(it 301-redirects, via `https://www.ccb.pt/eventos/categoria/musica/`,
to a page that renders correctly), but that page's own
`<link rel="canonical">` declares a different URL as authoritative:
`https://www.ccb.pt/event/category/musica/` (WordPress + The Events
Calendar's default `event` rewrite slug, not `eventos`). This
investigation's `official_url` reflects that self-declared canonical.

## What was actually found — a public JSON REST API, not a "dated HTML list"

The prior loose note described "dated HTML event list". This investigation
found something materially better: the site runs WordPress with **The
Events Calendar + Events Calendar Pro** (well-known, widely-deployed
calendar plugins), and the plugin's own bundled REST API v1 is public,
unauthenticated, and **advertised directly in the static HTML** of the
listing page itself (`<link rel="alternate" href="https://www.ccb.pt/wp-json/tribe/events/v1/events/?categories=musica" />`).

That REST API returns clean, paginated JSON — id, title, local + UTC start/end
dates, an explicit IANA timezone, a structured venue object, category tags,
and a canonical URL — for every one of 90 `musica`-tagged records currently
on the site (20 were sampled across 2 retained pages). Every sampled
detail page additionally carries a `schema.org` `Event` JSON-LD block whose
`startDate`/`endDate` include an **explicit UTC offset**
(`2026-09-27T17:00:00+01:00`), a stronger date guarantee than the
floating-local datetimes found in the sibling `gulbenkian-lisbon-01`
investigation.

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was attempted, and it was
**`SUFFICIENT`** — no escalation to Level 2/3/4 was needed. Every fetch in
this investigation, including the REST API calls, was a plain,
unauthenticated `curl` GET; none required JS execution, a browser session,
or inspecting a JS bundle to discover the endpoint (it was already linked
from the static HTML `<head>`).

## Bounded sample

20 `musica`-category events were sampled from the REST API list endpoint
(2 pages); 3 were followed to detail-page depth, and 2 were independently
re-fetched via the single-event REST API endpoint to prove id/date/url
stability:

- Festa Temporada 2026_2027 (multi-day umbrella event, 2026-09-11 to 2026-09-13)
- Cantar Juntos pelo Mundo (recurring, 2 dates: 2026-09-12 and 2026-09-13 —
  deliberately kept because it exposed a real permalink-redirect nuance,
  see below)
- Amor Sin Pena – Língua e Memória na Música Ibérica do Século XVI (2026-09-13)
- Sinfonia n.º 5 de Beethoven (2026-09-27, priced concert, kept for its
  price-table nuance — see below)
- Festival BIG BANG LX2026 and several of its constituent sub-events
  (2026-10-02/03, used to reproduce the permalink-redirect anomaly on a
  second, unrelated series)

## Real nuances found and honestly recorded (not smoothed over)

- **A systematic HTML-permalink redirect bug on recurring events.** For a
  multi-date recurring series, the REST API's own `url` field for the
  *first* chronological occurrence 302-redirects to a *different*
  occurrence's page when actually fetched — reproduced identically across
  two unrelated series (`Cantar Juntos pelo Mundo`: 2026-09-12 → redirects
  to 2026-09-13; `Festival BIG BANG — Norquestra`: 2026-10-02 → redirects
  to 2026-10-03). The REST API's *own* per-id JSON fields are unaffected —
  a direct single-event API lookup for the "redirected-away" id still
  correctly reports its own date. Recorded as a `MAJOR` blocker: a
  collector must not assume a fetched HTML detail page necessarily
  describes the id/date it looked up.
- **Ticket price is absent from the REST API's own `cost` field**, even
  for confirmed real, paid concerts (`Sinfonia n.º 5 de Beethoven` links to
  an external ticketing system, `ccb.bol.pt`, and lists 11 distinct price
  points on its own detail page — none of that appears in the API's
  `cost`/`cost_details`). Price is only obtainable via a second HTML fetch
  of the detail page's static price table. Recorded as `PARTIAL`, not
  `PROVEN`, and as a `MINOR` blocker.
- **The `musica` category cross-tags non-music programming.** Several
  sampled records also carry `teatro`, `performance`, `instalacao`,
  `escolas`, or `familias` tags (e.g. `Festival BIG BANG LX2026` carries
  both `musica` and `teatro`). A collector wanting strictly live-music/gig
  content should apply further judgement, not treat every `musica`-tagged
  record as a standalone concert.
- **Source-record ids are already per-occurrence-distinct.** Unlike the
  sibling `gulbenkian-lisbon-01` investigation (where a multi-date
  production shared one id across all its performances), here each dated
  occurrence of a recurring series already has its own distinct, stable
  numeric id (`Cantar Juntos pelo Mundo`: 294811 for 09-12, 294814 for
  09-13) — no composite-key workaround is needed for `source_record_id`
  itself, only the separate HTML-permalink caveat above.

## Independent re-check of the prior loose note's "Jardim de Verão" claim

The prior note said CCB "also runs an outdoor summer 'Jardim de Verão'
series". This investigation independently re-checked that claim two ways
and could not corroborate it:

1. The REST API's own category-taxonomy endpoint was fully retained (26
   categories across 3 pages, matching the API's own reported total) and
   contains no `jardim`/`verão`-like category anywhere.
2. A genuine site search for "jardim de verão" returns a generic
   "As nossas Sugestões" (no-direct-match suggestions) page, not any
   matching event or series page.

This is recorded honestly as a discrepancy with the prior note (per this
task's instruction to treat that note strictly as an unverified lead), not
silently reconciled or assumed to still be accurate — it's entirely
possible "Jardim de Verão" is a past/seasonal series not currently live,
was renamed, or was never a distinct on-site taxonomy category to begin
with.

## Rights note (out of this policy's scope)

The homepage footer reads "Todos os direitos reservados" (all rights
reserved), and `robots.txt` does not disallow `/event/`, `/evento/`, or
`/wp-json/`. This reproduces the prior note's characterisation
("all-rights-reserved footer, no explicit prohibition either") from this
investigation's own retained evidence. Per
`docs/SOURCE_INVESTIGATION_POLICY.md`, this policy does not resolve the
broader rights question — see `docs/DATA_RIGHTS.md` — so it is recorded
here for downstream awareness only, not decided as part of this
investigation.

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script that re-parses every retained HTML/JSON/header fixture in this
directory and mechanically re-derives every claim above: the platform
fingerprint and REST API self-advertisement, the 20-event/26-category
pagination shape, id/date/url stability between the list and single-event
endpoints, explicit-UTC-offset JSON-LD dates and venue-address matching
across 3 detail pages, the 2/2 reproduced permalink-redirect anomaly (with
the single-event API shown unaffected), the empty-cost-field-vs-HTML-price-
table finding, and the "jardim de verão" non-finding. Run with
`node evidence/offline-proof.mjs`; its captured stdout is retained at
`evidence/offline-proof-output.txt` and cited as the investigation's
`DETERMINISTIC_DERIVATION` evidence item. It exited `0` with every check
passing.

## What a future investigator/collector-builder should know

- Recommended collector family: `JSON_API` — page through
  `https://www.ccb.pt/wp-json/tribe/events/v1/events/?categories=musica`
  for id/title/date/venue/url, and optionally re-fetch each id via
  `/events/{id}` if per-record freshness matters.
- Do not follow a recurring event's own `url` field for HTML-only
  enrichment (chiefly price) without accounting for the first-occurrence
  redirect bug — prefer the REST API's own fields wherever they exist.
- Price is not in the JSON API; if needed, fetch the detail page's static
  `Preços` table separately, expecting a multi-value range, not one number.
- Filter carefully within the `musica` category — it is cross-tagged with
  CCB's broader multidisciplinary/family/festival programming.
- No `CRITICAL` blockers were found. One `MAJOR` blocker (the permalink
  redirect bug) and two `MINOR` blockers (unpopulated cost field; category
  cross-tagging) are recorded in `collector_assessment.blockers` — all
  workable, none blocking a future collector build.
