# Artist Enrichment

Task: BEATMAPPED-ENRICHMENT-PILOT-01

This document explains the canonical Artist entity and the Event ->
Artist -> genre enrichment layer this pilot adds, proven end-to-end
against five real, already-ingested MEO Arena Observations. It is
documentation of a bounded proof, not a claim that every existing
Observation now has an Artist attached — see "Scope" below.

## Why a canonical Artist entity

`docs/ARCHITECTURE.md` has always named Artist as one of Band on the
Map's canonical objects, alongside Source, Venue, Event, Observation, and
Offer — but until this task nothing implemented it. Every Observation's
`title` field is source-specific performance text (see
`docs/OBSERVATION_PIPELINE.md`) — "EVANESCENCE 2026 WORLD TOUR" is a
tour-branded event title, not a canonical artist name. Without a
separate Artist entity, "find me events by Evanescence" has no stable
target to search against, and a genre can only ever be guessed per-event
rather than genuinely owned by the artist across every event they play.

## Canonical objects added

### Artist (`ingestion/artist/contract.mjs`)

A first-class, **performance-independent** entity:

```text
{ artist_id, canonical_name, aliases: [...], genres: [...] }
```

- `artist_id` is deterministic (`createArtistId(canonical_name)`,
  slug-derived), matching `createVenueId()`'s existing convention.
- `aliases` holds observed name/performance-wording variants (e.g. a tour
  title) — never the canonical identity itself.
- `genres` is an array of **genre claims** (see below) — an Artist may
  have multiple genres (product decision #4), and this pilot's own data
  proves it (Evanescence: Rock + Metal; Duran Duran: Pop + Rock; Thirty
  Seconds to Mars: Rock + Alternative).

Identity resolution is deliberately conservative (product decision #3):
this contract never merges two Artists on name similarity alone, and
nothing in this pilot implements fuzzy artist-name matching anywhere.

### Genre claim

```text
{ family, tag, confidence, method, basis, asserted_at }
```

- `family` is the simple, public-facing genre (Rock, Electronic, Metal,
  Pop, Alternative, ...) — matching the existing public Genre filter's
  own vocabulary (product decision #10).
- `tag` is a more specific label underneath the family, only when
  genuinely useful (product decision #10) — e.g. family `Metal`, tag
  `Death Metal / Viking Metal` for Amon Amarth.
- `confidence` is `HIGH` | `MODERATE` | `LOW` — a coarse, honest signal,
  never a fabricated numeric precision (product decision: "do not
  pretend confidence is scientifically precise").
- `method` records how the claim was reached. This pilot uses exactly
  one value, `AI_ASSESSED_PUBLIC_KNOWLEDGE`: an AI interpretation of
  each artist's own long-standing, widely and consistently documented
  public genre identity (their entire studio catalogue and touring
  history) — never invented, and never derived from a single event
  listing's own title text (product decision #12: "AI may interpret
  evidence but must not invent missing facts").
- `basis` is free text answering, for this specific claim, "why does
  BeatMapped believe this Artist has this genre?" — see each entry in
  `artists/artists.json` for the five real answers.
- `asserted_at` is the date the claim was made, retained rather than
  computed at read time.

### Event -> Artist link (`artists/event-artist-links.json`,
`ingestion/artist/resolver.mjs`)

No canonical Event entity exists yet in this repository (per
`docs/OBSERVATION_PIPELINE.md`'s own "next intended stage" —
Event reconciliation is still future work). The smallest correct
foundation available today is therefore to link the **Observation
identity** every display listing already carries —
`(source_id, source_record_id)` — to a canonical `artist_id`:

```text
{ source_id, source_record_id, artist_id, method, decided_at }
```

This mirrors `ingestion/venue/resolver.mjs`'s own explicit-mapping
convention exactly: no fuzzy matching, and an Observation with no
curated link stays unlinked rather than being guessed at. Every one of
this pilot's five links was confirmed against one real Observation's
exact retained title (see `event-artist-links.json`'s own
`observed_title` field) — never a partial or fuzzy match. Once a real
canonical Event entity exists, this link's target can move from
Observation identity to Event identity without changing its meaning.

## How enrichment reaches the map without touching Observations

```text
Observation (raw, immutable — never modified by this pilot)
   |
   v  projectObservationsToDisplayMarkers()  [unchanged]
Display listing (source_id, source_record_id, title, start, ...)
   |
   v  attachArtistGenres()  [ingestion/map/attach-artist-genres.mjs, NEW]
Display listing + `artists: [{artist_id, canonical_name, genres}]`
   |
   v  buildArtistIndex()  [ingestion/map/publication.mjs, NEW]
Publication artifact's top-level `artists` search index
```

`attachArtistGenres()` never mutates an Observation or a listing's own
title/source fields — it only *adds* a read-only `artists` array,
resolved purely from the explicit link file above. A listing with no
link keeps `artists: []`; absence of evidence is never turned into a
fact. This is why "Never modify the original Observation to add genre
information" holds: the enrichment lives one layer above Observations,
attached at display-listing build time, not written back into them.

`buildArtistIndex()` (in `ingestion/map/publication.mjs`) is the one
place Artist search results are assembled: for each canonical Artist it
collects every linked, still-upcoming event across the freshly built
markers, so the public site's Artist search never has to re-walk every
marker itself.

## Genre inheritance and additive/OR matching

An Event/listing does not carry its own separate genre field in this
pilot — it **inherits** its genre(s) entirely from its linked Artist(s)
(product decision #8). Because an Artist may carry more than one genre,
and `listingHasGenre()` (`ingestion/map/artist-genre-search.mjs`) matches
on *either* a genre's `family` or its `tag`, matching is additive/OR by
construction: Evanescence's linked event is findable under a genre
filter of Rock **or** Metal, never only the first genre listed.

## Public search/filter/map surface

`ingestion/map/artist-genre-search.mjs` (browser-safe, dependency-free,
imported directly by `app/page.tsx`) provides:

- `searchArtists(query, artists)` — case/diacritic-insensitive substring
  search over the publication artifact's `artists` index, backing the
  public Artist search field.
- `filterMarkersByArtistId(markers, artistId)` / `filterMarkersByGenre
  (markers, genre)` — narrow an already-built marker list down to only
  the matching display listings, dropping any venue left with none. The
  **mapped object stays the Event** (a marker's display listing) in both
  cases — selecting an Artist never turns the Artist itself into a map
  pin.

## Scope (what this pilot deliberately does not do)

- Only five artists/links exist (`artists/artists.json`,
  `artists/event-artist-links.json`) — this is a bounded proof, not
  broad enrichment of every existing Observation across every source.
- No tour-page discovery, price enrichment, event-type enrichment,
  recursive discovery, artist biographies/images, or a large genre
  ontology — see the task brief's own "IMPORTANT BOUNDARIES".
- No canonical Event entity — links target Observation identity (see
  above); migrating them once a real Event entity exists is future work.
- No event-specific genre inference beyond artist inheritance (product
  decision #9 explicitly defers this).
