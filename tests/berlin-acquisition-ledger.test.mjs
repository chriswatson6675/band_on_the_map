import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildLedger } from "../research/venue-discovery/berlin-03-acquisition-learning/build-ledger.mjs";
import { COLLECTOR_CAPABILITY_ROUTES, TECHNICAL_MECHANISMS } from "../ingestion/venue-discovery/research-state.mjs";

test("Berlin acquisition universe is composed mechanically without room inflation", async () => {
  const ledger = await buildLedger();
  assert.equal(ledger.counts.proven_independent_venues, 104);
  assert.equal(ledger.counts.likely_additional_independent_venues, 6);
  assert.equal(ledger.counts.proven_plus_likely_working_universe, 110);
  assert.equal(ledger.counts.canonically_acquired, 38);
  assert.equal(ledger.counts.proven_not_canonically_acquired, 66);
  assert.equal(ledger.counts.likely_not_canonically_acquired, 6);
  assert.equal(ledger.records.some((record) => record.canonical_name === "OXI Garten"), false);
  assert.equal(new Set(ledger.records.map((record) => record.candidate_id)).size, 110);
});

test("consolidated deep ledger accounts for every target and gates acquisition proof on normalized events", async () => {
  const ledger = JSON.parse(await readFile(new URL("../research/venue-discovery/berlin-03-acquisition-learning/acquisition-ledger.json", import.meta.url), "utf8"));
  assert.equal(ledger.records.length, 110);
  assert.equal(ledger.counts.acquisition_proven_not_activated, 8);
  assert.equal(ledger.counts.deterministic_acquisition_capability, 46);
  assert.equal(ledger.counts.acquisition_proven_coverage_percent, 44.2);
  assert.ok(ledger.records.every((record) => TECHNICAL_MECHANISMS.has(record.technical_mechanism)));
  assert.ok(ledger.records.every((record) => record.collector_fit_after === null || COLLECTOR_CAPABILITY_ROUTES.has(record.collector_fit_after)));
  assert.ok(ledger.records.every((record) => !record.programme_url || record.source_evidence.length > 0));
  const proofs = ledger.records.filter((record) => record.acquisition_result === "ACQUISITION_PROVEN_NOT_ACTIVATED");
  assert.ok(proofs.every((record) => record.read_only_proof?.future_events_observed > 0));
  assert.ok(proofs.every((record) => record.read_only_proof.normalized_event_sample.every((event) => event.title && (event.start_date || event.start?.date) && event.event_url)));
});

test("capability and research queues partition the unresolved residue", async () => {
  const clusters = JSON.parse(await readFile(new URL("../research/venue-discovery/berlin-03-acquisition-learning/capability-clusters.json", import.meta.url), "utf8"));
  assert.equal(clusters.clusters.reduce((total, cluster) => total + cluster.venue_count, 0), 53);
  assert.equal(clusters.ai_research_queue.length, 7);
  assert.equal(clusters.human_review_queue.length, 0);
  assert.ok(clusters.ai_research_queue.every((item) => item.already_known && item.unresolved && item.deterministic_checks_attempted.length && item.ai_worker_should_determine && item.automatic_afterward));
});

test("all eight deterministic recovery cases have one controlled outcome", async () => {
  const probes = JSON.parse(await readFile(new URL("../research/venue-discovery/berlin-03-acquisition-learning/probe-results.json", import.meta.url), "utf8"));
  const names = ["Hebbel am Ufer (HAU 1, 2, 3)", "Kreuzwerk", "American Western Saloon", "Musikbrauerei", "MS Hoppetosse", "Panke", "Maaya", "Golden Gate"];
  const outcomes = new Set(["ACQUISITION_PROVEN_NOT_ACTIVATED", "SOURCE_RESOLVED_COLLECTOR_GAP", "SOURCE_RESOLUTION_WAS_WRONG", "PROGRAMME_NOW_EMPTY", "TECHNICAL_FAILURE", "NEEDS_DEEPER_INVESTIGATION"]);
  for (const name of names) {
    const result = probes.results.find((record) => record.venue === name);
    assert.ok(result, `${name} missing`);
    assert.ok(outcomes.has(result.acquisition_result), `${name}: ${result.acquisition_result}`);
  }
});

test("acquisition proof remains distinct from source discovery", async () => {
  const ledger = await buildLedger();
  const notAcquired = ledger.records.filter((record) => record.acquisition_result === "NOT_PROVEN");
  assert.equal(notAcquired.length, 72);
  assert.ok(notAcquired.some((record) => record.future_programme_state === "FUTURE_PROGRAMME_PROVEN"));
  assert.equal(ledger.counts.acquisition_proven_not_activated, 0);
  assert.equal(ledger.counts.current_acquisition_coverage_percent, 36.5);
});
