import assert from "node:assert/strict";
import test from "node:test";

import { buildArtistIndex, buildPortugalMarkers, buildPublicationArtifact, validatePublicationArtifact } from "../ingestion/map/publication.mjs";

// BEATMAPPED-ENRICHMENT-PILOT-01 — the Artist search index layered on top
// of BOTM-PUBLIC-MAP-LIVE-DATA-01's existing publication boundary (see
// tests/publication-artifact.test.mjs for that boundary's own, unchanged
// proof). Every existing test in that file must keep passing unmodified —
// artistRegistry/artistLinks are optional and default to producing
// `artists: []`.

const MEO_ARENA_VENUE = {
  venue_id: "venue-lisboa-meo-arena",
  canonical_name: "MEO Arena",
  address: "Rossio dos Olivais, 1990-231 Lisboa",
  latitude: 38.7685312,
  longitude: -9.0940297,
  location_status: "CONFIRMED",
  evidence: [{ url: "https://arena.meo.pt/contactos/" }],
};

const ARTIST_REGISTRY = [
  {
    artist_id: "artist-evanescence",
    canonical_name: "Evanescence",
    aliases: [],
    genres: [{ family: "Rock", tag: "Alternative Metal", confidence: "HIGH", method: "AI_ASSESSED_PUBLIC_KNOWLEDGE", basis: "x", asserted_at: "2026-08-25" }],
  },
  {
    artist_id: "artist-jungle",
    canonical_name: "Jungle",
    aliases: [],
    genres: [{ family: "Electronic", tag: null, confidence: "HIGH", method: "AI_ASSESSED_PUBLIC_KNOWLEDGE", basis: "x", asserted_at: "2026-08-25" }],
  },
];

const ARTIST_LINKS = [{ source_id: "meo-arena", source_record_id: "15722", artist_id: "artist-evanescence" }];

