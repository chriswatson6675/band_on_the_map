# verti-music-hall-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Part of the Berlin 6-venue collector-reuse trial. Investigates the venue
publicly known as "Verti Music Hall", renamed "Uber Eats Music Hall" on
22 March 2024 following a naming-rights change (large concert hall,
Uber-Platz, Friedrichshain, Berlin). Official site: https://www.uber-eats-music-hall.de/

## What was found

Level 1 (`PASSIVE_STATIC`) was sufficient. The venue's own official events
listing page (`/events/all`) is fully server-rendered static HTML: 71
distinct upcoming events, each with a structured date, title, a
"starting-from" price, and its own detail-page permalink. No JSON-LD,
WordPress, Fourvenues, or Sanity signal was present or needed.

Each event detail page additionally links a per-event "Add to Calendar"
ICS file (e.g. `/events/ical/amelie-lens/4002/2`), which was fetched
directly and retained for two sampled events. The ICS's own `DTSTART` is a
full UTC instant, corroborating the HTML's floating local time text. Its
`DTEND` was found to be a fixed `DTSTART + 2h` in both sampled events,
which reads as a synthesized default duration rather than a genuine
venue-stated end time, so `end` is recorded `NOT_PRESENT` rather than
promoted to a proven value.

## Decision

`READY_FOR_OFFLINE_PROOF` — every other `READY_FOR_ACTIVATION` gate is
satisfied against retained evidence, but no `DETERMINISTIC_DERIVATION`
offline-proof evidence item exists yet (that reproduction is separate
follow-up collector-wiring work, out of scope for this investigation
task).
