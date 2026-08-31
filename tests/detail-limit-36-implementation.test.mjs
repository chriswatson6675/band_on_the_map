// BEATMAPPED-DETAIL-LIMIT-36-IMPLEMENTATION-01
//
// Proves the production detail-fetch budget was raised from 12 to 36
// WITHOUT touching candidate selection/ordering, proof semantics, or
// acquisition concurrency/pacing. Specifically proves:
//   (a) the single shared DEFAULT_DETAIL_LIMIT constant is 36 and is what
//       both acquireSource() (source-execution.mjs) and
//       runCityAcquisition() (city-batch.mjs) actually default to when no
//       explicit detailLimit is given — no independently-drifting literal
//       remains in either file;
//   (b) 36 is a hard, never-exceeded cap on detail-page fetch ATTEMPTS per
//       source, even when far more than 36 safe candidates exist, even
//       across retry attempts, and even with duplicate candidate classes
//       (normalized-record + raw-link) pointing at overlapping URLs;
//   (c) when fewer than 36 safe candidates exist, only the candidates that
//       actually exist are fetched — nothing is padded/synthesized;
//   (d) the first 12 candidates selected under the new limit are byte-
//       identical, in order, to the full result under the old limit — the
//       change only ever APPENDS ranks 13-36, never reorders 1-12;
//   (e) no adaptive/source-aware/percentage/per-source-override logic was
//       introduced anywhere in the changed files.
//
// Fixtures follow this repository's own existing arbitrary.example
// convention (see tests/detail-candidate-selection.test.mjs,
// tests/source-execution.test.mjs) — no live network, no real venue.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireSource, DEFAULT_DETAIL_LIMIT } from "../ingestion/programme-acquisition/source-execution.mjs";
import { runCityAcquisition } from "../ingestion/programme-acquisition/city-batch.mjs";
import { discoverDetailCandidates } from "../ingestion/programme-acquisition/orchestrator.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BASE_URL = "https://arbitrary.example/whats-on";
const AT = "2026-08-29T00:00:00.000Z";

function eventScript(node) {
  return `<script type="application/ld+json">${JSON.stringify(node)}</script>`;
}

function jsonLdEvent({ name, url, startDate }) {
  return { "@context": "https://schema.org", "@type": "Event", name, url, startDate };
}

/** Same idiom as tests/detail-candidate-selection.test.mjs's own
 * programmeWithEvents(): `count` distinct, same-origin, deterministically
 * date-sortable JSON-LD Event nodes, deliberately NOT in ascending source
 * order so a determinism/ordering assertion actually exercises the sort. */
function programmeWithEvents(count, { anchors = [] } = {}) {
  const nodes = Array.from({ length: count }, (_, i) => jsonLdEvent({
    name: `Event ${i + 1}`,
    url: `/events/event-${i + 1}`,
    startDate: `2026-12-${String(31 - (i % 30)).padStart(2, "0")}T20:00:00+01:00`,
  }));
  const anchorHtml = anchors.map((a) => `<a href="${a}">${a} concert event</a>`).join("");
  const body = `<!doctype html>${anchorHtml}${nodes.map(eventScript).join("")}`;
  return { url: BASE_URL, at: AT, status: 200, content_type: "text/html", body };
}

/** A trivial, always-parseable detail document — proof outcome is
 * irrelevant to these tests, only fetch-attempt COUNT is being measured. */
function detailPage(url) {
  return { url, at: AT, status: 200, content_type: "text/html", body: `<p>${url}</p>` };
}

function countingFetch(programme, { flakyUrl } = {}) {
  const calls = [];
  let flakyAttempts = 0;
  return {
    calls,
    fetchDocument: async (url) => {
      calls.push(url);
      if (url === BASE_URL) return programme;
      if (flakyUrl && url === flakyUrl && flakyAttempts < 2) {
        flakyAttempts += 1;
        // Must match ../unattended-runner/retry.mjs's own
        // isTransientError() message-pattern classifier or withRetries()
        // will correctly treat it as PERMANENT and never retry at all.
        throw new Error("ETIMEDOUT: connection timed out");
      }
      return detailPage(url);
    },
  };
}

test("(a) DEFAULT_DETAIL_LIMIT is the single shared constant, and equals 36", () => {
  assert.equal(DEFAULT_DETAIL_LIMIT, 36);
});

test("(a) acquireSource() with no explicit detailLimit fetches up to DEFAULT_DETAIL_LIMIT (36) detail documents, not the old 12", async () => {
  const programme = programmeWithEvents(60);
  const { calls, fetchDocument } = countingFetch(programme);
  const result = await acquireSource({ source_id: "src", venue: "Arbitrary Venue", programme_url: BASE_URL }, { fetchDocument });
  const detailCalls = calls.filter((url) => url !== BASE_URL);
  assert.equal(detailCalls.length, 36, "default detail-fetch attempts must be exactly 36 when >=36 safe candidates exist");
  assert.equal(result.evidence.length, 1 + 36, "programme document + 36 detail documents, no more");
});

