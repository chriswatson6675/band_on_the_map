# forum-maia-01

Investigation of "Fórum Maia / CM Maia's cultural agenda" — the Câmara
Municipal da Maia's own municipal events calendar (Maia, Porto
metropolitan area, Portugal). Prompted by an existing loose lead already
recorded in `sources/porto.json` (`forum-maia`,
`monitoring_status: READY_FOR_TECHNICAL_PROOF`, `events_url` pointing at a
single weekend-agenda page). This investigation independently discovers and
verifies everything from freshly retained evidence, per
`docs/SOURCE_INVESTIGATION_POLICY.md`; it does not edit `sources/porto.json`
or any other registry.

## Summary

`www.cm-maia.pt` is genuinely the Maia municipal council's own official
site (independently re-confirmed from its own `<title>`, meta description,
and `og:site_name`). The registry's given `events_url`
(`.../institucional/agenda/evento/agenda-cultural_fim-de-semana-88`) turned
out to be exactly the stale/narrow page this task anticipated: it 301s to a
path-corrected version of the **same single-weekend page**, not the live
listing root. This investigation instead independently discovered the
site's own general listing root by reading the homepage's own navigation:
`/institucional/atualidade-e-participacao/agenda/todos-os-eventos` ("all
events") — a real, paginated (283 pages, ~3,400 events back to 2014),
fully server-rendered event index.

Every retained page — the listing and two sampled event detail pages — is
plain static HTML with complete content in the initial response. No
JSON-LD, RSS, or ICS exists anywhere, but none was needed: each event
detail page embeds a structured (HTML `var`-tag, not JSON) "addtocalendar"
widget stating `atc_date_start` / `atc_date_end` / `atc_timezone` /
`atc_location` / `atc_organizer` directly, cross-confirmed by a second
independent field on the same page (`meta[name=content_date]`) and by
separately labelled `Local:` / `Preço:` / (`Horário:` on some pages) /
`Organização:` fields. Two sampled events chosen specifically for being
genuine live music — **Maia Blues Fest 2026** (a 3-day international blues
festival) and **"Sons de Verão 2026"** (a recurring free outdoor concert
series), both at the Auditório Exterior do Fórum da Maia — both proved
title/start_date/end/venue_location/event_url/price directly, with basis
`DIRECT_SOURCE`.

This investigation also caught and rejected a stable-identifier trap: the
page's own `wm:page_id` meta tag and `event_detail_<id>` container id are
**identical** across the two genuinely distinct sampled events — a shared
template/config id, not a per-event identifier (the same class of trap this
project already documented for Hot Clube's ICS `UID`). `source_record_id`
instead uses the event's own canonical permalink URL, per this project's
existing `cm-gaia-eventos`/`paral-lel-62-barcelona-01` precedent.

**The one genuinely unresolved gap is content scope, not acquisition
technique.** This source's own category taxonomy — mechanically scanned
across a bounded 5-page/60-event sample — never contains a music-specific
value anywhere (`Biblioteca`, `Cultura`, `Desporto`, `Desporto-Destaque`,
`Educação`, `Homepage | Agenda - Eventos na Maia`, `Institucional`,
`Juventude`, `Juventude | Homepage`, `Turismo`). `Cultura` is the closest
bucket, but it bundles genuine music events together with unrelated
content under the same single tag (a "Feira das Cebolas" onion
fair/market is also tagged `Cultura`, observed on the same retained page).
Per this task's explicit instruction, a category/tag field is required for
mechanical isolation, and title/description keyword matching does not
qualify as mechanical, source-provided isolation under this project's
policy.

## Decision

`HUMAN_REVIEW`. Identity is `PROVEN` at `HIGH` confidence, acquisition
class is `STATIC_HTML` (a resolved, supported class), and field extraction
is strong (`title`/`start_date`/`end`/`venue_location`/`event_url`/`price`
all `PROVEN` with basis `DIRECT_SOURCE` for both sampled music events).
Unlike `wow-world-of-wine-gaia-01` (where music was genuinely incidental,
bundled only into dinner packages within a non-events ticketing catalog),
this source's music content is substantial and standalone — so `REJECT`
would understate a genuinely strong, working source. But reaching
`READY_FOR_ACTIVATION` would require this investigation to unilaterally
decide how "real music events" get scoped out of a ~3,400-event general
civic archive (a maintained allowlist of known recurring series vs. full
`Cultura`-category import with downstream filtering) — a deliberate
editorial/collector-scope decision this policy reserves for an explicit
human/operator call. See `collector_assessment.blockers` (one `MAJOR`
content-scope entry, one `MINOR` archive-scope entry) and `decision.reasons`
in `investigation.json` for the full reasoning.

If a human/operator later decides the music-scope question, a **new**
investigation (citing `supersedes: "forum-maia-01"`) would be required —
this record is never rewritten in place.

## Evidence

All evidence lives under `evidence/` and is cited by `investigation.json`.
Highlights:

- `body-home.html` — the CM Maia homepage; identity confirmation plus the
  navigation links used to discover the real listing root.
- `body-events-weekend.html` / `headers-events-weekend.txt` and
  `body-events-redirect-target.html` — the given `sources/porto.json`
  `events_url`'s own 301 redirect, confirming it is a stale/narrow
  single-weekend page, not the live listing root.
- `body-agenda-todos.html` (+ `-page2` through `-page5`, `-page283`) — the
  independently-discovered general listing root and its own pagination,
  used for the bounded category-taxonomy scan and the archive-scope
  (2014) finding.
- `body-event-maiabluesfest.html` / `body-event-sonsdeverao.html` — two
  sampled genuine music-event detail pages, each with a structured
  addtocalendar widget, labelled `Local:`/`Preço:`/`Organização:` fields,
  and the shared `wm:page_id`/`event_detail_<id>` stable-identifier trap.
- `body-robots.txt` — no crawl restriction encountered.
- `offline-proof.mjs` / `offline-proof-output.txt` — a dependency-free,
  no-network re-parse of every retained fixture, mechanically reproducing
  every claim above (run via `node evidence/offline-proof.mjs`); 45/45
  checks pass.
- `validate-mine.mjs` — runs `validateInvestigationV1_2()` from
  `ingestion/source-investigation/contract.mjs` against this
  investigation's own `investigation.json` (run via
  `node evidence/validate-mine.mjs`); passes with zero errors.
