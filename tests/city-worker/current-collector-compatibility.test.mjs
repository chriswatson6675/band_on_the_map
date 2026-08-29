// BEATMAPPED-PROVEN-CITY-WORKER-CURRENT-COLLECTOR-INTEGRATION-01
//
// The city worker proven live on DigitalOcean (run 33272969771) was frozen
// at fa64002 while deterministic collector work continued. This file proves
// the SAME proven worker, replayed onto the current collector line, really
// does execute the CURRENT collector engine — not the fa64002-era one it
// was live-tested against.
//
// The discriminator is deliberate and specific. `collectAndProve()` — the
// exact orchestrator entry point the worker reaches through
// acquireSource() — now sources its records from the generic static-card
// collector for a STATIC_HTML_CARDS programme surface. Before that
// improvement it fell through to JSON-LD extraction over the retained
// documents. So for a programme card whose own title differs from the
// detail page's JSON-LD name:
//
//   current line   -> record title comes from the CARD, and
//                     collector_provenance carries card counters
//   fa64002-era    -> record title comes from the DETAIL JSON-LD, and
//                     collector_provenance is null
//
// Both lines report mechanism STATIC_HTML_CARDS (routing/fingerprinting
// predates the collector), so mechanism alone proves nothing — which is
// exactly why these tests assert on provenance and record origin instead.
//
// No network, no AI, no browser: every document here is synthetic.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { collectAndProve } from "../../ingestion/programme-acquisition/orchestrator.mjs";
import { mapAcquisitionResultToCheckpoint } from "../../ingestion/programme-acquisition/worker-checkpoint-mapping.mjs";
import { resolveSourceTasks } from "../../ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs";

const PROGRAMME_URL = "https://cards.example/whats-on";
const DETAIL_URL = "https://cards.example/events/one";

/** A STATIC_HTML_CARDS programme surface whose card title is distinguishable. */
function programmeDocument(cardTitle = "CARD TITLE") {
  return {
    url: PROGRAMME_URL,
    at: "2026-08-29T00:00:00Z",
    status: 200,
    content_type: "text/html",
    body:
      '<article class="event-card">' +
      `<a href="/events/one">${cardTitle}</a>` +
      '<time datetime="2026-09-01T20:00:00+01:00"></time>' +
      "</article>",
  };
}

/** A first-party detail document that canonically proves the same event. */
function detailDocument(jsonLdTitle = "DETAIL TITLE") {
  return {
    url: DETAIL_URL,
    at: "2026-08-29T00:00:00Z",
    status: 200,
    content_type: "text/html",
    body:
      `<link rel="canonical" href="${DETAIL_URL}">` +
      '<script type="application/ld+json">' +
      `{"@context":"https://schema.org","@type":"Event","name":"${jsonLdTitle}",` +
      `"startDate":"2026-09-01T20:00:00+01:00","url":"${DETAIL_URL}"}` +
      "</script>",
  };
}

function runCollectAndProve() {
  const programme = programmeDocument();
  const detail = detailDocument();
  return collectAndProve({
    source_id: "arbitrary-cards",
    venue_name: "Arbitrary Cards Venue",
    programme,
    detail_documents: [detail],
    documents: [programme, detail],
  });
}

// --- A/B/C: the worker's own acquisition path runs the CURRENT engine ---

test("A: the orchestrator the worker reaches sources records from the CURRENT static-card collector, not fa64002-era JSON-LD fallback", () => {
  const result = runCollectAndProve();
  assert.equal(result.selected.mechanism, "STATIC_HTML_CARDS");
  assert.equal(result.records.length, 1);
  assert.equal(
    result.records[0].title,
    "CARD TITLE",
    "on the fa64002-era line this is 'DETAIL TITLE' — a record title of 'DETAIL TITLE' means the static-card collector did NOT run",
  );
});

test("B: current collector provenance is carried through (absent entirely on the fa64002-era line)", () => {
  const result = runCollectAndProve();
  assert.ok(result.collector_provenance, "fa64002-era collectAndProve returns null provenance for a static-card surface");
  assert.equal(result.collector_provenance.card_candidates_inspected, 1);
  assert.equal(result.collector_provenance.card_records_accepted, 1);
});

test("C: current normalisation/proof semantics still gate on first-party canonical detail proof", () => {
  const result = runCollectAndProve();
  assert.equal(result.state, "ACQUISITION_PROVEN");
  assert.equal(result.observations.length, 1);
  // Proof still comes from the retained detail document, never from the card alone.
  assert.equal(result.proofs.length, 1);
  assert.equal(result.proofs[0].proof_kind, "RETAINED_FIRST_PARTY_DETAIL_DOCUMENT");

  // A card with no proving detail document must NOT become an observation.
  const unproven = collectAndProve({
    source_id: "arbitrary-cards",
    venue_name: "Arbitrary Cards Venue",
    programme: programmeDocument(),
    detail_documents: [],
    documents: [programmeDocument()],
  });
  assert.equal(unproven.observations.length, 0);
  assert.equal(unproven.state, "STABLE_IDENTITY_PROOF_FAILED");
  assert.equal(unproven.residue, true, "an unproven card is structured residue, never a silent success");
});

// --- E: terminal result maps onto the durable checkpoint contract ---

