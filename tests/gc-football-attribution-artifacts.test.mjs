// BEATMAPPED-UK-GC-FOOTBALL-VENUE-ATTRIBUTION-01 — validation of the REAL
// derived attribution layer against the real football Observations.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { ATTRIBUTION_STATES, CONFIDENCE, resolveAll } from "../ingestion/major-event-attribution/resolve.mjs";
import { buildCensusIndex } from "../ingestion/major-event-attribution/census-index.mjs";
import { adaptAll } from "../ingestion/gc-football-attribution/adapt.mjs";
import { UNRESOLVED_REASONS } from "../ingestion/gc-football-attribution/reason-codes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));

const ATTR = "research/major-event-attribution/uk-gc-football-01";
const ACQ = "research/major-event-acquisition/uk-gc-football-01";

const attributions = (await readJson(`${ATTR}/attributions.json`)).attributions;
const unresolved = (await readJson(`${ATTR}/unresolved.json`)).unresolved;
const summary = await readJson(`${ATTR}/summary.json`);
const censusReview = await readJson(`${ATTR}/census-review.json`);
const observations = (await readJson(`${ACQ}/observations.json`)).observations;
const sources = (await readJson(`${ACQ}/sources.json`)).sources;
const censusVenues = (await readJson("research/major-event-venues/uk-major-event-census-01/venues.json")).venues;

/* ---------------------------------------------------------------- */
/* ACCOUNTING                                                        */
/* ---------------------------------------------------------------- */

test("every football Observation receives EXACTLY ONE attribution record", () => {
  assert.equal(attributions.length, observations.length, "counts must match with no remainder");

  const refs = attributions.map((r) => `${r.source_id}||${r.source_record_id}`);
  assert.equal(new Set(refs).size, refs.length, "no Observation may be attributed twice");

  const observationRefs = new Set(observations.map((o) => `${o.source_id}||${o.source_record_id}`));
  for (const ref of refs) assert.ok(observationRefs.has(ref), `attribution references an unknown Observation: ${ref}`);
  for (const ref of observationRefs) assert.ok(refs.includes(ref) || new Set(refs).has(ref), `Observation silently dropped: ${ref}`);
  assert.equal(new Set(refs).size, observationRefs.size, "no Observation may be missing");
});

test("resolved + unresolved sums exactly to the input", () => {
  const resolved = attributions.filter((r) => r.resolved_venue_census_id).length;
  const notResolved = attributions.filter((r) => !r.resolved_venue_census_id).length;
  assert.equal(resolved + notResolved, observations.length);
  assert.equal(summary.total_observations, observations.length);
  assert.equal(summary.resolved, resolved);
  assert.equal(summary.unresolved, notResolved);
  assert.equal(unresolved.length, notResolved, "unresolved.json must hold every unresolved record");
  const stateTotal = Object.entries(summary.by_attribution_state)
    .filter(([key]) => key !== "TOTAL")
    .reduce((a, [, v]) => a + v, 0);
  assert.equal(stateTotal, observations.length, "states must sum with no remainder");
});

test("every record carries a valid state, confidence and reason", () => {
  for (const record of attributions) {
    assert.ok(ATTRIBUTION_STATES.has(record.attribution_state), `bad state: ${record.attribution_state}`);
    assert.ok(CONFIDENCE.has(record.confidence), `bad confidence: ${record.confidence}`);
    assert.ok(Array.isArray(record.evidence) && record.evidence.length > 0, "every decision must state its evidence");
    if (record.resolved_venue_census_id) {
      assert.equal(record.unresolved_reason, null, "a resolved record has no unresolved reason");
    } else {
      assert.ok(UNRESOLVED_REASONS.has(record.unresolved_reason), `bad reason: ${record.unresolved_reason}`);
    }
  }
});

test("a resolved record points at a real census venue and carries its geography", () => {
  const byId = new Map(censusVenues.map((v) => [v.venue_census_id, v]));
  for (const record of attributions) {
    if (!record.resolved_venue_census_id) continue;
    const venue = byId.get(record.resolved_venue_census_id);
    assert.ok(venue, `resolved to a venue not in the census: ${record.resolved_venue_census_id}`);
    assert.equal(record.resolved_venue_name, venue.canonical_name);
    assert.equal(record.resolved_venue_city, venue.city ?? null);
    assert.equal(record.resolved_venue_nation, venue.nation ?? null);
    assert.ok(record.attribution_method, "a resolved record must record HOW it resolved");
  }
});

/* ---------------------------------------------------------------- */
/* IMMUTABILITY                                                      */
/* ---------------------------------------------------------------- */

