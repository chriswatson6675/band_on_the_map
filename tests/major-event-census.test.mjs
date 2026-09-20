// BEATMAPPED-UK-MAJOR-EVENT-VENUE-CENSUS-01 — census contract, compilation
// and safety tests. Synthetic fixtures only; the real compiled census is
// validated separately by tests/major-event-census-artifacts.test.mjs.

import assert from "node:assert/strict";
import test from "node:test";

import {
  CAPACITY_THRESHOLD, createVenueCensusId, createCalendarSourceId,
  validateVenueCensusRecord, validateCalendarSource, validateCapacityEvidence,
  validateCensusArtifact,
} from "../ingestion/major-event-census/contract.mjs";
import { compileCensus, reconcileVenues, electPrincipalCapacity } from "../ingestion/major-event-census/compile.mjs";
import { readinessFromFingerprint, fingerprintCalendarSources } from "../ingestion/major-event-census/fingerprint-sources.mjs";

const GENERATED_AT = "2026-09-20T00:00:00.000Z";

function rawVenue(overrides = {}) {
  return {
    canonical_name: "Example Arena", city: "Exampleton", nation: "England",
    official_url: "https://example-arena.test/", venue_type: "INDOOR_ARENA",
    operational_status: "OPERATIONAL",
    capacity: {
      capacity_value: 12000, capacity_type: "CONCERT", capacity_configuration: "full bowl",
      capacity_source: "https://example-arena.test/about", capacity_source_authority: "GRADE_A",
      capacity_observed_at: "2026-09-20", capacity_confidence: "HIGH",
    },
    calendar_sources: [{
      source_url: "https://example-arena.test/whats-on", source_type: "CONCERTS", sport: null,
      first_party: true, publicly_accessible: true, events_currently_present: true, last_checked: "2026-09-20",
    }],
    evidence: [{ kind: "FETCHED_URL", value: "https://example-arena.test/about", note: "capacity" }],
    ...overrides,
  };
}

const workstream = (venues, name = "TEST_WORKSTREAM") => ({ workstream: name, generated_at: GENERATED_AT, method_notes: "synthetic", venues });

test("ids are deterministic and slug-stable across punctuation and case", () => {
  assert.equal(createVenueCensusId("The O2 Arena", "London", "England"), createVenueCensusId("the o2   arena", "London", "England"));
  assert.equal(createVenueCensusId("Principality Stadium", "Cardiff", "Wales"), "ukmec-wales-cardiff-principality-stadium");
  assert.notEqual(createVenueCensusId("Utilita Arena", "Cardiff", "Wales"), createVenueCensusId("Utilita Arena", "Newcastle", "England"));
  assert.equal(createCalendarSourceId("v1", "https://a.test/whats-on"), createCalendarSourceId("v1", "https://a.test/whats-on"));
});

test("a capacity at or above the threshold with a cited source is admitted on CAPACITY_THRESHOLD_MET", () => {
  const { venues } = compileCensus([workstream([rawVenue()])], { generatedAt: GENERATED_AT });
  assert.equal(venues.venues.length, 1);
  assert.equal(venues.venues[0].inclusion_basis, "CAPACITY_THRESHOLD_MET");
  assert.equal(venues.capacity_threshold, CAPACITY_THRESHOLD);
});

test("a stated capacity with NO cited source is downgraded to review, never presented as proven", () => {
  const raw = rawVenue({ capacity: { capacity_value: 5000, capacity_type: "SPECTATOR", capacity_source: null, capacity_source_authority: "GRADE_A", capacity_confidence: "HIGH" } });
  const { capacityEvidence, venues } = compileCensus([workstream([raw])], { generatedAt: GENERATED_AT });
  assert.equal(capacityEvidence.capacity_evidence[0].capacity_confidence, "CAPACITY_REVIEW_REQUIRED");
  assert.equal(venues.venues[0].inclusion_basis, "CAPACITY_REVIEW_REQUIRED", "an unsourced number can never satisfy the inclusion threshold");
});

