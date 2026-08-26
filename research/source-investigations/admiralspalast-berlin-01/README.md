# admiralspalast-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 30-40 venue collector-reuse trial. Investigates
Admiralspalast (historic theatre / concert hall, Mitte, Berlin) as an
event-source candidate.

## Summary

- Official first-party site: `https://www.admiralspalast.theater/`
  (the naive `admiralspalast.de` domain 301-redirects to the operator
  group's corporate site, `atgentertainment.de` — rejected as
  official_url for that reason).
- Platform: Contao Open Source CMS. No JSON-LD Event/MusicEvent data, no
  ICS/iCal link, no WordPress/Fourvenues/Sanity signals — the site exposes
  a clean, static, semantically-classed server-rendered event list and
  per-event detail pages instead.
- Level 1 PASSIVE_STATIC was sufficient; no escalation was needed.
- One real upcoming event (Cem Adrian, 1 Nov 2026, 20:00) was sampled at
  detail-page granularity. `title`/`event_url`/`source_record_id`/
  `venue_location`/`time` are `PROVEN` (`DIRECT_SOURCE`); `start_date` is
  `PROVEN` via `DETERMINISTIC_CONTEXT` (combining the event row's own
  day-of-month span with its own month+year span — both scoped to the
  same event row, not a page-wide heading shared across unrelated
  events).
- Decision: `READY_FOR_OFFLINE_PROOF` — no offline
  parser/`DETERMINISTIC_DERIVATION` proof was produced in this
  investigation (out of scope per this task), so `READY_FOR_ACTIVATION`'s
  gate 9 cannot yet be satisfied. Recommended collector family:
  `STATIC_EVENT_LIST` (existing, reusable — no new family required).
