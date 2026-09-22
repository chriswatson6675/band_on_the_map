import assert from "node:assert/strict";
import test from "node:test";

import { classifyDiscoveryGroup, deriveAdmitSignals, DISCOVERY_ADMISSION_STATUSES } from "../ingestion/uk-national-discovery/admission.mjs";

function observation(tags, overrides = {}) {
  return {
    candidate_id: "cand-osm-node-1",
    reported_name: "Test Venue",
    discovery_evidence: [
      { kind: "OSM_ELEMENT", value: "node/1" },
      { kind: "OSM_TAGS", value: JSON.stringify(tags) },
    ],
    ...overrides,
  };
}

function group(observations, overrides = {}) {
  return {
    reconciled_candidate_id: "reconciled-cand-osm-node-1",
    reconciliation_status: "DISTINCT",
    observations,
    existing_registry_reconciliation: { status: "NEW_DISCOVERY_CANDIDATE", confident_matches: [], possible_matches: [] },
    ...overrides,
  };
}

test("every DISCOVERY_ADMISSION_STATUSES value is a real, checkable status", () => {
  assert.ok(DISCOVERY_ADMISSION_STATUSES.size > 0);
});

test("amenity=theatre auto-admits", () => {
  const result = classifyDiscoveryGroup(group([observation({ amenity: "theatre", name: "X" })]));
  assert.equal(result.status, "AUTO_ADMIT_HIGH_CONFIDENCE");
  assert.ok(result.signals.includes("amenity=theatre"));
});

test("amenity=nightclub auto-admits", () => {
  const result = classifyDiscoveryGroup(group([observation({ amenity: "nightclub", name: "X" })]));
  assert.equal(result.status, "AUTO_ADMIT_HIGH_CONFIDENCE");
});

test("amenity=arts_centre auto-admits", () => {
  const result = classifyDiscoveryGroup(group([observation({ amenity: "arts_centre", name: "X" })]));
  assert.equal(result.status, "AUTO_ADMIT_HIGH_CONFIDENCE");
});

test("live_music=yes alone (no amenity match) auto-admits", () => {
  const result = classifyDiscoveryGroup(group([observation({ live_music: "yes", name: "X" })]));
  assert.equal(result.status, "AUTO_ADMIT_HIGH_CONFIDENCE");
});

test("music_venue=yes alone auto-admits", () => {
  const result = classifyDiscoveryGroup(group([observation({ music_venue: "yes", name: "X" })]));
  assert.equal(result.status, "AUTO_ADMIT_HIGH_CONFIDENCE");
});

test("amenity=pub WITH live_music=yes auto-admits", () => {
  const result = classifyDiscoveryGroup(group([observation({ amenity: "pub", live_music: "yes", name: "X" })]));
  assert.equal(result.status, "AUTO_ADMIT_HIGH_CONFIDENCE");
});

test("amenity=bar WITHOUT live_music=yes is never auto-admitted — bare category is never sufficient for a noisy type", () => {
  const result = classifyDiscoveryGroup(group([observation({ amenity: "bar", name: "X" })]));
  assert.notEqual(result.status, "AUTO_ADMIT_HIGH_CONFIDENCE");
});

test("bare amenity=community_centre (no explicit live-event tag) is NEVER auto-admitted — this package's brief explicit requirement", () => {
  const result = classifyDiscoveryGroup(group([observation({ amenity: "community_centre", name: "X" })]));
  assert.equal(result.status, "INSUFFICIENT_EVIDENCE");
  assert.notEqual(result.status, "AUTO_ADMIT_HIGH_CONFIDENCE");
});

test("amenity=community_centre WITH live_music=yes IS auto-admitted — explicit evidence present", () => {
  const result = classifyDiscoveryGroup(group([observation({ amenity: "community_centre", live_music: "yes", name: "X" })]));
  assert.equal(result.status, "AUTO_ADMIT_HIGH_CONFIDENCE");
});

