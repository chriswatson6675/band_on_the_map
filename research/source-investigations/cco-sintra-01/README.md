# cco-sintra-01

Non-authoritative explanation for a human reader. **`investigation.json` is
the authoritative record** — this file never overrides it, and the
validator never reads this file. See `docs/SOURCE_INVESTIGATION_POLICY.md`
for the governing policy.

## What was investigated

**Centro Cultural Olga Cadaval**, Sintra's primary large concert venue (two
auditoria: Auditório Jorge Sampaio and Auditório Acácio Barreiros), Praça
Dr. Francisco Sá Carneiro, 2710-720 Sintra, Portugal — operated by Câmara
Municipal de Sintra. The task came in with a loose prior-research note
(`sources/lisbon.json`'s `cco-sintra` entry) claiming "stable per-event
permalinks combining an id/slug/date pattern" and `monitoring_status:
NEEDS_TECHNICAL_REVIEW`. This investigation treated that note as a lead
only, and independently re-verified everything itself against freshly
retained evidence.

- Homepage: `https://ccolgacadaval.pt`
- Candidate events page (given, and verified correct — no correction
  needed): `https://ccolgacadaval.pt/agenda`

## What was found

The candidate events page is a fully server-rendered **Joomla** site
running the **iCagenda** (`com_icagenda`) events-calendar extension — a
genuine, identifiable off-the-shelf calendar plugin (contrast with
`fama-dalfama-lisbon-01`, where no recognisable plugin existed). At fetch
time it listed **44 upcoming events across 9 paginated list pages**; this
investigation retained 2 of those 9 pages (10 event rows) plus 4 individual
event-detail permalinks as a bounded sample.

Every sampled event row directly states its own full ISO calendar date,
venue name, and title — no contextual combination across page headings was
needed anywhere (this source is a `DIRECT_SOURCE` case throughout, not a
`DETERMINISTIC_CONTEXT` one). Every sampled event has its own distinct
permalink of the shape `/agenda/{content-item-id}-{slug}/{date}-{time}`,
and every one of the 4 retained detail pages independently self-declares
that exact same URL as its own `<link rel="canonical">`.

**The most important finding is a genuine nuance in the stable-identifier
rule, not assumed but empirically demonstrated:** the site's bare numeric
content-item id (e.g. `543`) is **not** unique per calendar occurrence — it
appeared twice in this investigation's own retained sample, once for
2026-09-03 and once for 2026-09-04, both for the same "Evita" production.
The **full permalink**, however, genuinely is stable and source-declared
per occurrence (each of the two id-543 detail pages independently
self-states its own distinct canonical URL matching its own distinct
date). A future collector must key records on the full permalink, never
the bare id alone.

Two further honest, non-blocking findings, both mechanically verified
rather than glossed over:

- **Start time is common but not universal**: 9 of 10 sampled rows show an
  explicit `HH:MM` time; the 10th (event id 551) shows none at all, on
  either its list row or its own detail page — even though its own
  permalink suffix still encodes a time (`17-00`).
- **Price and duration are unstructured free text**, embedded inconsistently
  (2 of 4 sampled detail pages each) inside the event's prose description,
  never a dedicated field.

The site's own advertised RSS route (`/agenda?format=feed&type=rss`) was
checked and found genuinely disabled (`HTTP 410 Gone`), not merely
unchecked. No JSON-LD Event data exists anywhere on this source.

## Escalation ladder

Only **Level 1 (`PASSIVE_STATIC`)** was used, and it was `SUFFICIENT` — the
entire retained sample (list pages, detail pages, the RSS route, and
robots.txt) was already fully readable from plain, unauthenticated HTTP
responses. No escalation to Level 2/3/4 was attempted or needed.

## Decision

**`READY_FOR_ACTIVATION`.** All of the mechanically-enforced `v1.2`
activation gates in `docs/SOURCE_INVESTIGATION_POLICY.md` are met:
identity is `PROVEN`, the acquisition class (`KNOWN_CALENDAR_PLUGIN`) is a
resolved/supported class, two `data_paths` entries are
`PUBLIC`/`CONFIRMED`, `title` and `start_date` are both `PROVEN` with basis
`DIRECT_SOURCE` (so the `v1.2` `DETERMINISTIC_CONTEXT` offline-proof
citation gate does not even apply), `source_record_id` is `PROVEN` via the
full-permalink nuance described above, a known collector family
(`STATIC_EVENT_LIST`) is recommended, a `DETERMINISTIC_DERIVATION`
evidence item exists, and no blocker is `CRITICAL` (four `MINOR` blockers
only — see `investigation.json`'s `collector_assessment.blockers` for the
full, honest list).

This is a research conclusion only. Reaching `READY_FOR_ACTIVATION` here
does **not** edit `sources/*.json`, any `venues/*.json` registry, or any
other live registry — turning this into an active collector is a
separate, explicitly-authorised step outside this investigation's scope.

## Evidence

All evidence lives under `evidence/`:

- `body-home.html` / `headers-home.txt` — homepage (identity, platform
  fingerprints).
- `body-agenda.html` / `headers-agenda.txt` — the candidate agenda list
  page, page 1 of 9 (5 event rows).
- `body-agenda-page2.html` / `headers-agenda-page2.txt` — a second agenda
  list page (5 more event rows; the source of the no-displayed-time
  finding).
- `body-event-gnr.html` / `headers-event-gnr.txt` — one event-detail
  permalink (price/duration free text, municipal identity footer).
- `body-event-evita1.html` / `headers-event-evita1.txt` and
  `body-event-evita2.html` / `headers-event-evita2.txt` — two different
  calendar dates of the SAME underlying production (id 543), used to
  empirically stress-test the stable-identifier rule.
- `body-event-orquestra.html` / `headers-event-orquestra.txt` — a fourth
  event-detail permalink with no displayed time and no price/duration text
  at all.
- `body-feed.xml` / `headers-feed.txt` — the site's own advertised RSS
  route (checked, `HTTP 410 Gone`).
- `body-robots.txt` / `headers-robots.txt` — robots.txt (a 60-second
  crawl-delay directive; this investigation's small, bounded request count
  respects its spirit).
- `offline-proof.mjs` — dependency-free, no-network Node script that
  re-parses the retained files above and mechanically re-derives every
  claim in `investigation.json`'s `field_assessment`.
- `offline-proof-output.txt` — captured stdout of running that script
  (34/34 checks passed); cited in `investigation.json` as the
  `DETERMINISTIC_DERIVATION` evidence item.
- `validate-mine.mjs` — a local, one-off sanity check (not itself a
  governed evidence item) that imports `validateInvestigation` from
  `ingestion/source-investigation/contract.mjs` and confirms
  `investigation.json` passes with zero errors.
