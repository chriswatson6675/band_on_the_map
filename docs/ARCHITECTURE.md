# Architecture

Band on the Map uses canonical domain objects to separate source-specific observations from application identity.

## Canonical Objects

### Source

A permitted data source, feed, partner, publisher, venue site, ticketing source, or other origin from which event or event-related information is obtained.

### Artist

A canonical performer, band, DJ, ensemble, or other live act associated with one or more events.

### Venue

A canonical place where an event occurs. Venue identity and coordinates are managed by the application rather than independently trusted from every source.

### Event

A canonical real-world occurrence that is deliberately staged, attendable, and bounded in time, resolved from one or more Observations.

A gig, a festival, a football fixture, a conference and an exhibition are all Events. A music gig and a football fixture are peer Events: neither is a special case of the other.

Continuous or measured city conditions are not Events. Weather, traffic, footfall, hotel demand and transport disruption describe the context around occurrences rather than occurrences someone stages and a person can attend, and they belong to future context/condition/metric layers instead.

### Observation

A source-specific record of a potential event or event-related fact, preserving the original source context, identifiers, provenance, and observed values.

### Offer

A ticket listing, price, availability, sales URL, or other commercial/access option associated with a canonical event.

## Event Classification and Containment

### Classification

Every Event carries two classification fields:

- `event_category` — a small, closed, stable top-level classification, and the primary product filter. Adding a category is a deliberate architectural decision.
- `event_type` — an extensible type within its category. Adding a type is a data change, not a change to the Event model.

The initially defined vocabulary is deliberately minimal:

- `MUSIC` — `GIG`, `FESTIVAL`, `PERFORMANCE`
- `SPORT` — `FOOTBALL_FIXTURE`

Further categories and types are defined when a package genuinely needs them. None is defined speculatively here.

Classification is mutable enrichment: a mis-classified Event is corrected in place, and the correction never moves its identity (rule 7).

### Containment

Classification describes what kind of occurrence an Event is. It does not describe containment, and the two are independent concepts.

An Event may optionally reference a parent Event (`parent_event_id`), for genuine containment only:

```text
festival   -> performance
tournament -> fixture
conference -> session
```

- Most Events have no parent.
- A category is not a parent. A football fixture is not a child of `SPORT`, and a gig is not a child of `MUSIC`.
- Parent and child need not share a category or a venue: a festival spans stages, a tournament spans stadiums.
- A child does not inherit status from its parent. Cancelling a parent does not assert that a child is cancelled; that requires its own evidence.
- The parent relationship is not part of canonical Event identity.

### Temporal shape

An Event is either:

- `POINT_IN_TIME` — matched by its start, such as a gig or a fixture; or
- `RUN` — active across a bounded start/end interval, such as a multi-day festival or an exhibition.

The distinction exists so that date filtering can treat a run as active on every date it spans, rather than pretending it begins anew on each queried date. It does not change the Observation time contract (see `docs/OBSERVATION_PIPELINE.md`).

## Mandatory Architectural Rules

1. Incoming source records do not directly become canonical Events. They become Observations. Observations, and the evidence derived from them, may later be admitted to canonical Events through a governed, evidence-recorded admission step. Not every Observation becomes an Event.
2. Multiple Observations may resolve to one canonical Event.
3. Every Observation permanently retains its Source and provenance.
4. Venue identity and coordinates are canonical rather than independently trusted from every source.
5. Ticket listings/prices/URLs belong to Offers rather than being duplicated into Events.
6. Source-specific identifiers must never become the application's canonical identity scheme.
7. Canonical Event identity is application-issued, opaque, and source-independent. It is minted once at admission and is never re-derived from an Event's own attributes, because an Event's time, venue, title and participants can all change. Provider identifiers and derived occurrence fingerprints remain evidence and mapping inputs, never Event identity. An Observation never carries an Event identity: the Event-to-Observation relationship is recorded outside the Observation, in an evidence-bearing mapping.
8. An Event may exist without a resolved Venue. Existing as an Event and being plottable on the map are separate concerns, decided at separate layers.
9. Every Event publication path states the event categories it publishes. No publication path defaults to publishing every category.

## Runtime Architecture

The intended high-level runtime architecture is:

```text
external permitted sources -> DigitalOcean ingestion workers -> normalisation/deduplication -> Supabase PostgreSQL -> application/search API -> interactive web map
```

Supabase is the canonical persistent datastore.

DigitalOcean owns scheduled/background ingestion and processing.

Bolt may be used for rapid UI/product development.

Codex and Claude may be used for repository implementation, testing, review and refactoring.

GitHub is the source of truth for code.

No runtime AI is required for the MVP.
