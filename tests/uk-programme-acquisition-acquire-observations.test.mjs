import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { loadProvenUkSources, acquireUkObservations } from "../ingestion/uk-programme-acquisition/acquire-uk-observations.mjs";

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "botm-uk-prog-acquire-test-"));
}

async function writeSourcesRegistry(root, entries) {
  await mkdir(join(root, "sources"), { recursive: true });
  await writeFile(join(root, "sources", "uk.json"), JSON.stringify({ entries }), "utf8");
}

function provenEntry(overrides = {}) {
  return {
    id: "uk-prog-example",
    name: "Example Hall",
    official_website: "https://example-hall.example.com/",
    events_url: "https://example-hall.example.com/whats-on",
    monitoring_status: "TECHNICAL_PATH_PROVEN",
    ...overrides,
  };
}

test("loadProvenUkSources returns [] when sources/uk.json does not exist yet", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.deepEqual(await loadProvenUkSources(root), []);
});

test("loadProvenUkSources only returns TECHNICAL_PATH_PROVEN entries with a real events_url", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeSourcesRegistry(root, [
    provenEntry(),
    provenEntry({ id: "uk-prog-deferred", monitoring_status: "NEEDS_TECHNICAL_REVIEW" }),
    provenEntry({ id: "uk-prog-no-url", events_url: null }),
  ]);
  const proven = await loadProvenUkSources(root);
  assert.equal(proven.length, 1);
  assert.equal(proven[0].id, "uk-prog-example");
});

test("acquireUkObservations returns empty results when there are no proven sources", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await acquireUkObservations({ root, fetchDocument: async () => { throw new Error("must not fetch"); } });
  assert.deepEqual(result.ukObservations, []);
  assert.deepEqual(result.ukResults, []);
});

test("acquireUkObservations re-acquires live (never reads a cache) and flattens proven Observations, each tagged with its own source_id", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeSourcesRegistry(root, [provenEntry()]);

  const jsonLdBody = '<script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"A Real Gig","startDate":"2026-10-01T20:00:00+01:00","url":"https://example-hall.example.com/whats-on"}</script><link rel="canonical" href="https://example-hall.example.com/whats-on">';
  const fetchDocument = async (url) => ({ url, at: "2026-09-23T00:00:00.000Z", status: 200, content_type: "text/html", body: jsonLdBody });

  const { ukObservations, ukResults } = await acquireUkObservations({ root, fetchDocument });
  assert.equal(ukResults.length, 1);
  assert.equal(ukResults[0].state, "ACQUISITION_PROVEN");
  assert.ok(ukObservations.length > 0);
  assert.equal(ukObservations[0].source_id, "uk-prog-example");
});

test("acquireUkObservations never throws when a proven source fails to re-acquire on a later run — it simply contributes no observations that time", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeSourcesRegistry(root, [provenEntry()]);
  const fetchDocument = async () => { throw new Error("network down"); };

  const { ukObservations, ukResults } = await acquireUkObservations({ root, fetchDocument });
  assert.equal(ukResults[0].state, "NETWORK_FAILURE");
  assert.deepEqual(ukObservations, []);
});
