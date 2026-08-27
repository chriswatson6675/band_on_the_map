# coliseu-dos-recreios-lisbon-01

**This is a real investigation of a real venue/source candidate — not
activation.** `investigation.json` is the authoritative structured record;
this file is explanatory only and carries no independent authority, per
`docs/SOURCE_INVESTIGATION_POLICY.md`.

## What was investigated

**Coliseu dos Recreios** (branded "Coliseu de Lisboa" in its own ticketing
and structured event data) — a large, historic multi-purpose concert hall at
Rua das Portas de Santo Antão 96, 1150-269 Lisboa. Its registry entry already
existed in `sources/lisbon.json` (id `coliseu-dos-recreios`,
`official_website: "https://coliseulisboa.com"`) with `acquisition_method:
"UNKNOWN"` and a note that automated fetches had previously been blocked
(HTTP 403).

## Headline result: this investigation's own fetches were never blocked

Every one of this investigation's ~25 live requests today (homepage,
contacts page, robots.txt, 5 event detail pages, 2 independent fetches of
one detail page, 5 REST API per-event lookups, a slug-based lookup, a
taxonomy-terms lookup, a category-filtered list, and a post-types lookup)
returned `200 OK`. No `403` was observed anywhere. This is recorded as an
honest, unresolved discrepancy with the registry's older note (see
`identity.notes` in `investigation.json`) — the old block may have been
transient, User-Agent-specific, or has simply changed since. Current,
independently retained evidence wins, per this project's established
practice (see `gulbenkian-lisbon-01`'s identical-pattern note).

## What was found: a genuinely excellent public JSON API

The homepage itself is a fully server-rendered list of 69 upcoming events
(Elementor "Loop" widget over a WordPress custom post type, `eventos`), each
with a title, a full day+month-name+year date, and a detail-page link — no
month/year needed to be *inferred* from anywhere.

Following the homepage's own `Link` header (`rel="https://api.w.org/"`) led
to something much stronger than the HTML itself: **a public, unauthenticated
WordPress REST API** (`/wp-json/wp/v2/eventos/<id>`) exposing a rich
`toolset-meta` object (the Types/Toolset plugin) for every event —
structured start date (Unix timestamp + human-formatted string), a
genuinely separate performance **start time** field, a distinct
**doors-open** time field, an end date for multi-day runs, a numeric
`codigo-evento` matching the event's own linked BOL.pt ticket URL, a full
venue sub-object (name, room, address, lat/long), a sector-by-sector price
breakdown, and a custom `categoriaevento` taxonomy that cleanly separates
`Concerto`/`Música & Festivais` events from this venue's wider programme
(ballet, comedy, talks, etc.).

Every field this investigation sampled is **directly stated by the source**
— `basis: DIRECT_SOURCE` throughout, no `DETERMINISTIC_CONTEXT` combination
needed anywhere, because the REST API states date/time/venue/price/id
directly per event, not just once per page/section.

## Bounded sample

Five events were fetched to REST-API depth and cross-checked against the
homepage's own server-rendered list (5/5 matched exactly, mechanically
reproduced in `evidence/offline-proof-output.txt`):

- FISCHER-Z (2026-09-04, 21:00, doors 20:00) — `Concerto`
- DEVA PREMAL & MITEN (2026-09-12, 19:30, doors 18:30) — `Concerto`
- IOLANDA (2026-12-07, 21:00, doors 20:00) — `Concerto`
- O LAGO DOS CISNES / Imperial Heritage Ballet (2027-01-15 → 2027-01-16) —
  `Bailado` (deliberately included as a **negative** example: not music,
  proves the taxonomy genuinely discriminates)
- ANTÓNIO ZAMBUJO & MIGUEL ARAÚJO (2027-02-02 → 2027-02-06) — `Concerto`,
  a 5-day run

The `categoriaevento=49` ("Concerto") filter alone returned 239 posts out of
494 total `eventos` posts at time of investigation — the site clearly hosts
far more than just concerts, and the taxonomy is what lets a future
collector scope correctly to music/gig events.

## Why this investigation does NOT reach READY_FOR_ACTIVATION

Despite the acquisition mechanism being about as clean as this project has
seen, `decision.status` is **`HUMAN_REVIEW`**, not `READY_FOR_ACTIVATION`.
This investigation's own retained `robots.txt`
(`evidence/body-robots.txt`) contains:

1. A Cloudflare-managed `Content-Signal: search=yes,ai-train=no,use=reference`
   reservation under the generic `User-agent: *` rule (an explicit EU DSM
   Directive Article 4 rights reservation against AI training).
2. Separately, an explicit `User-agent: ClaudeBot` block with
   `Disallow: /` — naming **Anthropic's own crawler product** specifically
   — alongside the same treatment for GPTBot, Google-Extended, Bytespider,
   CCBot, Amazonbot, Applebot-Extended, and meta-externalagent.

This investigation's own HTTP requests used a distinct, honestly
self-identifying project User-Agent
(`BandOnTheMap-SourceInvestigation/0.1`), not literally `ClaudeBot`, so they
were not technically covered by that one line — but the site operator has
gone out of its way to name and block Anthropic's crawling infrastructure
specifically, on top of a general AI-training rights reservation. Per
`docs/DATA_RIGHTS.md` ("Do not scrape or ingest a source merely because its
content is publicly visible") and `docs/SOURCE_INVESTIGATION_POLICY.md`'s
"Third-party sources" section (rights classification is explicitly governed
elsewhere, not resolved by this policy), whether an ongoing, automated
collector may honestly acquire this source's data given this explicit,
named signal is a genuine judgement call this investigation does not
resolve unilaterally.

`collector_assessment.blockers` therefore carries one `CRITICAL` entry (this
finding) alongside four `MINOR` entries (REST default list-ordering does not
sort by event date; multi-day runs don't expose per-session
counts/times; the site is multilingual with a real risk of duplicate
Observations per language; and the unresolved 403 discrepancy above). A
human operator should read `evidence/body-robots.txt` and decide the correct
rights posture — and whether/how to proceed — before any collector is built.

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script that re-parses only the retained fixtures in this directory and
mechanically reproduces every structural claim above: the 69-event homepage
extraction, the 5/5 REST-vs-homepage date/title cross-checks, the
`postid-7902` empirical stability check (two independent fetches of the same
event), and the `categoriaevento` term-id-to-name mapping. Run with
`node evidence/offline-proof.mjs`; captured stdout is retained at
`evidence/offline-proof-output.txt` — 21/21 checks pass, exit code 0.

## What a future investigator/collector-builder (and the human reviewing
the rights question) should know

- If the rights question above resolves favourably, recommended collector
  family: `JSON_API`. Enumerate current/future events from the homepage's
  own curated list (or resolve slugs via `?slug=`), then fetch each event's
  `/wp-json/wp/v2/eventos/<id>` and read `toolset-meta.evento`/`.entidade`/
  `.preco` directly — no HTML parsing needed for the core fields.
- Filter to genuine music/gig events via the `categoriaevento` taxonomy
  (term id 49, `Concerto`) rather than guessing from titles.
- Do not confuse `aberturaportas` (doors) with `horainicialeventosemsegundos`
  (actual performance start) — both are present and clearly distinct.
- `end` (a per-performance end time) is genuinely `NOT_PRESENT` anywhere in
  the sample; do not invent one.
- No CRITICAL blocker exists on the *technical* side; the one CRITICAL
  blocker recorded is the rights/robots.txt finding above, deliberately kept
  separate from, and not diminishing, the strength of the technical findings.