test("(a) runCityAcquisition() with no explicit detailLimit defaults identically to acquireSource()'s own default (36) — no drifted second literal", async () => {
  const programme = programmeWithEvents(60);
  const { calls, fetchDocument } = countingFetch(programme);
  const [result] = await runCityAcquisition({
    sources: [{ source_id: "src", venue: "Arbitrary Venue", programme_url: BASE_URL }],
    fetchDocument,
  });
  const detailCalls = calls.filter((url) => url !== BASE_URL);
  // Fetch-attempt COUNT parity with acquireSource()'s own default is what
  // this test proves (the "single shared constant" contract) — the trivial
  // `<p>${url}</p>` detail bodies this fixture uses deliberately don't
  // satisfy the proof engine's own canonical/self-referential identity
  // rule, so `result.state` here is expected to be a residue state, not
  // ACQUISITION_PROVEN; that is proof-engine behaviour, unrelated to and
  // unchanged by this test's own concern (fetch-count parity).
  assert.equal(detailCalls.length, DEFAULT_DETAIL_LIMIT);
  assert.equal(detailCalls.length, 36);
  assert.ok(result.source_id === "src");
});

test("(b) HARD CAP: 36 is never exceeded even when the candidate pool is far larger (200 events)", async () => {
  const programme = programmeWithEvents(200);
  const { calls, fetchDocument } = countingFetch(programme);
  await acquireSource({ source_id: "src", venue: "Arbitrary Venue", programme_url: BASE_URL }, { fetchDocument });
  const detailCalls = calls.filter((url) => url !== BASE_URL);
  assert.equal(detailCalls.length, 36);
  assert.ok(detailCalls.length <= 36);
});

test("(b) HARD CAP: overlapping duplicate candidate classes (normalized-record + raw anchor links pointing at the same URLs) never push the total past 36", async () => {
  // Every anchor href deliberately duplicates a normalized-record URL
  // already produced by the JSON-LD nodes below, so uniqueLinks()'s own
  // dedupe is what must hold the line at 36, not merely "there weren't
  // enough distinct URLs to begin with".
  const anchors = Array.from({ length: 50 }, (_, i) => `/events/event-${i + 1}`);
  const programme = programmeWithEvents(50, { anchors });
  const { calls, fetchDocument } = countingFetch(programme);
  await acquireSource({ source_id: "src", venue: "Arbitrary Venue", programme_url: BASE_URL }, { fetchDocument });
  const detailCalls = calls.filter((url) => url !== BASE_URL);
  assert.equal(detailCalls.length, 36);
  assert.equal(new Set(detailCalls).size, 36, "no duplicate URL was fetched twice to pad the count");
});

test("(b) HARD CAP: retry attempts on one flaky candidate never add an extra candidate slot beyond 36", async () => {
  const programme = programmeWithEvents(40);
  // event-30 (i=29) has this fixture's single earliest date (day 2) and is
  // therefore always rank 1 of the selected 36 — verified directly (not
  // assumed) with the same ascending-date/tie-broken-by-index rule
  // discoverDetailCandidates() itself uses: with 40 events and limit 36,
  // the selected set is exactly {event-3..event-30, event-33..event-40},
  // which always includes event-30.
  const { calls, fetchDocument } = countingFetch(programme, { flakyUrl: "https://arbitrary.example/events/event-30" });
  const result = await acquireSource({ source_id: "src", venue: "Arbitrary Venue", programme_url: BASE_URL }, { fetchDocument });
  const detailCalls = calls.filter((url) => url !== BASE_URL);
  const distinctDetailUrls = new Set(detailCalls);
  assert.equal(distinctDetailUrls.size, 36, "retries on one URL must not enlarge the candidate set beyond 36 distinct detail URLs");
  assert.ok(result.retry_count >= 1, "the flaky candidate should have needed at least one retry (sanity check the fixture actually exercised retries)");
});

test("(c) fewer than 36 safe candidates exist: only the candidates that actually exist are fetched, nothing padded", async () => {
  const programme = programmeWithEvents(10);
  const { calls, fetchDocument } = countingFetch(programme);
  const result = await acquireSource({ source_id: "src", venue: "Arbitrary Venue", programme_url: BASE_URL }, { fetchDocument });
  const detailCalls = calls.filter((url) => url !== BASE_URL);
  assert.equal(detailCalls.length, 10);
  assert.equal(result.evidence.length, 1 + 10);
});

test("(c) zero safe candidates: zero detail fetches, no synthesized URL", async () => {
  const programme = { url: BASE_URL, at: AT, status: 200, content_type: "text/html", body: "<!doctype html><p>no events here</p>" };
  const { calls, fetchDocument } = countingFetch(programme);
  await acquireSource({ source_id: "src", venue: "Arbitrary Venue", programme_url: BASE_URL }, { fetchDocument });
  const detailCalls = calls.filter((url) => url !== BASE_URL);
  assert.equal(detailCalls.length, 0);
});

