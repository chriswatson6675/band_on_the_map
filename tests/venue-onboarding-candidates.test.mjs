import assert from "node:assert/strict";
import test from "node:test";
import { deriveCandidateKey, extractVenueCandidates, buildCandidateId } from "../ingestion/venue-onboarding/candidates.mjs";

function obs(overrides = {}) {
  return {
    source_id: "test-source",
    source_record_id: "1",
    title: "Test Event",
    venue_name: null,
    location_text: null,
    source_fields: {},
    ...overrides,
  };
}

// 1. Candidate extraction is deterministic.
test("extraction over the same input, run twice, produces byte-identical output", () => {
  const observations = [
    obs({ source_record_id: "1", venue_name: "Alpha" }),
    obs({ source_record_id: "2", location_text: "Beta" }),
    obs({ source_id: "agendalx", source_record_id: "3", source_fields: { venue_id: 42 } }),
  ];
  const first = extractVenueCandidates(observations);
  const second = extractVenueCandidates(observations);
  assert.deepEqual(first, second);
});

test("candidate order follows first-appearance order in the input array", () => {
  const observations = [
    obs({ source_record_id: "1", venue_name: "First" }),
    obs({ source_record_id: "2", venue_name: "Second" }),
    obs({ source_record_id: "3", venue_name: "First" }), // repeats candidate 1's key
  ];
  const candidates = extractVenueCandidates(observations);
  assert.deepEqual(
    candidates.map((c) => c.key),
    ["First", "Second"],
  );
  assert.equal(candidates[0].observation_count, 2);
});

// 2. Stable source venue ID preferred over display name.
test("SOURCE_VENUE_ID is preferred over venue_name/location_text when both are present", () => {
  const key = deriveCandidateKey(
    obs({ venue_name: "Some Display Name", location_text: "Some address text", source_fields: { venue_id: 798 } }),
  );
  assert.equal(key.key_type, "SOURCE_VENUE_ID");
  assert.equal(key.key, "798");
});

test("SOURCE_LOCATION_ID is preferred over venue_name/location_text, but not over SOURCE_VENUE_ID", () => {
  const withLocationId = deriveCandidateKey(
    obs({ venue_name: "Display", source_fields: { location_id: "loc-9" } }),
  );
  assert.equal(withLocationId.key_type, "SOURCE_LOCATION_ID");

  const withBoth = deriveCandidateKey(
    obs({ source_fields: { venue_id: 1, location_id: "loc-9" } }),
  );
  assert.equal(withBoth.key_type, "SOURCE_VENUE_ID");
});

test("VENUE_NAME is preferred over LOCATION_TEXT when no ID is present", () => {
  const key = deriveCandidateKey(obs({ venue_name: "A Venue", location_text: "Some address" }));
  assert.equal(key.key_type, "VENUE_NAME");
  assert.equal(key.key, "A Venue");
});

test("LOCATION_TEXT is used only when nothing else is available", () => {
  const key = deriveCandidateKey(obs({ location_text: "Some address only" }));
  assert.equal(key.key_type, "LOCATION_TEXT");
});

test("SOURCE_ID is the last resort when no ID/venue_name/location_text exists", () => {
  const key = deriveCandidateKey(obs({ source_id: "some-city-feed" }));
  assert.equal(key.key_type, "SOURCE_ID");
  assert.equal(key.key, "some-city-feed");
});

// 3. Exact source key mappings work (grouping honours source context).
test("a candidate key MUST retain source context: the same key text from two different sources never merges", () => {
  const observations = [
    obs({ source_id: "source-a", source_record_id: "1", venue_name: "Capitólio" }),
    obs({ source_id: "source-b", source_record_id: "2", venue_name: "Capitólio" }),
  ];
  const candidates = extractVenueCandidates(observations);
  assert.equal(candidates.length, 2);
  assert.notEqual(candidates[0].candidate_id, candidates[1].candidate_id);
});

test("harmless whitespace normalisation groups exact-text variants together, but raw_keys preserves every exact string observed", () => {
  const observations = [
    obs({ source_record_id: "1", venue_name: "  Campo   Alegre " }),
    obs({ source_record_id: "2", venue_name: "Campo Alegre" }),
  ];
  const candidates = extractVenueCandidates(observations);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].observation_count, 2);
  assert.equal(candidates[0].key, "Campo Alegre");
  assert.deepEqual(candidates[0].raw_keys.sort(), ["  Campo   Alegre ", "Campo Alegre"].sort());
});

// 5. No fuzzy cross-source matching exists (and none within-source either).
test("similar-but-not-identical text never groups into the same candidate (no fuzzy/Levenshtein matching)", () => {
  const observations = [
    obs({ source_record_id: "1", venue_name: "Teatro Rivoli" }),
    obs({ source_record_id: "2", venue_name: "Teatro do Rivoli" }),
    obs({ source_record_id: "3", venue_name: "teatro rivoli" }), // different case, not whitespace-only
  ];
  const candidates = extractVenueCandidates(observations);
  assert.equal(candidates.length, 3, "each distinct exact string is its own candidate");
});

test("buildCandidateId is deterministic and stable for the same (source_id, key_type, key)", () => {
  assert.equal(
    buildCandidateId("teatro-municipal-do-porto", "VENUE_NAME", "Campo Alegre"),
    buildCandidateId("teatro-municipal-do-porto", "VENUE_NAME", "Campo Alegre"),
  );
  assert.notEqual(
    buildCandidateId("teatro-municipal-do-porto", "VENUE_NAME", "Campo Alegre"),
    buildCandidateId("teatro-municipal-do-porto", "VENUE_NAME", "Rivoli"),
  );
});

test("extraction records existing_canonical_mapping via the supplied resolveFn, without altering grouping", () => {
  const observations = [obs({ source_record_id: "1", venue_name: "X" })];
  const resolved = extractVenueCandidates(observations, {
    resolveFn: () => ({ resolution_status: "RESOLVED", venue_id: "venue-test-x" }),
  });
  assert.equal(resolved[0].existing_canonical_mapping, true);
  assert.equal(resolved[0].existing_venue_id, "venue-test-x");

  const unresolved = extractVenueCandidates(observations, {
    resolveFn: () => ({ resolution_status: "UNRESOLVED", venue_id: null }),
  });
  assert.equal(unresolved[0].existing_canonical_mapping, false);
  assert.equal(unresolved[0].existing_venue_id, null);
});

test("example_event_titles/example_source_record_ids are capped at 3 and deduplicated for titles", () => {
  const observations = [1, 2, 3, 4, 5].map((n) =>
    obs({ source_record_id: String(n), venue_name: "Many", title: n <= 2 ? "Same Title" : `Title ${n}` }),
  );
  const [candidate] = extractVenueCandidates(observations);
  assert.equal(candidate.observation_count, 5);
  assert.ok(candidate.example_event_titles.length <= 3);
  assert.ok(candidate.example_source_record_ids.length <= 3);
  assert.equal(new Set(candidate.example_event_titles).size, candidate.example_event_titles.length);
});
