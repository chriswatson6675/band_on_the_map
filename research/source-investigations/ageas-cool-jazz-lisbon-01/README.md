# ageas-cool-jazz-lisbon-01

**This is a real trial investigation of a real festival/source candidate —
not activation.** Reaching any `decision.status` in `investigation.json` is
a research conclusion only. It does not edit `sources/*.json`, any
`venues/*.json` registry, or public map data. This investigation did not
touch `sources/lisbon.json`'s existing `ageas-cool-jazz` entry in any way.

`investigation.json` is the authoritative structured record. This file is
explanatory only, per policy.

## What was investigated

**Ageas Cool Jazz** (formerly EDP Cool Jazz), an annual jazz/pop festival at
Cascais, Portugal, already has a `DISCOVERED` entry in `sources/lisbon.json`
(id `ageas-cool-jazz`) naming `https://ageascooljazz.pt` as its official
website and `https://ageascooljazz.pt/cartaz.html` ("cartaz" = lineup
poster) as its events URL. This investigation independently re-fetched and
retained both pages from scratch, plus one guessed schedule-page path and
one bounded cross-check of the festival's own linked ticketing widget.

## The multi-venue hypothesis was not confirmed

This task's brief raised a strong possibility that the festival spans
**several distinct physical venues**. This investigation's retained
evidence does **not** support that: the only physical venue name/address
found anywhere in the full text of either retained page is **"Hipódromo
Manuel Possolo", Cascais**. The festival does have up to **three named
stages** within that one site — the main "Ageas" stage, a secondary
**"Cascais Jazz Sessions by Smooth FM"** stage, and a "Late Night" stage —
but nothing in the retained evidence places any of them at a different
physical address. `sources/lisbon.json`'s own `physical_address` for this
candidate also names "Parque Marechal Carmona" as a second location; that
string was searched for explicitly (`evidence/offline-proof.mjs`) and never
found anywhere in this edition's retained content — recorded honestly in
`identity.notes` as a discrepancy with the registry's own prior note, not
silently reconciled or assumed still accurate.

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was attempted, and it was
**`SUFFICIENT`**. Plain `curl` GETs of `cartaz.html` and the homepage both
returned fully server-rendered static HTML — a hand-built microsite (CSS
class naming matches the "Blocs" desktop site-builder, e.g. `l-bloc`), no
WordPress/CMS fingerprint, no schema.org JSON-LD, RSS, ICS, or JSON API
anywhere. One guessed schedule-page path (`horarios.html`) returned a plain
404; one bounded cross-check of the festival's own linked ticketing-widget
page returned HTTP 410 Gone (sold out). Neither changed the core finding,
and Level 2/3/4 were never attempted.

## The 8 festival nights found

The cartaz page's own `<title>` ("CARTAZ - 08 a 31 JULHO 2026 / CASCAIS")
states a single 2026 edition-year context; retained first-party prose
independently confirms the source's own claim of "8 nights this edition"
(*"acrescentando um dia aos usuais 7 do festival"* — an 8th night added to
the usual 7). All 8 resolve to one unambiguous `2026-07-DD` date each,
mechanically reproduced in `evidence/offline-proof-output.txt`:

| Date | Headliner | Ticket link present? | Venue/stage restated? |
|---|---|---|---|
| 2026-07-08 | Gilberto Gil | yes | yes (Hipódromo Manuel Possolo) |
| 2026-07-14 | David Byrne | **no** | yes (Hipódromo Manuel Possolo) |
| 2026-07-15 | Loyle Carner | yes | yes (Hipódromo Manuel Possolo) |
| 2026-07-18 | Jamiroquai / Moullinex | **no** | yes (Cascais Jazz Sessions stage) |
| 2026-07-22 | Diana Krall | yes | yes (Hipódromo Manuel Possolo + Cascais Jazz Sessions) |
| 2026-07-25 | Franz Ferdinand | yes | **no venue/stage text found** |
| 2026-07-29 | Scissor Sisters | yes | yes (Hipódromo Manuel Possolo + Late Night) |
| 2026-07-31 | Chet Faker | yes | **no venue/stage text found** |

These 8 headline-artist + date pairs are retained here for later, separate
venue-registry work, per this task's own instructions — no `venues/*.json`
entry was created or edited by this investigation.

## Real nuances found and honestly recorded (not smoothed over)

- **The source's own `div id` attributes are unreliable as a date key.**
  The block whose `id="desk-cartaz-dia12"` mentions "12 de julho" **zero**
  times in its own body and is entirely about 22 July (Diana Krall / Gisela
  Mabel) instead — a genuine copy/rename bug in the source's own markup,
  empirically demonstrated in `evidence/offline-proof.mjs` (both blocks
  covering 22 July independently resolve to the same date despite one
  carrying the misleading id `dia12`). A collector must parse dates from
  the block's own prose text, never from its `id`.
