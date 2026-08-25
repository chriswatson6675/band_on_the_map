import assert from "node:assert/strict";
import test from "node:test";

import { indexArtistLinks, resolveArtistForIdentity, resolveArtistForObservation } from "../ingestion/artist/resolver.mjs";

// BEATMAPPED-ENRICHMENT-PILOT-01 — mirrors ingestion/venue/resolver.mjs's
// own "explicit mapping only, never fuzzy" convention: an Observation with
// no curated link stays unresolved, never guessed at.

const LINKS = [
  { source_id: "meo-arena", source_record_id: "15722", artist_id: "artist-evanescence" },
  { source_id: "meo-arena", source_record_id: "16031", artist_id: "artist-jungle" },
];

test("resolveArtistForIdentity resolves an explicitly linked (source_id, source_record_id) pair", () => {
  const result = resolveArtistForIdentity("meo-arena", "15722", LINKS);
  assert.equal(result.resolution_status, "RESOLVED");
  assert.equal(result.artist_id, "artist-evanescence");
  assert.equal(result.resolution_method, "EXPLICIT_EVENT_ARTIST_LINK");
});

test("resolveArtistForIdentity is UNRESOLVED for a pair with no curated link — never a guess", () => {
  const result = resolveArtistForIdentity("meo-arena", "99999-not-linked", LINKS);
  assert.equal(result.resolution_status, "UNRESOLVED");
  assert.equal(result.artist_id, null);
  assert.equal(result.resolution_method, "NO_EXPLICIT_EVENT_ARTIST_LINK");
});

test("resolveArtistForIdentity never matches on source_record_id alone across a different source_id", () => {
  const result = resolveArtistForIdentity("some-other-source", "15722", LINKS);
  assert.equal(result.resolution_status, "UNRESOLVED");
});

test("resolveArtistForObservation reads source_id/source_record_id off an Observation-shaped object", () => {
  const result = resolveArtistForObservation({ source_id: "meo-arena", source_record_id: "16031" }, LINKS);
  assert.equal(result.artist_id, "artist-jungle");
});

test("indexArtistLinks + a pre-built Map produces identical results to passing the raw links array", () => {
  const index = indexArtistLinks(LINKS);
  const viaMap = resolveArtistForIdentity("meo-arena", "15722", index);
  const viaArray = resolveArtistForIdentity("meo-arena", "15722", LINKS);
  assert.deepEqual(viaMap, viaArray);
});

test("an empty/undefined links list resolves everything as UNRESOLVED, never throws", () => {
  assert.equal(resolveArtistForIdentity("meo-arena", "15722", []).resolution_status, "UNRESOLVED");
  assert.equal(resolveArtistForIdentity("meo-arena", "15722", undefined).resolution_status, "UNRESOLVED");
});
