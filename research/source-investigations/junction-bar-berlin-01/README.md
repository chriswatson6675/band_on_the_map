# junction-bar-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of a Berlin 6-venue source-investigation trial (BOTM-source-investigation
policy `v1.2`). Investigates Junction Bar, a live-music bar/club in
Berlin-Kreuzberg (https://junction-bar.de/), founded 1993.

## Summary

Entirely hand-authored static HTML — no CMS, framework, or events plugin of
any kind. One physical `.html` file exists per calendar month
(`/program/08_2026/08_26.html` for August 2026). The page's own single
heading states "August 2026 music program" once; each of 8 sampled dated
rows beneath it states only `D.M.` (day.month, no year) plus a weekday name
and the performing act(s) — a clean example of this project's own canonical
`DETERMINISTIC_CONTEXT` heading-governs-every-row pattern.

Unlike every other venue in this trial, Junction Bar exposes **no per-event
permalink** — events are just rows on a shared month-page. `source_record_id`
and `event_url` are honestly recorded `UNKNOWN`/`NOT_PRESENT` rather than
invented; an alternative composite-key identity strategy (page URL + date +
act title) is documented in `field_assessment.source_record_id.notes` for a
future collector build.

`site_classification.acquisition_class`: `STATIC_HTML`.
`collector_assessment.recommended_family`: `STATIC_EVENT_LIST` (confidence
`MEDIUM` — a MINOR blocker flags the markup's genuinely malformed nesting,
which a real parser would need to tolerate defensively).

## Decision

`READY_FOR_OFFLINE_PROOF`, not `READY_FOR_ACTIVATION` — `title`/`start_date`
are both `PROVEN` against a confirmed public data path, but no
`DETERMINISTIC_DERIVATION` evidence item exists (no parser/collector code
was written in this task). Building and offline-proving a defensive
`STATIC_EVENT_LIST` parser against the retained
`evidence/august-program.html` fixture is separate follow-up work.

## Evidence

- `evidence/home-page.html` — full byte-retained homepage.
- `evidence/musikprogramm-page.html` — full byte-retained "Musikprogramm"
  navigation page (links to each month's programme page).
- `evidence/august-program.html` — full byte-retained August 2026 programme
  page (8 dated rows).