- **Date basis is genuinely mixed.** 4 of 8 nights (14, 15, 22, 25 July)
  restate the year directly in their own prose (`basis: DIRECT_SOURCE`);
  the other 4 (8, 18, 29, 31 July) state only day+month locally and need
  the page-title's year context (`basis: DETERMINISTIC_CONTEXT`, with a
  `derivation` object per policy `v1.2`). All 8 are proven reproducible
  offline.
- **Ticket links are incomplete.** 2 of 8 nights (14, 18 July) have no
  ticket-purchase link at all in the retained evidence — not every night is
  equally "finished" on the source's own page.
- **A present ticket link does not mean a live, purchasable page.** The one
  ticket link this investigation independently re-fetched (Gilberto Gil, 8
  July) returned HTTP 410 Gone with a "no tickets available" message, not a
  200 OK purchase flow.
- **Venue/stage text is not restated on every night.** 2 of 8 nights (25,
  31 July) name neither the venue nor a stage anywhere in their own
  retained prose. This investigation deliberately did **not** promote
  `venue_location` to `PROVEN`/`DETERMINISTIC_CONTEXT` for those nights
  merely because the page's global `<meta name="keywords">` also mentions
  "Hipódromo Manuel Possolo" once — per policy, a value appearing once at
  page level, without genuinely demonstrable per-event structural
  containment, is not a safe inheritance basis. `venue_location` is
  honestly `PARTIAL`, not `PROVEN`.
- **No set/door times found anywhere in retrievable text.** `time` and
  `end` are both `NOT_PRESENT` — if times exist at all, they most likely
  live only inside the poster image assets, which this investigation did
  not OCR.
- **No stable first-party record id exists.** `source_record_id` stays
  `UNKNOWN`; the only id-like value present belongs to the third-party
  ticketing widget, was never re-tested for stability, and one sampled
  instance already returned 410 Gone during this very investigation. An
  alternative composite-key strategy (headline artist + derived date) is
  documented in `field_assessment.source_record_id.notes`.
- **Each night is a multi-act bill, not a single show.** One headliner plus
  several supporting acts across up to three named stages. This
  investigation intentionally does not decide whether Band on the Map
  should model only headliners, or every named performer, as distinct
  Observations — that is a product/architecture decision left open, not
  smoothed over.

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script that re-parses the retained `body-cartaz.html` fixture and
mechanically re-derives every claim above: the page-title edition context,
all 8 distinct festival nights, the `dia12`/`dia22` id-vs-content mismatch,
ticket-link and venue/stage coverage per night, and the mixed
`DIRECT_SOURCE`/`DETERMINISTIC_CONTEXT` date derivation. Run with
`node evidence/offline-proof.mjs`; its captured stdout is retained at
`evidence/offline-proof-output.txt` and cited as this investigation's
`DETERMINISTIC_DERIVATION` evidence item. It exited `0` with every check
passing.

## Decision: `READY_FOR_OFFLINE_PROOF`

`title` and `start_date` both reach `PROVEN`, and the formal
`READY_FOR_ACTIVATION` gates in `docs/SOURCE_INVESTIGATION_POLICY.md` are
not strictly blocked (no `CRITICAL` blocker, `source_record_id` has a
documented alternative strategy, an offline `DETERMINISTIC_DERIVATION`
proof exists). This investigation nonetheless stops at
`READY_FOR_OFFLINE_PROOF` rather than `READY_FOR_ACTIVATION`, because three
`MAJOR` blockers are genuinely unresolved: the source's own unreliable
`div id` attributes, the inherent fragility of parsing marketing prose
rather than a structured feed or repeated card, and the open
headliner-vs-full-bill modelling question. `collector_assessment
.recommended_family` is `NEW_FAMILY_REQUIRED` — no existing family (JSON_LD,
ICS, a repeated static card family) matches this source's actual shape.

## What a future investigator/collector-builder should know

- Recommended next step: a bespoke, prose-pattern-based extractor —
  `NEW_FAMILY_REQUIRED`, not an existing collector family.
- Never key dates off `desk-cartaz-diaNN` div ids; parse from each block's
  own `"DD de <mês>"` prose text.
- Combine the page's own `<title>` year context with each block's own
  day+month per the `derivation` rule in `field_assessment.start_date`.
- Re-verify ticket-link liveness at collection time — presence in HTML does
  not imply purchasability.
- A human/product decision is needed on event granularity (headliner-only
  vs. every named performer) before a collector is built.
- No `CRITICAL` blockers were found. Three `MAJOR` and four `MINOR`
  blockers are recorded in `collector_assessment.blockers` — all workable,
  none blocking future work, but real enough to justify stopping at
  `READY_FOR_OFFLINE_PROOF` rather than `READY_FOR_ACTIVATION` today.
