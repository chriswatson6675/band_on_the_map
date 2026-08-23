# Observation Pipeline

Reviewed: 2026-08-23
Task: BOTM-OBSERVATION-01

This document explains the generic Observation contract
(`ingestion/observation/contract.mjs`) and the two source-specific
adapters proven against it — AgendaLX (`ingestion/agendalx/
observation-adapter.mjs`) and Hot Clube de Portugal
(`ingestion/hot-clube/observation-adapter.mjs`) — using the genuine,
retained fixtures already committed to this repository. It is
documentation of the pipeline this proof establishes; it does not
describe a running production system.

## What an Observation is

Per `docs/ARCHITECTURE.md`, an Observation is:

> a source-specific record of a potential event or event-related fact,
> preserving the original source context, identifiers, provenance, and
> observed values.

In this task's own words: an Observation is **"what one source said about
one source record at one retrieval point."**

## What an Observation is NOT

- It is **not** a canonical Event. It carries no Event identity of any
  kind, and this pipeline never generates one — see "Forbidden identity
  fields" below.
- It does **not** resolve Venue identity or coordinates. `venue_name` and
  `location_text` are source-reported text, not a canonical `Venue`.
- It does **not** deduplicate across sources or across records within one
  source. Two sources' Observations of the same real-world gig stay two
  separate Observations here.
- It is **not** a persistence layer. Nothing in this pipeline writes to
  Supabase, a database, or any durable store — see `docs/SOURCE_REGISTRY.md`
  and this task's own explicit exclusions.

## Source → Observation → (later) Event

```text
Source (registry entry)
   |
   |  one retrieval, per record
   v
Observation  <-- this task proves this step, for two real sources
   |
   |  future, separate work: matching/merging across Observations
   v
Event (canonical, resolved from one or more Observations)
```

This task proves only the first arrow — converting a real, retained
source record into a well-formed Observation. Resolving multiple
Observations (from AgendaLX, Hot Clube, or any other future source) into
one canonical Event is later, separate work, and nothing here assumes or
performs that resolution.

## The contract

`ingestion/observation/contract.mjs` is deliberately source-agnostic — it
never references AgendaLX, Hot Clube, or any other source by name — and
dependency-free, matching the rest of this repository's ingestion code
(`sources/registry/validate.mjs`, `ingestion/ics/parse.mjs`).

```text
{
  source_id,          canonical sources/*.json registry id
  source_record_id,   stable identifier from/discoverable via the source
  retrieved_at,       retained retrieval timestamp (never Date.now())

  source_url,         the technical endpoint this record was retrieved from
  content_type,       the retained response content type, if known

  title,
  description,
  start,              { raw, date, iso, is_utc, tzid, certainty }
  end,                 same shape as start

  venue_name,
  location_text,

  price_text,
  event_url,

  source_fields,      source-specific facts that don't fit a generic field

  raw_evidence,       { fixture_path, evidence_kind, content_type, byte_faithful }
}
```

Every field an adapter does not supply defaults to `null` (or `{}` for
`source_fields`) rather than being fabricated — `createObservation()`
enforces this and throws if `source_id`, `source_record_id`, or
`retrieved_at` is missing, since those three are what make an Observation
identifiable and attributable at all.

### Why `source_record_id` is source-specific

There is no generic algorithm for "the stable ID of a record" — every
source defines its own, and sometimes (see Hot Clube below) the value
that looks stable is not the value that actually is. The contract does
not guess; each adapter is responsible for supplying the ID its own
source proof has established as genuinely stable.

### `start` / `end`: honest, not optimistic

Both fields use the same small shape, and the same rule: never fabricate
an instant, timezone, or offset the source did not genuinely provide.
`certainty` records exactly how much is actually known:

| certainty | meaning |
|---|---|
| `UTC_INSTANT` | a real, confirmed UTC date-time is known (`iso` is set) |
| `DATE_ONLY` | a calendar date is known; no time of day |
| `TZID_QUALIFIED_UNRESOLVED` | source gave a named timezone; not resolved against a timezone database |
| `FLOATING_LOCAL` | source gave a bare local time with no offset information |
| `TEXT_ONLY` | only free human-readable text is available |
| `UNKNOWN` | nothing usable was available |

## AgendaLX

Registry id: `agendalx`. Retained fixture:
`fixtures/agendalx/music-sample.json` (10 records, already classified as
music via explicit source taxonomy — see `docs/sources/AGENDALX.md`).

- `source_record_id` = the source's own numeric `id`, stringified.
- `retrieved_at` = the fixture's own `metadata.retrieved_at`
  (`2026-08-23T15:56:34.0855101Z`) — a real retained timestamp, not the
  time the adapter happens to run.
- `start.date` = `StartDate`; `start.raw` combines `string_dates` and
  `string_times`; `start.certainty` is `DATE_ONLY` — no UTC instant is
  fabricated from a human-readable date range and a per-weekday time
  string.
- `end` is deliberately left empty. AgendaLX's `LastDate` is the last date
  of a **recurring occurrence schedule** (see `occurences`), not the end
  time of one dated event — treating it as `end` would misrepresent a
  series as a single occurrence. The full schedule is preserved honestly
  in `source_fields.occurences` / `source_fields.last_date` instead.
- `price_text` is derived only for the unambiguous `"free"` case. AgendaLX's
  `price_val` is **PHP-serialized** source data (e.g.
  `a:1:{i:0;a:1:{s:5:"value";s:1:"5";}}`). This adapter does not hand-roll
  a PHP deserializer for one field — that would mean trusting a parse this
  project cannot verify — so priced (non-free) events get `price_text:
  null`, with `price_cat`/`price_val` preserved verbatim in
  `source_fields` for a future, deliberately-scoped price adapter to
  handle correctly.