test("when two workstreams both research a venue, exactly one capacity stays principal and it is the better-evidenced one", () => {
  // The real defect this guards: three workstreams each found Swansea Arena
  // and each supplied its own principal capacity. Two cited 3,500; the third
  // had no figure at all — and being compiled last, it became the venue's
  // headline capacity.
  const wellSourced = rawVenue({
    canonical_name: "Shared Arena", venue_type: "INDOOR_ARENA",
    capacity: { capacity_value: 3500, capacity_type: "CONCERT", capacity_source: "https://shared.test/about", capacity_source_authority: "GRADE_B", capacity_confidence: "MEDIUM" },
  });
  const unsourced = rawVenue({
    canonical_name: "Shared Arena", venue_type: "CONFERENCE_CENTRE",
    capacity: { capacity_value: null, capacity_type: "OTHER_EXPLICIT", capacity_source: "https://shared.test/whats-on", capacity_source_authority: "GRADE_A", capacity_confidence: "CAPACITY_REVIEW_REQUIRED" },
  });
  const { capacityEvidence, venues } = compileCensus(
    [workstream([wellSourced], "ARENAS"), workstream([unsourced], "CONFERENCE")],
    { generatedAt: GENERATED_AT },
  );
  const principals = capacityEvidence.capacity_evidence.filter((item) => item.is_principal);
  assert.equal(principals.length, 1, "a merged venue must not carry two principal capacities");
  assert.equal(principals[0].capacity_value, 3500, "the sourced figure must win over the empty one");
  assert.equal(venues.venues[0].inclusion_basis, "CAPACITY_THRESHOLD_MET");
  // The rejected claim is demoted, not deleted — the disagreement stays auditable.
  assert.equal(capacityEvidence.capacity_evidence.length, 2);
  assert.equal(capacityEvidence.counts.venues_with_conflicting_capacity_claims, 1);
});

test("principal capacity is elected by evidence quality, never by whichever figure is largest", () => {
  const entries = [
    { is_principal: true, capacity_value: 32609, capacity_source: "https://a.test", capacity_source_authority: "GRADE_C", capacity_confidence: "MEDIUM" },
    { is_principal: true, capacity_value: 10000, capacity_source: "https://b.test", capacity_source_authority: "GRADE_A", capacity_confidence: "HIGH" },
  ];
  const elected = electPrincipalCapacity(entries).filter((item) => item.is_principal);
  assert.equal(elected.length, 1);
  assert.equal(elected[0].capacity_value, 10000, "GRADE_A/HIGH must beat a larger GRADE_C/MEDIUM figure");
  // Election is order-independent.
  const reversed = electPrincipalCapacity([...entries].reverse()).filter((item) => item.is_principal);
  assert.equal(reversed[0].capacity_value, 10000);
});

test("a convention/exhibition venue with no single capacity still qualifies on the documented scale exception", () => {
  const raw = rawVenue({
    canonical_name: "Example Exhibition Centre", venue_type: "EXHIBITION_CENTRE",
    capacity: { capacity_value: null, capacity_type: "LARGEST_ROOM", capacity_confidence: "CAPACITY_REVIEW_REQUIRED", capacity_source: null },
    exhibition_space_sqm: 200000,
  });
  const { venues } = compileCensus([workstream([raw])], { generatedAt: GENERATED_AT });
  assert.equal(venues.venues[0].inclusion_basis, "MAJOR_CONVENTION_EXHIBITION_INFRASTRUCTURE");
  assert.equal(venues.venues[0].exhibition_space_sqm, 200000);
});

test("a spectator venue with neither a proven capacity nor the convention exception is flagged, never silently admitted", () => {
  const raw = rawVenue({ capacity: { capacity_value: null, capacity_type: "SPECTATOR", capacity_confidence: "CAPACITY_REVIEW_REQUIRED", capacity_source: null } });
  const { venues } = compileCensus([workstream([raw])], { generatedAt: GENERATED_AT });
  assert.equal(venues.venues[0].inclusion_basis, "CAPACITY_REVIEW_REQUIRED");
});

test("the same venue researched by two workstreams reconciles into ONE record retaining both provenance trails", () => {
  const a = rawVenue({ evidence: [{ kind: "FETCHED_URL", value: "https://example-arena.test/a", note: "a" }] });
  const b = rawVenue({ canonical_name: "example arena", operator: "Example Operator", evidence: [{ kind: "FETCHED_URL", value: "https://example-arena.test/b", note: "b" }] });
  const { venues } = compileCensus([workstream([a], "WS_A"), workstream([b], "WS_B")], { generatedAt: GENERATED_AT });
  assert.equal(venues.venues.length, 1, "one physical venue, not two");
  assert.equal(venues.venues[0].operator, "Example Operator", "the richer record's fields are retained");
  assert.equal(venues.venues[0].provenance.evidence.length, 2, "both researchers' evidence is retained");
  assert.equal(venues.venues[0].provenance.workstream, "WS_A+WS_B");
});

