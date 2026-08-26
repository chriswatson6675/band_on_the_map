# ausland-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Berlin jazz-club investigation trial (BOTM-BERLIN-30-40-VENUE-COLLECTOR-REUSE-
TRIAL-01). Investigates Ausland (Prenzlauer Berg, Berlin — Lychener Straße
60), an independent experimental/improvised music venue.

## Outcome

Level 1 PASSIVE_STATIC alone was sufficient. The site is TYPO3 CMS using its
"news" extension to render a clean, static, server-rendered event list with
full date text (both a human-readable long form and a short DD/MM/YY form),
title, artist list, image, and permalink per event — no JSON-LD, ICS,
WordPress, or third-party calendar plugin.

Two honest findings retained as evidence:

1. A free-text "doors HH:MM | concerts HH:MM | Ticket €X" line exists on
   some (not all) event detail pages, and where present, its concert-start
   time did not exactly match the structured date field's own time-of-day
   in the one case checked — so `time` is recorded as `PARTIAL`, not
   `PROVEN`.
2. `price` similarly varies — present as free text on one sampled event,
   genuinely absent on another — recorded as `PARTIAL`.

`title`, `start_date` (full date, directly stated), `source_record_id`, and
`event_url` are all soundly `PROVEN`.

Decision: `READY_FOR_OFFLINE_PROOF` (not `READY_FOR_ACTIVATION`) — no
offline parser/test was built against the retained fixtures.

## Evidence

- `evidence/identity-excerpt.html` — the venue's own retained footer
  address text.
- `evidence/program-page-excerpt.html` — the first 2 real event-list
  entries from the real 29,888-byte /program/all response, plus the
  invisible internal TYPO3 news-record-UID list.
- `evidence/event-detail-excerpt.html` — the date/title/artist block,
  verbatim, from two separate event detail pages (one with, one without,
  the doors/concert-time/price free-text line).
