# Venue Coordinate Research — Closed

Task: FINAL COORDINATE-RESEARCH BOUNDARY (closing package)
Closed: 2026-08-24

This document formally closes automated venue-coordinate research for the
current Lisbon+Porto proof. It records the two bounded steps this closing
package performed, the residual venue set, and the non-destructive
operational queue those venues are left in — plus the (unimplemented)
provenance contract a future dashboard must follow if it ever supplies
coordinates for them by hand.

No further automated coordinate-research package should be started against
this venue set — see "What is closed" below.

## 1. Casa Capitão governed-alias re-evaluation

[VENUE-LOCATION-RESOLUTION-03](LISBON_PORTO_OVERNIGHT_COVERAGE_01.md)'s
`STRUCTURED_POI_QUERY` strategy found one real OSM candidate for Casa
Capitão — "Casa do Capitão" — sharing an exact street, house number, and
postcode, and an `extratags.website` matching the venue's own recorded
`https://casa-capitao.com`. That package correctly declined to treat this
as a governed alias, because the only evidence for the "do" form was the
OSM candidate's own extratags, and this project's rules do not accept a
geocoder candidate's own metadata as canonical-identity authority.

This closing package independently re-fetched the venue's own official
site (`https://casa-capitao.com`) — not the OSM candidate — and checked its
logo, footer, and copyright text directly. The site consistently and
exclusively uses **"Casa Capitão"**; it never uses "Casa do Capitão"
anywhere. That confirms, from independent first-party evidence rather than
the OSM candidate itself, that no alias is warranted: the prior decision
was correct, and Casa Capitão remains `ADDRESS_ONLY`.

## 2. Bounded Foursquare Places evaluation

This package was scoped to attempt one bounded Foursquare Places API
evaluation against the residual `ADDRESS_ONLY` venue set, as a genuinely
different provider/dataset from OpenStreetMap/Nominatim.

**Outcome: not performed.** Foursquare Places requires an authenticated
API key; no Foursquare credentials were found anywhere in this repository
or environment (checked: process environment variables, `.env*` files, and
a repository-wide search for any prior Foursquare configuration — none
existed). Per this project's rules against fabricating results or bypassing
access controls, no live Foursquare request was made and no invented
Foursquare result was recorded. The user was asked directly and chose to
skip the Foursquare evaluation and close research now rather than supply a
key.

This is reported honestly as **"not evaluated: no API credentials
available"** — a genuinely different outcome from a Foursquare query that
was attempted and returned nothing, and it should be read as such by
anyone reviewing this closure.

## 3. Residual venues — queued for manual coordinate entry

All six canonical venues that remained `ADDRESS_ONLY` after
`ADDRESS_ONLY_QUERY`, `NAME_PLUS_ADDRESS_QUERY`, and `STRUCTURED_POI_QUERY`
(all via Nominatim — see
[LISBON_PORTO_OVERNIGHT_COVERAGE_01.md](LISBON_PORTO_OVERNIGHT_COVERAGE_01.md)
and [VENUE_RESOLUTION.md](VENUE_RESOLUTION.md)) remain `ADDRESS_ONLY`
today, since the Foursquare step that might have moved one or more of them
was not performed:

| venue_id | Canonical name | City |
|---|---|---|
| `venue-lisboa-igreja-e-convento-da-graca` | Igreja e Convento da Graça | Lisboa |
| `venue-lisboa-bota-anjos` | BOTA Anjos | Lisboa |
| `venue-lisboa-village-underground-lisboa` | Village Underground Lisboa | Lisboa |
| `venue-lisboa-casa-capitao` | Casa Capitão | Lisboa |
| `venue-odivelas-centro-cultural-malaposta` | Centro Cultural Malaposta | Odivelas |
| `venue-odivelas-biblioteca-municipal-d-dinis` | Biblioteca Municipal D. Dinis | Odivelas |

Each is real, still evidenced (a genuine official address remains on the
canonical Venue record, from a first-party source) — none of this closure
removes or weakens that evidence. Only the coordinate step is closed.

`ingestion/geocoding/manual-coordinate-queue.mjs`
(`npm run report:manual-coordinate-queue`) generates a machine-readable
report of exactly this list — derived live from `venues/lisbon.json` /
`venues/porto.json`, never hardcoded — at
`fixtures/geocoding/manual-coordinate-queue.json`. Each entry carries
`queue_status: "MANUAL_COORDINATE_REQUIRED"`.

**Important: this is a report-level label only.** It is not a new
`location_status` value. `ingestion/venue/contract.mjs`'s
`LOCATION_STATUSES` remains exactly `{CONFIRMED, GEOCODED, ADDRESS_ONLY,
UNRESOLVED}` — unchanged by this package, and asserted directly by
`tests/manual-coordinate-queue.test.mjs`. Every venue above is, and
remains, `ADDRESS_ONLY` in the canonical registry. `"MANUAL_COORDINATE_
REQUIRED"` describes where it sits in a future operational queue, not what
it is in the data model.

## 4. Future operational fallback: MANUAL_OPERATOR_ENTRY (not implemented)

The Band on the Map dashboard does not yet exist and is explicitly out of
scope for this closing package. This section records the provenance
contract any future dashboard coordinate-entry feature must follow, so
that work is not designed from scratch later:

- An operator may enter `latitude`/`longitude` for an **existing,
  evidence-backed** canonical Venue only — never for an unresolved venue
  candidate, and never inventing an address; the address must already be
  on the Venue record with its own evidence, exactly as required for
  automated geocoding today.
- The resulting coordinates must carry explicit provenance distinguishing
  them from both existing states:
  ```json
  {
    "method": "MANUAL_OPERATOR_ENTRY",
    "entered_at": "<ISO 8601 timestamp>"
  }
  ```
- A manually-entered coordinate must **never** be labelled `CONFIRMED`
  (reserved for coordinates evidenced directly through the venue/official
  authority itself) or `GEOCODED` (reserved for `GEOCODED_FROM_OFFICIAL_
  ADDRESS` — a governed provider's own deterministic derivation). It needs
  its own distinct state or field when that dashboard work is actually
  scoped — this package deliberately does not invent one now, per its
  instruction not to alter canonical Venue semantics merely to add an
  operational queue label.
- Until that dashboard exists, the six venues above simply remain
  `ADDRESS_ONLY`, correctly excluded from the map
  (`MAP_ELIGIBLE_LOCATION_STATUSES` in `ingestion/venue/contract.mjs`
  accepts only `CONFIRMED`/`GEOCODED`) — an honest, non-fabricated final
  state, not a bug.

## 5. What is closed

Automated coordinate research for the current Lisbon+Porto proof is now
closed. Per the task boundary for this package, none of the following
should be started against this venue set without a new, separately-scoped
package:

- a fourth Nominatim query strategy;
- evaluation of additional POI/geocoding providers beyond the one bounded
  Foursquare attempt recorded above (which was itself not performed, for
  the credential reasons given in §2);
- TomTom or Geoapify implementation;
- further query-variant invention;
- continued per-venue coordinate research.

The six residual venues above are an **acceptable final state**: real,
evidenced, `ADDRESS_ONLY`, non-map-eligible, and queued (report-only) for
a future manual dashboard step. This matches the explicit instruction that
governed this closure: "If Foursquare does not safely resolve a residual
canonical venue: leave it `ADDRESS_ONLY`. That is an acceptable final
state."
