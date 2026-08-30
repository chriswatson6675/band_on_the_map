// BEATMAPPED-GENERIC-PER-SOURCE-ACQUISITION-BRIDGE-01 — proves items
// 1-10 of this package's own brief for source-execution.mjs's
// acquireSource(), the generic single-source execution boundary. Fixtures
// follow this repository's own existing convention for this exact module
// family (tests/city-batch.test.mjs, tests/programme-orchestrator.test.mjs)
// — small, inline, "arbitrary.example" documents; never a real venue,
// never the London/Berlin/Paris estate.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireSource } from "../ingestion/programme-acquisition/source-execution.mjs";
import { runCityAcquisition } from "../ingestion/programme-acquisition/city-batch.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const jsonLdPage = (url) => ({
  url,
  at: "2026-08-29T00:00:00.000Z",
  status: 200,
  content_type: "text/html",
  body:
    '<link rel="canonical" href="/events/a"><script type="application/ld+json">' +
    '{"@context":"https://schema.org","@type":"Event","name":"A","startDate":"2026-09-01T20:00:00+01:00","url":"/events/a"}</script>',
});

const embeddedNextDataPage = (url) => ({
  url,
  at: "2026-08-29T00:00:00.000Z",
  status: 200,
  content_type: "text/html",
  // Two event-like records: this repository's own embedded-state
  // classifier deliberately requires >= 2 before treating a structural
  // JSON blob as EMBEDDED_PROGRAMME_STATE_PROVEN (a single ambiguous
  // object is not enough evidence) — see
  // ingestion/browser-resolution/classify.mjs. Matches
  // tests/programme-orchestrator.test.mjs's own equivalent fixture.
  body:
    '<script id="__NEXT_DATA__" type="application/json">' +
    '{"events":[{"id":"x","name":"X","startDate":"2026-09-05","url":"/events/x"},{"id":"y","name":"Y","startDate":"2026-09-06","url":"/events/y"}]}</script>',
});

function jsonLdFetch(host) {
  return async (url) => jsonLdPage(url.includes("/events/a") ? url : `${host}/events/a`);
}

test("1 + 6: source execution is independent of city/venue metadata (no geography-specific routing)", async () => {
  const outcomeAlpha = await acquireSource(
    { source_id: "alpha-src", venue: "Alpha Arena", programme_url: "https://alpha.example/events" },
    { fetchDocument: jsonLdFetch("https://alpha.example") },
  );
  const outcomeBeta = await acquireSource(
    { source_id: "beta-src", venue: "Beta Hall", programme_url: "https://beta.example/events" },
    { fetchDocument: jsonLdFetch("https://beta.example") },
  );

  assert.equal(outcomeAlpha.state, "ACQUISITION_PROVEN");
  assert.equal(outcomeBeta.state, "ACQUISITION_PROVEN");
  assert.equal(outcomeAlpha.collector, outcomeBeta.collector, "identical document shape must route to the identical collector regardless of venue/city metadata");
  assert.equal(outcomeAlpha.proven_event_count, outcomeBeta.proven_event_count);
});

test("2: the correct existing collector is invoked (JSON-LD Event) and produces real observations/proofs", async () => {
  const result = await acquireSource(
    { source_id: "src-jsonld", venue: "Arbitrary Venue", programme_url: "https://a.example/events" },
    { fetchDocument: jsonLdFetch("https://a.example") },
  );
  assert.equal(result.state, "ACQUISITION_PROVEN");
  assert.equal(result.collector, "JSON_LD_EVENT");
  assert.equal(result.observations.length, 1);
  assert.equal(result.proofs.length, 1);
  assert.equal(result.proven_event_count, 1);
});

test("3: normalization/proof uses the existing orchestrator, not a reimplementation", async () => {
  // The embedded-state route exercises a DIFFERENT existing collector
  // (ingestion/embedded-state/collector.mjs via orchestrator.mjs) than
  // JSON-LD, proving acquireSource() genuinely delegates rather than
  // hardcoding one collector family.
  const result = await acquireSource(
    { source_id: "src-embedded", venue: "Arbitrary Venue", programme_url: "https://b.example/whats-on" },
    { fetchDocument: async (url) => embeddedNextDataPage(url) },
  );
  assert.equal(result.collector, "EMBEDDED_NEXT_DATA");
  assert.equal(result.normalized_event_count, 2);
  // No detail page was ever fetched/proven for this source, so this
  // repository's own existing "no detail-page corroboration" rule fails
  // the acquisition closed rather than fabricating proof — exactly
  // matching tests/programme-orchestrator.test.mjs's own equivalent case.
  assert.equal(result.state, "STABLE_IDENTITY_PROOF_FAILED");
  assert.equal(result.residue, true);
});

test("4: a failing/unresolved source returns a structured result rather than throwing", async () => {
  const result = await acquireSource(
    { source_id: "src-broken", venue: "Arbitrary Venue", programme_url: "https://broken.example/events" },
    { fetchDocument: async () => { throw new Error("boom, permanently unreachable"); } },
  );
  assert.equal(result.state, "NETWORK_FAILURE");
  assert.equal(result.residue, true);
  assert.equal(typeof result.error, "string");
  assert.equal(result.network_stage, "SELECTED_PROGRAMME_FETCH");
});

