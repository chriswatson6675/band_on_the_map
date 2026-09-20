// BEATMAPPED-UK-MAJOR-EVENT-VENUE-ATTRIBUTION-01 — validation of the REAL
// derived attribution layer against the real acquired Observations.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ATTRIBUTION_STATES, CONFIDENCE } from "../ingestion/major-event-attribution/resolve.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));

const attributions = (await readJson("research/major-event-attribution/uk-tier1-01/attributions.json")).attributions;
const unresolved = (await readJson("research/major-event-attribution/uk-tier1-01/unresolved.json")).unresolved;
const summary = await readJson("research/major-event-attribution/uk-tier1-01/summary.json");
const observations = (await readJson("research/major-event-acquisition/uk-tier1-01/observations.json")).observations;
const censusVenues = (await readJson("research/major-event-venues/uk-major-event-census-01/venues.json")).venues;

test("every acquired Observation receives exactly one attribution record", () => {
  assert.equal(attributions.length, observations.length, "attribution count must equal observation count");
  const refs = attributions.map((record) => `${record.source_id}||${record.source_record_id}`);
  assert.equal(new Set(refs).size, refs.length, "no observation may be attributed twice");

  const observationRefs = new Set(observations.map((o) => `${o.source_id}||${o.source_record_id}`));
  for (const ref of refs) assert.ok(observationRefs.has(ref), `attribution references an unknown observation: ${ref}`);
});

test("every attribution carries a valid state and confidence", () => {
  for (const record of attributions) {
    assert.ok(ATTRIBUTION_STATES.has(record.attribution_state), `bad state: ${record.attribution_state}`);
    assert.ok(CONFIDENCE.has(record.confidence), `bad confidence: ${record.confidence}`);
    assert.ok(Array.isArray(record.evidence) && record.evidence.length > 0, "every decision must state its evidence");
  }
});

test("a resolved attribution points at a real census venue; an unresolved one names its candidates", () => {
  const byId = new Map(censusVenues.map((venue) => [venue.venue_census_id, venue]));
  for (const record of attributions) {
    if (record.resolved_venue_census_id) {
      const venue = byId.get(record.resolved_venue_census_id);
      assert.ok(venue, `resolved to a venue not in the census: ${record.resolved_venue_census_id}`);
      assert.equal(record.resolved_venue_name, venue.canonical_name);
      assert.ok(record.attribution_method, "a resolved attribution must record HOW it resolved");
      assert.equal(record.ambiguity_candidates.length, 0);
    } else {
      assert.equal(record.confidence, "REVIEW", "an unresolved attribution is always REVIEW");
      assert.equal(record.attribution_method, null);
    }
  }
});

test("SOURCE PROVENANCE IS NOT VENUE IDENTITY — both are retained, and they genuinely differ", () => {
  // The whole point of this layer: the venue an event is attributed to is
  // decided on evidence, not inherited from the calendar it came from.
  for (const record of attributions) {
    assert.ok("source_census_venue_id" in record, "where it was fetched from must be retained");
    assert.ok("resolved_venue_census_id" in record, "where it actually is must be a separate field");
  }

  const redirected = attributions.filter((record) => record.attribution_state === "RESOLVED_TO_DIFFERENT_CENSUS_VENUE");
  assert.ok(redirected.length > 0, "the dataset must contain real cross-venue redirections");
  for (const record of redirected) {
    assert.notEqual(record.resolved_venue_census_id, record.source_census_venue_id);
    assert.ok(
      record.evidence.some((line) => /source provenance is not venue identity/.test(line)),
      "a redirection must say explicitly that provenance was not inherited",
    );
  }
});

test("the source Observations were NOT rewritten by attribution", () => {
  const byRef = new Map(observations.map((o) => [`${o.source_id}||${o.source_record_id}`, o]));
  for (const record of attributions) {
    const observation = byRef.get(`${record.source_id}||${record.source_record_id}`);
    assert.equal(
      observation.venue_name,
      record.source_reported_venue_name,
      "the Observation's venue_name must still be the SOURCE's own words",
    );
    // The observation must not have gained the resolved venue.
    assert.ok(!("resolved_venue_census_id" in observation), "attribution must not be written back onto the Observation");
    assert.ok(!("event_id" in observation));
  }
});

test("no attribution record creates canonical Event identity or merges across sources", () => {
  for (const record of attributions) {
    assert.ok(!("event_id" in record));
    assert.ok(!("canonical_event_id" in record));
    assert.ok(!("merged_with" in record));
    assert.ok(!("duplicate_of" in record));
  }
  // Two sources covering one venue must still yield separate records.
  const bySource = new Map();
  for (const record of attributions) bySource.set(record.source_id, (bySource.get(record.source_id) ?? 0) + 1);
  assert.ok(bySource.size > 1, "multiple sources must still be present independently");
});

test("the summary reconciles exactly with the attribution records", () => {
  assert.equal(summary.total_observations, attributions.length);
  assert.equal(summary.resolved, attributions.filter((r) => r.resolved_venue_census_id).length);
  assert.equal(summary.unresolved, attributions.filter((r) => !r.resolved_venue_census_id).length);
  assert.equal(summary.resolved + summary.unresolved, attributions.length, "states must sum with no remainder");
  assert.equal(summary.redirected_away_from_source_venue, attributions.filter((r) => r.attribution_state === "RESOLVED_TO_DIFFERENT_CENSUS_VENUE").length);
  assert.equal(summary.distinct_resolved_venues, new Set(attributions.filter((r) => r.resolved_venue_census_id).map((r) => r.resolved_venue_census_id)).size);
  assert.equal(unresolved.length, summary.unresolved, "unresolved.json must hold every unresolved record");
});

test("every unresolved record states a concrete reason — none is silently dropped", () => {
  for (const record of unresolved) {
    assert.ok(record.evidence.length > 0, `${record.source_record_id} must say why it did not resolve`);
    assert.ok(ATTRIBUTION_STATES.has(record.attribution_state));
    if (record.attribution_state === "AMBIGUOUS_MULTIPLE_CENSUS_MATCHES") {
      assert.ok(record.ambiguity_candidates.length > 1, "an ambiguous record must name its competing candidates");
    }
  }
});

test("SAFETY: attribution touched no production registry or public map data", async () => {
  const { execSync } = await import("node:child_process");
  const status = execSync("git status --porcelain venues sources data public", { cwd: ROOT, encoding: "utf8" });
  assert.equal(status.trim(), "", `attribution must not modify production paths:\n${status}`);
});

test("SAFETY: the acquisition dataset on disk is unchanged by this package", async () => {
  const { execSync } = await import("node:child_process");
  const status = execSync("git status --porcelain research/major-event-acquisition", { cwd: ROOT, encoding: "utf8" });
  assert.equal(status.trim(), "", `source Observations are evidence and must not be rewritten:\n${status}`);
});
