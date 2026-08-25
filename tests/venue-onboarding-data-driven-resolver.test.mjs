import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { resolveFromMappings, findMapping } from "../ingestion/venue-onboarding/data-driven-resolver.mjs";
import { resolveObservation } from "../ingestion/venue/resolver.mjs";

const TEST_MAPPINGS = [
  {
    source_id: "teatro-municipal-do-porto",
    source_key_type: "VENUE_NAME",
    source_key: "Campo Alegre",
    venue_id: "venue-porto-teatro-campo-alegre",
  },
  {
    source_id: "agendalx",
    source_key_type: "SOURCE_VENUE_ID",
    source_key: "3780",
    venue_id: "venue-lisboa-casa-capitao",
  },
];

function obs(overrides = {}) {
  return { source_id: "test-source", source_record_id: "1", venue_name: null, location_text: null, source_fields: {}, ...overrides };
}

// 4. New mappings are data-driven — a mapping entry alone resolves an
// Observation, with no code change.
test("a data-driven mapping entry resolves a matching Observation", () => {
  const observation = obs({ source_id: "teatro-municipal-do-porto", venue_name: "Campo Alegre" });
  const result = resolveFromMappings(observation, TEST_MAPPINGS);
  assert.equal(result.resolution_status, "RESOLVED");
  assert.equal(result.venue_id, "venue-porto-teatro-campo-alegre");
  assert.equal(result.resolution_method, "DATA_DRIVEN_MAPPING:VENUE_NAME");
});

test("a data-driven mapping keyed on SOURCE_VENUE_ID resolves via that key", () => {
  const observation = obs({ source_id: "agendalx", source_fields: { venue_id: 3780 } });
  const result = resolveFromMappings(observation, TEST_MAPPINGS);
  assert.equal(result.resolution_status, "RESOLVED");
  assert.equal(result.venue_id, "venue-lisboa-casa-capitao");
});

// 6. No unknown venue is silently mapped.
test("an Observation with no matching mapping entry is UNRESOLVED, never guessed", () => {
  const observation = obs({ source_id: "teatro-municipal-do-porto", venue_name: "Some Unmapped Venue" });
  const result = resolveFromMappings(observation, TEST_MAPPINGS);
  assert.equal(result.resolution_status, "UNRESOLVED");
  assert.equal(result.venue_id, null);
});

test("a matching key text from the WRONG source never resolves (source context is part of the key)", () => {
  const observation = obs({ source_id: "some-other-source", venue_name: "Campo Alegre" });
  const result = resolveFromMappings(observation, TEST_MAPPINGS);
  assert.equal(result.resolution_status, "UNRESOLVED");
});

test("an empty/missing mappings array never resolves anything", () => {
  const observation = obs({ source_id: "agendalx", source_fields: { venue_id: 3780 } });
  assert.equal(resolveFromMappings(observation, []).resolution_status, "UNRESOLVED");
  assert.equal(resolveFromMappings(observation, undefined).resolution_status, "UNRESOLVED");
});

test("findMapping returns null (not undefined-vs-throw ambiguity) when nothing matches", () => {
  assert.equal(findMapping(TEST_MAPPINGS, "nope", "VENUE_NAME", "nope"), null);
  assert.equal(findMapping(undefined, "nope", "VENUE_NAME", "nope"), null);
});

// Cross-check against the REAL committed venues/source-venue-mappings.json
// via the real resolveObservation() dispatcher — proves the data-driven
// layer is genuinely wired into the resolver end to end, using the exact
// mapping entries this task's own onboarding run produced.
test("resolveObservation resolves a real Campo Alegre Observation via the committed data-driven mapping", () => {
  const observation = obs({ source_id: "teatro-municipal-do-porto", venue_name: "Campo Alegre" });
  const result = resolveObservation(observation);
  assert.equal(result.resolution_status, "RESOLVED");
  assert.equal(result.venue_id, "venue-porto-teatro-campo-alegre");
  assert.equal(result.resolution_method, "DATA_DRIVEN_MAPPING:VENUE_NAME");
});

test("resolveObservation resolves the real Casa Capitão Observation via the committed data-driven mapping", () => {
  const observation = obs({ source_id: "agendalx", source_fields: { venue_id: 3780 } });
  const result = resolveObservation(observation);
  assert.equal(result.resolution_status, "RESOLVED");
  assert.equal(result.venue_id, "venue-lisboa-casa-capitao");
});

test("BOTM-CCB-ACTIVATION-01: resolveObservation resolves a real CCB Observation via the committed data-driven mapping (SOURCE_VENUE_ID)", () => {
  const observation = obs({ source_id: "ccb-centro-cultural-belem", source_fields: { venue_id: 117320 } });
  const result = resolveObservation(observation);
  assert.equal(result.resolution_status, "RESOLVED");
  assert.equal(result.venue_id, "venue-lisboa-centro-cultural-de-belem-ccb");
  assert.equal(result.resolution_method, "DATA_DRIVEN_MAPPING:SOURCE_VENUE_ID");
});

test("resolveObservation still leaves a genuinely unmapped venue_name UNRESOLVED", () => {
  const observation = obs({ source_id: "teatro-municipal-do-porto", venue_name: "Somewhere Nobody Verified" });
  assert.equal(resolveObservation(observation).resolution_status, "UNRESOLVED");
});

test("the committed venues/source-venue-mappings.json is well-formed and every entry has full provenance", async () => {
  const file = JSON.parse(await readFile(new URL("../venues/source-venue-mappings.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(file.mappings));
  for (const mapping of file.mappings) {
    for (const field of ["source_id", "source_key_type", "source_key", "venue_id", "method", "created_at", "retrieved_at"]) {
      assert.ok(mapping[field], `mapping for ${mapping.source_id}/${mapping.source_key} missing ${field}`);
    }
    assert.ok(Array.isArray(mapping.evidence));
  }
});
