# casino-estoril-01

Non-authoritative explanation for a human reader. **`investigation.json` is
the authoritative record** — this file never overrides it, and the
validator never reads this file. See `docs/SOURCE_INVESTIGATION_POLICY.md`
for the governing policy.

## What was investigated

**Casino Estoril — Música ao Vivo**, a near-weekly (Wed–Sun) live-music slot
in the "Lounge D" room at Casino Estoril, Av. Dr. Stanley Ho, 2765-190
Estoril, Cascais municipality. The task came in with a loose prior-research
lead (`sources/lisbon.json`'s `casino-estoril-musica-ao-vivo` entry, status
`NEEDS_TECHNICAL_REVIEW`). This investigation treated that note as a
discovery lead only and independently re-verified everything itself against
freshly retained evidence.

- Homepage: `https://casino-estoril.pt` (302 → `https://casino-estoril.pt/pt/home`)
- Candidate events page (given, and verified correct):
  `https://casino-estoril.pt/pt/agenda/musica-ao-vivo`
- Independently discovered: `https://casino-estoril.pt/assets/json/agenda_content.pt.json`
  — a public JSON data asset referenced directly by the agenda page's own
  inline `<script>`, containing structured records for every agenda listing
  site-wide, including this exact candidate.

## What was found

The candidate page is genuinely server-rendered PHP HTML (not a
client-rendered SPA shell), and its own inline `<script>` references a
publicly-fetchable JSON asset that duplicates and structurally confirms the
same content. Together, these retained sources reliably expose:

- **who is performing** — 8 named performers, each with their days of the
  month (e.g. `VANESSA FERREIRA - 1, 29 de Agosto`);
- **where** — the room (`Lounge D`), combined with the venue's own
  independently-retained street address;
- **the default nightly time window** — `22h00 à 00h30`, with one
  documented per-night exception (`MANUEL MELO - 8 de Agosto, 23h00`)
  proving the shared default is not universal;
- **admission** — `ENTRADA: LIVRE*` (free, with an asterisked minimum-
  consumption condition for seated bar-area seating on Fri/Sat/themed
  nights).

**The blocker: no year, anywhere.** Every one of the 8 listed dates states
only a day-of-month and the month name ("de Agosto") — never a year. The
JSON asset's own `date_begin`/`date_end` fields do not resolve this: they
were empirically proven (via `offline-proof.mjs`, and via a cross-check
against a genuinely one-off, specifically-dated show — "ABBA MIA" — in the
same retained JSON) to be a generic content-visibility window the CMS uses
site-wide, not the real occurrence date. More than one real August (2026
and 2027) falls inside that window. Inferring "2026" merely because that is
the current real-world date would be exactly the `AI_INFERENCE` pattern
`docs/SOURCE_INVESTIGATION_POLICY.md` prohibits from ever being `PROVEN` —
so this investigation does not do that.

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was used, and it was `SUFFICIENT` — the
candidate page's own server-rendered HTML, plus a JSON asset it references
directly, already exposed everything needed to reach a well-evidenced
conclusion, including the negative finding that no year is published
anywhere on this source. No escalation to Level 2/3/4 was attempted: the
blocker is an absence of data in the source's own output, not a
client-rendering or hidden-endpoint problem a deeper probe could resolve.

## Decision

**`DEFER`.** Most fields are honestly strong (`title`, `time`, `end`,
`venue_location`, and `price` all reach `PROVEN` with cited, retained,
mechanically-reproduced evidence), but `field_assessment.start_date`
honestly reaches only `AMBIGUOUS` — day and month are known, the calendar
year is not, and no retained first-party context resolves it mechanically.
Because the year cannot be established, `source_record_id`'s otherwise-
obvious alternative strategy (a composite `slug + calendar date` key, as
used successfully in `fama-dalfama-lisbon-01`) is not safely constructible
either. `collector_assessment.blockers` records this honestly as one
`CRITICAL` blocker (plus three `MINOR` ones) — `READY_FOR_ACTIVATION`
explicitly requires no unresolved `CRITICAL` blocker, and this investigation
does not attempt to force that gate.

This is a legitimate, complete, evidenced investigation outcome, not a
failure — see `docs/SOURCE_INVESTIGATION_POLICY.md`'s "Level 5 — Defer"
section. This decision is a research conclusion only. It does not edit
`sources/*.json`, any `venues/*.json` registry, or the existing
`casino-estoril-musica-ao-vivo` entry in `sources/lisbon.json` in any way.

## Evidence

All evidence lives under `evidence/`:

- `body-home.html` (empty) / `headers-home.txt` — bare-domain 302 redirect.
- `body-home-pt.html` / `headers-home-pt.txt` — the redirected homepage.
- `body-agenda.html` / `headers-agenda.txt` — the candidate "Música ao
  Vivo" page (the 8-performer/day summary, sidebar contact box).
- `body-agenda-content.json` / `headers-agenda-json.txt` — the publicly-
  referenced site-wide agenda JSON asset (49 records, including this exact
  candidate and the "ABBA MIA" comparison record).
- `body-sobre.html` / `headers-sobre.txt` — the venue's own "Sobre/
  Contactos" page (independent identity/address confirmation).
- `offline-proof.mjs` — dependency-free, no-network Node script that
  re-parses the retained files above and mechanically re-derives every
  claim in `investigation.json`'s `field_assessment`, including the
  zero-year-token scan and the `date_begin`/`date_end` multi-year and
  "ABBA MIA" cross-checks.
- `offline-proof-output.txt` — captured stdout of running that script;
  cited in `investigation.json` as the `DETERMINISTIC_DERIVATION` evidence
  item.
- `validate-mine.mjs` — a local, one-off sanity check (not itself a
  governed evidence item) that imports `validateInvestigationV1_2` from
  `ingestion/source-investigation/contract.mjs` and confirms
  `investigation.json` passes with zero errors.
