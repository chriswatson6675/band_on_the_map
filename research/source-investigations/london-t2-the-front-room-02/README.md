# london-t2-the-front-room-02

Level 2 STRUCTURAL escalation of `london-t2-the-front-room-01` (superseded),
per `BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01` Phase B.

**What changed vs. Level 1:** the homepage's own nav links exposed no
events/programme page, so this pass fetched the site's public
`sitemap.xml` (a legitimate Squarespace structural-discovery step) to
enumerate the real page inventory: `contact`, `home`, `jazz-lunchtim`,
`new-page`, `radio`, `services-2`. The one event-shaped page,
`/jazz-lunchtim`, describes a recurring jazz night but is a stale,
unmaintained page frozen at "now arranged into March 2022" with a 2022
copyright footer — not a live/current listing. `/new-page` is an empty
"Test" placeholder.

**Decision:** `DEFER` — music identity remains proven, but no current,
maintained first-party events data path was found within this bounded
Level 2 pass, and no third-party platform dependency was found either.
See `investigation.json` (authoritative) for the full record; this file
is explanatory only.