function meoArenaObservation(overrides = {}) {
  return {
    source_id: "meo-arena",
    source_record_id: "15722",
    retrieved_at: "2026-08-24T00:00:00.000Z",
    title: "EVANESCENCE 2026 WORLD TOUR",
    start: { raw: "04 OUT 2026", date: "2026-10-04", iso: null, is_utc: null, tzid: null, certainty: "DATE_ONLY" },
    end: { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" },
    event_url: "https://arena.meo.pt/agenda/evanescence-2026-world-tour_pt/15722",
    source_fields: {},
    ...overrides,
  };
}

test("buildPortugalMarkers, given an artistRegistry/artistLinks, attaches `artists` to the resolved display listing", () => {
  const markers = buildPortugalMarkers({
    lisbonObservations: [meoArenaObservation()],
    portoObservations: [],
    lisbonVenues: [MEO_ARENA_VENUE],
    portoVenues: [],
    lisbonSourceRegistry: [],
    portoSourceRegistry: [],
    artistRegistry: ARTIST_REGISTRY,
    artistLinks: ARTIST_LINKS,
  });
  assert.equal(markers.length, 1);
  const listing = markers[0].display_listings[0];
  assert.equal(listing.artists.length, 1);
  assert.equal(listing.artists[0].artist_id, "artist-evanescence");
});

test("buildPortugalMarkers with no artistRegistry/artistLinks (existing callers) still attaches an empty `artists: []`, never breaking the existing shape", () => {
  const markers = buildPortugalMarkers({
    lisbonObservations: [meoArenaObservation()],
    portoObservations: [],
    lisbonVenues: [MEO_ARENA_VENUE],
    portoVenues: [],
    lisbonSourceRegistry: [],
    portoSourceRegistry: [],
  });
  assert.deepEqual(markers[0].display_listings[0].artists, []);
});

test("buildArtistIndex returns one entry per registry Artist, each with its own linked upcoming events", () => {
  const markers = buildPortugalMarkers({
    lisbonObservations: [meoArenaObservation()],
    portoObservations: [],
    lisbonVenues: [MEO_ARENA_VENUE],
    portoVenues: [],
    lisbonSourceRegistry: [],
    portoSourceRegistry: [],
    artistRegistry: ARTIST_REGISTRY,
    artistLinks: ARTIST_LINKS,
  });
  const index = buildArtistIndex(markers, ARTIST_REGISTRY, "2026-08-25");

  assert.equal(index.length, 2, "every registry Artist appears, even Jungle with zero linked events here");
  const evanescence = index.find((a) => a.artist_id === "artist-evanescence");
  assert.equal(evanescence.events.length, 1);
  assert.equal(evanescence.events[0].venue_id, "venue-lisboa-meo-arena");
  assert.equal(evanescence.events[0].venue_name, "MEO Arena");
  assert.equal(evanescence.events[0].start.date, "2026-10-04");

  const jungle = index.find((a) => a.artist_id === "artist-jungle");
  assert.deepEqual(jungle.events, [], "an Artist with no linked event still appears, with an honest empty events array");
});

test("buildArtistIndex excludes a PAST event (asOfDate rule) but never drops a genuinely unknown-date event", () => {
  const markers = buildPortugalMarkers({
    lisbonObservations: [meoArenaObservation()],
    portoObservations: [],
    lisbonVenues: [MEO_ARENA_VENUE],
    portoVenues: [],
    lisbonSourceRegistry: [],
    portoSourceRegistry: [],
    artistRegistry: ARTIST_REGISTRY,
    artistLinks: ARTIST_LINKS,
  });

  const asIfPast = buildArtistIndex(markers, ARTIST_REGISTRY, "2027-01-01");
  assert.deepEqual(asIfPast.find((a) => a.artist_id === "artist-evanescence").events, []);

  const unknownDateMarkers = buildPortugalMarkers({
    lisbonObservations: [meoArenaObservation({ start: { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" } })],
    portoObservations: [],
    lisbonVenues: [MEO_ARENA_VENUE],
    portoVenues: [],
    lisbonSourceRegistry: [],
    portoSourceRegistry: [],
    artistRegistry: ARTIST_REGISTRY,
    artistLinks: ARTIST_LINKS,
  });
  const withUnknownDate = buildArtistIndex(unknownDateMarkers, ARTIST_REGISTRY, "2027-01-01");
  assert.equal(withUnknownDate.find((a) => a.artist_id === "artist-evanescence").events.length, 1, "an unknown date is never silently dropped");
});

test("buildPublicationArtifact wires artistRegistry through to a validated `artists` field", () => {
  const markers = buildPortugalMarkers({
    lisbonObservations: [meoArenaObservation()],
    portoObservations: [],
    lisbonVenues: [MEO_ARENA_VENUE],
    portoVenues: [],
    lisbonSourceRegistry: [],
    portoSourceRegistry: [],
    artistRegistry: ARTIST_REGISTRY,
    artistLinks: ARTIST_LINKS,
  });
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-25T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers: markers,
    sourceResults: [{ source_id: "meo-arena", success: true, raw_record_count: 1, observation_count: 1 }],
    observationCount: 1,
    artistRegistry: ARTIST_REGISTRY,
  });

  assert.deepEqual(validatePublicationArtifact(artifact), []);
  assert.equal(artifact.artists.length, 2);
  assert.equal(artifact.artists.find((a) => a.artist_id === "artist-evanescence").events.length, 1);
});

test("buildPublicationArtifact with no artistRegistry publishes artists: [] and remains schema-valid (backward compatible)", () => {
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-25T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers: [],
    sourceResults: [],
    observationCount: 0,
  });
  assert.deepEqual(artifact.artists, []);
  assert.deepEqual(validatePublicationArtifact(artifact), []);
});

test("validatePublicationArtifact rejects a malformed artists entry (missing artist_id)", () => {
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-25T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers: [],
    sourceResults: [],
    observationCount: 0,
  });
  artifact.artists = [{ canonical_name: "No Id" }];
  const errors = validatePublicationArtifact(artifact);
  assert.ok(errors.some((e) => e.includes("artist_id")));
});

test("validatePublicationArtifact accepts an artifact with no `artists` field at all (pre-pilot artifacts)", () => {
  const artifact = buildPublicationArtifact({
    generatedAt: "2026-08-25T00:00:00.000Z",
    from: null,
    to: null,
    portugalMarkers: [],
    sourceResults: [],
    observationCount: 0,
  });
  delete artifact.artists;
  assert.deepEqual(validatePublicationArtifact(artifact), []);
});
