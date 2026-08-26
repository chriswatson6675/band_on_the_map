# cassiopeia-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of a Berlin 6-venue source-investigation trial (BOTM-source-investigation
policy `v1.2`). Investigates Cassiopeia, a club and concert venue on the
RAW-Gelände in Friedrichshain (https://cassiopeia-berlin.de/club).

## Summary

A plain, unauthenticated `curl` GET of the venue's own official club events
page exposes a Webflow CMS Collection List server-side-rendered directly
into the HTML (Finsweet cmsfilter/cmsload attributes only add client-side
filter UI on top of the already-rendered list). 8 sampled event cards each
state a title, day/month digits plus a full "Month YYYY" text within the
same per-event date block, a start ("Beginn") time, a category/genre tag,
and a link to the event's own detail page.

`site_classification.acquisition_class`: `STATIC_HTML`.
`collector_assessment.recommended_family`: `STATIC_EVENT_LIST`.

`start_date` is recorded with `basis: DETERMINISTIC_CONTEXT` — a genuine,
narrow example of the v1.2 combination rule operating *within one event's
own record* (day digits + a sibling node's month-name/year text), not
cross-event heading inheritance.

## Decision

`READY_FOR_OFFLINE_PROOF`, not `READY_FOR_ACTIVATION` — `title` is `PROVEN`
(`basis: DIRECT_SOURCE`) and `start_date` is `PROVEN` (`basis:
DETERMINISTIC_CONTEXT`) against a confirmed public data path, but no
`DETERMINISTIC_DERIVATION` evidence item exists (no parser/collector code
was written in this task). Building and offline-proving a
`STATIC_EVENT_LIST` parser — including the date-combination rule — against
the retained `evidence/club-page.html` fixture is separate follow-up work.

## Evidence

- `evidence/club-page.html` — full byte-retained club events page (8 event
  cards).
- `evidence/event-detail.html` — one full byte-retained event detail page,
  confirming the resolved `event_url` genuinely resolves.
