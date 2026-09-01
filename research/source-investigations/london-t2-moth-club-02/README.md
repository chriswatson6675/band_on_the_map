# london-t2-moth-club-02

Level 2 STRUCTURAL escalation of `london-t2-moth-club-01` (superseded),
per `BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01` Phase B.

**What changed vs. Level 1:** discovered the site's own linked RSS feed
(`https://mothclub.co.uk/rss`), which enumerates the real page inventory
and confirms MOTH Club does maintain its own first-party, in-nav `/Events`
page. A direct GET of that page confirms its entire event-listing content
is a DICE.fm widget embed (`widgets.dice.fm/dice-event-list-widget.js` +
`DiceEventListWidget.create(...)` carrying MOTH Club's own DICE
`partnerId`/`apiKey`, filtered to `venues:["moth club"]`) — no first-party
event titles, dates, IDs, JSON-LD, or JSON API are present anywhere in the
static HTML.

**Decision:** `DEFER` — exactly the platform-dependency scenario flagged
in the tasking: a DICE-only programme means deferring on third-party
dependency, not activating. See `investigation.json` (authoritative) for
the full record; this file is explanatory only.
