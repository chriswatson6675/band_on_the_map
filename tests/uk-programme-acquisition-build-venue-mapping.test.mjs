import assert from "node:assert/strict";
import test from "node:test";

import { buildVenueMappingEntry } from "../ingestion/uk-programme-acquisition/build-venue-mapping.mjs";
import { resolveFromMappings } from "../ingestion/venue-onboarding/data-driven-resolver.mjs";

function venue(overrides = {}) {
  return { venue_id: "venue-london-example-hall", canonical_name: "Example Hall", ...overrides };
}

function observation(overrides = {}) {
  return {
    source_id: "uk-prog-london-example-hall",
    source_record_id: "a-real-gig",
    retrieved_at: "2026-09-23T10:00:00.000Z",
    title: "A Real Gig",
    venue_name: null,
    location_text: null,
    source_fields: {},
    ...overrides,
  };
}

test("buildVenueMappingEntry returns null when there are no proven observations to derive a key from", () => {
  assert.equal(buildVenueMappingEntry({ sourceId: "uk-prog-x", venue: venue(), observations: [], officialUrl: "https://x.example.com/", today: "2026-09-23" }), null);
});

test("buildVenueMappingEntry derives SOURCE_ID as the key when the observation carries no venue_name/location_text/source_fields.venue_id (the common single-venue-source case)", () => {
  const entry = buildVenueMappingEntry({ sourceId: "uk-prog-london-example-hall", venue: venue(), observations: [observation()], officialUrl: "https://example-hall.example.com/", today: "2026-09-23" });
  assert.equal(entry.source_key_type, "SOURCE_ID");
  assert.equal(entry.source_key, "uk-prog-london-example-hall");
  assert.equal(entry.venue_id, "venue-london-example-hall");
});

test("buildVenueMappingEntry follows the observation's own actual key derivation when the collector DID populate venue_name (never blindly assumes SOURCE_ID)", () => {
  const entry = buildVenueMappingEntry({
    sourceId: "uk-prog-london-example-hall",
    venue: venue(),
    observations: [observation({ venue_name: "Example Hall" })],
    officialUrl: "https://example-hall.example.com/",
    today: "2026-09-23",
  });
  assert.equal(entry.source_key_type, "VENUE_NAME");
  assert.equal(entry.source_key, "Example Hall");
});

test("a real Observation from this source resolves back to the correct canonical venue via the SAME resolution logic the production resolver uses", () => {
  const obs = observation();
  const entry = buildVenueMappingEntry({ sourceId: "uk-prog-london-example-hall", venue: venue(), observations: [obs], officialUrl: "https://example-hall.example.com/", today: "2026-09-23" });

  const resolution = resolveFromMappings(obs, [entry]);
  assert.equal(resolution.resolution_status, "RESOLVED");
  assert.equal(resolution.venue_id, "venue-london-example-hall");
});

test("a DIFFERENT source's observation is never accidentally resolved by this venue's mapping entry", () => {
  const entry = buildVenueMappingEntry({ sourceId: "uk-prog-london-example-hall", venue: venue(), observations: [observation()], officialUrl: "https://example-hall.example.com/", today: "2026-09-23" });
  const otherObs = observation({ source_id: "uk-prog-some-other-venue" });
  const resolution = resolveFromMappings(otherObs, [entry]);
  assert.equal(resolution.resolution_status, "UNRESOLVED");
});