test("a disused:* tag is never admitted, regardless of category", () => {
  const result = classifyDiscoveryGroup(group([observation({ amenity: "theatre", "disused:amenity": "theatre", name: "X" })]));
  assert.equal(result.status, "CLOSED_OR_INACTIVE");
});

test("building=derelict is never admitted, regardless of category (BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02: real national-scale find, Tameside Hippodrome)", () => {
  const result = classifyDiscoveryGroup(group([observation({ amenity: "theatre", building: "derelict", name: "X" })]));
  assert.equal(result.status, "CLOSED_OR_INACTIVE");
});

test("building=abandoned and building=ruins are also never admitted", () => {
  assert.equal(classifyDiscoveryGroup(group([observation({ amenity: "theatre", building: "abandoned", name: "X" })])).status, "CLOSED_OR_INACTIVE");
  assert.equal(classifyDiscoveryGroup(group([observation({ amenity: "theatre", building: "ruins", name: "X" })])).status, "CLOSED_OR_INACTIVE");
});

test("a was:* tag (former name/classification, current tag still active) is NOT treated as disused — the repurposed-building case", () => {
  const result = classifyDiscoveryGroup(group([observation({ amenity: "theatre", "was:amenity": "townhall", "was:name": "Old Town Hall", name: "X" })]));
  assert.equal(result.status, "AUTO_ADMIT_HIGH_CONFIDENCE", "a former town hall now actively tagged amenity=theatre must still admit");
});

test("a candidate matching an existing ACTIVE source is ALREADY_CANONICAL, never re-admitted", () => {
  const result = classifyDiscoveryGroup(
    group([observation({ amenity: "theatre", name: "X" })], { existing_registry_reconciliation: { status: "ALREADY_ACQUIRED" } }),
  );
  assert.equal(result.status, "ALREADY_CANONICAL");
});

test("a candidate matching an existing canonical venue (no source) is ALREADY_CANONICAL", () => {
  const result = classifyDiscoveryGroup(
    group([observation({ amenity: "theatre", name: "X" })], { existing_registry_reconciliation: { status: "KNOWN_VENUE_NO_SOURCE" } }),
  );
  assert.equal(result.status, "ALREADY_CANONICAL");
});

test("a possible (not confident) existing-registry match is REVIEW_REQUIRED, never silently auto-admitted or silently dropped", () => {
  const result = classifyDiscoveryGroup(
    group([observation({ amenity: "theatre", name: "X" })], { existing_registry_reconciliation: { status: "POSSIBLE_EXISTING_MATCH_REVIEW" } }),
  );
  assert.equal(result.status, "REVIEW_REQUIRED");
});

test("a within-run possible duplicate is REVIEW_REQUIRED, never silently merged or silently admitted twice", () => {
  const result = classifyDiscoveryGroup(group([observation({ amenity: "theatre", name: "X" })], { reconciliation_status: "POSSIBLE_DUPLICATE_REVIEW" }));
  assert.equal(result.status, "REVIEW_REQUIRED");
});

test("classifyDiscoveryGroup never throws on malformed/missing OSM_TAGS evidence", () => {
  const malformed = group([{ candidate_id: "c1", discovery_evidence: [{ kind: "OSM_ELEMENT", value: "node/1" }] }]);
  assert.doesNotThrow(() => classifyDiscoveryGroup(malformed));
});

// --- deriveAdmitSignals ---

test("deriveAdmitSignals returns every matching signal, not just the first", () => {
  const signals = deriveAdmitSignals({ amenity: "theatre", live_music: "yes" });
  assert.deepEqual(signals.sort(), ["amenity=theatre", "live_music=yes"].sort());
});

test("deriveAdmitSignals returns [] for a bare noisy category", () => {
  assert.deepEqual(deriveAdmitSignals({ amenity: "community_centre" }), []);
  assert.deepEqual(deriveAdmitSignals({ amenity: "pub" }), []);
  assert.deepEqual(deriveAdmitSignals({ amenity: "bar" }), []);
});
