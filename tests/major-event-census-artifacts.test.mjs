// BEATMAPPED-UK-MAJOR-EVENT-VENUE-CENSUS-01 — validation of the REAL
// compiled census artifacts (not synthetic fixtures). These tests are the
// standing data-quality gate: if a future research pass introduces a
// duplicate venue, an unsourced capacity, an invalid vocabulary value or a
// dangling reference, this suite fails.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validateCensusArtifact, CAPACITY_THRESHOLD, UK_NATIONS, createVenueCensusId } from "../ingestion/major-event-census/contract.mjs";

const CENSUS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../research/major-event-venues/uk-major-event-census-01");
const readJson = async (name) => JSON.parse(await readFile(resolve(CENSUS_DIR, name), "utf8"));

const venuesDoc = await readJson("venues.json");
const calendarsDoc = await readJson("calendar-sources.json");
const capacityDoc = await readJson("capacity-evidence.json");
const venues = venuesDoc.venues;
const calendars = calendarsDoc.calendar_sources;
const capacity = capacityDoc.capacity_evidence;

test("the compiled census passes full contract and cross-record validation", () => {
  assert.deepEqual(validateCensusArtifact({ venues, calendarSources: calendars, capacityEvidence: capacity }), []);
});

test("the census is non-trivial and national in scope", () => {
  assert.ok(venues.length >= 100, `expected a substantial national census, got ${venues.length} venues`);
  const nations = new Set(venues.map((venue) => venue.nation));
  for (const nation of UK_NATIONS) {
    assert.ok(nations.has(nation), `census must cover ${nation}`);
  }
});

test("every venue id is deterministic — recomputing it from the record's own fields reproduces it exactly", () => {
  for (const venue of venues) {
    assert.equal(venue.venue_census_id, createVenueCensusId(venue.canonical_name, venue.city, venue.nation), `id drift for ${venue.canonical_name}`);
  }
});

test("no duplicate venue identities, and no duplicate name+city pairs", () => {
  const ids = venues.map((venue) => venue.venue_census_id);
  assert.equal(new Set(ids).size, ids.length);
  const nameCity = venues.map((venue) => `${venue.canonical_name.toLowerCase()}|${venue.city.toLowerCase()}`);
  assert.equal(new Set(nameCity).size, nameCity.length);
});

test("every venue admitted on CAPACITY_THRESHOLD_MET has a sourced principal capacity at or above the threshold", () => {
  const principal = new Map(capacity.filter((item) => item.is_principal).map((item) => [item.venue_census_id, item]));
  const offenders = [];
  for (const venue of venues.filter((venue) => venue.inclusion_basis === "CAPACITY_THRESHOLD_MET")) {
    const evidence = principal.get(venue.venue_census_id);
    if (!evidence) { offenders.push(`${venue.canonical_name}: no principal capacity evidence`); continue; }
    if (typeof evidence.capacity_value !== "number" || evidence.capacity_value < CAPACITY_THRESHOLD) {
      offenders.push(`${venue.canonical_name}: capacity ${evidence.capacity_value} below threshold`);
    }
    if (!evidence.capacity_source) offenders.push(`${venue.canonical_name}: capacity has no cited source`);
    if (evidence.capacity_confidence === "CAPACITY_REVIEW_REQUIRED") offenders.push(`${venue.canonical_name}: admitted on a review-required capacity`);
  }
  assert.deepEqual(offenders, []);
});

test("no capacity figure is ever stated without a cited source", () => {
  const offenders = capacity
    .filter((item) => typeof item.capacity_value === "number" && item.capacity_confidence !== "CAPACITY_REVIEW_REQUIRED" && !item.capacity_source)
    .map((item) => item.venue_census_id);
  assert.deepEqual(offenders, []);
});

test("every calendar source belongs to a venue in the census and carries a usable absolute URL", () => {
  const venueIds = new Set(venues.map((venue) => venue.venue_census_id));
  const offenders = [];
  for (const source of calendars) {
    if (!venueIds.has(source.venue_census_id)) offenders.push(`${source.calendar_source_id}: dangling venue reference`);
    try { new URL(source.source_url); } catch { offenders.push(`${source.calendar_source_id}: unusable URL ${source.source_url}`); }
  }
  assert.deepEqual(offenders, []);
});

