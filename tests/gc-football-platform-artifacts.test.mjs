// BEATMAPPED-UK-GC-FOOTBALL-PLATFORM-ACQUISITION-01 — validation of the
// REAL retained acquisition dataset. Offline: reads the retained files.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateObservation } from "../ingestion/observation/contract.mjs";
import { TERMINAL_STATES } from "../ingestion/gc-football-platform/collect.mjs";
import { NON_VENUE_SENTINELS } from "../ingestion/gc-football-platform/record.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIR = "research/major-event-acquisition/uk-gc-football-01";
const readJson = async (name) => JSON.parse(await readFile(resolve(ROOT, DIR, name), "utf8"));

const observations = (await readJson("observations.json")).observations;
const sources = (await readJson("sources.json")).sources;
const failures = (await readJson("failures.json")).failures;
const summary = await readJson("summary.json");
const diagnostic = await readJson("attribution-diagnostic.json");
const evidence = (await readJson("evidence-index.json")).routes;

test("the run acquired real events from the shared platform", () => {
  assert.ok(observations.length > 1000, `expected a substantial dataset, got ${observations.length}`);
  const proven = sources.filter((source) => source.terminal_state === "ACQUISITION_PROVEN");
  assert.ok(proven.length >= 40, `expected most of the estate to prove, got ${proven.length}`);
});

test("every source ended at exactly one canonical terminal state", () => {
  for (const source of sources) {
    assert.ok(TERMINAL_STATES.has(source.terminal_state), `non-canonical state: ${source.terminal_state}`);
  }
  assert.equal(
    sources.filter((s) => s.terminal_state !== "ACQUISITION_PROVEN").length,
    failures.length,
    "every non-proven source must appear in failures.json",
  );
  for (const failure of failures) {
    assert.ok(failure.terminal_state && failure.detection !== undefined, `${failure.source_url} must state why it failed`);
  }
});

test("every Observation satisfies the source-agnostic contract", () => {
  for (const observation of observations) {
    const errors = validateObservation(observation);
    assert.deepEqual(errors, [], `${observation.source_record_id}: ${errors.join("; ")}`);
  }
});

test("every Observation carries a stable platform identity, unique within its source", () => {
  const seen = new Set();
  for (const observation of observations) {
    assert.ok(typeof observation.source_record_id === "string" && observation.source_record_id.length > 0);
    assert.equal(observation.source_record_id, observation.source_fields.match_id, "identity must be the platform's own match id");
    const ref = `${observation.source_id}||${observation.source_record_id}`;
    assert.ok(!seen.has(ref), `duplicate record within one source: ${ref}`);
    seen.add(ref);
  }
});

test("DATE HONESTY: no date was invented", () => {
  for (const observation of observations) {
    const start = observation.start;
    assert.ok(["UTC_INSTANT", "DATE_ONLY", "TEXT_ONLY", "UNKNOWN"].includes(start.certainty));
    if (start.certainty === "UTC_INSTANT") {
      assert.equal(start.is_utc, true);
      assert.ok(start.iso && !Number.isNaN(Date.parse(start.iso)));
      assert.equal(start.date, start.iso.slice(0, 10));
      assert.ok(start.raw, "a derived instant must retain the source's own value");
    } else {
      assert.equal(start.iso, null, "no instant may exist without UTC_INSTANT certainty");
    }
  }
  assert.equal(summary.observations_with_utc_instant, observations.filter((o) => o.start.certainty === "UTC_INSTANT").length);
});

test("SOURCE PROVENANCE IS NOT VENUE IDENTITY: acquisition decided no venue", () => {
  for (const observation of observations) {
    // Acquisition must not carry, or pre-judge, a census venue.
    assert.ok(!("venue_census_id" in observation.source_fields));
    assert.ok(!("census_venue_name" in observation.source_fields));
    assert.ok(!("resolved_venue_census_id" in observation));
    assert.ok(!("event_id" in observation));
    assert.ok(!("canonical_event_id" in observation));

    // venue_name is only ever the record's own words.
    if (observation.venue_name !== null) {
      assert.equal(observation.venue_name, observation.source_fields.venue_text_raw);
      assert.ok(!NON_VENUE_SENTINELS.has(observation.venue_name.toLowerCase()), `a sentinel leaked into venue_name: ${observation.venue_name}`);
    } else {
      assert.ok(["ABSENT", "NON_VENUE_SENTINEL"].includes(observation.source_fields.venue_text_state));
    }
  }
});

