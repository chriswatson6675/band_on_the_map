// BEATMAPPED-UNATTENDED-CITY-WORKER-REAL-INTEGRATION-01 — proves the real
// resolveSourceTasks(job) adapter (programme-acquisition-resolver.mjs):
// it genuinely invokes acquireSource() (the real per-source acquisition
// bridge) and mapAcquisitionResultToCheckpoint() (the real worker
// compatibility contract), reconstructs entirely from durable
// (job.estate_ref + a registry file) state, and never touches the real
// sources/*.json registries used by production (a small synthetic
// registry stands in here — no live network in this automated test; the
// real bounded live-network proof is separately recorded in
// docs/UNATTENDED_CITY_WORKER.md).

import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { resolveSourceTasks } from "../../ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs";

async function freshRoot() {
  return mkdtemp(join(tmpdir(), "city-worker-resolver-test-"));
}

const JSON_LD_BODY =
  '<link rel="canonical" href="/events/a"><script type="application/ld+json">' +
  '{"@context":"https://schema.org","@type":"Event","name":"A","startDate":"2026-09-01T20:00:00+01:00","url":"/events/a"}</script>';

function jsonLdFetchDocument() {
  return async (url) => ({
    url,
    at: "2026-08-29T00:00:00.000Z",
    status: 200,
    content_type: "text/html",
    body: JSON_LD_BODY,
  });
}

async function writeSyntheticRegistry(root) {
  await mkdir(join(root, "sources"), { recursive: true });
  const registry = {
    entries: [
      { id: "arbitrary-venue-one", name: "Arbitrary Venue One", official_website: "https://one.example/", events_url: "https://one.example/events" },
      { id: "arbitrary-venue-two", name: "Arbitrary Venue Two", official_website: "https://two.example/", events_url: "https://two.example/events" },
    ],
  };
  await writeFile(join(root, "sources/arbitrary-registry.json"), JSON.stringify(registry, null, 2), "utf8");
}

async function writeEstate(root, name, sourceIds) {
  await mkdir(join(root, "fixtures/city-worker/real-estates"), { recursive: true });
  const estate = { registry: "sources/arbitrary-registry.json", source_ids: sourceIds };
  await writeFile(join(root, `fixtures/city-worker/real-estates/${name}.json`), JSON.stringify(estate, null, 2), "utf8");
  return `fixtures/city-worker/real-estates/${name}.json`;
}

test("1: resolveSourceTasks returns one SourceTask per estate source_id, in order", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeSyntheticRegistry(root);
  const estateRef = await writeEstate(root, "two-sources", ["arbitrary-venue-one", "arbitrary-venue-two"]);

  const tasks = await resolveSourceTasks({ estate_ref: estateRef }, { root, fetchDocument: jsonLdFetchDocument() });
  assert.deepEqual(tasks.map((task) => task.source_id), ["arbitrary-venue-one", "arbitrary-venue-two"]);
  for (const task of tasks) assert.equal(typeof task.run, "function");
});

test("2: task.run() genuinely invokes acquireSource() and mapAcquisitionResultToCheckpoint() — real collector routing, real checkpoint mapping", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeSyntheticRegistry(root);
  const estateRef = await writeEstate(root, "one-source", ["arbitrary-venue-one"]);

  const [task] = await resolveSourceTasks({ estate_ref: estateRef }, { root, fetchDocument: jsonLdFetchDocument() });
  const outcome = await task.run();

  assert.equal(outcome.outcome, "SUCCESS", "the real JSON-LD collector genuinely ran and proved an event");
  assert.equal(outcome.collector, "JSON_LD_EVENT", "real orchestrator.mjs routing, not a stub");
  assert.equal(outcome.source_state, "ACQUISITION_PROVEN");
  assert.ok(!("status" in outcome), "worker bookkeeping fields (status/attempts/timestamps) must not leak into the SourceTask outcome — the runner records those itself");
});

test("11: source-task reconstruction depends only on durable (disk) state, never in-memory closures from a prior call", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeSyntheticRegistry(root);
  const estateRef = await writeEstate(root, "reconstruct", ["arbitrary-venue-one", "arbitrary-venue-two"]);

  const firstCall = await resolveSourceTasks({ estate_ref: estateRef }, { root, fetchDocument: jsonLdFetchDocument() });
  // A second, entirely independent call — simulating a fresh process
  // reading the same durable estate_ref + registry after a restart —
  // must reconstruct the identical task list.
  const secondCall = await resolveSourceTasks({ estate_ref: estateRef }, { root, fetchDocument: jsonLdFetchDocument() });

  assert.deepEqual(firstCall.map((t2) => t2.source_id), secondCall.map((t2) => t2.source_id));

  const firstOutcome = await firstCall[0].run();
  const secondOutcome = await secondCall[0].run();
  assert.deepEqual(firstOutcome, secondOutcome, "identical durable inputs must reconstruct identical, independent task behaviour");
});

test("an estate referencing an unknown source_id fails closed with a clear error, never silently skipping", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeSyntheticRegistry(root);
  const estateRef = await writeEstate(root, "bad", ["does-not-exist"]);

  await assert.rejects(
    () => resolveSourceTasks({ estate_ref: estateRef }, { root, fetchDocument: jsonLdFetchDocument() }),
    /is not present in/,
  );
});

test("this resolver never mutates the registry file it reads (read-only)", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeSyntheticRegistry(root);
  const estateRef = await writeEstate(root, "readonly-check", ["arbitrary-venue-one"]);

  const { readFile } = await import("node:fs/promises");
  const { join: pathJoin } = await import("node:path");
  const before = await readFile(pathJoin(root, "sources/arbitrary-registry.json"), "utf8");
  const [task] = await resolveSourceTasks({ estate_ref: estateRef }, { root, fetchDocument: jsonLdFetchDocument() });
  await task.run();
  const after = await readFile(pathJoin(root, "sources/arbitrary-registry.json"), "utf8");
  assert.equal(before, after);
});
