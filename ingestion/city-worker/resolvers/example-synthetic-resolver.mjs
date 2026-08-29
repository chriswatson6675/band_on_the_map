// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01 — a reference example
// of the `resolveSourceTasks(job)` contract (see runner.mjs's own header
// comment), wired to this package's own synthetic test fixtures
// (fixtures/city-worker/synthetic-estates.json). This is NOT a real
// collector adapter — every "source" here is a synthetic id that always
// succeeds. It exists so the operator CLI and the systemd worker
// entrypoint have something runnable to demonstrate/smoke-test against
// without any real acquisition dependency, and so a real integration
// adapter has a concrete, working example to model itself on.
//
// `job.estate_ref` is expected to be one of the keys in
// fixtures/city-worker/synthetic-estates.json (e.g. "testcity-alpha") —
// this is exactly the kind of opaque, caller-defined estate reference
// job.mjs's own doc comment describes; a real adapter would instead
// resolve `job.estate_ref` against a real source registry.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function resolveSourceTasks(job, { root }) {
  const fixturesPath = resolve(root, "fixtures/city-worker/synthetic-estates.json");
  const estates = JSON.parse(await readFile(fixturesPath, "utf8"));
  const estate = estates[job.estate_ref];
  if (!estate) {
    throw new Error(`example-synthetic-resolver: no synthetic estate named "${job.estate_ref}" in ${fixturesPath}`);
  }

  return estate.source_ids.map((sourceId) => ({
    source_id: sourceId,
    run: async () => ({ outcome: "SUCCESS", observation_count: 1 }),
  }));
}
