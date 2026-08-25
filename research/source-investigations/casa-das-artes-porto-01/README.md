# casa-das-artes-porto-01

**This is a real investigation of a real venue/source candidate — not
activation.** `investigation.json` is the authoritative structured record.
This file is explanatory only, per policy, and carries no independent
authority.

## What was investigated

**Casa das Artes** — Porto, Portugal. A cultural centre at Rua Ruben A,
nº 210, Porto, operated under the DRCN / Instituto Público Património
Cultural (Direção Regional de Cultura do Norte) umbrella. The task supplied
the official website directly: `http://casadasartes.gov.pt/`. This
investigation independently re-verified that URL is genuinely the venue's
own official presence (page title, branding, real street address on its
own `/contactos/` page, and a nav link into the DRCN's own "Instituto
Público Património Cultural" section) rather than treating the task's note
as evidence.

A prior, loose (non-governed) note described this venue as "a real,
evidenced Porto venue with apparent static listing, partially
client-rendered per one loose note — not yet independently fetch-verified."
This investigation did not treat that note as a finding; every claim below
comes from this investigation's own retained evidence.

## What was actually found

The site is **genuinely official** and **fully server-rendered plain
WordPress HTML** — nothing here is a rendering/JavaScript problem. But it
currently **exposes no current or future event/programme data at all**:

- The primary nav menu has no agenda/programação/eventos/calendário link.
- The homepage's "blog" area shows exactly 3 sticky posts, each dated
  2023–2024, with no pagination.
- The site's own public WordPress REST API (`/wp-json/wp/v2/posts`,
  `/wp-json/wp/v2/pages`, and the API discovery root) mechanically confirms
  this is the **entire** site: `X-WP-Total: 3` posts (most recent
  2024-10-29, ~665 days / ~22 months before this investigation), `X-WP-Total:
  11` static pages (none an agenda page), and no calendar/events plugin
  (e.g. The Events Calendar, EventOn) registered among 281 total API
  routes.
- The one event-like post ("Salão Piolho", a cinema-club screening)
  states its date only as unstructured prose — `"23 de NOVEMBRO | Sábado |
  18h"` — with **no year anywhere in that text**. The post's own metadata
  makes 2024 a plausible guess, but the source itself never states it, so
  `field_assessment.start_date` is recorded `AMBIGUOUS`, never a fabricated
  `PROVEN` date.
- No JSON-LD `Event`/`MusicEvent` data and no `.ics` link exist anywhere in
  the retained sample.

## Escalation ladder

- **Level 1 (`PASSIVE_STATIC`) — `INSUFFICIENT`**: fetching and visually
  inspecting the homepage and the `/category/musica/` archive strongly
  suggested a dormant site with no event listing, but visual/HTML
  inspection alone wasn't judged fully authoritative about site-wide
  totals (a link could in principle be hidden, or the homepage template
  could in principle omit content that still exists elsewhere).
- **Level 2 (`STRUCTURAL`) — `SUFFICIENT`**: querying the site's own public
  WordPress REST API (`X-WP-Total` headers, the full pages list, and the
  route-discovery root) mechanically settled the question with the site's
  own authoritative metadata rather than an eyeballed count.
- No escalation to Level 3/4 (browser/headless) was attempted. This is not
  a client-rendering problem — every page fetched was already fully
  server-rendered plain HTML — so a browser session could not reveal
  anything the REST API totals hadn't already settled.

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script that re-parses every retained HTML/JSON fixture in this
directory and mechanically re-derives every claim above: post/page counts
vs. `X-WP-Total` headers, the absence of any calendar-plugin REST route,
the absence of JSON-LD/`.ics` anywhere sampled, the yearless date line, and
cross-checks of the one event-like post's WordPress id (3231) across four
independent renderings (homepage card, category archive, single-post page,
REST API). Run with `node evidence/offline-proof.mjs`; its captured stdout
is retained at `evidence/offline-proof-output.txt` and cited as the
investigation's `DETERMINISTIC_DERIVATION` evidence item. It exited `0`
with every check passing.

`evidence/validate-check.mjs` is an additional, throwaway sanity check
(not itself cited as governed evidence) that imports
`validateInvestigationV1_1` from `ingestion/source-investigation/contract.mjs`
and confirms `investigation.json` passes structural/business-rule
validation with zero errors.

## Decision: DEFER

This is a **content-availability finding, not a technical acquisition
barrier**. Identity is `PROVEN` and the site is straightforward to fetch —
but there is currently nothing current to fetch. `collector_assessment`
records one `CRITICAL` blocker (no live/current event data exists to
build or validate a collector against) and one `MINOR` blocker (even the
one historical sample uses fragile unstructured-prose fields, not a
reliable structured pattern). `collector_assessment.recommended_family` is
left `null` — recommending a collector family against zero current samples
would not be honest.

Per `docs/SOURCE_INVESTIGATION_POLICY.md`, `DEFER` is a legitimate,
complete investigation outcome, not a failure to be papered over. A future
investigator could reasonably re-check this exact `official_url` later — if
the venue resumes actively posting, a **new** investigation (a new
`investigation_id`, `supersedes` pointing back at this one) could honestly
reach a different conclusion. This record does not speculate about where
else the venue's events might be announced (e.g. third-party/government
ticketing platforms observed only as discovery leads on the homepage,
`bilheteira.culturanorte.gov.pt` / `bilheteira.patrimoniocultural.gov.pt`)
— that is out of scope for an investigation bounded to this one candidate's
own official site.
