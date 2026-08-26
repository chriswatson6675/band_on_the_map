# b-flat-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Berlin jazz-club investigation trial (BOTM-BERLIN-30-40-VENUE-COLLECTOR-REUSE-
TRIAL-01). Investigates b-flat (Mitte, Berlin — Dircksenstrasse 40), an
acoustic music & jazz club.

## Outcome

Level 1 PASSIVE_STATIC alone was sufficient. b-flat runs Squarespace with a
genuine "Events" collection. The `/programm` page renders a Summary Block
listing 316 event occurrences; each event's own detail page carries a real
`schema.org` `Event` JSON-LD block.

**Important honest caveat found and retained as evidence, not glossed over:**
cross-checking three independently-fetched event detail pages showed that
the JSON-LD `startDate` time-of-day (`09:00:00+0200`) and `endDate`
(`23:55:00+0200`) are IDENTICAL across all three different events — a fixed
Squarespace platform default/sentinel, not real per-event show times. The
genuine door/concert time exists only as free text (e.g. `"Doors open: 20:00
– Concert: 21:00"`) in a tag/description field, not in a dedicated,
consistently-present structured field. `field_assessment.time` and `.end`
are recorded honestly as `AMBIGUOUS`/`NOT_PRESENT` rather than promoted to
`PROVEN` from a field that merely looks structured.

The calendar DATE (year-month-day) portion of `startDate`, by contrast, does
vary correctly per event and is `PROVEN`.

Decision: `READY_FOR_OFFLINE_PROOF` (not `READY_FOR_ACTIVATION`) — no
offline parser/test was built against the retained fixtures. `collector_
assessment.confidence` is `MEDIUM` rather than `HIGH` specifically because a
real collector implementation needs to deliberately ignore this source's own
misleading time fields, which is a genuine source-specific nuance worth
human attention, not a fully mechanical drop-in.

## Evidence

- `evidence/identity-excerpt.html` — the venue's own retained address text.
- `evidence/programm-page-excerpt.html` — one representative Summary Block
  event-item, verbatim, from the real 536,986-byte /programm response.
- `evidence/event-detail-jsonld-excerpt.html` — the real Event JSON-LD block
  and og:description text from three separate event detail pages, retained
  to demonstrate the startDate/endDate sentinel-value finding above.
