# kunstfabrik-schlot-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Berlin jazz-club investigation trial (BOTM-BERLIN-30-40-VENUE-COLLECTOR-REUSE-
TRIAL-01). Investigates Kunstfabrik Schlot (Mitte, Berlin — Invalidenstraße
117, in den Edison Höfen).

## Outcome

Level 1 PASSIVE_STATIC alone was sufficient. The site is WordPress using the
"Offbeat" theme's own built-in event-list widget — confirmed NOT to be
EventON, Tribe Events Calendar (checked the wp-json REST root directly: no
`tribe/events/v1` namespace or `tribe_events` post type is registered, only
`tribe/tickets/v1` for ticket sales), Fourvenues, or Sanity.

The programme list page's own cards show only day+month (no year) — but
each event's own detail page directly states the FULL date in one clean
field (`"Datum: August 26, 2026"`), plus time (`"Zeit: 20:00 Uhr"`) and
price (`"Eintritt: recommended fee 12€ - 25€"`) in a consistently-labelled
"EINZELHEITEN" (Details) block. Because the full date is directly stated in
one place, `start_date` is `DIRECT_SOURCE`, not a `DETERMINISTIC_CONTEXT`
combination of the list page's day/month with an inferred year.

Decision: `READY_FOR_OFFLINE_PROOF` (not `READY_FOR_ACTIVATION`) — no
offline parser/test was built against the retained fixtures.

## Evidence

- `evidence/identity-excerpt.html` — the venue's own retained footer
  address text.
- `evidence/programm-page-excerpt.html` — the first 3 real event-list
  entries from the real 135,665-byte /programm/ response.
- `evidence/event-detail-excerpt.html` — the "EINZELHEITEN" (Eintritt/
  Datum/Zeit) block, verbatim, from two separate event detail pages.
