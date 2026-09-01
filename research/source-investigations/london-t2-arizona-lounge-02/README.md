# london-t2-arizona-lounge-02

Level 2 STRUCTURAL escalation of `london-t2-arizona-lounge-01` (superseded),
per `BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01` Phase B.

**What changed vs. Level 1:** confirmed no common events/programme path
slug resolves (`/events`, `/whats-on`, `/whatso`, `/gigs`, `/calendar`,
`/listings`, `/programme`, `/events-2`, `/live-music` — all 404), then
followed the homepage's own nav link to `/entertainment`. That page
confirms live-entertainment identity in prose ("LIVE SINGERS | TOP DJS |
BELLY DANCERS") but its actual listing content is a client-side widget
that never hydrated in this static GET ("Widget Didn't Load") — no dated
events, JSON-LD, ICS feed, or discoverable JSON API endpoint was exposed.

**Decision:** `DEFER` — identity and genre remain proven, but no
first-party data path was found within this bounded Level 2 pass. See
`investigation.json` (authoritative) for the full record; this file is
explanatory only.