test("5: one source's failure does not poison a subsequent source's execution through the same interface", async () => {
  const failing = await acquireSource(
    { source_id: "src-broken", venue: "Arbitrary Venue", programme_url: "https://broken.example/events" },
    { fetchDocument: async () => { throw new Error("boom, permanently unreachable"); } },
  );
  assert.equal(failing.state, "NETWORK_FAILURE");

  const succeeding = await acquireSource(
    { source_id: "src-ok", venue: "Arbitrary Venue", programme_url: "https://a.example/events" },
    { fetchDocument: jsonLdFetch("https://a.example") },
  );
  assert.equal(succeeding.state, "ACQUISITION_PROVEN", "a prior failing source must never affect a later, independent call");
});

test("7 + 8: no AI or browser-automation import exists anywhere in the deterministic execution path", async () => {
  // NOTE: ingestion/embedded-state/collector.mjs legitimately imports
  // from ingestion/browser-resolution/classify.mjs — a PURE text/JSON
  // structure classifier (no network, no Playwright) that happens to
  // live in a directory also used, separately, by a real browser-
  // automation residue worker. Banning that whole directory name would
  // be a false positive; what must never appear is an import of the
  // directory's actual browser-driving modules (playwright-session.mjs)
  // or any browser-automation/AI SDK.
  const filesToScan = [
    "ingestion/programme-acquisition/source-execution.mjs",
    "ingestion/programme-acquisition/city-batch.mjs",
    "ingestion/programme-acquisition/orchestrator.mjs",
    "ingestion/programme-acquisition/programme-resolver.mjs",
    "ingestion/programme-acquisition/discovery.mjs",
    "ingestion/programme-acquisition/offline-proof.mjs",
    "ingestion/embedded-state/collector.mjs",
    "ingestion/programme-acquisition/worker-checkpoint-mapping.mjs",
  ];
  const forbiddenImportFragments = ["playwright", "puppeteer", "anthropic", "openai", "claude"];

  for (const relativePath of filesToScan) {
    const contents = await readFile(resolve(REPO_ROOT, relativePath), "utf8");
    const importSpecifiers = [...contents.matchAll(/from\s+["']([^"']+)["']/g)].map((match) => match[1]);
    for (const fragment of forbiddenImportFragments) {
      assert.ok(
        !importSpecifiers.some((specifier) => specifier.toLowerCase().includes(fragment)),
        `${relativePath} must not import anything matching "${fragment}" — no AI/browser execution in the deterministic layer`,
      );
    }
  }
});

test("9: existing city-batch behaviour remains compatible after the source-execution extraction", async () => {
  const result = await runCityAcquisition({
    sources: [
      { source_id: "a", venue: "A", programme_url: "https://a.example/events" },
      { source_id: "b", venue: "B" },
      { source_id: "c", venue: "C", programme_url: "https://c.example/events" },
    ],
    fetchDocument: async (url) => {
      if (url.includes("c.example")) throw new Error("offline");
      return jsonLdPage(url.includes("/a") ? url : "https://a.example/events/a");
    },
  });
  assert.deepEqual(
    result.map((row) => row.state),
    ["ACQUISITION_PROVEN", "PROGRAMME_SOURCE_UNRESOLVED", "NETWORK_FAILURE"],
    "identical to tests/city-batch.test.mjs's own pre-extraction expectation",
  );
  // The one small, documented behavioural addition: every row now always
  // carries retry_provenance (previously omitted on two branches).
  for (const row of result) {
    assert.ok(Array.isArray(row.retry_provenance));
  }
});

test("10: a single-source invocation fetches only that source's own documents, never a whole city estate", async () => {
  const fetched = [];
  const result = await acquireSource(
    { source_id: "src-solo", venue: "Arbitrary Venue", programme_url: "https://solo.example/events" },
    {
      fetchDocument: async (url) => {
        fetched.push(url);
        return jsonLdPage(url.includes("/events/a") ? url : "https://solo.example/events/a");
      },
    },
  );
  assert.equal(result.state, "ACQUISITION_PROVEN");
  assert.ok(fetched.length > 0);
  for (const url of fetched) {
    assert.ok(url.startsWith("https://solo.example/"), `acquireSource must never fetch outside the one source it was given — saw ${url}`);
  }
});

test("12: no London/Berlin/Paris/Lisbon/Barcelona hostname or city logic exists in the generic interface", async () => {
  const filesToScan = [
    "ingestion/programme-acquisition/source-execution.mjs",
    "ingestion/programme-acquisition/city-batch.mjs",
    "ingestion/programme-acquisition/worker-checkpoint-mapping.mjs",
  ];
  const forbiddenTerms = ["london", "berlin", "lisbon", "porto", "barcelona", "manchester", "liverpool", "paris"];
  for (const relativePath of filesToScan) {
    const contents = (await readFile(resolve(REPO_ROOT, relativePath), "utf8")).toLowerCase();
    for (const term of forbiddenTerms) {
      assert.ok(!contents.includes(term), `${relativePath} must not reference "${term}"`);
    }
  }
});

// Sanity check: this test's own file-scan list actually exists (catches a
// typo'd path silently scanning nothing).
test("sanity: every scanned file in this suite actually exists", async () => {
  const dir = resolve(REPO_ROOT, "ingestion/programme-acquisition");
  const entries = await readdir(dir);
  assert.ok(entries.includes("source-execution.mjs"));
  assert.ok(entries.includes("worker-checkpoint-mapping.mjs"));
});