test("two DIFFERENT venues sharing only an operator are never merged", () => {
  const a = rawVenue({ canonical_name: "Alpha Arena", city: "Alphaville", operator: "Shared Operator Ltd" });
  const b = rawVenue({ canonical_name: "Beta Arena", city: "Betaville", operator: "Shared Operator Ltd" });
  const { venues } = compileCensus([workstream([a, b])], { generatedAt: GENERATED_AT });
  assert.equal(venues.venues.length, 2);
});

test("same name and city but genuinely different official sites is flagged for identity review, not silently resolved", () => {
  const a = rawVenue({ canonical_name: "Ambiguous Hall", official_url: "https://one.test/" });
  const b = rawVenue({ canonical_name: "Ambiguous Hall", official_url: "https://two.test/" });
  const merged = reconcileVenues([a, b].map((raw, index) => ({
    ...raw, venue_census_id: createVenueCensusId(raw.canonical_name, raw.city, raw.nation),
    alternative_names: [], provenance: { workstream: `WS${index}`, evidence: [{ kind: "FETCHED_URL", value: raw.official_url }] },
  })));
  assert.equal(merged.length, 1);
  assert.equal(merged[0].identity_review, true);
  assert.match(merged[0].identity_review_reason, /different official site/);
});

test("a venue in one complex is not merged into its parent complex", () => {
  const complex = rawVenue({ canonical_name: "Example Campus", venue_type: "MULTI_PURPOSE_COMPLEX" });
  const hall = rawVenue({ canonical_name: "Example Campus Hall 4", parent_complex: "Example Campus" });
  const { venues } = compileCensus([workstream([complex, hall])], { generatedAt: GENERATED_AT });
  assert.equal(venues.venues.length, 2);
});

test("closed and not-yet-built venues are excluded from the census population but retained as an explicit excluded list", () => {
  const closed = rawVenue({ canonical_name: "Closed Exhibition Centre", operational_status: "CLOSED_PERMANENTLY" });
  const unbuilt = rawVenue({ canonical_name: "Future Arena", city: "Bristol", operational_status: "UNDER_CONSTRUCTION" });
  const open = rawVenue({ canonical_name: "Open Arena", city: "Opentown" });
  const { venues } = compileCensus([workstream([closed, unbuilt, open])], { generatedAt: GENERATED_AT });
  assert.deepEqual(venues.venues.map((venue) => venue.canonical_name), ["Open Arena"]);
  assert.equal(venues.excluded_non_operational.length, 2, "excluded venues must be recorded, never silently dropped");
  assert.deepEqual(venues.excluded_non_operational.map((venue) => venue.operational_status).sort(), ["CLOSED", "UNDER_CONSTRUCTION"]);
});

test("compilation is deterministic — the same input yields byte-identical output", () => {
  const input = [workstream([rawVenue({ canonical_name: "Zeta Hall" }), rawVenue({ canonical_name: "Alpha Hall" })])];
  const first = JSON.stringify(compileCensus(input, { generatedAt: GENERATED_AT }));
  const second = JSON.stringify(compileCensus(input, { generatedAt: GENERATED_AT }));
  assert.equal(first, second);
});

test("the compiled artifact passes full cross-record validation", () => {
  const compiled = compileCensus([workstream([rawVenue(), rawVenue({ canonical_name: "Second Arena", city: "Othertown" })])], { generatedAt: GENERATED_AT });
  const errors = validateCensusArtifact({
    venues: compiled.venues.venues,
    calendarSources: compiled.calendarSources.calendar_sources,
    capacityEvidence: compiled.capacityEvidence.capacity_evidence,
  });
  assert.deepEqual(errors, []);
});

