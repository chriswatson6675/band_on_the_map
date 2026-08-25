# gulbenkian-lisbon-01

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

**Fundação Calouste Gulbenkian** (Lisbon, Portugal) is a large, broad
cultural foundation — museum, gardens, an in-house orchestra and choir,
exhibitions, talks, film, education, **and** a dedicated concert
programme branded "Gulbenkian Música". This investigation targeted only
the music/concert programming, not the foundation's much wider cultural
calendar.

No confirmed official-events-URL existed anywhere in this repository's
registries for Gulbenkian before this investigation (unlike Hard Club or
Maus Hábitos). `https://gulbenkian.pt/musica/agenda/` was located via
`WebSearch` purely as a **discovery lead** — never treated as evidence —
and then independently confirmed by this investigation's own retained,
byte-faithful `curl` fetches.

## How music was distinguished from Gulbenkian's broader programme

The source itself exposes an explicit event-type taxonomy on every event
card of its `/musica/agenda/` list page (`<li class="fcg-card__meta-item">`):
of the 24 event cards retained in `evidence/body-musica-agenda.html`, **22
are tagged `Concerto`** and **2 are tagged `Transmissão`** (a broadcast/relay
screening of an opera performance elsewhere, not a live concert at this
venue). This investigation used that source-provided tag to define the
music/concert sample — `Concerto` — and explicitly excluded `Transmissão`
as well as the foundation's separately-programmed exhibitions, talks,
theatre, film, and education activities, which were never fetched or
sampled here at all (the `/musica/agenda/` URL itself is already scoped to
the music programme, distinct from the foundation's general `/agenda/`).
This is not a guess "from vibes" — it is the source's own stated category,
retained as evidence and mechanically re-verified in
`evidence/offline-proof.mjs`.

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was attempted, and it was
**`SUFFICIENT`** — no escalation to Level 2/3/4 was needed or attempted.
A single `curl` GET of the list page already returned fully
server-rendered event cards (title, date/time text, category tag, a stable
numeric `data-event-id`, and a detail-page link) for every event. Following
five of those links to their own detail pages, each also a plain `curl`
GET, returned pages carrying a complete `schema.org` `JSON-LD`
`MusicEvent`/`Event` block (name, start/end date-time, location, organizer)
plus a static price/admission DOM node. No JS bundle inspection, API
discovery, or browser session was ever needed.

## Bounded sample

Five music/concert events were fetched and cross-checked end-to-end
(list-page card → detail page → JSON-LD → offline re-parse):

- Vale do Silêncio (2026-09-05, off-site outdoor concert, free admission)
- Oedipus Rex (two performances: 2026-10-01 and 2026-10-02; price range
  shown; deliberately kept because it exposed a real multi-session-id
  nuance — see below)
- Kafka-Fragmente (2026-09-09, free admission)
- Quarteto Diotima (2026-09-12, free admission)
- Beatrice Rana (2026-10-11, price range shown)

The list page itself carries 22 `Concerto`-tagged cards in total (through
early November 2026); only five were fetched to detail-page depth to keep
evidence bounded, per policy.

## Real nuances found and honestly recorded (not smoothed over)

- **Multi-session productions share one source-level id.** Oedipus Rex's
  two performances (2026-10-01, 2026-10-02) share a single top-level
  `data-event-id` / JSON-LD `@id` (106764); the individual dates live only
  in an un-identified `subEvent[]` array. `field_assessment.source_record_id`
  is marked `PROVEN` (the id itself is genuinely stable and
  source-documented — reproduced identically across list page and detail
  page for all 5 sampled events), but its `notes` spell out that a future
  collector needs a composite key (`id + subEvent.startDate`) per
  performance, not the id alone — the same class of lesson this repository
  already learned from Hot Clube de Portugal's non-stable ICS `UID`.
- **The source's own structured data can disagree with itself.**
  Oedipus Rex's top-level JSON-LD `eventStatus` reads `EventCancelled`
  while both of its own `subEvent[]` entries read `EventScheduled` (and
  the list page displays a normal "Bilhetes disponíveis" label for it).
  Recorded as a `MINOR` blocker, not silently resolved by guessing which
  field is "right".
- **Title-derived URL slugs are not safe to guess.** This investigation
  first tried `https://gulbenkian.pt/musica/agenda/beatrice-rana/` (no
  numeric suffix) and got a real `200 OK` — but for a stale, unrelated
  2020-03-24 Beatrice Rana concert (JSON-LD `@id .../Event/65829`), not the
  2026-10-11 performance actually on the current agenda (real slug:
  `beatrice-rana-4`, discovered only via the list page's own `href`). Both
  the stale and the correct fetch are retained as evidence
  (`ev-detail-beatrice-stale`, `ev-detail-beatrice-current`) specifically
  to make this trap visible rather than silently avoided.
- **Timing is floating-local, not a confirmed UTC instant.** JSON-LD
  `startDate`/`endDate` are given as `YYYY-MM-DD HH:MM:SS` with no
  timezone/offset anywhere in the retained evidence. Recorded as `PROVEN`
  (the value is genuinely and reliably present) but never promoted to a
  fabricated UTC timestamp.

## Discrepancy with the older, loose repository note

`docs/LISBON_PORTO_VENUE_ESTATE_01.md` mentions in passing that "this
session's own contacts-page fetch was blocked (403)" for Gulbenkian, flagged
there as "a genuine gap worth a dedicated technical pass". This
investigation independently re-fetched `https://gulbenkian.pt/contacte-nos/`
just now (plain `curl`, same UA as everything else here) and got a normal
`200 OK` with a full contacts page (`evidence/body-contacte-nos.html`) — no
403 was observed. The old note was treated strictly as a loose
discovery-lead/hint per this task's instructions, never as a conclusion to
carry forward; **current, independently retained evidence wins**, and the
disagreement is recorded honestly (in `identity.notes`) rather than
silently reconciled or assumed to still hold. It's possible the old block
was transient, targeted a different path, or has simply been fixed/changed
since — this investigation does not speculate further than what it
actually observed today.

## Offline proof

`evidence/offline-proof.mjs` is a small, dependency-free, **no-network**
Node script that re-parses the retained HTML/JSON-LD fixtures in this
directory and mechanically re-derives every claim above: the
`Concerto`/`Transmissão` taxonomy, the list-page-id-to-detail-page-`@id`
match for all 5 sampled events, per-event title/date/location/price
extraction, and the Oedipus Rex `eventStatus` self-disagreement. Run with
`node evidence/offline-proof.mjs`; its captured stdout is retained at
`evidence/offline-proof-output.txt` and cited as the investigation's
`DETERMINISTIC_DERIVATION` evidence item. It exited `0` with every check
passing.

## What a future investigator/collector-builder should know

- Recommended collector family: `JSON_LD` — fetch the list page to enumerate
  current `Concerto`-tagged event hrefs (never construct slugs), then fetch
  each href and parse its `schema.org` `MusicEvent`/`Event` JSON-LD block;
  read price/admission text from the static `dd.fcg-event-ticket-price__value`
  node.
- Handle multi-date productions via `subEvent[]`, not the top-level
  start/end/eventStatus fields alone.
- Re-review the `fcg-card__meta-item` category vocabulary periodically —
  this investigation only observed `Concerto` and `Transmissão` within its
  bounded sample window; other category values may exist elsewhere on the
  site or appear in future.
- No CRITICAL blockers were found. Three MINOR blockers are recorded in
  `collector_assessment.blockers` (id granularity, `eventStatus`
  self-inconsistency, unsafe slug-guessing) — all workable, none blocking a
  future collector build.
