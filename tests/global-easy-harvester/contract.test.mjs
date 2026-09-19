import assert from "node:assert/strict";
import test from "node:test";

import {
  preGateAcquisitionClass,
  mapAcquisitionResultToTier1Verdict,
  slugify,
  deriveSourceId,
} from "../../ingestion/global-easy-harvester/contract.mjs";

test("preGateAcquisitionClass: auto-dispatched classes proceed to acquireSource()", () => {
  assert.equal(preGateAcquisitionClass("JSON_LD_EVENT"), null);
  assert.equal(preGateAcquisitionClass("STATIC_HTML"), null);
  assert.equal(preGateAcquisitionClass("EMBEDDED_JSON"), null);
});

test("preGateAcquisitionClass: browser/adaptation/unsupported classes defer without a network call", () => {
  assert.equal(preGateAcquisitionClass("HEADLESS_REQUIRED"), "T1_DEFER_BROWSER_REQUIRED");
  assert.equal(preGateAcquisitionClass("CLIENT_RENDERED"), "T1_DEFER_BROWSER_REQUIRED");
  assert.equal(preGateAcquisitionClass("ICS"), "T1_DEFER_REQUIRES_ADAPTATION");
  assert.equal(preGateAcquisitionClass("WORDPRESS"), "T1_DEFER_REQUIRES_ADAPTATION");
  assert.equal(preGateAcquisitionClass("SOCIAL_ONLY"), "T1_DEFER_UNSUPPORTED_PATTERN");
  assert.equal(preGateAcquisitionClass("UNKNOWN"), "T1_DEFER_UNSUPPORTED_PATTERN");
});

test("mapAcquisitionResultToTier1Verdict: ACQUISITION_PROVEN is the only proven outcome", () => {
  assert.deepEqual(mapAcquisitionResultToTier1Verdict({ state: "ACQUISITION_PROVEN" }), { proven: true });
});

test("mapAcquisitionResultToTier1Verdict: every documented residue/failed state maps to exactly one defer reason", () => {
  const cases = [
    ["PROGRAMME_SOURCE_UNRESOLVED", "T1_DEFER_SOURCE_DISCOVERY"],
    ["BROWSER_REQUIRED", "T1_DEFER_BROWSER_REQUIRED"],
    ["ACCESS_BLOCKED", "T1_DEFER_UNSUPPORTED_PATTERN"],
    ["SOCIAL_FIRST_PROGRAMME", "T1_DEFER_UNSUPPORTED_PATTERN"],
    ["IMAGE_OR_POSTER_ONLY", "T1_DEFER_UNSUPPORTED_PATTERN"],
    ["SOURCE_FINGERPRINT_UNSUPPORTED", "T1_DEFER_UNSUPPORTED_PATTERN"],
    ["NETWORK_FAILURE", "T1_DEFER_NETWORK"],
    ["PROGRAMME_EMPTY", "T1_DEFER_EVENTS_UNAVAILABLE"],
    ["SUPPORTED_COLLECTOR_NO_VALID_EVENTS", "T1_DEFER_EVENTS_UNAVAILABLE"],
    ["STABLE_IDENTITY_PROOF_FAILED", "T1_DEFER_NORMALIZATION"],
  ];
  for (const [state, expected] of cases) {
    const verdict = mapAcquisitionResultToTier1Verdict({ state });
    assert.equal(verdict.proven, false, state);
    assert.equal(verdict.defer_state, expected, state);
  }
});

test("mapAcquisitionResultToTier1Verdict: an unrecognised state throws rather than silently misclassifying", () => {
  assert.throws(() => mapAcquisitionResultToTier1Verdict({ state: "SOME_NEW_STATE_NOBODY_MAPPED_YET" }));
});

test("slugify/deriveSourceId are deterministic and kebab-case", () => {
  assert.equal(slugify("Café Ñandú"), "cafe-nandu");
  assert.equal(deriveSourceId("Test City", "Café Ñandú"), "test-city-cafe-nandu");
  assert.equal(deriveSourceId("Test City", "Café Ñandú"), deriveSourceId("Test City", "Café Ñandú"));
});
