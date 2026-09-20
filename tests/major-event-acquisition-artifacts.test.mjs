// BEATMAPPED-UK-MAJOR-EVENT-ACQUISITION-TIER1-01 — validation of the REAL
// acquired dataset (not synthetic fixtures). This is the standing gate on
// the retained national major-event observation layer.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateObservation } from "../ingestion/observation/contract.mjs";
import { TERMINAL_STATES } from "../ingestion/major-event-acquisition/acquire.mjs";

const DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../research/major-event-acquisition/uk-tier1-01");
const readJson = async (name) => JSON.parse(await readFile(resolve(DIR, name), "utf8"));

const run = await readJson("run.json");
const sources = (await readJson("sources.json")).records;
const observations = (await readJson("observations.json")).observations;
const failures = (await readJson("failures.json")).failures;
const summary = await readJson("summary.json");
const evidence = (await readJson("evidence-index.json")).retrievals;

test("every acquired Observation satisfies the shared Observation contract", () => {
  const invalid = [];
  for (const observation of observations) {
    const errors = validateObservation(observation);
    if (errors.length) invalid.push(`${observation.source_id}/${observation.source_record_id}: ${errors.join("; ")}`);
  }
  assert.deepEqual(invalid, []);
  assert.ok(observations.length > 0, "the run must have acquired real observations");
});

test("no Observation carries canonical Event identity — this layer is observations only", () => {
  for (const observation of observations) {
    assert.ok(!("event_id" in observation), `${observation.source_id} leaked a canonical event_id`);
    assert.ok(!("canonical_event_id" in observation));
    assert.ok(!("venue_id" in observation), "production venue identity must not appear; the census is the identity root here");
  }
});

test("source_record_id is unique WITHIN each source — no colliding identities shipped", () => {
  const bySource = new Map();
  for (const observation of observations) {
    const ids = bySource.get(observation.source_id) ?? new Set();
    assert.ok(!ids.has(observation.source_record_id), `duplicate source_record_id in ${observation.source_id}: ${observation.source_record_id}`);
    ids.add(observation.source_record_id);
    bySource.set(observation.source_id, ids);
  }
});

test("every Observation links back to its census venue and calendar source", () => {
  for (const observation of observations) {
    assert.ok(observation.source_fields.venue_census_id, "venue_census_id provenance is mandatory");
    assert.ok(observation.source_fields.calendar_source_id, "calendar_source_id provenance is mandatory");
    assert.equal(observation.source_id, observation.source_fields.calendar_source_id, "source_id is the census calendar source id");
    assert.ok(observation.source_fields.census_nation, "nation provenance is mandatory");
  }
});

test("every event domain comes from the census calendar class, never inferred", () => {
  for (const observation of observations) {
    assert.equal(
      observation.source_fields.event_domain,
      observation.source_fields.census_calendar_class,
      `${observation.source_id} has an event_domain that does not match its census calendar class`,
    );
  }
});

test("temporal classification is present, honest and consistent with the recorded date", () => {
  const allowed = new Set(["FUTURE_EVENT", "PAST_EVENT", "DATE_UNKNOWN"]);
  for (const observation of observations) {
    const temporal = observation.source_fields.temporal_class;
    assert.ok(allowed.has(temporal), `${observation.source_id}: bad temporal_class ${temporal}`);
    if (temporal === "DATE_UNKNOWN") {
      assert.equal(observation.start?.date ?? null, null, "DATE_UNKNOWN must genuinely have no usable date");
    } else {
      assert.match(observation.start.date, /^\d{4}-\d{2}-\d{2}$/, `${temporal} requires a real calendar date`);
    }
    // A floating or date-only value must never claim to be a UTC instant.
    if (observation.start?.certainty !== "UTC_INSTANT") {
      assert.notEqual(observation.start?.is_utc, true, `${observation.source_id}: non-UTC certainty must not claim is_utc`);
      assert.equal(observation.start?.iso ?? null, null, "a fabricated UTC instant must never be present");
    }
  }
});

test("every source in the population has a terminal state, and failures are retained not dropped", () => {
  assert.equal(sources.length, 43, "all 43 READY_TIER1 sources must be accounted for");
  for (const source of sources) {
    assert.ok(TERMINAL_STATES.has(source.state), `${source.calendar_source_id}: non-canonical state ${source.state}`);
  }
  const nonProven = sources.filter((source) => source.state !== "ACQUISITION_PROVEN");
  assert.equal(failures.length, nonProven.length, "every non-proven source appears in failures.json");
  for (const failure of failures) {
    assert.ok(failure.reason, `${failure.calendar_source_id} must state WHY it did not prove`);
    assert.ok(failure.calendar_url, "and must retain the URL that was attempted");
  }
});