test("IMMUTABILITY: the football Observations are untouched on disk", async () => {
  const { execSync } = await import("node:child_process");
  const status = execSync(`git status --porcelain ${ACQ}`, { cwd: ROOT, encoding: "utf8" });
  assert.equal(status.trim(), "", `source Observations are evidence and must not be rewritten:\n${status}`);
});

test("IMMUTABILITY: attribution was not written back onto any Observation", () => {
  for (const observation of observations) {
    assert.ok(!("resolved_venue_census_id" in observation));
    assert.ok(!("attribution_state" in observation));
    assert.ok(!("event_id" in observation));
    assert.ok(!("venue_census_id" in observation.source_fields), "acquisition must still carry no census venue");
  }
  // And the source's own venue words are still the source's own words.
  const byRef = new Map(observations.map((o) => [`${o.source_id}||${o.source_record_id}`, o]));
  for (const record of attributions) {
    const observation = byRef.get(`${record.source_id}||${record.source_record_id}`);
    assert.equal(record.source_reported_venue_name, observation.venue_name);
  }
});

/* ---------------------------------------------------------------- */
/* THE CORE INVARIANTS                                               */
/* ---------------------------------------------------------------- */

test("AWAY fixtures never inherit the source club's census venue", () => {
  const away = attributions.filter((r) => r.home_away_class === "AWAY");
  assert.ok(away.length > 1000, `expected many away fixtures, got ${away.length}`);
  const inherited = away.filter((r) => r.resolved_venue_census_id && r.resolved_venue_census_id === r.source_census_venue_id);
  assert.deepEqual(
    inherited.map((r) => `${r.source_id}/${r.source_record_id}`),
    [],
    "an away fixture resolving to its own source's venue is a hard review trigger",
  );
});

test("HOME fixtures are genuinely allowed to resolve elsewhere", () => {
  const home = attributions.filter((r) => r.home_away_class === "HOME");
  const elsewhere = home.filter((r) => r.resolved_venue_census_id && r.resolved_venue_census_id !== r.source_census_venue_id);
  assert.ok(elsewhere.length > 0, "the dataset must contain Home fixtures staged at another census venue");
  assert.equal(elsewhere.length, summary.source_vs_physical_effect.home_resolved_to_different_census_venue);
});

test("NO VENUE EVIDENCE never resolves — and matches the acquisition's own counts", () => {
  const none = attributions.filter((r) => r.unresolved_reason === "NO_VENUE_EVIDENCE");
  for (const record of none) assert.equal(record.resolved_venue_census_id, null);

  // The acquisition suppressed placeholders and recorded absences. Every one
  // of those must still be venue-less here — none may have acquired a venue.
  const expected = observations.filter((o) => ["ABSENT", "NON_VENUE_SENTINEL"].includes(o.source_fields.venue_text_state)).length;
  assert.equal(none.length, expected, "every venue-less Observation must remain venue-less");
});

test("MULTI-VENUE: one domain's two census venues stay distinct", () => {
  // A domain serving more than one census venue is a real platform case.
  const byDomain = new Map();
  for (const source of sources) {
    const domain = new URL(source.source_url).hostname.replace(/^www\./, "");
    if (!byDomain.has(domain)) byDomain.set(domain, new Set());
    byDomain.get(domain).add(source.census_venue_id);
  }
  const multi = [...byDomain.entries()].filter(([, ids]) => ids.size > 1);
  assert.ok(multi.length > 0, "the estate must still contain a multi-venue domain");

  // Both of that domain's venues must appear as distinct resolved venues.
  const [, ids] = multi[0];
  const resolvedIds = new Set(attributions.filter((r) => r.resolved_venue_census_id).map((r) => r.resolved_venue_census_id));
  const present = [...ids].filter((id) => resolvedIds.has(id));
  assert.equal(present.length, ids.size, "each of the domain's census venues must resolve in its own right");
});

/* ---------------------------------------------------------------- */
/* NO CANONICAL EVENT IDENTITY                                       */
/* ---------------------------------------------------------------- */

test("no canonical Event identity and no cross-source merging", () => {
  for (const record of attributions) {
    assert.ok(!("event_id" in record));
    assert.ok(!("canonical_event_id" in record));
    assert.ok(!("merged_with" in record));
    assert.ok(!("duplicate_of" in record));
  }
  // The same platform match published by two clubs must remain two records.
  const byMatchId = new Map();
  for (const record of attributions) {
    byMatchId.set(record.platform_match_id, (byMatchId.get(record.platform_match_id) ?? 0) + 1);
  }
  const shared = [...byMatchId.values()].filter((n) => n > 1).length;
  assert.ok(shared > 0, "the estate must contain matches seen by more than one source");
  assert.ok(attributions.length > byMatchId.size, "records must NOT have been collapsed onto distinct match ids");
  assert.equal(summary.duplicate_match_ids.ids_seen_multiple_times, shared);
});