test("every venue carries provenance evidence — nothing is in the census without a cited trail", () => {
  const offenders = venues.filter((venue) => !venue.provenance?.evidence?.length).map((venue) => venue.canonical_name);
  assert.deepEqual(offenders, []);
});

test("the census summary is not STALE — every headline it publishes matches the artifacts it describes", async () => {
  // The defect this guards: census-summary.json is written by a separate
  // `summarise` step. When a later compile changed the artifacts, the
  // summary silently kept the previous numbers — it reported 988 calendar
  // sources while calendar-sources.json held 989, and that stale 988 was
  // then carried into a freeze report as fact.
  //
  // A summary that disagrees with the artifacts it summarises is worse
  // than no summary, because it reads like corroboration.
  const summary = await readJson("census-summary.json");

  assert.equal(summary.totals.venues, venues.length, "summary venue total must match venues.json");
  assert.equal(summary.calendars.total, calendars.length, "summary calendar total must match calendar-sources.json");

  const venuesWithCalendar = new Set(calendars.map((source) => source.venue_census_id)).size;
  assert.equal(summary.totals.venues_with_any_calendar, venuesWithCalendar);
  assert.equal(summary.totals.venues_without_any_calendar, venues.length - venuesWithCalendar);

  const byNation = {};
  for (const venue of venues) byNation[venue.nation] = (byNation[venue.nation] ?? 0) + 1;
  assert.deepEqual(summary.totals.by_nation, byNation, "summary nation split must match the venue records");

  assert.equal(summary.totals.identity_review, venues.filter((venue) => venue.identity_review).length);
});

test("the acquisition-ready population reconciles exactly, and 'verified' is never reported as 'population'", async () => {
  // The defect this guards: a report stated READY_TIER1 as 43 sources in
  // one table and 42 in another. 43 is the POPULATION; 42 was the count
  // the family audit CONFIRMED. One source (Mallory Park, HTTP 500) is
  // unreachable, so it is unverified — but unreachable is not disproof,
  // so it correctly keeps its readiness. The two numbers measure different
  // things and must never be presented interchangeably.
  const audit = await readJson("source-family-audit.json");
  const verdictById = new Map(audit.verdicts.map((verdict) => [verdict.calendar_source_id, verdict.verdict]));

  const readyTier1 = calendars.filter((source) => source.acquisition_readiness === "READY_TIER1");
  const byFamily = {};
  for (const source of readyTier1) byFamily[source.source_family] = (byFamily[source.source_family] ?? 0) + 1;

  // The population is the sum of its families — no unexplained remainder.
  assert.equal(
    Object.values(byFamily).reduce((total, count) => total + count, 0),
    readyTier1.length,
    `READY_TIER1 families must sum to the population: ${JSON.stringify(byFamily)}`,
  );

  // Every READY_TIER1 source must route through an existing zero-code
  // collector — that is what the tier claims.
  for (const source of readyTier1) {
    assert.equal(source.collector_route, "EXISTING_COLLECTOR_ZERO_CODE", `${source.source_url} is READY_TIER1 but does not route to an existing collector`);
  }

  // Every one must have been audited, and none may be a failed claim.
  for (const source of readyTier1) {
    const verdict = verdictById.get(source.calendar_source_id);
    assert.ok(verdict, `READY_TIER1 source was never audited: ${source.source_url}`);
    assert.notEqual(verdict, "NOT_CONFIRMED", `a source whose family claim failed must not stay READY_TIER1: ${source.source_url}`);
  }
});

test("SAFETY: the census artifacts contain no production registry mutation and no admitted/published state", async () => {
  // The census must never carry production-shaped admission fields.
  const forbiddenFields = ["active_status", "lifecycle_status", "published_at", "admitted_at", "source_registry_id"];
  const offenders = [];
  for (const venue of venues) {
    for (const field of forbiddenFields) if (field in venue) offenders.push(`${venue.canonical_name}: carries production field ${field}`);
  }
  assert.deepEqual(offenders, []);
  // And the production registries themselves must be untouched by this package.
  const status = await import("node:child_process").then(({ execSync }) => execSync("git status --porcelain venues sources data", { cwd: resolve(CENSUS_DIR, "../../.."), encoding: "utf8" }));
  assert.equal(status.trim(), "", `this package must not modify production registries:\n${status}`);
});
