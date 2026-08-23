# Venue Resolution

Reviewed: 2026-08-23
Task: BOTM-VENUE-01

This document explains the canonical Venue contract
(`ingestion/venue/contract.mjs`), the small evidence-backed Lisbon
registry it produced (`venues/lisbon.json`), and the deterministic
resolver (`ingestion/venue/resolver.mjs`) that maps real, already-proven
AgendaLX and Hot Clube Observations onto it. It documents a bounded proof
against the 19 real Observations already established in this repository
(`BOTM-OBSERVATION-01`/`01A`) — not a production venue database, and not
a claim of complete Lisbon venue coverage.

## Observation venue text vs canonical Venue

An Observation's `venue_name`/`location_text` (see
`docs/OBSERVATION_PIPELINE.md`) is **source-reported text, not identity**.
AgendaLX's `venue_name: "Capitólio"` and Hot Clube's `location_text:
"Cineteatro Capitólio Parque Mayer"` are two different sources describing
the same real building in two different ways — neither is more "correct"
than the other, and neither is a canonical identifier.

A canonical **Venue** (`ingestion/venue/contract.mjs`) is different: it is
one resolved, evidence-backed real-world place, with a deterministic
`venue_id`, that many Observations (from many sources) can point at. Per
`docs/ARCHITECTURE.md`: "Venue identity and coordinates are canonical
rather than independently trusted from every source." This task builds
the first real instance of that resolution step, for real data.

## Evidence requirements

Every fact in `venues/lisbon.json` was retrieved from a live, first-party
page during this task, following the priority order the task specified:

1. the venue's own official website;
2. an official municipal/cultural website (e.g. EGEAC, the Lisbon
   municipal cultural agency);
3. first-party structured/map/location information *linked from* those
   pages.

Social media was never used as location authority, and no address was
submitted to a third-party geocoder — not even a single "one-off" lookup.
Where an official page's own outbound map link (not a geocoder query
constructed by this project) happened to resolve to a coordinate pair,
that coordinate was treated as tier-3 evidence and retained; where no
such first-party coordinate evidence existed, the venue stops at an
evidenced address rather than a guessed pin.

### `location_status`: three honest states, not two

- **`CONFIRMED`** — address *and* coordinates are both evidenced. Only one
  venue reached this in this proof: **Capitólio**, whose EGEAC page links
  its own official Google Maps shortlink
  (`https://maps.app.goo.gl/PgnLPrz43VZjvVRt8`), which resolves to
  Google's place page for "Cineteatro Capitólio" carrying an explicit
  marker coordinate (`38.7188712, -9.1466143`).
- **`ADDRESS_ONLY`** — a trustworthy address is evidenced, but no
  first-party coordinate evidence was found. This is the honest, expected
  outcome for most real venues under a "no bulk geocoding, no guessing"
  rule: **Igreja e Convento da Graça** and **BOTA Anjos** both have a real,
  confirmed street address from their own official sites, and genuinely
  no coordinates yet.
- **`UNRESOLVED`** — neither could be confidently evidenced. See "Fail-
  closed behaviour" below.

`validateVenue()` enforces this as more than documentation:
`UNRESOLVED` venues are rejected if they carry any coordinate,
`CONFIRMED` venues are rejected if they don't, and any venue that does
carry coordinates must cite at least one evidence entry.

## Explicit mappings, not fuzzy matching

`ingestion/venue/resolver.mjs` uses two small, hand-authored lookup
tables and nothing else:

- **AgendaLX** resolves on the source's own numeric `venue_id` (from
  `Observation.source_fields.venue_id`) — more stable than matching on
  `venue_name` text, which could vary.
- **Hot Clube** resolves on the *exact* retained `location_text` string
  (its ICS `LOCATION` field doesn't expose a separate stable venue key —
  `venue_name` is deliberately left `null` for this source, see
  `docs/OBSERVATION_PIPELINE.md`).

There is no string-similarity, Levenshtein-distance, or partial-match
logic anywhere in this resolver. A venue_id/location_text that isn't in
one of the two lookup tables is `UNRESOLVED`, full stop — never a "best
guess."

## Fail-closed behaviour

Several real records in the 19 retained Observations were deliberately
left unresolved, each for a documented, evidence-based reason:

