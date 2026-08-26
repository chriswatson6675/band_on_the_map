# zig-zag-jazz-club-berlin-01

Explanatory only — `investigation.json` in this directory is authoritative.

Berlin jazz-club investigation trial (BOTM-BERLIN-30-40-VENUE-COLLECTOR-REUSE-
TRIAL-01). Investigates Zig Zag Jazz Club (Berlin — Hauptstraße 89, 12159
Berlin).

## Outcome

Level 1 PASSIVE_STATIC alone was sufficient, but required checking two
different "programme" pages first: the venue's top-nav "Program" link
(`/program-mai`) renders only a client-side calendar widget with no
server-rendered events, while a second, oddly-named page (`/menu-marquee`,
titled "PROGRAMM") is the real Squarespace Summary Block event listing. Each
event's own detail page carries a real `schema.org` `Event` JSON-LD block
plus a separate, consistently-formatted free-text block
("Beginn:"/"Einlass ab"/"Eintrittspreise:"/"Location:").

**Two honest findings retained as evidence:**

1. The JSON-LD `startDate` time-of-day is the DOOR/ENTRY time ("Einlass"),
   not the real show start — the real start ("Beginn") is a separate,
   directly-stated free-text value, consistently 1 hour later across all
   sampled events.
2. One sampled event ("Kennedy Administration") carries an explicit
   free-text override stating it takes place at a DIFFERENT venue than Zig
   Zag's own room — so `venue_location` is recorded as `AMBIGUOUS`, not
   silently assumed constant.

`price` is genuinely `PROVEN` here (unlike several other investigated
venues) via the same consistent free-text block, with real varying amounts
across sampled events.

Decision: `READY_FOR_OFFLINE_PROOF` (not `READY_FOR_ACTIVATION`) — no
offline parser/test was built. `collector_assessment.confidence` is `MEDIUM`
because a complete collector needs source-specific free-text parsing beyond
the generic JSON-LD family, plus explicit handling of the venue-override
case.

## Evidence

- `evidence/identity-excerpt.html` — Organization/LocalBusiness JSON-LD.
- `evidence/program-page-excerpt.html` — one representative Summary Block
  event-item from the real /menu-marquee response.
- `evidence/event-detail-excerpt.html` — Event JSON-LD + free-text data
  block from four separate event detail pages, including the venue-override
  case.
