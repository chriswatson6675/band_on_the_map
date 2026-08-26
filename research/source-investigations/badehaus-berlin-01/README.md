# badehaus-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of a Berlin 6-venue source-investigation trial (BOTM-source-investigation
policy `v1.2`). Investigates Badehaus Berlin, a small live-music venue on the
RAW-Gelände in Friedrichshain (https://badehaus-berlin.com/en/).

## Summary

A plain, unauthenticated `curl` GET of the venue's own official English
events page (`/en/events/`) exposes 93 server-rendered static HTML event
cards. Each card directly states its own title, a full `DD.MM.YYYY` date,
and an `HH:MM` local time (no timezone offset — floating local), plus a link
to the event's own detail page. No JSON-LD `Event`/`MusicEvent` schema, ICS
feed, WordPress "The Events Calendar" REST route (confirmed 404), Fourvenues
widget, or Sanity CMS was found — this is a custom WordPress theme rendering
plain static HTML, not any of this project's existing plugin/API-based
collector families.

`site_classification.acquisition_class`: `STATIC_HTML`.
`collector_assessment.recommended_family`: `STATIC_EVENT_LIST` (an existing
named family in this project's vocabulary — not `NEW_FAMILY_REQUIRED`).

## Decision

`READY_FOR_OFFLINE_PROOF`, not `READY_FOR_ACTIVATION` — this investigation
retains a strong, evidenced static-HTML data path with `title`/`start_date`
both `PROVEN` (`basis: DIRECT_SOURCE`), but no `DETERMINISTIC_DERIVATION`
evidence item, since no parser/collector code was written as part of this
investigation task. Building and offline-proving a `STATIC_EVENT_LIST`
parser against the retained `evidence/events-page.html` fixture is separate
follow-up work.

## Evidence

- `evidence/events-page.html` — full byte-retained events listing page (93
  event cards).
- `evidence/event-detail-atlas.html` — one full byte-retained event detail
  page, confirming no additional structured data beyond the listing card.
- `evidence/tribe-events-api-404.json` — negative-finding evidence: no
  WordPress "The Events Calendar" REST route exists on this install.
- `evidence/wp-json-types.json` — negative-finding evidence: no custom
  `event` WordPress post type is registered/exposed.
