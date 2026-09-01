# Backyard Comedy Club — Level 1 passive-static investigation (tranche 2)

Supersedes `triage-osm-node-7125946902-london-01`. A single unauthenticated GET to https://backyardcomedyclub.co.uk/events/ returned a WordPress page running The Events Calendar (Tribe Events) plugin. Every retained event card is tagged with the site's own `cat_comedy` taxonomy class and describes stand-up comedy programming (e.g. "The Comedy Hump" — "the biggest stand-up stars and the best new acts"). Decision: `REJECT`. See `investigation.json` for the authoritative record.