- `raw_evidence.byte_faithful` is honestly `false`. `fixtures/agendalx/
  music-sample.json` is written by `ingestion/agendalx/probe.mjs` via
  `JSON.stringify()` of already-`JSON.parse()`d records — genuinely useful
  structured evidence, but not a byte-identical copy of the original HTTP
  response body.

## Hot Clube de Portugal

Registry id: `hot-clube-de-portugal`. Retained fixtures:
`fixtures/hot-clube/events/*.ics` (9 files) plus
`fixtures/hot-clube/metadata.json` — see `docs/sources/HOT_CLUBE.md` for
the full acquisition proof (`BOTM-ICS-01` / `BOTM-ICS-01A`) this adapter
is built on.

### `event_id` vs the unstable ICS `UID`

This is the most important rule in this adapter, and it is directly a
consequence of a finding from the proof: **the ICS `UID` regenerates on
every download of the same event** (confirmed by re-fetching event
`3794` twice with identical parameters and getting two different `UID`
values). It is not a usable stable identifier.

The genuinely stable identifier is the EventON `event_id` — present in
the HTML programme page's `data-event_id` attribute, and, in this
project, also encoded as the retained fixture's filename
(`fixtures/hot-clube/events/3794.ics`). It **does not appear anywhere
inside the ICS payload itself.**

Consequently:

- `source_record_id` = `event_id`, supplied by the **caller**, from the
  HTML-discovery step (here, the fixture filename / `metadata.json`'s
  `retained_event_ids`) — `toObservation()` throws if no `eventId` is
  supplied, so this can never silently fall back to something parsed out
  of the `.ics` text.
- The ICS `UID` is preserved separately, in `source_fields.ics_uid`, for
  provenance only. It must never be used as `source_record_id`.
- `source_fields.event_id` also carries the same value as
  `source_record_id` — this is the one place `event_id` is allowed to
  appear, explicitly as the Hot Clube *source's own* identifier, never as
  a generated canonical Event ID.

### Timing

`start`/`end` map from the parser's `dtstart`/`dtend` through the same
certainty model documented above. All 9 samples have confirmed-UTC
`DTSTART`/`DTEND` (`certainty: "UTC_INSTANT"`). This is **not** treated as
independently trustworthy timing evidence beyond "reflects whatever the
caller asked for" — `docs/sources/HOT_CLUBE.md` directly tested that the
`sunix`/`eunix` request parameters are client-supplied and echoed back
unvalidated by the server. A future collector must derive the timing it
requests from the HTML page (or its `data-time` attribute), not treat a
successful ICS fetch alone as proof the returned time is correct.

### Location

ICS `LOCATION` (e.g. `Cineteatro Capitólio Parque Mayer`) does not
cleanly separate a venue name from an address. Splitting it would mean
guessing which words are which — so `venue_name` is left `null` and the
full text is kept in `location_text` only.

### Raw evidence

`raw_evidence.evidence_kind` is `RAW_HTTP_RESPONSE_BYTES` and
`byte_faithful: true` — `fixtures/hot-clube/events/{event_id}.ics` are the
genuine, byte-for-byte retained HTTP response bodies (protected from
CRLF/LF mangling by `.gitattributes`), unlike AgendaLX's re-serialized
JSON fixture. `ParsedEvent.unfoldedBlock` (from `ingestion/ics/parse.mjs`)
is explicitly **not** used as raw evidence here — see that module's own
doc comment for why it is normalized, already-unfolded parser text, not
byte-identical source material.

## Forbidden identity fields

Neither adapter, nor the shared contract, ever produces a top-level
`event_id`, `canonical_event_id`, or `canonicalEventId` field on an
Observation — `tests/observation-contract.test.mjs`,
`tests/agendalx-observation.test.mjs`, and
`tests/hot-clube-observation.test.mjs` all assert this directly. The one
sanctioned exception is `source_fields.event_id` on a Hot Clube
Observation, which is explicitly the source's own identifier (see above),
not a generated canonical one.

## Deterministic, fixture-based proof

Both adapters are proven entirely offline, against fixtures already
committed to this repository — no network requests are made by this
pipeline or its tests. Running either adapter twice against the same
fixture input produces deep-equal output (`tests/agendalx-observation
.test.mjs`, `tests/hot-clube-observation.test.mjs`), and `retrieved_at` in
both cases comes from retained provenance (`fixture.metadata.retrieved_at`
for AgendaLX, `metadata.retrieved_at` for Hot Clube) rather than the
current wall-clock time — the same fixtures must always produce the same
Observations, run today or a year from now.

## Fields deliberately not resolved yet

None of the following are implemented or invented by this pipeline:

- coordinates / geocoding for any venue
- canonical `Venue` identity or deduplication
- canonical `Event` identity, matching, or deduplication (across sources
  or within one source's own records)
- `Artist` extraction (no source in this proof exposes a performer field)
- `Offer`/ticketing beyond the conservative `price_text` derivation
  described above
- persistence of any kind — Observations exist only as function return
  values proven by tests, never written to a database or file

## Next intended stage

The next stage of this pipeline, out of scope for this task, is Venue and
location resolution: taking `venue_name`/`location_text` from many
Observations (potentially from many sources) and resolving them against a
canonical `Venue` registry with real coordinates — followed, later still,
by Event reconciliation: matching Observations that describe the same
real-world occurrence (e.g. an AgendaLX record and a Hot Clube record for
the same "Há Jazz no Parque Mayer" concert, which this proof's fixtures
show genuinely overlap) into one canonical `Event`, per
`docs/ARCHITECTURE.md`'s Observation → Event model.
