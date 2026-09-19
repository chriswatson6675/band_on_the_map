// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — end-to-end controller tests
// against an isolated fixture repository tree (see fixture.mjs). Never
// touches the real repository's venues/sources/research directories and
// never makes a real network request — every fetchDocument is a fake,
// URL-routed fixture, matching tests/source-execution.test.mjs's own
// convention.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { makeFixtureRoot, cleanupFixtureRoot, writeFixtureInvestigations, writeFixtureVenueEstate, writeFixtureCensus } from "./fixture.mjs";
import { buildCandidatePool } from "../../ingestion/global-easy-harvester/candidate-pool.mjs";
import { evaluateTier1Candidate, checkExistingRegistration } from "../../ingestion/global-easy-harvester/tier1-gate.mjs";
import { admitCandidate } from "../../ingestion/global-easy-harvester/admission.mjs";
import { runHarvester } from "../../ingestion/global-easy-harvester/controller.mjs";
import { loadCandidateStates, recordCandidateState } from "../../ingestion/global-easy-harvester/state-store.mjs";

const jsonLdPage = (url) => ({
  url,
  at: "2026-01-01T00:00:00.000Z",
  status: 200,
  content_type: "text/html",
  body:
    '<link rel="canonical" href="/events/a"><script type="application/ld+json">' +
    '{"@context":"https://schema.org","@type":"Event","name":"A","startDate":"2099-09-01T20:00:00+01:00","url":"/events/a"}</script>',
});

const plainPage = (url) => ({ url, at: "2026-01-01T00:00:00.000Z", status: 200, content_type: "text/html", body: "<html><body><p>Nothing structured here.</p></body></html>" });

const homepageWithEventsLink = (url) => ({ url, at: "2026-01-01T00:00:00.000Z", status: 200, content_type: "text/html", body: '<html><body><nav><a href="/events">Events</a></nav></body></html>' });

/** A candidate with only a `website` (no `programme_url`) — e.g. a census-derived one — routes through acquireSource()'s own bounded homepage-navigation discovery (programme-resolver.mjs) before it ever sees a JSON-LD page. */
function homepageDiscoveryFetch(host) {
  return async (url) => (url === host || url === `${host}/` ? homepageWithEventsLink(url) : jsonLdPage(url.includes("/events/a") ? url : `${host}/events/a`));
}

/** A fake fetchDocument, routed by exact URL prefix, that logs every call and throws loudly for any URL it wasn't told about — a silent fixture gap must never pass a test. */
function makeFetchDocument(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [prefix, handler] of routes) {
      if (url.startsWith(prefix)) return handler(url);
    }
    throw new Error(`makeFetchDocument: no fixture registered for "${url}"`);
  };
  fn.calls = calls;
  return fn;
}

async function fullFixture() {
  const root = await makeFixtureRoot();
  await writeFixtureInvestigations(root);
  await writeFixtureVenueEstate(root);
  await writeFixtureCensus(root);
  return root;
}