test("E: the current terminal result maps cleanly onto the worker's durable checkpoint", () => {
  const result = runCollectAndProve();
  // The bridge (source-execution.mjs) is what attaches the counted fields;
  // this asserts the mapping contract those counts flow through, using the
  // real state and mechanism the current orchestrator just produced.
  const checkpoint = mapAcquisitionResultToCheckpoint({
    state: result.state,
    collector: result.selected.mechanism,
    normalized_event_count: result.records.length,
    proven_event_count: result.observations.length,
    retry_count: 0,
  });
  assert.equal(checkpoint.status, "SUCCESS");
  assert.equal(checkpoint.source_state, "ACQUISITION_PROVEN");
  assert.equal(checkpoint.collector, "STATIC_HTML_CARDS");
  assert.equal(checkpoint.normalized_event_count, 1);
  assert.equal(checkpoint.proven_event_count, 1);
  assert.equal(checkpoint.retry_count, 0);
});

// --- F: current residue vocabulary maps to per-source terminal results ---

test("F: current residue/failure vocabulary maps to per-source terminal results, never a city-job crash", () => {
  const cases = [
    ["STABLE_IDENTITY_PROOF_FAILED", "FAILED", null],
    ["SUPPORTED_COLLECTOR_NO_VALID_EVENTS", "FAILED", null],
    ["BROWSER_REQUIRED", "RESIDUE", "BROWSER_REQUIRED"],
    ["PROGRAMME_EMPTY", "RESIDUE", "PROGRAMME_EMPTY"],
    ["PROGRAMME_SOURCE_UNRESOLVED", "RESIDUE", "SOURCE_UNRESOLVED"],
  ];
  for (const [state, expectedStatus, residueReason] of cases) {
    const checkpoint = mapAcquisitionResultToCheckpoint({ state, retry_count: 0 });
    assert.equal(checkpoint.status, expectedStatus, `${state} must map to a structured ${expectedStatus}, never throw`);
    assert.equal(checkpoint.source_state, state, "the current vocabulary is preserved verbatim in durable state");
    if (residueReason) assert.equal(checkpoint.residue_reason, residueReason);
  }

  // An unrecognised state must fail loudly rather than be silently coerced —
  // that is what keeps this mapping honest as the collector vocabulary grows.
  assert.throws(
    () => mapAcquisitionResultToCheckpoint({ state: "A_STATE_THIS_REPOSITORY_DOES_NOT_DEFINE" }),
    /unrecognised state/,
  );
});

// --- D: one retry owner, on the current line ---

test("D: the collector still owns its internal retries — the worker never adds an outer retry", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "current-collector-compat-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "sources"), { recursive: true });
  await writeFile(
    join(root, "sources/arbitrary-registry.json"),
    JSON.stringify({ entries: [{ id: "arbitrary-cards", name: "Arbitrary Cards Venue", official_website: "https://cards.example/", events_url: PROGRAMME_URL }] }),
    "utf8",
  );
  await mkdir(join(root, "fixtures/city-worker/real-estates"), { recursive: true });
  const estateRef = "fixtures/city-worker/real-estates/cards.json";
  await writeFile(join(root, estateRef), JSON.stringify({ registry: "sources/arbitrary-registry.json", source_ids: ["arbitrary-cards"] }), "utf8");

  let programmeFetches = 0;
  const fetchDocument = async (url) => {
    if (new URL(url).pathname === "/events/one") return detailDocument();
    programmeFetches += 1;
    return programmeDocument();
  };

  const [task] = await resolveSourceTasks({ estate_ref: estateRef }, { root, fetchDocument });
  const outcome = await task.run();

  assert.equal(outcome.outcome, "SUCCESS");
  assert.equal(outcome.collector, "STATIC_HTML_CARDS", "the real current orchestrator ran, not a stub");
  assert.equal(outcome.retry_count, 0, "a clean fetch needs no collector-internal retry");
  assert.ok(programmeFetches >= 1, "the programme surface really was fetched through the current bridge");
  assert.ok(!("attempts" in outcome), "worker attempt bookkeeping must not leak into the source-task outcome");
});

// --- I/J: nothing geography-specific, no AI, no browser in the deterministic path ---

test("I/J: the deterministic worker path introduces no geography routing, AI, or browser execution", async () => {
  const workerDir = new URL("../../ingestion/city-worker/", import.meta.url);
  const files = [];
  async function walk(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const child = new URL(entry.name + (entry.isDirectory() ? "/" : ""), dir);
      if (entry.isDirectory()) await walk(child);
      else if (entry.name.endsWith(".mjs")) files.push(child);
    }
  }
  await walk(workerDir);
  assert.ok(files.length > 0, "expected worker modules to scan");

  const { readFile } = await import("node:fs/promises");
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const code = text.split("\n").filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*")).join("\n");
    assert.doesNotMatch(code, /playwright|puppeteer|browser-resolution/i, `${file.pathname} must not reach browser execution`);
    assert.doesNotMatch(code, /anthropic|openai|ai-onboarding/i, `${file.pathname} must not reach AI inference`);
    // Geography is metadata only: no city/country name may select a collector.
    assert.doesNotMatch(code, /\b(?:Berlin|London|Lisbon|Paris|Madrid|Barcelona)\b/, `${file.pathname} must not hard-code a city`);
  }
});
