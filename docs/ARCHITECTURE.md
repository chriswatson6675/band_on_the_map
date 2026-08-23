# Architecture

Band on the Map uses canonical domain objects to separate source-specific observations from application identity.

## Canonical Objects

### Source

A permitted data source, feed, partner, publisher, venue site, ticketing source, or other origin from which live music information is obtained.

### Artist

A canonical performer, band, DJ, ensemble, or other live act associated with one or more events.

### Venue

A canonical place where an event occurs. Venue identity and coordinates are managed by the application rather than independently trusted from every source.

### Event

A canonical live music occurrence, such as a gig or festival, resolved from one or more observations.

### Observation

A source-specific record of a potential event or event-related fact, preserving the original source context, identifiers, provenance, and observed values.

### Offer

A ticket listing, price, availability, sales URL, or other commercial/access option associated with a canonical event.

## Mandatory Architectural Rules

1. Incoming source records do not directly become canonical Events. They become Observations.
2. Multiple Observations may resolve to one canonical Event.
3. Every Observation permanently retains its Source and provenance.
4. Venue identity and coordinates are canonical rather than independently trusted from every source.
5. Ticket listings/prices/URLs belong to Offers rather than being duplicated into Events.
6. Source-specific identifiers must never become the application's canonical identity scheme.

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
