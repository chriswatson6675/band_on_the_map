# teatro-sao-carlos-lisbon-01

Explanatory only — `investigation.json` is authoritative per
`docs/SOURCE_INVESTIGATION_POLICY.md`; this file carries no independent
authority and is never read by the validator.

## Candidate

**Teatro Nacional de São Carlos (TNSC)**, Portugal's state opera house,
Largo de São Carlos, Chiado, Lisboa. Official site: `https://saocarlos.pt`
(redirects to `https://www.saocarlos.pt/`). Operated/produced by OPART —
Organismo de Produção Artística, E.P.E.

The candidate came from a pre-existing, loose lead in `sources/lisbon.json`
(`tnsc-sao-carlos`, `monitoring_status: READY_FOR_TECHNICAL_PROOF`,
`research_notes: "State opera house; dated calendar confirmed through Dec
2026 at review time"`). That note was treated as a discovery lead only —
this investigation independently re-verified everything from freshly
retained evidence, per policy, and did **not** simply trust it.

## What Level 1 found

A single `PASSIVE_STATIC` probe was sufficient — no escalation to Level 2/3
was needed. Plain `curl` requests against `saocarlos.pt`,
`www.saocarlos.pt/calendar/`, `/program/`, one production detail page,
`/feed/`, `/wp-json/`, and `/robots.txt` already exposed everything needed:

- The site is built on a bespoke in-house platform ("bl-"/`bndlyr`/Bond
  Habits), not WordPress — no JSON-LD, no RSS (`/feed/` 404), no public
  WordPress REST API (`/wp-json/` 403).
- `/calendar/` and `/program/` are **genuinely server-rendered** — real
  event data (day/month/year/time/type/venue/city/title, a production
  permalink, and a stable per-occurrence `data-content-id`) is present
  verbatim in the raw HTML, not an empty client-rendered shell. This is a
  materially stronger acquisition path than several other investigated
  candidates in this repository.
- 60 event occurrences were retained from `/calendar/` (spanning
  Sep 2026 – Jul 2027). All required fields (title, date, time, venue,
  stable id) are directly, individually stated per row — `basis:
  DIRECT_SOURCE` throughout; no contextual/derived combination was needed
  or claimed.
- The per-occurrence `data-content-id` was empirically proven stable: two
  independent, separately-issued fetches of `/calendar/` returned the same
  60 ids in the same order (60/60 matching).

## The material finding this investigation surfaced

The homepage's own retained news text ("São Carlos, por agora, na Boa
Hora") states the **physical São Carlos building is currently closed for
requalification works**, with administrative operations and the box office
relocated nearby to Largo da Boa Hora. This directly explains a striking,
independently-confirmed fact: **zero of the 60 retained calendar entries
list Teatro Nacional de São Carlos itself as the performance venue.**
Every one is an OPART touring production (opera, concert, ballet) staged
at another Portuguese venue (Teatro Nacional de São João, Teatro Camões,
CCB, Coliseu Porto Ageas, Casa da Música, regional municipal theatres,
etc.) or even abroad (Castelo Kuressaare, Estónia).

This is architecturally acceptable under `docs/ARCHITECTURE.md`'s Source
model (a Source may be a publisher whose Observations are each
independently resolved to their own real venue downstream), but it is a
substantial, honestly-surfaced departure from the candidate's brief
("Lisbon's state opera house calendar") — most observed events aren't at
São Carlos, and most aren't even in Lisbon.

## Decision

`HUMAN_REVIEW` — deliberately, not `READY_FOR_ACTIVATION` and not
`DEFER`/`REJECT`. The technical acquisition path is genuinely proven (every
mechanical activation gate would pass: `identity.status: PROVEN`, a
confirmed public `STATIC_HTML` data path, `title`/`start_date`/
`source_record_id` all `PROVEN`, a passing `DETERMINISTIC_DERIVATION`
offline proof, no `CRITICAL` blocker). But the closure/scope finding above
is a substantive product/registry judgement — whether to activate this
source as OPART's national touring-programme publisher now, or wait for
the São Carlos building's own reopening — that this investigation is not
positioned to make unilaterally. See `investigation.json`'s
`decision.reasons` and the `MAJOR` blocker in
`collector_assessment.blockers` for the full reasoning.

## Evidence

All evidence is retained under `evidence/` and cited by `evidence_id` in
`investigation.json`: raw HTTP response bodies/headers for every fetch
(`ev-home-bare`, `ev-home-www-*`, `ev-calendar-*`, `ev-calendar-recheck-*`,
`ev-program-*`, `ev-carmen-detail-*`, `ev-feed`, `ev-wpjson`, `ev-robots`),
plus a dependency-free, no-network offline proof
(`evidence/offline-proof.mjs`, captured output in
`evidence/offline-proof-output.txt`, cited as `ev-offline-proof`) that
mechanically re-parses every retained HTML file and re-derives every claim
in `field_assessment`, `site_classification`, and `identity` — including
the zero-São-Carlos-as-venue finding and the empirical id-stability
cross-check.

`evidence/validate-mine.mjs` is a local sanity check (not itself governed
evidence) confirming `investigation.json` passes
`validateInvestigationV1_2()` from `ingestion/source-investigation/
contract.mjs` with zero errors — run with `node evidence/validate-mine.mjs`.

## Not to be confused with

`research/source-investigations/teatro-sao-luiz-lisbon-01/` investigates a
**different** EGEAC-managed venue (Teatro São Luiz), unrelated to this
OPART-managed candidate beyond both being Lisbon theatres referenced from
`sources/lisbon.json`.