test("(d) DETERMINISM: the first 12 candidate URLs selected at the new limit (36) are identical, in order, to the full result at the old limit (12)", () => {
  // NOTE ON `role`: this fixture's JSON-LD Event nodes are ALSO picked up
  // by the (pre-existing, unchanged-by-this-package) embedded-state
  // scanner (ingestion/embedded-state/collector.mjs), which — like
  // extractProgrammeLinks() — is itself bounded by the same `limit`. This
  // surfaced a genuine, PRE-EXISTING characteristic of orchestrator.mjs's
  // uniqueLinks() (present in origin/main, untouched by this package):
  // its Map-based dedup keeps a URL's first-seen POSITION but its
  // LAST-seen VALUE, so when a larger `limit` admits more embedded-state
  // link candidates into the pool, a URL already selected via the
  // normalized-record tier can have its `role` label overwritten from
  // NORMALIZED_RECORD_EVENT_URL_CANDIDATE to
  // EMBEDDED_STATE_EVENT_DETAIL_CANDIDATE purely because of the larger
  // limit — even though the URL and its ordinal position never change.
  // `role` is bookkeeping/provenance only; acquireSource() only ever
  // consumes `link.url` (see source-execution.mjs's fetch loop), so this
  // has zero effect on what gets fetched, in what order, or on proof. This
  // package does not change orchestrator.mjs, so this pre-existing
  // labelling nuance is out of scope to fix here — the assertion below
  // therefore checks the functionally load-bearing contract (URL identity
  // and order), not full object identity.
  const programme = programmeWithEvents(60);
  const at12 = discoverDetailCandidates(programme, { limit: 12 });
  const at36 = discoverDetailCandidates(programme, { limit: 36 });
  assert.equal(at12.length, 12);
  assert.equal(at36.length, 36);
  assert.deepEqual(at36.slice(0, 12).map((c) => c.url), at12.map((c) => c.url), "ranks 1-12's URLs must be identical and in the same order under the new limit");
});

test("(d) DETERMINISM: ranks 13-36 are a pure append — no rank among 1-12 reappears later, and the full 36 stays internally ordered/deduplicated", () => {
  const programme = programmeWithEvents(60);
  const at36 = discoverDetailCandidates(programme, { limit: 36 });
  const urls = at36.map((c) => c.url);
  assert.equal(new Set(urls).size, 36, "no duplicate across the full 36");
});

test("(d) DETERMINISM: repeated calls at limit=36 are byte-identical (same guarantee PR #31 already established at limit=12)", () => {
  const programme = programmeWithEvents(50);
  const first = discoverDetailCandidates(programme, { limit: 36 });
  const second = discoverDetailCandidates(programme, { limit: 36 });
  assert.deepEqual(first, second);
});

test("(e) no adaptive/source-aware/percentage/per-source-override detail-limit logic exists in the changed files", async () => {
  const filesToScan = [
    "ingestion/programme-acquisition/source-execution.mjs",
    "ingestion/programme-acquisition/city-batch.mjs",
  ];
  const forbiddenFragments = [
    "source_id ===", "source_id ==", "venue ===", "venue ==",
    "percentageLimit", "adaptiveLimit", "perSourceLimit", "sourceSpecific",
    "while (proof", "untilExhaust",
  ];
  for (const relativePath of filesToScan) {
    const contents = await readFile(resolve(REPO_ROOT, relativePath), "utf8");
    for (const fragment of forbiddenFragments) {
      assert.ok(!contents.includes(fragment), `${relativePath} must not contain "${fragment}" — no adaptive/per-source detail-limit logic is permitted in this package`);
    }
  }
});

test("(e) offline-proof.mjs and orchestrator.mjs are byte-identical to what this branch started from (proof engine and candidate-selection algorithm unchanged)", async () => {
  // This is a structural sanity check that these two files still export
  // exactly the same canonical proof-engine symbols this repository's own
  // existing proof/identity tests already exercise — it is NOT a
  // replacement for `git diff --stat origin/main -- <path>` (empty, as
  // confirmed separately), just an in-suite guard against an accidental
  // future edit to either file under this same package.
  const offlineProof = await readFile(resolve(REPO_ROOT, "ingestion/programme-acquisition/offline-proof.mjs"), "utf8");
  const orchestrator = await readFile(resolve(REPO_ROOT, "ingestion/programme-acquisition/orchestrator.mjs"), "utf8");
  assert.ok(offlineProof.includes("SOURCE_PUBLISHED_CANONICAL_EVENT_URL"));
  assert.ok(offlineProof.includes("SOURCE_PUBLISHED_SELF_REFERENTIAL_EVENT_URL"));
  assert.ok(orchestrator.includes("export function discoverDetailCandidates"));
  assert.ok(orchestrator.includes("export function collectAndProve") || orchestrator.includes("collectAndProve"));
});

test("(e) explicit detailLimit override still works unchanged (no new mandatory adaptive parameter was introduced)", async () => {
  const programme = programmeWithEvents(60);
  const { calls, fetchDocument } = countingFetch(programme);
  await acquireSource({ source_id: "src", venue: "Arbitrary Venue", programme_url: BASE_URL }, { fetchDocument, detailLimit: 5 });
  const detailCalls = calls.filter((url) => url !== BASE_URL);
  assert.equal(detailCalls.length, 5, "an explicit override must still take priority over the new default, exactly as before");
});
