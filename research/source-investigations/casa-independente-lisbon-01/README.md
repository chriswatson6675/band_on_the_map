# casa-independente-lisbon-01

**This is a real trial investigation of a real venue/source candidate — not
activation.** `decision.status` here is `READY_FOR_OFFLINE_PROOF`, a
research conclusion only. It does not edit `sources/*.json`, any
`venues/*.json` registry, or public map data. Turning this candidate into
an active collector is a separate, explicitly-authorised step — see
"Investigation and activation are separate" in
`docs/SOURCE_INVESTIGATION_POLICY.md`.

`investigation.json` is the authoritative structured record. This file is
explanatory only, per policy.

## What was investigated

**Casa Independente** — Largo do Intendente 45, 1100-285 Lisboa, Portugal.
The task's context note described it as "an 1863 mansion operated under a
cultural-association model, concerts/parties" — this investigation treated
that note strictly as an unverified lead and independently re-confirmed
what it could from the venue's own retained pages: the `/sobre/` (about)
page's own prose states the building was "construído em 1863" and that
the venue "nasceu em 2012, no coração do Largo do Intendente, em Lisboa,
fundada por Inês Valdez e Patrícia Craveiro Lopes." No "cultural
association" legal-form language was found on the venue's own public pages
within this bounded sample — that specific framing from the task prompt was
neither confirmed nor denied here, so it is not asserted as fact anywhere
in `investigation.json`.

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was attempted, and it was
**`SUFFICIENT`** — no escalation to Level 2/3/4 was needed. Plain `curl`
GETs of the homepage, `/agenda/`, `/contactos/`, and `/sobre/` all returned
fully server-rendered HTML with no client-side rendering, no bot-block, and
no CAPTCHA. No JS bundle inspection, API discovery, or browser session was
ever needed.

## The events page itself

`https://casaindependente.com/agenda/` (the candidate URL given in the
task, verified correct — no redirect, 200 OK) is **not** built on a
calendar plugin, JSON-LD, RSS, or ICS. It is a hand-authored WordPress /
Elementor page: one page-level month/year heading (`Agosto 2026`, the only
one present in this fetch), followed by four sequential per-event blocks,
each a weekday name + `DD MES` day/month + `HH` hour heading, an
event-type heading (`DJ Set` on all four sampled events), and an
artist-name heading. No JSON-LD `Event`/`MusicEvent`, no ICS export, no
`data-event-id` or similar attribute, and **no per-event URL** exist
anywhere on the page.

## Bounded sample

All four events currently shown on the page were retained and cross-checked
(the entire visible agenda at fetch time — nothing was cherry-picked):

- DIDI — Fri 2026-08-21, 23H, DJ Set (already past relative to the fetch
  date of 2026-08-25)
- Jayde & Lagryma — Sat 2026-08-22, 23H, DJ Set (already past)
- Patisol — Fri 2026-08-28, 23H, DJ Set (future)
- Fatumata — Sat 2026-08-29, 23H, DJ Set (future)

Only four events were visible in total in this fetch — the whole agenda,
not a truncated sample of a longer list. Two of the four are already in
the past as of the fetch date; this is recorded honestly rather than
silently dropped.

## The year-inference cross-check

No event card states its own year — only day + month abbreviation. The
year is stated exactly once, in the single page-level "Agosto 2026"
heading, which this investigation combined with each card's day/month to
derive a full date. To avoid this being an unverified assumption,
`evidence/offline-proof.mjs` performs a genuine mechanical cross-check:
for each derived date, it computes the actual day-of-week by pure calendar
math and compares it against the source's own weekday label on that same
card (e.g. "SEXTA FEIRA" = Friday). All 4/4 sampled events matched. This
is real corroboration, not a guess based on "today's date" — but it only
proves the heading-governs-all-cards assumption held for *this* fetch of
*this* single month; it does not prove how the page behaves once it spans
a month boundary, which this investigation never observed (see blockers
below).

## Real nuances found and honestly recorded (not smoothed over)

- **No per-event id or URL exists at all.** Unlike `gulbenkian-lisbon-01`
  (which had a numeric id and a detail-page URL per event), this source
  gives a collector nothing to anchor identity or a canonical link to.
  `field_assessment.source_record_id` and `field_assessment.event_url` are
  both honestly `NOT_PRESENT`, with an explicit alternative composite-key
  identity strategy documented in `source_record_id.notes` (never proven,
  never silently invented).
- **The weekday label is inconsistently formatted even in this small
  sample.** "SEXTA FEIRA" (event 1) vs "SEXTA" (event 3) for the same
  weekday — evidence the page is hand-typed per event, not
  template-generated. This does not currently break date parsing (only the
  numeric `DD MES` line is load-bearing), but it is recorded as a MAJOR
  blocker signal that the page could drift in less predictable ways too.
- **Only one month was ever observed.** The retained fetch shows exactly
  one month/year heading. This investigation cannot say from this one
  fetch alone how the page structures multiple months (a second heading?
  do past events get removed? does the whole page get replaced each
  month?) — recorded as a MAJOR blocker, not glossed over.
- **No price and no end time are exposed** for any sampled event — both
  honestly `NOT_PRESENT` rather than invented.

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script that re-parses the retained HTML fixtures in this directory
and mechanically re-derives every claim above: the single month/year
heading, the 4 per-event blocks, the year-inference + weekday cross-check
for all 4 events, the weekday-label formatting inconsistency, and the
independent about/contacts-page identity corroboration (1863 building
date, 2012 founding date, address, email). Run with
`node evidence/offline-proof.mjs`; its captured stdout is retained at
`evidence/offline-proof-output.txt` and cited as the investigation's
`DETERMINISTIC_DERIVATION` evidence item. It exited `0` with every check
passing.

## Why the decision is `READY_FOR_OFFLINE_PROOF`, not `READY_FOR_ACTIVATION`

The mechanical activation gates in `ingestion/source-investigation/contract.mjs`
would technically permit `READY_FOR_ACTIVATION` here (identity is PROVEN,
`title`/`start_date` are PROVEN, `source_record_id` has a documented
alternative strategy, a `DETERMINISTIC_DERIVATION` evidence item exists,
and no blocker is `CRITICAL`). This investigation deliberately stops one
step short of that anyway, because the honest substance of what was found
— no id, no per-event URL at all, a hand-typed page with already-observed
formatting drift, and a year-inference strategy validated against only one
single-month page state — is not yet a safe basis for recommending an
active collector. The recommended next step is a **second observation of
the same `/agenda/` URL after the calendar rolls into September 2026**,
specifically to see how the page's month-heading structure behaves across
a real month boundary, before any future investigation (a new
`investigation_id`, `supersedes`-linked back to this one) reconsiders
`READY_FOR_ACTIVATION`.

## What a future investigator/collector-builder should know

- Tentative recommended collector family: `STATIC_EVENT_LIST` — fetch the
  agenda page, parse the single month/year heading plus the sequence of
  event blocks, and diff against the previous fetch to detect
  additions/removals (there is no id to diff against, only the
  synthesized composite key).
- Do not trust the shared `/agenda/` URL as a per-event `event_url` — no
  unique per-event URL exists on this source at all.
- Re-observe across a month boundary before trusting the
  single-heading-governs-all-cards year assumption in production.
- No `CRITICAL` blockers were found. Two `MAJOR` blockers (no stable
  identity/URL at all; unverified multi-month heading behaviour) and two
  `MINOR` blockers (weekday-label formatting drift; no price/end-time
  data) are recorded in `collector_assessment.blockers`.