test("the run summary reconciles exactly with the retained records", () => {
  assert.equal(summary.sources_attempted, sources.length);
  assert.equal(summary.normalized_observations, observations.length);
  assert.equal(summary.sources_proven, sources.filter((s) => s.state === "ACQUISITION_PROVEN").length);
  assert.equal(summary.future_observations, observations.filter((o) => o.source_fields.temporal_class === "FUTURE_EVENT").length);
  assert.equal(summary.past_observations, observations.filter((o) => o.source_fields.temporal_class === "PAST_EVENT").length);
  assert.equal(summary.date_unknown, observations.filter((o) => o.source_fields.temporal_class === "DATE_UNKNOWN").length);
  assert.equal(
    summary.sources_attempted,
    summary.sources_proven + summary.sources_empty + summary.sources_failed,
    "source states must sum to the population with no unexplained remainder",
  );
});

test("every retrieval that produced observations retains its evidence", () => {
  const evidenceBySource = new Map(evidence.map((item) => [item.calendar_source_id, item]));
  for (const source of sources.filter((s) => s.observation_count > 0)) {
    const retained = evidenceBySource.get(source.calendar_source_id);
    assert.ok(retained, `${source.calendar_source_id} produced observations but retained no evidence`);
    assert.ok(retained.requested_url, "evidence must record what was requested");
    assert.ok(retained.final_url, "and where it landed");
    assert.ok(retained.retrieved_at, "and when");
  }
});

test("cross-source duplicates are REPORTED but never merged", () => {
  const multi = summary.potential_cross_source_duplicates ?? [];
  for (const venue of multi) {
    assert.ok(venue.source_count > 1);
    const ids = venue.sources.map((source) => source.calendar_source_id);
    assert.equal(new Set(ids).size, ids.length);
    // Each source's observations must still be present independently.
    for (const id of ids) {
      const fromThisSource = observations.filter((o) => o.source_id === id);
      const sourceRow = sources.find((s) => s.calendar_source_id === id);
      assert.equal(fromThisSource.length, sourceRow.observation_count, `${id}: observations were merged away`);
    }
  }
});

test("venue attribution is explicit wherever a source names a different venue than the census", () => {
  const allowed = new Set(["SOURCE_VENUE_MATCHES_CENSUS", "SOURCE_VENUE_DIFFERS_FROM_CENSUS", "SOURCE_VENUE_NOT_STATED", "CENSUS_VENUE_NOT_STATED", "VENUE_ATTRIBUTION_UNVERIFIABLE"]);
  for (const observation of observations) {
    assert.ok(allowed.has(observation.source_fields.venue_attribution), `bad venue_attribution: ${observation.source_fields.venue_attribution}`);
  }
  // A shared operator platform genuinely serves other venues' events, so
  // this must be a visible, non-zero, machine-readable signal — not a
  // silent assumption that every observation belongs to its census venue.
  assert.ok(
    observations.some((o) => o.source_fields.venue_attribution === "SOURCE_VENUE_DIFFERS_FROM_CENSUS"),
    "the shared-platform attribution risk must remain visible in the dataset",
  );
});

test("SAFETY: the acquired dataset contains no production admission or publication state", () => {
  assert.equal(run.artifact_type, "UK_MAJOR_EVENT_ACQUISITION_RUN");
  // Production admission/publication state must appear NOWHERE.
  const forbiddenAnywhere = ["admitted_at", "published_at", "active_status", "lifecycle_status", "source_registry_id"];
  // `venue_id` is forbidden at TOP level, where it would mean BeatMapped
  // production venue identity. Inside source_fields it legitimately means
  // the SOURCE's own venue identifier — The Events Calendar publishes a
  // venue id with each event, and discarding it would destroy source
  // truth. The distinction is the point, so it is asserted, not relaxed.
  for (const observation of observations) {
    for (const field of forbiddenAnywhere) {
      assert.ok(!(field in observation), `observation carries production field ${field}`);
      assert.ok(!(field in observation.source_fields), `observation.source_fields carries production field ${field}`);
    }
    assert.ok(!("venue_id" in observation), "a top-level venue_id would assert production venue identity");
    if ("venue_id" in observation.source_fields) {
      assert.equal(observation.source_fields.source_family, "WORDPRESS_TRIBE_API", "only the Tribe source publishes its own venue id");
      assert.ok(observation.source_fields.venue_census_id, "and the census linkage must still be the identity root");
    }
  }
  assert.equal(run.invalid_observations.length, 0, "a run that produced invalid observations is a failed run");
});

test("SAFETY: acquisition did not touch any production registry or public map data", async () => {
  const { execSync } = await import("node:child_process");
  const status = execSync("git status --porcelain venues sources data public", { cwd: resolve(DIR, "../../.."), encoding: "utf8" });
  assert.equal(status.trim(), "", `acquisition must not modify production paths:\n${status}`);
});