| Observation | venue text | Why unresolved |
|---|---|---|
| AgendaLX "Fado na Rua" | "Junta de Freguesia de Santa Maria Maior" | This is a parish administrative council, not a performance venue — the event itself is a roving street programme ("Fado na Rua" = "Fado in the street"). |
| AgendaLX "MEO Kalorama" | "Parque da Belavista" | A large, multi-stage festival park — no single point is the venue. |
| AgendaLX "Avenidas Hot Jazz" | "Jardim do Arco do Cego" | A specific public garden (also referenced by Hot Clube — see below), but an open-air programme with no single-point official address found in this bounded proof. |
| AgendaLX "Sunset Sessions" | "Centro Vasco da Gama" | The shopping centre's official site (`centrovascodagama.pt`) returned no fetchable content within this proof (client-rendered / bot-protected); an address existed only in third-party listings, which this proof does not treat as authoritative. |
| AgendaLX "Sardinhas com Bigodes" | "Museu de Lisboa - Teatro Romano" | Multiple independent secondary sources agree on an address, but every first-party page found (`museudelisboa.pt`, the Lisbon City Council's own venue directory, and a Portuguese government heritage-monument page) was either a JavaScript-rendered page this proof's tooling could not read, returned HTTP 403, or was unreachable — no authoritative page's *own* content could be directly confirmed. |
| AgendaLX "Soma Please" | "Casa Capitão" (slug `casa-do-capitao`) | The obvious-looking official domain, `casadocapitao.pt`, was checked and turned out to be unrelated rural tourism accommodation **in the Azores** — a genuine false-lead, caught by fetching the page directly rather than trusting the name/slug. No verified Lisbon venue page was found for this AgendaLX record within this proof's bounded search. |
| AgendaLX "Bees & Honey" | "Lisboa ao Vivo" | No official first-party page could be found distinguishing this from Lisbon's many other live-music bars within this proof's bounded search. |
| Hot Clube event `3786` ("Eupnea") | "Muzeu Praça Municipal 62" | Investigation revealed "Muzeu" is *Muzeu – Pensamento e Arte Contemporânea DST*, a museum in **Braga** — a different city entirely, hosting a touring "Jazz no Museu" series curated by Hot Clube. Correctly out of scope for a Lisbon venue registry, not a failed lookup. |
| Hot Clube events `3788`/`3790`/`3793` | "Jardim do Arco do Cego Rua Dona Filipa de Vilhena" | Same outdoor garden as above — left unresolved for the same reason. |

In every case, **an unresolved gig is preferable to a false map marker** —
this proof stops rather than inventing a convenient pin.

## Cross-source Capitólio proof

This is the central reconciliation result of this task. Two structurally
unrelated sources describe the same real building differently:

- AgendaLX record `241429` ("Há Jazz no Parque Mayer!") has
  `venue_name: "Capitólio"`, `source_fields.venue_id: 798`.
- Five Hot Clube events (`3794`, `3795`, `3797`, `3799`, `3801` — all part
  of the same "Há Jazz no Parque Mayer" series) each have
  `location_text: "Cineteatro Capitólio Parque Mayer"`.

`resolveAgendalxObservation()` (via `venue_id: 798`) and
`resolveHotClubeObservation()` (via the exact `location_text` string)
independently resolve to the **same** `venue_id`:
`venue-lisboa-cineteatro-capitolio-teatro-raul-solnado` —
`tests/venue-resolution.test.mjs` proves this directly. This is Venue
reconciliation only: the six underlying Observations (1 AgendaLX + 5 Hot
Clube) remain six separate Observations. Nothing here merges, deduplicates,
or resolves them into a canonical Event.

## Result summary

- **3 canonical venues** in `venues/lisbon.json`: Capitólio (`CONFIRMED`,
  with coordinates), Igreja e Convento da Graça (`ADDRESS_ONLY`), BOTA
  Anjos (`ADDRESS_ONLY`).
- **8 of the 19 real Observations resolve**: 3 AgendaLX (Capitólio,
  Graça, BOTA) + 5 Hot Clube (all Capitólio) — exceeding the task's
  minimum target of 5.
- The Capitólio cross-source case resolves to one Venue, as required.
- 11 Observations remain honestly unresolved, each for a documented
  reason (see table above) — not silently dropped.

## What remains before genuine gigs can be drawn on the map

- **Coordinates for `ADDRESS_ONLY` venues.** Igreja e Convento da Graça
  and BOTA Anjos have real, evidenced addresses but no evidenced
  coordinates yet. Turning an evidenced address into map-ready
  coordinates requires a deliberate, separately-authorised geocoding step
  (this task's brief explicitly excluded bulk/automated geocoding) — not
  a guess made here.
- **The 11 unresolved Observations** (see table) need either better
  first-party evidence (e.g. a working, fetchable official page for
  Centro Vasco da Gama or Museu de Lisboa - Teatro Romano) or a
  considered, single-point decision for genuinely outdoor/imprecise
  venues (e.g. a specific bandstand/entrance coordinate for Jardim do
  Arco do Cego, if such a point can be evidenced) — not attempted here.
- **Venue → map pin rendering** itself is explicitly out of scope for
  this task (no map/UI changes were made).
- **Event reconciliation.** Resolving Observations to a shared Venue is
  not the same as recognising two Observations describe the *same gig* —
  that is separate, later work per `docs/ARCHITECTURE.md`'s
  Observation → Event model, and is not performed or assumed here.
