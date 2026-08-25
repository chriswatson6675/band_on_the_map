import assert from "node:assert/strict";
import test from "node:test";

import { applyAndValidate, applyArtistEnrichmentToArtifact } from "../ingestion/artist-enrichment/apply.mjs";
import { validatePublicationArtifact } from "../ingestion/map/publication.mjs";

// BEATMAPPED-ENRICHMENT-PILOT-01 — proves the network-free re-enrichment
// path (`npm run enrich:artists`) reapplies onto an ALREADY-PUBLISHED
// artifact's own display listings without re-acquiring/re-dating/renaming
// anything, and without changing derived counts.

function baseArtifact() {
  return {
    generated_at: "2026-08-25T00:00:00.000Z",
    window: { from: null, to: null },
    source_report: { success_count: 1, failure_count: 0, sources: [{ source_id: "meo-arena", success: true, raw_record_count: 1, observation_count: 1 }] },
    counts: { observation_count: 1, display_listing_count: 1, map_marker_count: 1 },
    countries: {
      Portugal: {
        markers: [
          {
            venue_id: "venue-lisboa-meo-arena",
            canonical_name: "MEO Arena",
            latitude: 38.7685312,
            longitude: -9.0940297,
            address: "Rossio dos Olivais, 1990-231 Lisboa",
            display_listings: [
              {
                kind: "SINGLE",
                source_id: "meo-arena",
                source_record_id: "15722",
                source_name: "Altice / MEO Arena",
                title: "EVANESCENCE 2026 WORLD TOUR",
                start: { raw: "04 OUT 2026", date: "2026-10-04", iso: null, is_utc: null, tzid: null, certainty: "DATE_ONLY" },
                end: { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" },
                event_url: "https://arena.meo.pt/agenda/evanescence-2026-world-tour_pt/15722",
              },
            ],
          },
        ],
      },
      Croatia: { markers: [] },
    },
    artists: [],
  };
}

const ARTIST_REGISTRY = [
  { artist_id: "artist-evanescence", canonical_name: "Evanescence", aliases: [], genres: [{ family: "Rock", tag: "Alternative Metal", confidence: "HIGH", method: "AI_ASSESSED_PUBLIC_KNOWLEDGE", basis: "x", asserted_at: "2026-08-25" }] },
];
const ARTIST_LINKS = [{ source_id: "meo-arena", source_record_id: "15722", artist_id: "artist-evanescence" }];

test("applyArtistEnrichmentToArtifact attaches artists to the already-published listing without changing its own facts", () => {
  const artifact = baseArtifact();
  const enriched = applyArtistEnrichmentToArtifact(artifact, { artistRegistry: ARTIST_REGISTRY, artistLinks: ARTIST_LINKS });

  const listing = enriched.countries.Portugal.markers[0].display_listings[0];
  assert.equal(listing.title, "EVANESCENCE 2026 WORLD TOUR");
  assert.equal(listing.source_record_id, "15722");
  assert.equal(listing.event_url, artifact.countries.Portugal.markers[0].display_listings[0].event_url);
  assert.equal(listing.artists[0].artist_id, "artist-evanescence");
});

test("applyArtistEnrichmentToArtifact never mutates the artifact passed in", () => {
  const artifact = baseArtifact();
  const originalListing = artifact.countries.Portugal.markers[0].display_listings[0];
  applyArtistEnrichmentToArtifact(artifact, { artistRegistry: ARTIST_REGISTRY, artistLinks: ARTIST_LINKS });
  assert.ok(!("artists" in originalListing));
});

test("applyArtistEnrichmentToArtifact leaves counts untouched — enrichment adds a field, never a listing/marker", () => {
  const artifact = baseArtifact();
  const enriched = applyArtistEnrichmentToArtifact(artifact, { artistRegistry: ARTIST_REGISTRY, artistLinks: ARTIST_LINKS });
  assert.deepEqual(enriched.counts, artifact.counts);
});

test("applyArtistEnrichmentToArtifact rebuilds the top-level artists search index", () => {
  const artifact = baseArtifact();
  const enriched = applyArtistEnrichmentToArtifact(artifact, { artistRegistry: ARTIST_REGISTRY, artistLinks: ARTIST_LINKS });
  assert.equal(enriched.artists.length, 1);
  assert.equal(enriched.artists[0].events.length, 1);
  assert.equal(enriched.artists[0].events[0].venue_id, "venue-lisboa-meo-arena");
});

test("applyAndValidate returns ok:true with a schema-valid result for good input", () => {
  const result = applyAndValidate(baseArtifact(), { artistRegistry: ARTIST_REGISTRY, artistLinks: ARTIST_LINKS });
  assert.equal(result.ok, true);
  assert.deepEqual(validatePublicationArtifact(result.artifact), []);
});

test("applyAndValidate returns ok:false without throwing when the input artifact is already malformed", () => {
  const broken = baseArtifact();
  broken.counts.map_marker_count = 999; // drifting total
  const result = applyAndValidate(broken, { artistRegistry: ARTIST_REGISTRY, artistLinks: ARTIST_LINKS });
  assert.equal(result.ok, false);
  assert.ok(result.errors.length > 0);
});