test("validation rejects an invalid nation, venue type, source type and unknown venue reference", () => {
  assert.ok(validateVenueCensusRecord({ ...rawVenue(), venue_census_id: "v", nation: "Ireland", alternative_names: [], identity_review: false, inclusion_basis: "CAPACITY_THRESHOLD_MET", provenance: { workstream: "w", evidence: [{ kind: "k", value: "v" }] } }).some((error) => /nation invalid/.test(error)));
  assert.ok(validateCalendarSource({ calendar_source_id: "c", venue_census_id: "v", source_url: "https://a.test", source_type: "NOT_A_TYPE", acquisition_readiness: "READY_TIER1" }).some((error) => /source_type invalid/.test(error)));
  assert.ok(validateCapacityEvidence({ venue_census_id: "v", capacity_value: 1, capacity_type: "NOPE", capacity_confidence: "HIGH" }).some((error) => /capacity_type invalid/.test(error)));
  const errors = validateCensusArtifact({ venues: [], calendarSources: [{ calendar_source_id: "c", venue_census_id: "missing", source_url: "https://a.test", source_type: "CONCERTS", acquisition_readiness: "READY_TIER1" }], capacityEvidence: [] });
  assert.ok(errors.some((error) => /references unknown venue/.test(error)));
});

test("readiness is derived from the shared fingerprint engine's route, never from HTTP 200 alone", () => {
  assert.equal(readinessFromFingerprint({ ok: true, mechanism: "JSON_LD_EVENT", collectorRoute: "EXISTING_COLLECTOR_ZERO_CODE" }), "READY_TIER1");
  assert.equal(readinessFromFingerprint({ ok: true, mechanism: "STATIC_HTML_CARDS", collectorRoute: "CONFIGURATION_ONLY" }), "READY_WITH_CONFIGURATION");
  assert.equal(readinessFromFingerprint({ ok: true, mechanism: "EMBEDDED_NEXT_DATA", collectorRoute: "GENERIC_CAPABILITY_WIDENING" }), "TIER2_REUSABLE_FAMILY");
  assert.equal(readinessFromFingerprint({ ok: true, mechanism: "CLIENT_RENDERED_UNKNOWN", collectorRoute: "NEEDS_DEEPER_INVESTIGATION" }), "TIER3_BROWSER_OR_COMPLEX");
  assert.equal(readinessFromFingerprint({ ok: true, mechanism: "NO_CURRENT_PROGRAMME_FOUND", collectorRoute: "NEEDS_DEEPER_INVESTIGATION" }), "NO_PUBLIC_CALENDAR");
  // A 200 that fingerprints as nothing usable is NOT ready.
  assert.notEqual(readinessFromFingerprint({ ok: true, mechanism: "OTHER", collectorRoute: "NEEDS_DEEPER_INVESTIGATION" }), "READY_TIER1");
  assert.equal(readinessFromFingerprint({ ok: false, mechanism: "ACCESS_BLOCKED", collectorRoute: "CURRENTLY_BLOCKED" }), "SOURCE_REVIEW_REQUIRED");
});

test("one source's fetch failure never affects another source's fingerprint result", async () => {
  const sources = [
    { calendar_source_id: "a", source_url: "https://good.test/whats-on" },
    { calendar_source_id: "b", source_url: "https://bad.test/whats-on" },
  ];
  const fetchDocument = async (url) => {
    if (url.includes("bad.test")) throw new Error("simulated unreachable");
    return { url, status: 200, at: GENERATED_AT, content_type: "text/html", body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2099-01-01"}</script>' };
  };
  const results = await fingerprintCalendarSources(sources, { fetchDocument, concurrency: 2 });
  const good = results.find((result) => result.calendar_source_id === "a");
  const bad = results.find((result) => result.calendar_source_id === "b");
  assert.equal(good.source_family, "JSON_LD_EVENT");
  assert.equal(good.acquisition_readiness, "READY_TIER1");
  assert.equal(bad.acquisition_readiness, "SOURCE_REVIEW_REQUIRED");
  assert.match(bad.fingerprint_error, /simulated unreachable/);
});

test("SAFETY: the census modules never import any production registry, admission, publication or deployment path", async () => {
  const { readFile, readdir } = await import("node:fs/promises");
  const { resolve, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../ingestion/major-event-census");
  const forbidden = [/admission\.mjs/i, /publish-map-data/i, /publication-server/i, /deploy/i, /venues\/.*\.json/i, /sources\/.*\.json/i];
  const offenders = [];
  for (const file of (await readdir(dir)).filter((name) => name.endsWith(".mjs"))) {
    const text = await readFile(resolve(dir, file), "utf8");
    for (const line of text.split("\n").filter((line) => /^\s*import\b/.test(line))) {
      for (const pattern of forbidden) if (pattern.test(line)) offenders.push(`${file}: ${line.trim()}`);
    }
  }
  assert.deepEqual(offenders, [], `census code must never import production registry/publication/deployment code:\n${offenders.join("\n")}`);
});
