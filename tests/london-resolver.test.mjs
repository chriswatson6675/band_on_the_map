// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01 —
// London's 6 first-tranche sources are each resolved via the DATA-DRIVEN
// venues/source-venue-mappings.json table (VENUE_NAME key), matching
// Berlin's own precedent exactly — no new hardcoded resolver function was
// added to ingestion/venue/resolver.mjs. This works safely because every
// London collector sets its own venue_name deterministically (either via
// ingestion/squarespace-eventlist/observation-adapter.mjs's venueName
// parameter, or a hardcoded string in the 3 small bespoke adapters) —
// never trusting a source-provided value that could conflict.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolveObservation } from "../ingestion/venue/resolver.mjs";

const LONDON_SOURCE_TO_VENUE = {
  "downstairs-at-the-dome-london": { venueId: "venue-london-downstairs-at-the-dome", venueName: "Downstairs at The Dome" },
  "night-tales-loft-london": { venueId: "venue-london-night-tales-loft", venueName: "Night Tales Loft" },
  "the-roxy-london": { venueId: "venue-london-the-roxy", venueName: "The Roxy" },
  "100-club-london": { venueId: "venue-london-100-club", venueName: "100 Club" },
  "the-underworld-london": { venueId: "venue-london-the-underworld", venueName: "The Underworld" },
  "jazz-cafe-posk-london": { venueId: "venue-london-jazz-cafe-posk", venueName: "Jazz Cafe Posk" },
  "eventim-apollo-london": { venueId: "venue-london-eventim-apollo", venueName: "Eventim Apollo" },
  "jamboree-london": { venueId: "venue-london-jamboree", venueName: "Jamboree" },
};

test("every London source's own deterministic venue_name resolves to its correct canonical venue via the data-driven mapping table", () => {
  for (const [sourceId, { venueId, venueName }] of Object.entries(LONDON_SOURCE_TO_VENUE)) {
    const observation = { source_id: sourceId, source_record_id: "x", venue_name: venueName, location_text: null };
    const result = resolveObservation(observation);
    assert.equal(result.resolution_status, "RESOLVED", `${sourceId} should resolve`);
    assert.equal(result.venue_id, venueId, `${sourceId} should resolve to ${venueId}`);
    assert.match(result.resolution_method, /^DATA_DRIVEN_MAPPING:VENUE_NAME$/);
  }
});

test("an unmapped London source_id/venue_name combination is honestly UNRESOLVED, never guessed", () => {
  const result = resolveObservation({ source_id: "downstairs-at-the-dome-london", source_record_id: "x", venue_name: "Some Other Room", location_text: null });
  assert.equal(result.resolution_status, "UNRESOLVED");
});

test("resolving does not mutate the Observation passed in", () => {
  const observation = { source_id: "100-club-london", source_record_id: "x", venue_name: "100 Club", location_text: null };
  const before = JSON.stringify(observation);
  resolveObservation(observation);
  assert.equal(JSON.stringify(observation), before);
});

// Cross-check: every venue_id this mapping table dispatches to must
// actually exist in venues/london.json — never a mapping to a venue that
// was never admitted to the registry.
test("every London mapping target in venues/source-venue-mappings.json actually exists in venues/london.json", async () => {
  const venueRegistry = JSON.parse(await readFile(new URL("../venues/london.json", import.meta.url), "utf8"));
  const knownVenueIds = new Set(venueRegistry.venues.map((v) => v.venue_id));
  const mappings = JSON.parse(await readFile(new URL("../venues/source-venue-mappings.json", import.meta.url), "utf8"));
  const londonMappings = mappings.mappings.filter((m) => m.source_id.endsWith("-london"));
  assert.equal(londonMappings.length, 8);
  for (const mapping of londonMappings) {
    assert.ok(knownVenueIds.has(mapping.venue_id), `${mapping.venue_id} must exist in venues/london.json`);
  }
});
