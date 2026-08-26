# urban-spree-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of a Berlin 6-venue source-investigation trial (BOTM-source-investigation
policy `v1.2`). Investigates Urban Spree, a 1700 sqm artistic space and
concert venue on the RAW-Gelände in Friedrichshain
(https://www.urbanspree.com/).

## Summary

A plain, unauthenticated `curl` GET of the venue's own official concerts
programme page (`/program/concerts/`) exposes server-rendered static HTML
event cards (MODX CMS with pdoTools pagination — not WordPress). Each of 9
sampled cards states its own title, a full machine-readable local datetime
(`data-dateStart="YYYY-MM-DD HH:MM:SS"`, mirrored in human-readable text), an
explicit EUR price, and a link to the event's own detail page. No JSON-LD,
ICS feed, WordPress plugin API, Fourvenues widget, or Sanity CMS was found.

`site_classification.acquisition_class`: `STATIC_HTML`.
`collector_assessment.recommended_family`: `STATIC_EVENT_LIST`.

Notably this source exposes `price` directly (`PROVEN`/`DIRECT_SOURCE`) —
more complete than most static-HTML sources this project has investigated.

## Decision

`READY_FOR_OFFLINE_PROOF`, not `READY_FOR_ACTIVATION` — `title`/`start_date`
are both `PROVEN` (`basis: DIRECT_SOURCE`) against a confirmed public data
path, but no `DETERMINISTIC_DERIVATION` evidence item exists, since no
parser/collector code was written as part of this investigation task.
Building and offline-proving a `STATIC_EVENT_LIST` parser against the
retained `evidence/program-page.html` fixture is separate follow-up work.

## Evidence

- `evidence/program-page.html` — full byte-retained concerts programme page
  (9 event cards).
- `evidence/event-detail.html` — one full byte-retained event detail page,
  confirming the resolved `event_url` genuinely resolves.