test("known easy candidate accepted: T1_PROVEN then admitted, idempotent on rerun", async () => {
  const root = await fullFixture();
  try {
    const pool = await buildCandidatePool({ root });
    const candidate = pool.find((c) => c.provenance.investigation_id === "easy-jsonld-testcity-01");
    assert.ok(candidate, "fixture candidate must be in the pool");
    assert.ok(candidate.existing_venue, "this fixture's venue is already registered — the win here is a NEW source for a KNOWN venue");

    const fetchDocument = makeFetchDocument([["https://easy-jsonld.example", (u) => jsonLdPage(u.includes("/events/a") ? u : "https://easy-jsonld.example/events/a")]]);
    const verdict = await evaluateTier1Candidate(candidate, { fetchDocument });
    assert.equal(verdict.status, "T1_PROVEN");

    const admission1 = await admitCandidate(candidate, verdict.acquisition_result, { root, dryRun: false });
    assert.equal(admission1.admitted, true);
    assert.equal(admission1.venue_written, false, "the venue already exists — must be reused, never re-created");
    assert.equal(admission1.source_written, true);
    assert.equal(admission1.mapping_written, true);

    const venuesDoc = JSON.parse(await readFile(resolve(root, "venues/testcity.json"), "utf8"));
    assert.ok(venuesDoc.venues.some((v) => v.venue_id === candidate.venue_id));
    const sourcesDoc = JSON.parse(await readFile(resolve(root, "sources/testcity.json"), "utf8"));
    const written = sourcesDoc.entries.find((e) => e.id === candidate.source_id);
    assert.ok(written);
    assert.equal(written.lifecycle_status, "TECHNICALLY_REVIEWED", "must never auto-advance to ENABLED — rights review not performed by this controller");
    assert.equal(written.rights_status, "UNKNOWN");

    // Rerun against the now-updated registries: admission must be idempotent, no duplicate entries.
    const poolAfter = await buildCandidatePool({ root });
    const candidateAfter = poolAfter.find((c) => c.venue_id === candidate.venue_id);
    assert.ok(candidateAfter.existing_venue, "second read must see the just-admitted venue");
    assert.ok(candidateAfter.existing_source, "second read must see the just-admitted source");

    const admission2 = await admitCandidate(candidateAfter, verdict.acquisition_result, { root, dryRun: false });
    assert.equal(admission2.venue_written, false);
    assert.equal(admission2.source_written, false);
    assert.equal(admission2.mapping_written, false);

    const sourcesDocAfter = JSON.parse(await readFile(resolve(root, "sources/testcity.json"), "utf8"));
    assert.equal(sourcesDocAfter.entries.filter((e) => e.id === candidate.source_id).length, 1, "no duplicate source admission");
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("unknown official source deferred: no website/programme_url at all", async () => {
  const candidate = { canonical_name: "No Source Venue", city: "Test City", city_key: "testcity", website: null, programme_url: null, has_admissible_location: true, acquisition_class: null, venue_id: "venue-test-city-no-source-venue", source_id: "testcity-no-source-venue" };
  const fetchDocument = makeFetchDocument([]);
  const verdict = await evaluateTier1Candidate(candidate, { fetchDocument });
  assert.equal(verdict.status, "T1_DEFER_SOURCE_DISCOVERY");
  assert.equal(fetchDocument.calls.length, 0, "must not spend a network call once the source is already known to be unresolved");
});

test("browser-required candidate deferred without any network call", async () => {
  const root = await fullFixture();
  try {
    const pool = await buildCandidatePool({ root });
    const candidate = pool.find((c) => c.provenance.investigation_id === "browser-required-testcity-01");
    assert.ok(candidate);
    const fetchDocument = makeFetchDocument([]);
    const verdict = await evaluateTier1Candidate(candidate, { fetchDocument });
    assert.equal(verdict.status, "T1_DEFER_BROWSER_REQUIRED");
    assert.equal(fetchDocument.calls.length, 0);
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("existing collector requires adaptation (ICS): deferred without any network call", async () => {
  const root = await fullFixture();
  try {
    const pool = await buildCandidatePool({ root });
    const candidate = pool.find((c) => c.provenance.investigation_id === "requires-adaptation-testcity-01");
    assert.ok(candidate);
    const fetchDocument = makeFetchDocument([]);
    const verdict = await evaluateTier1Candidate(candidate, { fetchDocument });
    assert.equal(verdict.status, "T1_DEFER_REQUIRES_ADAPTATION");
    assert.equal(fetchDocument.calls.length, 0);
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("unsupported source shape deferred: SOCIAL_ONLY pre-classified, no network call", async () => {
  const root = await fullFixture();
  try {
    const pool = await buildCandidatePool({ root });
    const candidate = pool.find((c) => c.provenance.investigation_id === "social-only-testcity-01");
    assert.ok(candidate);
    const fetchDocument = makeFetchDocument([]);
    const verdict = await evaluateTier1Candidate(candidate, { fetchDocument });
    assert.equal(verdict.status, "T1_DEFER_UNSUPPORTED_PATTERN");
    assert.equal(fetchDocument.calls.length, 0);
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("events currently unavailable deferred: real fetch, unstructured page", async () => {
  const root = await fullFixture();
  try {
    const pool = await buildCandidatePool({ root });
    const candidate = pool.find((c) => c.canonical_name === "Unsupported Shape Venue");
    assert.ok(candidate);
    const fetchDocument = makeFetchDocument([["https://unsupported-shape.example", plainPage]]);
    const verdict = await evaluateTier1Candidate(candidate, { fetchDocument });
    assert.equal(verdict.status, "T1_DEFER_EVENTS_UNAVAILABLE");
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("ambiguous identity deferred: no admissible location and no existing venue", async () => {
  const root = await fullFixture();
  try {
    const pool = await buildCandidatePool({ root });
    const candidate = pool.find((c) => c.canonical_name === "No Address Venue");
    assert.ok(candidate);
    assert.equal(candidate.has_admissible_location, false);
    const fetchDocument = makeFetchDocument([]);
    const verdict = await evaluateTier1Candidate(candidate, { fetchDocument });
    assert.equal(verdict.status, "T1_DEFER_IDENTITY");
    assert.equal(fetchDocument.calls.length, 0);
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("already-live venue skipped safely via the existing-registration check", async () => {
  const root = await fullFixture();
  try {
    const pool = await buildCandidatePool({ root });
    const candidate = pool.find((c) => c.canonical_name === "Already Live Venue");
    assert.ok(candidate.existing_venue && candidate.existing_source);
    const fetchDocument = makeFetchDocument([["https://already-live.example", jsonLdPage]]);
    const result = await checkExistingRegistration(candidate, { fetchDocument });
    assert.equal(result.status, "SKIP_ALREADY_LIVE");
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("already-registered broken venue routed to repair", async () => {
  const root = await fullFixture();
  try {
    const pool = await buildCandidatePool({ root });
    const candidate = pool.find((c) => c.canonical_name === "Broken Registered Venue");
    assert.ok(candidate.existing_venue && candidate.existing_source);
    const fetchDocument = makeFetchDocument([["https://broken-registered.example", plainPage]]);
    const result = await checkExistingRegistration(candidate, { fetchDocument });
    assert.equal(result.status, "REPAIR_REQUIRED");
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("a paused source is left alone entirely: no network call, no repair, no re-admission", async () => {
  const root = await fullFixture();
  try {
    const pool = await buildCandidatePool({ root });
    const candidate = pool.find((c) => c.canonical_name === "Paused Venue");
    assert.ok(candidate.existing_source, "paused-src must still be found by the website cross-reference");
    const fetchDocument = makeFetchDocument([]); // no fixture registered — any call throws
    const result = await checkExistingRegistration(candidate, { fetchDocument });
    assert.equal(result.status, "SKIP_ALREADY_LIVE");
    assert.equal(fetchDocument.calls.length, 0);
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("network failure deferred without stopping the sweep: one city's failure does not block another", async () => {
  const root = await fullFixture();
  try {
    const fetchDocument = makeFetchDocument([
      ["https://network-failure.example", () => { throw new Error("boom, permanently unreachable"); }],
      ["https://othercity-success.example", homepageDiscoveryFetch("https://othercity-success.example")],
      ["https://easy-jsonld.example", (u) => jsonLdPage(u.includes("/events/a") ? u : "https://easy-jsonld.example/events/a")],
    ]);

    const summary = await runHarvester({ root, runId: "city-transition-01", dryRun: true, fetchDocument });

    assert.equal(summary.counters.deferred_by_reason.T1_DEFER_NETWORK, 1);
    assert.equal(summary.counters.tier1_proven >= 1, true, "testcity's own easy candidate must still succeed");
    assert.equal(summary.counters.cities_encountered, 2, "both testcity and othercity must be in the sweep");

    const checkpoints = await loadCandidateStates("city-transition-01", { root });
    const otherCitySuccess = [...checkpoints.values()].find((c) => c.candidate?.canonical_name === "Other City Success Venue");
    assert.ok(otherCitySuccess, "othercity's candidate must have been reached and evaluated despite testcity's network failure");
    assert.equal(otherCitySuccess.state, "T1_PROVEN");
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("dry run never admits and never writes to any registry", async () => {
  const root = await fullFixture();
  try {
    const fetchDocument = makeFetchDocument([
      ["https://easy-jsonld.example", (u) => jsonLdPage(u.includes("/events/a") ? u : "https://easy-jsonld.example/events/a")],
      ["https://already-live.example", jsonLdPage],
      ["https://broken-registered.example", plainPage],
      ["https://unsupported-shape.example", plainPage],
      ["https://network-failure.example", () => { throw new Error("boom"); }],
      ["https://othercity-success.example", jsonLdPage],
    ]);

    const sourcesBefore = await readFile(resolve(root, "sources/testcity.json"), "utf8");
    const venuesBefore = await readFile(resolve(root, "venues/testcity.json"), "utf8");

    const summary = await runHarvester({ root, runId: "dry-run-01", dryRun: true, fetchDocument });
    assert.equal(summary.counters.admitted, 0);

    const sourcesAfter = await readFile(resolve(root, "sources/testcity.json"), "utf8");
    const venuesAfter = await readFile(resolve(root, "venues/testcity.json"), "utf8");
    assert.equal(sourcesBefore, sourcesAfter);
    assert.equal(venuesBefore, venuesAfter);
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("interrupted run resumes: a pre-recorded terminal checkpoint is never re-evaluated", async () => {
  const root = await fullFixture();
  try {
    const pool = await buildCandidatePool({ root });
    const alreadyDeferred = pool.find((c) => c.canonical_name === "No Address Venue");
    await recordCandidateState("resume-01", alreadyDeferred.venue_id, { state: "T1_DEFER_IDENTITY", city_key: "testcity" }, { root });

    const fetchDocument = makeFetchDocument([
      ["https://easy-jsonld.example", (u) => jsonLdPage(u.includes("/events/a") ? u : "https://easy-jsonld.example/events/a")],
      ["https://already-live.example", jsonLdPage],
      ["https://broken-registered.example", plainPage],
      ["https://unsupported-shape.example", plainPage],
      ["https://network-failure.example", () => { throw new Error("boom"); }],
      ["https://othercity-success.example", jsonLdPage],
    ]);

    const summary = await runHarvester({ root, runId: "resume-01", dryRun: true, fetchDocument });
    assert.equal(summary.counters.resumed_skipped, 1);
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("success cap honoured: stops after max_admissions even with more provable candidates available", async () => {
  const root = await fullFixture();
  // A second easy, independently-provable candidate in the same city.
  await import("node:fs/promises").then(({ writeFile, mkdir }) =>
    mkdir(resolve(root, "research/source-investigations/easy-jsonld-two-testcity-01"), { recursive: true }).then(() =>
      writeFile(
        resolve(root, "research/source-investigations/easy-jsonld-two-testcity-01/investigation.json"),
        JSON.stringify({
          investigation_id: "easy-jsonld-two-testcity-01",
          policy_version: "BOTM-SOURCE-INVESTIGATION-v1.2",
          investigated_at: "2026-01-01T00:00:00Z",
          investigator: { type: "AI", method: "fixture" },
          probe_history: [{ level: 1, method: "PASSIVE_STATIC", outcome: "SUFFICIENT", reason: "fixture", evidence_refs: ["ev1"] }],
          source_candidate_id: null,
          source_id: null,
          venue_reference: "Easy JSON-LD Venue Two (Test City)",
          official_url: "https://easy-jsonld-two.example/",
          identity: { status: "PROVEN", confidence: "HIGH", evidence_refs: ["ev1"], notes: null },
          site_classification: { acquisition_class: "JSON_LD_EVENT", platform: null, confidence: "HIGH", evidence_refs: [] },
          data_paths: [{ kind: "HTML_EVENT_LIST_PAGE_WITH_JSONLD", url: "https://easy-jsonld-two.example/events", access: "PUBLIC", status: "CONFIRMED", confidence: "HIGH", evidence_refs: [] }],
          field_assessment: {},
          collector_assessment: { recommended_family: "JSON_LD", confidence: "HIGH", evidence_refs: [], blockers: [] },
          decision: { status: "READY_FOR_ACTIVATION", reasons: [], evidence_refs: ["ev1"] },
          supersedes: null,
          evidence: [{ evidence_id: "ev1", evidence_class: "DIRECT_EVIDENCE", description: "fixture", acquired_from: "fixture", acquired_at: "2026-01-01T00:00:00Z", method: "fixture", content_type: null, byte_faithful: true, path: null }],
        }, null, 2),
      ),
    ),
  );

  try {
    const fetchDocument = makeFetchDocument([
      ["https://easy-jsonld-two.example", (u) => jsonLdPage(u.includes("/events/a") ? u : "https://easy-jsonld-two.example/events/a")],
      ["https://easy-jsonld.example", (u) => jsonLdPage(u.includes("/events/a") ? u : "https://easy-jsonld.example/events/a")],
      ["https://already-live.example", jsonLdPage],
      ["https://broken-registered.example", plainPage],
      ["https://unsupported-shape.example", plainPage],
      ["https://network-failure.example", () => { throw new Error("boom"); }],
      ["https://othercity-success.example", jsonLdPage],
    ]);

    const summary = await runHarvester({ root, runId: "cap-01", dryRun: false, maxAdmissions: 1, fetchDocument });
    assert.equal(summary.counters.admitted, 1, "must stop at exactly the success cap");
  } finally {
    await cleanupFixtureRoot(root);
  }
});

test("no duplicate venue/source admissions: re-admitting the same candidate writes nothing new", async () => {
  const root = await fullFixture();
  try {
    const pool = await buildCandidatePool({ root });
    const candidate = pool.find((c) => c.provenance.investigation_id === "easy-jsonld-testcity-01");
    const fetchDocument = makeFetchDocument([["https://easy-jsonld.example", (u) => jsonLdPage(u.includes("/events/a") ? u : "https://easy-jsonld.example/events/a")]]);
    const verdict = await evaluateTier1Candidate(candidate, { fetchDocument });

    const first = await admitCandidate(candidate, verdict.acquisition_result, { root, dryRun: false });
    assert.equal(first.admitted, true);

    const poolAfter = await buildCandidatePool({ root });
    const candidateAfter = poolAfter.find((c) => c.venue_id === candidate.venue_id);
    const second = await admitCandidate(candidateAfter, verdict.acquisition_result, { root, dryRun: false });
    assert.equal(second.venue_written, false);
    assert.equal(second.source_written, false);
    assert.equal(second.mapping_written, false);

    const venuesDoc = JSON.parse(await readFile(resolve(root, "venues/testcity.json"), "utf8"));
    assert.equal(venuesDoc.venues.filter((v) => v.venue_id === candidate.venue_id).length, 1);
  } finally {
    await cleanupFixtureRoot(root);
  }
});
