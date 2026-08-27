import assert from "node:assert/strict";
import test from "node:test";

import {
  assertIsolatedResearchPaths,
  buildTemporaryRoot,
  classifyBrowserRuntime,
  compareProductionBaselines,
  findCredentialLeaks,
  sanitizeArtifact,
  validateCandidateSha,
  validateOwnedCleanup,
  validateResearchJob,
} from "../remote-research/contract.mjs";

const SHA = "21412d227eb302b60c541ce41cccd9cb0b5ace86";

test("request contract accepts only a full lowercase SHA and allowlisted job", () => {
  assert.equal(validateCandidateSha(SHA), SHA);
  assert.equal(validateResearchJob("berlin-browser-proof"), "berlin-browser-proof");
  for (const invalid of ["main", "21412d2", `${SHA}; id`, SHA.toUpperCase()]) assert.throws(() => validateCandidateSha(invalid));
  for (const invalid of ["bash", "ssh", "berlin-browser-proof; id", ""]) assert.throws(() => validateResearchJob(invalid));
});

test("temporary roots are deterministic and confined to a run-owned prefix", () => {
  assert.equal(buildTemporaryRoot("gh-123-1"), "/tmp/beatmapped-research/gh-123-1");
  assert.throws(() => buildTemporaryRoot("../production"));
  assert.throws(() => buildTemporaryRoot("gh-0-1"));
});

test("production isolation rejects overlap and broad temporary roots", () => {
  assert.deepEqual(assertIsolatedResearchPaths({ productionPath: "/opt/band-on-the-map", researchRoot: "/tmp/beatmapped-research/gh-123-1", publicationPath: "/opt/band-on-the-map/data/public" }), {
    productionPath: "/opt/band-on-the-map",
    researchRoot: "/tmp/beatmapped-research/gh-123-1",
    publicationPath: "/opt/band-on-the-map/data/public",
  });
  for (const researchRoot of ["/", "/tmp", "/tmp/beatmapped-research", "/opt/band-on-the-map", "/opt/band-on-the-map/research"]) {
    assert.throws(() => assertIsolatedResearchPaths({ productionPath: "/opt/band-on-the-map", researchRoot, publicationPath: "/opt/band-on-the-map/data/public" }));
  }
});

test("runtime classification fails closed across every controlled outcome", () => {
  const ready = { node_version: "v20.9.0", memory: { available_mb: 1024 }, temporary_disk: { available_mb: 2048 }, production_path_writable: false, chromium: { executable_path: "/usr/bin/chromium", missing_libraries: [] } };
  assert.equal(classifyBrowserRuntime(ready), "BROWSER_RUNTIME_READY");
  assert.equal(classifyBrowserRuntime({ ...ready, chromium: { executable_path: null, missing_libraries: [] } }), "BROWSER_RUNTIME_MISSING_CHROMIUM");
  assert.equal(classifyBrowserRuntime({ ...ready, chromium: { executable_path: "/usr/bin/chromium", missing_libraries: ["libx.so"] } }), "BROWSER_RUNTIME_MISSING_LIBRARIES");
  assert.equal(classifyBrowserRuntime({ ...ready, memory: { available_mb: 767 } }), "BROWSER_RUNTIME_RESOURCE_CONCERN");
  assert.equal(classifyBrowserRuntime({ ...ready, temporary_disk: { available_mb: 1023 } }), "BROWSER_RUNTIME_RESOURCE_CONCERN");
  assert.equal(classifyBrowserRuntime({ ...ready, node_version: "v18.20.0" }), "BROWSER_RUNTIME_OTHER_BLOCKER");
  assert.equal(classifyBrowserRuntime({ ...ready, production_path_writable: true }), "BROWSER_RUNTIME_OTHER_BLOCKER");
});

test("artifact sanitization removes credential keys, URL userinfo and sensitive query values", () => {
  const sanitized = sanitizeArtifact({ authorization: "Bearer abc", endpoint: "https://user:pass@example.test/events?token=abc&page=2#secret", nested: { cookie: "sid=abc" } });
  assert.equal(sanitized.authorization, "[REDACTED]");
  assert.equal(sanitized.nested.cookie, "[REDACTED]");
  assert.equal(sanitized.endpoint, "https://example.test/events?token=%5BREDACTED%5D&page=2");
  assert.deepEqual(findCredentialLeaks(sanitized), []);
  assert.ok(findCredentialLeaks({ endpoint: "https://example.test/?api_key=secret" }).length > 0);
});

test("post-run comparison ignores capture time but detects every protected state change", () => {
  const before = { captured_at: "before", production_path: "/opt/band-on-the-map", head: SHA, git_status: " M data/public/lisbon-porto-map.json", services: { timer: "active" }, publication: { sha256: "a" }, registry_tree_sha256: "b" };
  assert.deepEqual(compareProductionBaselines(before, { ...before, captured_at: "after" }), { unchanged: true, differences: [] });
  assert.deepEqual(compareProductionBaselines(before, { ...before, captured_at: "after", head: "f".repeat(40), services: { timer: "inactive" } }), { unchanged: false, differences: ["head", "services"] });
});

test("cleanup ownership requires a dedicated session leader whose command names the exact root", () => {
  assert.equal(validateOwnedCleanup({ pid: 4321, sessionId: 4321, command: "node /tmp/beatmapped-research/gh-123-1/controller/run.mjs", researchRoot: "/tmp/beatmapped-research/gh-123-1" }), true);
  assert.equal(validateOwnedCleanup({ pid: 4321, sessionId: 7, command: "chromium", researchRoot: "/tmp/beatmapped-research/gh-123-1" }), false);
  assert.equal(validateOwnedCleanup({ pid: 4321, sessionId: 4321, command: "chromium", researchRoot: "/tmp/beatmapped-research/gh-123-1" }), false);
});