test("duplicate match ids are MEASURED, and none resolved to conflicting venues", () => {
  const groups = new Map();
  for (const record of attributions) {
    if (!groups.has(record.platform_match_id)) groups.set(record.platform_match_id, []);
    groups.get(record.platform_match_id).push(record);
  }
  let conflicting = 0;
  for (const [, group] of groups) {
    if (group.length < 2) continue;
    const resolvedIds = new Set(group.filter((r) => r.resolved_venue_census_id).map((r) => r.resolved_venue_census_id));
    if (resolvedIds.size > 1) conflicting += 1;
  }
  assert.equal(conflicting, summary.duplicate_match_ids.duplicate_groups_resolved_to_conflicting_venues);
});

/* ---------------------------------------------------------------- */
/* DETERMINISM + TIER-1 REGRESSION                                   */
/* ---------------------------------------------------------------- */

test("DETERMINISM: re-resolving the same input reproduces the same decisions", async () => {
  const index = await buildCensusIndex();
  const sourcesById = new Map(sources.map((s) => [s.source_id, s]));
  const first = resolveAll(adaptAll(observations, sourcesById), index, { derivedAt: "fixed" });
  const second = resolveAll(adaptAll(observations, sourcesById), index, { derivedAt: "fixed" });
  assert.deepEqual(first, second, "the resolver must be deterministic");

  // And it must reproduce what was retained.
  const key = (r) => `${r.source_id}||${r.source_record_id}|${r.attribution_state}|${r.resolved_venue_census_id}|${r.attribution_method}|${r.confidence}`;
  assert.deepEqual(first.map(key), attributions.map(key), "the retained dataset must be reproducible from its inputs");
});

test("REGRESSION: the existing uk-tier1-01 attribution is unchanged by this package", async () => {
  // This package reuses the shared resolver. If it had altered resolver
  // semantics to raise football yield, the Tier-1 dataset would move.
  const index = await buildCensusIndex();
  const tier1Observations = (await readJson("research/major-event-acquisition/uk-tier1-01/observations.json")).observations;
  const tier1Attributions = (await readJson("research/major-event-attribution/uk-tier1-01/attributions.json")).attributions;

  const recomputed = resolveAll(tier1Observations, index, { derivedAt: "fixed" });
  assert.equal(recomputed.length, tier1Attributions.length);

  const key = (r) => `${r.source_id}||${r.source_record_id}|${r.attribution_state}|${r.resolved_venue_census_id}|${r.attribution_method}|${r.confidence}`;
  assert.deepEqual(recomputed.map(key), tier1Attributions.map(key), "Tier-1 attribution must be byte-identical in substance");
});

test("REGRESSION: the retained uk-tier1-01 attribution files are untouched on disk", async () => {
  const { execSync } = await import("node:child_process");
  const status = execSync("git status --porcelain research/major-event-attribution/uk-tier1-01", { cwd: ROOT, encoding: "utf8" });
  assert.equal(status.trim(), "", `the Tier-1 attribution dataset must not be rewritten:\n${status}`);
});

/* ---------------------------------------------------------------- */
/* CENSUS REVIEW + SAFETY                                            */
/* ---------------------------------------------------------------- */

test("census review findings are RECORDED, not applied", async () => {
  assert.match(censusReview.status, /RECORDED ONLY/);
  for (const candidate of censusReview.candidates) {
    assert.equal(candidate.finding, "CENSUS_REVIEW_REQUIRED");
    assert.ok(candidate.basis && candidate.requires, "each candidate must state its basis and what it needs");
  }
  const { execSync } = await import("node:child_process");
  const status = execSync("git status --porcelain research/major-event-venues", { cwd: ROOT, encoding: "utf8" });
  assert.equal(status.trim(), "", `the census must not be modified:\n${status}`);
});

test("SAFETY: no production registry, public map data or deployment path was touched", async () => {
  const { execSync } = await import("node:child_process");
  for (const path of ["venues", "sources", "data", "public", ".github", "ingestion/major-event-attribution", "ingestion/major-event-census"]) {
    const status = execSync(`git status --porcelain ${path}`, { cwd: ROOT, encoding: "utf8" });
    assert.equal(status.trim(), "", `${path} must not be modified:\n${status}`);
  }
});
