# london-t2-southlands-arts-centre-02

Level 2 STRUCTURAL escalation of `london-t2-southlands-arts-centre-01`
(superseded), per `BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01` Phase B.

**What changed vs. Level 1:** fetched the `/events/` calendar page the
Level 1 record had identified but not retrieved. It is a real, current,
dated GeoDirectory event-listing grid, and its own HTML references a
public WordPress GeoDirectory REST API
(`/wp-json/geodir/v2/events`). That API was fetched (one bounded sample
record, then the full 33-item current/future listing, trimmed to
essential fields for bounded retention) to assess both the data path's
viability and the programme's actual music relevance.

**Finding:** the acquisition path is genuinely strong — direct-source
dates/times/prices/IDs/URLs, no derivation needed. But a deterministic,
offline-reproduced tally over the retained 33-event fixture
(`category-tally-derivation.mjs`, output in `category-tally-output.json`)
found only **1 of 33** current/future events tagged `Music`
("Classic Concert"); the rest are Workshops, Wellbeing, LitOct
(literary festival), Art, Crafts, Literary, Talks, Creative Writing,
Family, Kids, Gardening, and Meet the Maker. This is a general community
arts centre, not a music-primary venue.

**Decision:** `REJECT` — fails BeatMapped's venue-level music gate on
real, retained, mechanically-verifiable evidence, independent of the data
path's technical quality. See `investigation.json` (authoritative) for the
full record; this file is explanatory only.
