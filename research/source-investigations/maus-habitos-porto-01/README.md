# maus-habitos-porto-01

**This is a real trial source investigation, not an activation.** It
follows `docs/SOURCE_INVESTIGATION_POLICY.md` end to end against the live
site at `https://www.maushabitos.com`, and its `decision.status` is
`DEFER` — it does not, and cannot, edit `sources/*.json`, any
`venues/*.json` registry, or public map data. See "Investigation and
activation are separate" in the policy doc.

## What was investigated

Maus Hábitos is an independent cultural centre / club in Porto with a
music programme (R. de Passos Manuel 178, 4º Piso, 4000-382 Porto). A
prior, older repository research pass (`sources/porto.json`, entry id
`maus-habitos`) had already recorded a candidate official site and events
URL, and a finding that the site was entirely client-rendered with "no
server-rendered event markup or discoverable JSON endpoint found." This
investigation treated that only as a **discovery lead** — where to start
looking — and independently re-fetched and re-assessed the live site from
scratch, following the full Level 1 → 2 → 3 escalation ladder.

## Where this investigation agrees and disagrees with the prior note

**Disagrees, on the specific technical claim.** The plain HTTP response
for `https://www.maushabitos.com/en/music-events/` (fetched fresh, today)
contains a genuine server-rendered block of 10 event cards with real
structured fields — title, full date, time, venue, price, description,
and a per-event detail-page URL — plus a directly-referenced, trivially
parseable embedded JSON payload (`window.BndLyrContent`). Neither of
those is true of "no server-rendered event markup or discoverable JSON
endpoint" as the prior note stated. `evidence/offline-proof.mjs`
deterministically proves this extraction works, every time, with no
network access.

**Agrees, on the practical bottom line.** Both investigations land on
"not presently ready for automated acquisition" — but for a different,
more specific reason. This investigation found the actual blocker is
**data currency, not extractability**: every event in the retained sample
carries a CMS-recorded `_updated_at` timestamp from February/March 2023,
unchanged even when the same record is refetched via a much newer
(2026-05-25) platform build. A full pass over the site's own
`sitemap.xml` (2,926 `/events/` entries) found zero events with a 2026
date, and the most recent entry anywhere is from October 2025. Meanwhile
the site's homepage content and weekly opening-hours schedule were
genuinely updated as recently as July 2026 and February 2026
respectively — so the platform itself is clearly still alive and
maintained; it is specifically the discoverable event-listing content
that appears to have stopped being regenerated.

A controlled Playwright browser session (Level 3) against both the
discovery-lead page and the site's current top-nav "Programme" page
confirmed there is no hidden, JS-only, fresher data path either — the
fully-rendered page makes no network request beyond fetching the same
stale content blob already found statically.

## Why the decision is DEFER, not READY_FOR_ACTIVATION

The extraction *mechanism* is proven clean and reproducible — see
`evidence/offline-proof.mjs` / `evidence/offline-proof-output.txt`, which
deterministically re-parses the retained HTML/JSON fixtures with no
network access and confirms every `field_assessment` value in
`investigation.json`. But per
`docs/SOURCE_INVESTIGATION_POLICY.md`'s "Unknown facts must never be
invented" rule, this framework must never fabricate or assume that a
demonstrably 2023-dated sample represents current programming. Since no
genuinely current or future event was found through any path checked
(static HTML, embedded JSON, sitemap, or full browser rendering),
`READY_FOR_ACTIVATION` would be dishonest here even though every other
gate (identity, extraction mechanism, stable-ID strategy, offline proof)
is otherwise well-evidenced. `collector_assessment.blockers` records this
as a single `CRITICAL` blocker rather than several smaller ones, because
it is the one thing standing between this candidate and activation.

## What a future investigator or collector-builder should know

- The acquisition mechanism, if the content were current, would be
  straightforward: either parse the server-rendered HTML event cards
  directly (simplest — the CMS's own relational "rubrica"/title lookups
  are already joined into visible text by the time HTML reaches you), or
  parse the embedded `window.BndLyrContent` JSON (richer per-field data,
  but titles for some events require resolving a `_related` reference to
  another CMS collection not fully mapped in this investigation).
- The site's own URL slug (e.g. `230321-jazz-ii`) is a good stable
  identifier candidate — this investigation empirically verified it
  reappears identically as the listing card's `href` and the individual
  event page's own `<link rel="canonical">`.
- `/en/music-events/` is **not** in the site's current top navigation at
  all (the live nav only has Programme / Art / Restaurants / Store) — it
  may be an orphaned/legacy page. `/en/espetaculos-clubbing/` ("Programme"
  in the current nav) was checked as the natural alternative and turned
  out to be a curated project/minisite hub, not a dated events calendar
  either.
- Before re-investigating, it would be worth checking whether the venue
  has moved its concert-listing publishing to a different mechanism
  entirely (its Instagram/Facebook are both linked from the site footer
  and were not checked here, per the third-party-sources policy — social
  platforms are a discovery lead at most, never first-party authority).
- If this candidate is re-investigated later, it should be filed as a
  **new** investigation (`supersedes: "maus-habitos-porto-01"`), not by
  editing this record in place — see "History and supersession" in the
  policy doc.

## Files

- `investigation.json` — authoritative structured record.
- `evidence/` — retained, bounded evidence: raw HTTP responses and
  headers for the homepage, the discovery-lead events page, the
  embedded-JSON content payloads (listing screen, one sample event's
  detail page, and the homepage), a bounded excerpt of the JS bundle
  referencing a since-decommissioned ticketing integration, the site's
  `sitemap.xml`, the "Programme" page, one full event detail page,
  captured Playwright browser-observation output (network requests +
  rendered-DOM excerpts) for two pages, and the offline proof script +
  its captured output.

Run `node ingestion/source-investigation/validate.mjs` from the repo root
to confirm this record validates; run
`node research/source-investigations/maus-habitos-porto-01/evidence/offline-proof.mjs`
(or `node evidence/offline-proof.mjs` from inside this directory) to
reproduce the deterministic field-extraction proof.