test("the dataset genuinely contains away fixtures at other clubs' grounds", () => {
  // If this were empty, the collector would be silently scoping to home
  // fixtures and the venue problem would be hidden rather than solved.
  const away = observations.filter((o) => o.source_fields.home_or_away === "Away");
  assert.ok(away.length > 500, `expected many away fixtures, got ${away.length}`);
  assert.ok(new Set(away.map((o) => o.venue_name).filter(Boolean)).size > 100, "away fixtures must span many grounds");
});

test("HOME/AWAY PROTECTION: a Home flag was never treated as the club's own ground", () => {
  const protection = diagnostic.home_away_protection;
  // Measured with the alias-aware governed resolver, not string equality.
  assert.equal(protection.away_resolved_to_the_SOURCE_census_venue, 0, "an away fixture must never resolve to the source's own venue");
  assert.ok(protection.home_resolved_to_a_DIFFERENT_census_venue > 0, "the dataset must actually contain Home fixtures staged elsewhere");
  assert.equal(
    protection.home_records,
    observations.filter((o) => o.source_fields.home_or_away === "Home").length,
  );
});

test("the attribution diagnostic is explicitly NOT canonical attribution", async () => {
  assert.match(diagnostic.status, /DIAGNOSTIC_ONLY/);
  // The substance of this test is that the ACQUISITION package produced a
  // labelled diagnostic and did not write canonical attribution data.
  //
  // The path watched below was previously the whole
  // research/major-event-attribution/ parent, which also fired once a
  // LATER attribution package legitimately added its own sibling dataset
  // there. That says nothing about what this acquisition package wrote,
  // so the watch is scoped to the canonical attribution dataset that
  // existed when this package ran. The assertion is otherwise unchanged.
  const { execSync } = await import("node:child_process");
  const status = execSync("git status --porcelain research/major-event-attribution/uk-tier1-01", { cwd: ROOT, encoding: "utf8" });
  assert.equal(status.trim(), "", `this package must not write the attribution dataset:\n${status}`);
});

test("no cross-source deduplication was performed", () => {
  // The same platform match legitimately appears under more than one
  // source. Those must remain separate Observations.
  const byRecordId = new Map();
  for (const observation of observations) {
    byRecordId.set(observation.source_record_id, (byRecordId.get(observation.source_record_id) ?? 0) + 1);
  }
  const shared = [...byRecordId.values()].filter((n) => n > 1).length;
  assert.ok(shared > 0, "the estate must contain matches seen by more than one source");
  assert.ok(
    observations.length > byRecordId.size,
    "observations must NOT have been collapsed to distinct match ids",
  );
});

test("the summary reconciles exactly with the retained records", () => {
  assert.equal(summary.observations_total, observations.length);
  assert.equal(summary.sources_proven, sources.filter((s) => s.terminal_state === "ACQUISITION_PROVEN").length);
  assert.equal(summary.observations_with_named_venue, observations.filter((o) => o.venue_name).length);
  assert.equal(summary.distinct_venue_names, new Set(observations.map((o) => o.venue_name).filter(Boolean)).size);
  assert.equal(
    summary.observations_with_non_venue_sentinel,
    observations.filter((o) => o.source_fields.venue_text_state === "NON_VENUE_SENTINEL").length,
  );
  const stateTotal = Object.values(summary.by_terminal_state).reduce((a, b) => a + b, 0);
  assert.equal(stateTotal, sources.length, "terminal states must sum with no remainder");
});

test("EVIDENCE: every route issued was a public web route, never the authenticated admin host", () => {
  assert.ok(evidence.length > 100, "the run must retain the routes it issued");
  for (const route of evidence) {
    if (route.kind === "PAGE") continue;
    assert.ok(route.url.includes(".web.gc."), `non-public host used: ${route.url}`);
    assert.ok(!route.url.includes(".admin.gc."), `authenticated admin host used: ${route.url}`);
  }
});

test("SAFETY: acquisition touched no production registry, public map data, or prior dataset", async () => {
  const { execSync } = await import("node:child_process");
  for (const path of ["venues", "sources", "data", "public", "research/major-event-venues", "research/major-event-acquisition/uk-tier1-01"]) {
    const status = execSync(`git status --porcelain ${path}`, { cwd: ROOT, encoding: "utf8" });
    assert.equal(status.trim(), "", `${path} must not be modified by acquisition:\n${status}`);
  }
});
