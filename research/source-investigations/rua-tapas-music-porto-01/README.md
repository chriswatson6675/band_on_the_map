# Source investigation: Rua Tapas & Music (Porto) — `rua-tapas-music-porto-01`

**Non-authoritative.** `investigation.json` in this directory is the
authoritative record; this file only explains it to a human reader, per
`docs/SOURCE_INVESTIGATION_POLICY.md`.

## What this investigated

Rua Tapas & Music Bar - Restaurant, 24 Travessa de Cedofeita, 4050-449
Porto, Portugal (Cedofeita neighbourhood) — a small bar/restaurant, not a
dedicated concert hall, advertising live music. A prior loose research
note flagged it P2 ("real, evidenced Porto venue with apparent static
listing, not yet independently fetch-verified... world/folk-leaning
programme"). This investigation treated that note only as a discovery
lead, not as evidence, and independently re-verified everything from
scratch.

The known official URL, `https://www.ruatapas.com/`, was confirmed
correct — no correction was needed.

## What was found

- The site is built on **Wix** (Thunderbolt renderer).
- Identity is **PROVEN**: the homepage's own schema.org `LocalBusiness`
  JSON-LD gives the venue's name, address, and phone, matching the given
  URL and venue reference exactly.
- The homepage's own embedded page-routing data exposes two real,
  source-defined candidate slugs — `agenda` and `events` — without this
  investigation ever guessing them.
- `https://www.ruatapas.com/events` resolves to Wix's own 404 page
  (HTTP 200, soft-404, but the page's own `<title>` says `404 | Rua Tapas
  Music Bar`).
- `https://www.ruatapas.com/agenda` is real: a genuine **Wix Events &
  Tickets** app page exists and returns 200 OK with the title
  `Agenda | Rua Tapas Music Bar`. However, as fetched, it contains **zero**
  `Event`/`MusicEvent` JSON-LD nodes, a very small (1,495-character)
  Wix SSR "warmup data" blob, and no server-rendered event cards.
- The venue's own Wix-generated sitemap (`pages-sitemap.xml`) lists 9
  URLs and **excludes `/agenda` and `/events` entirely** — the venue's own
  site treats the events page as non-content, not merely "not yet
  crawled".
- The only `_api/` paths visible in the agenda page's static HTML are
  generic Wix platform bootstrap endpoints (access-tokens, dynamicmodel,
  session/business info) — no dedicated, stable, publicly-documented
  events-fetch REST path was found. This investigation deliberately did
  **not** guess or call Wix's internal events API, since that would be a
  private API not publicly exposed by the site for this purpose — exactly
  what the policy prohibits.
- The About page carries a marketing tagline, `LIVE MUSIC EVERY
  NIGHT!!!`, but no dated, per-event schedule — consistent with ambient
  nightly music rather than individually billed/dated acts.
- The venue's own nav links its Facebook and Instagram accounts. This
  investigation recorded those URLs as the venue's own self-declared
  social presence but **did not fetch or scrape either platform** — out
  of scope per this task's instructions, and Facebook in particular is
  generally against most such platforms' access controls to scrape.

## Escalation ladder actually used

- **Level 1 (`PASSIVE_STATIC`)** — outcome `INSUFFICIENT`. Fetched the
  homepage, robots.txt, sitemap.xml, pages-sitemap.xml, and the About
  page. Established identity and platform, and discovered the `agenda`
  and `events` candidate slugs from the homepage's own embedded routing
  data, but could not yet determine whether either slug carries usable
  event data.
- **Level 2 (`STRUCTURAL`)** — outcome `INSUFFICIENT`. Fetched
  `/events` (dead — Wix's own 404) and `/agenda` (real, but empty of
  structured event data by every static means checked), and inspected the
  agenda page's embedded Wix bootstrap/viewer-model JSON for a stable
  public JSON/feed/API path. Found none that wasn't a generic Wix
  platform bootstrap endpoint.
- **No Level 3/4.** This investigation deliberately stopped at Level 2.
  The converging static signals (empty JSON-LD, tiny warmup-data blob,
  sitemap exclusion, marketing-only tagline) already answer the honest
  research question with reasonable confidence, and
  `docs/SOURCE_INVESTIGATION_POLICY.md` explicitly says `DEFER` never
  requires exhausting the ladder or opening a browser merely to prove
  every level was tried. The residual uncertainty (JS could theoretically
  render events a static fetch can't see) is recorded honestly as a MINOR
  blocker rather than resolved by guessing.

## Decision

**`DEFER`.** Every `field_assessment` entry (title, start_date, time,
end, venue_location, source_record_id, event_url, price) is honestly
`NOT_PRESENT` — there is currently no event record anywhere in retained
evidence. `collector_assessment.recommended_family` is left `null`
(recommending a family now would be premature/hypothetical). One `MAJOR`
blocker (no current event data to acquire) and two `MINOR` blockers
(residual JS-rendering uncertainty; no publicly-usable event-specific API
path) are recorded — no `CRITICAL` blocker, and this is not an
access-control/CAPTCHA/paywall situation.

This is a genuine, complete, evidenced `DEFER` — not a failure, and not a
`REJECT` (the venue's Wix Events widget could plausibly be populated with
real events later, in which case a fresh investigation, with `supersedes`
pointing at this one, should re-check it — this record should never be
silently rewritten in place).

## Evidence and reproducibility

All retained evidence lives under `evidence/` in this directory: raw HTTP
response bodies and headers for every fetch (`DIRECT_EVIDENCE`,
`byte_faithful: true`), plus `evidence/offline-proof.mjs` — a
dependency-free, no-network Node script that mechanically re-derives
every claim above from the retained files. Its captured output,
`evidence/offline-proof-output.txt`, is retained as a
`DETERMINISTIC_DERIVATION` evidence item (`ev-offline-proof`) and exits
`0` with all 9 checks passing.

`evidence/validate-record.mjs` is a local, throwaway sanity script (not
itself a governed evidence item) that imports the real
`validateInvestigationV1_1` from `ingestion/source-investigation/contract.mjs`
and confirms `investigation.json` validates with 0 errors under the
policy's own machine-checkable rules.
