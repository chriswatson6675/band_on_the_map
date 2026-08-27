# la-java-paris-01

Investigation of La Java (105 rue du Faubourg du Temple, 75010 Paris), part
of `BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01`.

## Summary

La Java's official site (la-java.fr) is a Next.js app. Its home page embeds
a `NightClub` JSON-LD block directly stating its own name, address, and GEO
coordinates. Its `/programmation` page already streams its full near-term
event list (19 events at retrieval time) as a first-party JSON array
embedded inside the page's own initial HTML — a React Server Component
("RSC") `self.__next_f.push(...)` chunk — with no separate client-side
fetch needed.

Each event carries a stable `id`, `name`, full ISO `date`, `type`
("concert"/"club"), and an outbound `ticketUrl` (currently Shotgun, a
third-party checkout domain — but the venue's own page is what designates
which URL belongs to which event, so that mapping is first-party).

One honesty finding worth flagging explicitly: every event's own `date`
field carries a trailing `.000Z`, but this is **not** a genuine UTC
instant — cross-checked directly against the same page's own
human-readable card text for the same event, which showed identical digits
with no timezone conversion applied (a true UTC→Europe/Paris conversion in
August would shift the displayed hour by +2). Recorded honestly as
`FLOATING_LOCAL`, never silently upgraded.

`source_record_id` stability was proven empirically: a second, independent
fetch of the same page minutes later reproduced every one of the 19
records' `id` values (and every other field) byte-for-byte.

## Decision

`READY_FOR_ACTIVATION`. Identity, venue_location (with a source-stated GEO
property — `CONFIRMED`-grade, not geocoder-derived), title, start_date, and
source_record_id are all `PROVEN`. No CRITICAL blocker.

## Collector

`ingestion/la-java-paris/discovery.mjs` + `observation-adapter.mjs` — a new
bespoke family for this venue's own Next.js RSC embedded-JSON convention
(distinct from `ingestion/sveltekit-data/`, a different framework's own
`__data.json` shape).

Offline proof: `tests/la-java.test.mjs` (5/5 passing), against the retained
fixture `fixtures/la-java-paris/programmation-rsc-chunk.html` (a bounded,
byte-faithful excerpt: the single script chunk carrying the full embedded
events array).

## Coordinates

`CONFIRMED` — the source's own home-page JSON-LD directly states its own
GEO property (48.8714, 2.3702); no geocoder call was needed or made.

## Evidence

- `evidence/home-raw.html` — full retained home page (NightClub JSON-LD).
- `evidence/programmation-raw.html` — full retained `/programmation` page.
- `evidence/programmation-raw-refetch.html` — a second independent fetch,
  proving `source_record_id` stability empirically.
