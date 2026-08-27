# serralves-porto-01

A new, governed source investigation of **Fundação de Serralves** (Porto,
Portugal) — its public `Agenda Serralves` programme page — run under
`BOTM-SOURCE-INVESTIGATION-v1.2`. `investigation.json` is authoritative;
this file is explanatory only, per
`docs/SOURCE_INVESTIGATION_POLICY.md`.

Nothing in this directory changes `sources/*.json`, any `venues/*.json`
registry, `venues/manual-coordinates.json`, or public map data.
`investigation.json` records a research conclusion, not an activation.

## Starting point

`sources/porto.json`'s existing `serralves` entry (`lifecycle_status:
"DISCOVERED"`, `monitoring_status: "NEEDS_TECHNICAL_REVIEW"`,
`acquisition_method: "UNKNOWN"`) already noted: *"Same client-rendered
'bond-frontend' platform directly observed for maus-habitos and
agenda-vila-do-conde ... no server-rendered event markup or discoverable
JSON endpoint found within this bounded search."* That note was treated
strictly as a **discovery lead**, not assumed — this investigation
independently re-fetched the live site from scratch and reached a
materially different, more complete finding for the platform question,
while independently confirming the platform identification itself.

## What this investigation found

**The platform is the same `bond-frontend`/`bndlyr.com` builder already
investigated for Maus Hábitos** (`research/source-investigations/
maus-habitos-porto-01/`, same `X-Server-Name: bond-frontend` header). But
where Maus Hábitos' discoverable listing pages were an empty client-rendered
shell, Serralves' agenda page IS server-rendered and carries 16 embedded
schema.org JSON-LD `Event` blocks directly in the plain HTML.

That JSON-LD, however, turned out to be **insufficient** for two concrete,
evidenced reasons (Level 1, `probe_history[0]`):

1. Every one of the 16 blocks' own `startDate`/`endDate` spans more than 14
   days — several span 6-12+ months (e.g. the Jenny Holzer exhibition:
   18 Jun - 1 Nov 2026). These are **exhibition/programme-run dates**, not
   individually-dated activities or concerts.
2. Every block's `organizer`/`location`/`performer` `"name"` field is an
   opaque, unresolvable placeholder token (e.g. `"nkAuLJivT2J"`) — the same
   literal token on all 16 blocks, proven (mechanically, in
   `evidence/offline-proof.mjs`) to not resolve to any real string anywhere
   in this investigation's retained evidence.

Escalating to Level 2 (`STRUCTURAL`) — inspecting the same page's own
publicly-referenced embedded JSON content payload (`window.BndLyrContent`,
loaded from a `<script src>` the page itself declares, exactly like the
mechanism already investigated for Maus Hábitos) — found the real answer:
a 27-item, **individually-dated** public activities data set (repeater id
`cmLWMdoHxiBolXCW`, sorted by the source's own `datetime_data_de_inicio`
field, spanning 21 Aug - 21 Nov 2026 at the time of this investigation),
each item carrying a real title, date/time, display venue, a
mechanically-resolvable category, price/ticket text, and a canonical URL
slug. This data path is genuinely richer than the JSON-LD, and is not
affected by the broken organizer/location placeholder-token bug (its own
`text_display_local` field is populated directly). One representative item
was cross-checked against a live, independently-fetched detail page and
matched verbatim. No browser/headless session was used anywhere in this
investigation — everything above was reached via plain `curl` at Levels 1
and 2 only.

## The honest music-content finding — why this is `DEFER`, not `READY_FOR_ACTIVATION`

This task explicitly asked for an honest assessment of whether Serralves'
agenda is genuinely music, or overwhelmingly something else. It is
overwhelmingly something else.

Of the 27 individually-dated activities in this investigation's retained
window:

| Category (source's own taxonomy) | Count |
|---|---|
| SESSÃO DE CINEMA (film screenings) | 10 |
| Oficinas (workshops) | 4 |
| Performance | 3 |
| Visitas (guided tours) | 2 |
| Conversas e Conferências (talks) | 1 |
| Festival (BOIL — a climate festival, not music) | 1 |
| Book presentation | 1 |
| Feira do Livro (book fair appearance) | 1 |
| Uncategorised (untitled draft, summer-holidays block, book-fair item, autumn festival) | 4 |

Only the 3 `Performance` items are even plausibly music, and only **one**
of those three is: **`STEPHEN O'MALLEY & CONTRECHAMPS`** (13 Sep 2026,
Auditório do Museu), part of a 2026 "focus" series on musician Stephen
O'Malley whose own linked description explicitly names concerts, Sunn O))),
and several named ensembles/orchestras (Contrechamps, Alponom, ONCEIM, ars
ad hoc). The other two `Performance` items (`PONCILI CREACIÓN`,
`PERFORMANCE Sitters`) read as performance-art/theatre by their own titles
and are not corroborated as music anywhere in this investigation's retained
evidence.

Critically, this investigation searched **every** category/cycle name
anywhere in the entire retained content blob (all 30 repeaters and their
`related{}` lookup tables — see `evidence/offline-proof-output.txt`) and
found **no category literally named Music/Música/Concert/Concerto**. The
closest available category, `Performance`/`Artes Performativas`, mixes
music and non-music performing arts with no further source-provided
sub-classification. There is therefore no reliable, mechanical signal a
collector could filter on to isolate genuine live-music events from
Serralves' much larger non-music programme, short of reading each item's
own free-text description and making a content judgement call — exactly
the kind of AI/content-based inference
`docs/SOURCE_INVESTIGATION_POLICY.md`'s "What may AI NOT infer?" section
prohibits as the sole basis for automated inclusion.

**This is a content-composition/curation blocker, not a technical-extraction
blocker.** The acquisition mechanism itself is clean and fully proven
(`evidence/offline-proof.mjs`, 33/33 checks passing, zero network access).
If Serralves' own site later adds a genuine Music/Concert sub-category, or
a human curator is willing to hand-select which `Performance` items are
music on a recurring basis, a follow-up investigation would very likely
reach `READY_FOR_OFFLINE_PROOF` or better quickly, since the rest of the
pipeline (title/date/venue/price/URL extraction) already works. This
investigation's retained window also did not happen to contain any
`Serralves em Festa` festival dates (mentioned in `sources/porto.json`'s
existing `overlap_notes` as historically a major multi-stage music event) —
a future investigation timed closer to that festival's actual dates could
reasonably re-open this question with fresh, more favourable evidence.

## Two honestly-documented `PARTIAL`/`NOT_PRESENT` findings

- **`time`** is `PARTIAL`, not `PROVEN`, despite a directly-stated `"19:00"`
  display value: the underlying ISO-shaped `datetime_data_de_inicio` field
  carries a trailing `"Z"` (UTC) suffix, but its clock value is identical to
  the displayed local time (`19:00`) — the signature of a floating
  local-time value with a mislabelled `Z` appended, not a real UTC
  conversion (a true 19:00 WEST performance would serialise as `18:00Z` in
  September, not `19:00Z`). No explicit timezone/offset is stated anywhere
  in the retained evidence, so this is recorded honestly as a floating
  local time only.
- **`end`** is `NOT_PRESENT`: the backend `datetime_data_de_fim` field is
  populated, but never rendered in any publicly-visible text this
  investigation found (list display or detail page) — an internal field is
  not the same as a source-published fact.

## Decision

`decision.status: "DEFER"` — a **research conclusion only**. See
`investigation.json`'s `decision.reasons` for the full, evidenced
rationale. This package does **not** modify `sources/*.json`, any
`venues/*.json` registry, manual coordinates, public map data, or scheduler
configuration, and does not build or enable any collector.
