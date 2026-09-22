import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyElementEligibility,
  partitionByEligibility,
  ELIGIBILITY_REASONS,
} from "../ingestion/uk-national-bulk-osm/candidate-eligibility.mjs";

function element(id, tags, extra = {}) {
  return { type: "node", id, lat: 51.5, lon: -0.1, tags, ...extra };
}

// --- Direct tag eligibility: only genuine music/performance-venue signals ---

test("amenity=nightclub is directly eligible", () => {
  const decision = classifyElementEligibility(element(1, { name: "X", amenity: "nightclub" }));
  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, ELIGIBILITY_REASONS.DIRECT_TAG_SIGNAL);
});

test("amenity=theatre is directly eligible", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", amenity: "theatre" })).eligible, true);
});

test("amenity=arts_centre is directly eligible", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", amenity: "arts_centre" })).eligible, true);
});

test("live_music=yes alone is directly eligible", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", live_music: "yes" })).eligible, true);
});

test("music_venue=yes alone is directly eligible", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", music_venue: "yes" })).eligible, true);
});

test("amenity=pub WITH live_music=yes is eligible (explicit evidence)", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", amenity: "pub", live_music: "yes" })).eligible, true);
});

test("amenity=bar WITH live_music=yes is eligible (explicit evidence)", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", amenity: "bar", live_music: "yes" })).eligible, true);
});

// --- Noisy generic categories: NEVER eligible from category alone ---

test("bare amenity=community_centre is NOT eligible — this is the exact founder-flagged regression", () => {
  const decision = classifyElementEligibility(element(1, { name: "Village Hall", amenity: "community_centre" }));
  assert.equal(decision.eligible, false);
  assert.equal(decision.reason, ELIGIBILITY_REASONS.FILTERED_GENERIC_NON_EVENT_LEAD);
});

test("bare amenity=pub (no live_music tag) is NOT eligible", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "The Red Lion", amenity: "pub" })).eligible, false);
});

test("bare amenity=bar (no live_music tag) is NOT eligible", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", amenity: "bar" })).eligible, false);
});

test("amenity=restaurant is NOT eligible", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", amenity: "restaurant" })).eligible, false);
});

test("amenity=place_of_worship is NOT eligible", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", amenity: "place_of_worship" })).eligible, false);
});

test("amenity=school is NOT eligible", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", amenity: "school" })).eligible, false);
});

test("leisure=sports_centre is NOT eligible", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", leisure: "sports_centre" })).eligible, false);
});

test("social_facility (generic social centre) is NOT eligible", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", amenity: "social_facility" })).eligible, false);
});

test("an element with no relevant tags at all is NOT eligible", () => {
  assert.equal(classifyElementEligibility(element(1, { name: "X", shop: "bakery" })).eligible, false);
});

// --- Existing-registry evidence: only a STRONG match promotes eligibility, never a merely possible one ---

test("a generic-category element with a STRONG existing-registry match (name+address) is eligible", () => {
  // address() (ingestion/venue-discovery/providers/overpass.mjs) joins
  // addr:street then addr:housenumber, e.g. "Main St 1" — matched here
  // exactly, not the more natural "1 Main St" reading order.
  const registryRecords = [{ kind: "VENUE", id: "v1", name: "Community Hall", address: "Main St 1, Leeds", website: null }];
  const el = element(1, { name: "Community Hall", amenity: "community_centre", "addr:street": "Main St", "addr:housenumber": "1", "addr:city": "Leeds" });
  const decision = classifyElementEligibility(el, registryRecords);
  assert.equal(decision.eligible, true);
  assert.equal(decision.reason, ELIGIBILITY_REASONS.EXISTING_REGISTRY_STRONG_MATCH);
  assert.deepEqual(decision.registryMatch, [{ kind: "VENUE", id: "v1" }]);
});

test("a generic-category element with only a POSSIBLE (name-only, no address/postcode/domain) registry match is still NOT eligible", () => {
  const registryRecords = [{ kind: "VENUE", id: "v1", name: "Community Hall", address: "99 Somewhere Else, Truro", website: null }];
  const el = element(1, { name: "Community Hall", amenity: "community_centre" });
  const decision = classifyElementEligibility(el, registryRecords);
  assert.equal(decision.eligible, false);
});

test("an empty registry never makes a generic-category element eligible", () => {
  const decision = classifyElementEligibility(element(1, { name: "Village Hall", amenity: "community_centre" }), []);
  assert.equal(decision.eligible, false);
});

// --- partitionByEligibility: retained provenance, no silent drops, correct counts ---

test("partitionByEligibility splits eligible vs filtered, retaining full OSM identity on filtered leads", () => {
  const elements = [
    element(1, { name: "Real Club", amenity: "nightclub" }),
    element(2, { name: "Village Hall", amenity: "community_centre" }, { osm_version: 5, osm_timestamp: "2025-01-01T00:00:00Z" }),
    element(3, { name: "The Anchor", amenity: "pub" }),
  ];
  const { eligible, filtered } = partitionByEligibility(elements);
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].id, 1);
  assert.equal(filtered.length, 2);
  const hall = filtered.find((f) => f.id === 2);
  assert.equal(hall.type, "node");
  assert.equal(hall.tags.amenity, "community_centre");
  assert.equal(hall.osm_version, 5);
  assert.equal(hall.reason, ELIGIBILITY_REASONS.FILTERED_GENERIC_NON_EVENT_LEAD);
});

test("partitionByEligibility on an all-community-centre input yields zero eligible candidates", () => {
  const elements = [
    element(1, { name: "Hall A", amenity: "community_centre" }),
    element(2, { name: "Hall B", amenity: "community_centre" }),
    element(3, { name: "Hall C", amenity: "community_centre" }),
  ];
  const { eligible, filtered } = partitionByEligibility(elements);
  assert.equal(eligible.length, 0, "zero bare community centres must ever reach the main candidate census");
  assert.equal(filtered.length, 3);
});

test("partitionByEligibility's signalCounts breaks candidates down by the qualifying tag/signal", () => {
  const elements = [
    element(1, { name: "A", amenity: "nightclub" }),
    element(2, { name: "B", amenity: "theatre" }),
    element(3, { name: "C", amenity: "nightclub" }),
    element(4, { name: "D", amenity: "community_centre" }),
  ];
  const { signalCounts } = partitionByEligibility(elements);
  assert.equal(signalCounts["amenity=nightclub"], 2);
  assert.equal(signalCounts["amenity=theatre"], 1);
  assert.equal(signalCounts["amenity=community_centre"], undefined);
});
