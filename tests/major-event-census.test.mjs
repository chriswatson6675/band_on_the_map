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
import { compileCensus, reconcileVenues, electPrincipalCapacity, electVenueType } from "../ingestion/major-event-census/compile.mjs";
import { readinessFromFingerprint, fingerprintCalendarSources } from "../ingestion/major-event-census/fingerprint-sources.mjs";
import { verifyFamilyClaim, auditSourceFamilies, applyAuditVerdicts } from "../ingestion/major-event-census/audit-source-families.mjs";
import { classifyOfficialUrl } from "../ingestion/major-event-census/audit-official-urls.mjs";

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

test("the sporting-infrastructure exception needs a CITED calendar, not a note saying no capacity was published", () => {
  // The defect this guards: the exception first keyed off scale_description,
  // so a racecourse whose researcher wrote "No capacity figure published"
  // was admitted on a sentence recording the ABSENCE of evidence.
  const base = {
    canonical_name: "Example Racecourse", city: "Exampleton", nation: "England",
    venue_type: "RACECOURSE", operational_status: "OPERATIONAL",
    capacity: { capacity_value: null, capacity_type: "SPECTATOR", capacity_source: null, capacity_confidence: "CAPACITY_REVIEW_REQUIRED" },
    evidence: [{ kind: "FETCHED_URL", value: "https://example-racecourse.test/", note: "official site" }],
  };

  const absenceOnly = compileCensus([workstream([{
    ...base, scale_description: "No capacity figure published on the official homepage.", calendar_sources: [],
  }])], { generatedAt: GENERATED_AT });
  assert.equal(absenceOnly.venues.venues[0].inclusion_basis, "CAPACITY_REVIEW_REQUIRED", "a note about missing evidence must never admit a venue");

  const withCalendar = compileCensus([workstream([{
    ...base,
    calendar_sources: [{ source_url: "https://example-racecourse.test/racedays", source_type: "SPORT_FIXTURES", sport: "horse_racing", first_party: true, publicly_accessible: true, events_currently_present: true, last_checked: "2026-09-20" }],
  }])], { generatedAt: GENERATED_AT });
  assert.equal(withCalendar.venues.venues[0].inclusion_basis, "MAJOR_SPORTING_INFRASTRUCTURE", "a cited public fixture calendar is positive evidence and does qualify");

  // The exception is confined to classes where a seat count is genuinely
  // not meaningful — it must not leak into ordinary uncertain venues.
  const ordinary = compileCensus([workstream([{
    ...base, venue_type: "THEATRE",
    calendar_sources: [{ source_url: "https://example-racecourse.test/whats-on", source_type: "PERFORMING_ARTS", sport: null, first_party: true, publicly_accessible: true, events_currently_present: true, last_checked: "2026-09-20" }],
  }])], { generatedAt: GENERATED_AT });
  assert.equal(ordinary.venues.venues[0].inclusion_basis, "CAPACITY_REVIEW_REQUIRED", "a theatre with no proven capacity is never admitted on the sporting exception");
});

test("a proven official URL that turns out to be squatted is quarantined, never silently dropped or reinstated", () => {
  const bad = "https://lapsed-domain.test/";
  const quarantined = rawVenue({
    official_url: "https://real-venue.test/",
    official_url_status: "OFFICIAL_URL_REPLACED",
    official_url_quarantined: bad,
    official_url_quarantine_reason: "domain now serves casino affiliate spam",
  });
  const { venues, capacityEvidence, calendarSources } = compileCensus([workstream([quarantined])], { generatedAt: GENERATED_AT });
  const venue = venues.venues[0];
  assert.equal(venue.official_url, "https://real-venue.test/");
  assert.equal(venue.official_url_quarantined, bad, "the rejected domain must be retained as historical provenance");
  assert.notEqual(venue.official_url, venue.official_url_quarantined);
  assert.deepEqual(validateCensusArtifact({
    venues: venues.venues,
    calendarSources: calendarSources.calendar_sources,
    capacityEvidence: capacityEvidence.capacity_evidence,
  }), []);

  // A second researcher still carrying the bad URL must not reinstate it.
  const naive = rawVenue({ official_url: bad });
  const merged = compileCensus([workstream([quarantined], "A"), workstream([naive], "B")], { generatedAt: GENERATED_AT }).venues.venues;
  assert.equal(merged.length, 1);
  assert.notEqual(merged[0].official_url, bad, "a merge must never reinstate a URL already proven wrong");
  assert.equal(merged[0].official_url_quarantined, bad);
});

test("validation rejects a quarantined URL that is still presented as the venue's current official site", () => {
  const bad = "https://lapsed-domain.test/";
  const { venues } = compileCensus([workstream([rawVenue({
    official_url: bad, official_url_status: "OFFICIAL_URL_REPLACED",
    official_url_quarantined: bad, official_url_quarantine_reason: "squatted",
  })])], { generatedAt: GENERATED_AT });
  // compileCensus keeps the record shape; validation is what must object.
  const errors = validateCensusArtifact({ venues: venues.venues, calendarSources: [], capacityEvidence: [] });
  assert.ok(errors.some((error) => /must not also be the current official_url/.test(error)), `expected a quarantine conflict error, got: ${errors.join("; ")}`);
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

test("a venue class is elected on evidence, never by which workstream file sorted first", () => {
  // The defect this guards: four workstreams classified Coventry Building
  // Society Arena differently, and the winner was whichever filename came
  // first alphabetically — which presented a 32,609-capacity Premier
  // League stadium as an EXHIBITION_CENTRE.
  const crossFamily = electVenueType([
    { venue_type: "EXHIBITION_CENTRE", capacity_value: 10000 },
    { venue_type: "FOOTBALL_STADIUM", capacity_value: 32609 },
  ]);
  assert.equal(crossFamily.venueType, "MULTI_PURPOSE_EVENT_COMPLEX", "a venue evidenced as both a stadium and an exhibition centre genuinely is both");

  // Within one activity family it is a classification nuance, not
  // multi-purpose: elect the best-evidenced largest configuration.
  const withinFamily = electVenueType([
    { venue_type: "RUGBY_STADIUM", capacity_value: 26462 },
    { venue_type: "FOOTBALL_STADIUM", capacity_value: 27000 },
  ]);
  assert.equal(withinFamily.venueType, "FOOTBALL_STADIUM");
  assert.equal(withinFamily.multiPurpose, false);

  // Order must not change the answer.
  assert.equal(electVenueType([
    { venue_type: "FOOTBALL_STADIUM", capacity_value: 27000 },
    { venue_type: "RUGBY_STADIUM", capacity_value: 26462 },
  ]).venueType, "FOOTBALL_STADIUM");

  // No disagreement, no election.
  assert.equal(electVenueType([{ venue_type: "THEATRE", capacity_value: 1200 }]).venueType, "THEATRE");
});

test("a sub-venue inside a complex is never collapsed into its parent, but true aliases are merged", () => {
  const parent = rawVenue({
    canonical_name: "Example Complex", city: "Exampleton", venue_type: "EXHIBITION_CENTRE",
    alternative_names: ["Example Arena Complex"], parent_complex: null,
  });
  const child = rawVenue({
    canonical_name: "Indoor Arena, Example Complex", city: "Exampleton", venue_type: "INDOOR_ARENA",
    alternative_names: ["Example Complex"], parent_complex: "Example Complex",
  });
  const kept = compileCensus([workstream([parent], "A"), workstream([child], "B")], { generatedAt: GENERATED_AT }).venues.venues;
  assert.equal(kept.length, 2, "a declared sub-venue must survive as its own record");

  // But two records for ONE building, arriving under different headline
  // names that share an alias, ARE the same venue.
  const a = rawVenue({ canonical_name: "Aviva Arena", city: "Bristol", alternative_names: ["YTL Arena Bristol"], parent_complex: null });
  const b = rawVenue({ canonical_name: "Aviva Arena Bristol", city: "Bristol", alternative_names: ["YTL Arena Bristol"], parent_complex: null });
  const merged = compileCensus([workstream([a], "A"), workstream([b], "B")], { generatedAt: GENERATED_AT }).venues.venues;
  assert.equal(merged.length, 1, "records sharing an alias in the same city are one venue");
  assert.ok(merged[0].identity_review, "an alias-based merge is weaker evidence and must stay visible for review");
});

test("the family audit rejects the exact shapes that inflated TIER2 — emoji-only JSON and no JSON at all", () => {
  const emojiOnly = `<html><head><script type="application/json" id="x">{"concatemoji":"https://s/wp-includes/js/wp-emoji-release.min.js","source":{"wpemoji":"x"}}</script></head><body>events</body></html>`;
  const noJson = `<html><head><script src="/app.js"></script></head><body>fixtures</body></html>`;
  const real = `<html><script type="application/json">{"props":{"events":[{"title":"Gig A","date":"2026-10-01"},{"title":"Gig B","date":"2026-10-08"},{"title":"Gig C","date":"2026-11-02"}]}}</script></html>`;

  assert.equal(verifyFamilyClaim("OTHER_EMBEDDED_APP_STATE", emojiOnly).confirmed, false, "the WordPress emoji block is not reusable app state");
  assert.equal(verifyFamilyClaim("OTHER_EMBEDDED_APP_STATE", noJson).confirmed, false, "no application/json script at all cannot confirm embedded app state");
  assert.equal(verifyFamilyClaim("OTHER_EMBEDDED_APP_STATE", real).confirmed, true);

  // Each family must verify ITS OWN marker — a Next.js page must never
  // confirm a Nuxt claim, or the audit would just launder the error.
  const next = `<html><script id="__NEXT_DATA__" type="application/json">{"props":{}}</script></html>`;
  assert.equal(verifyFamilyClaim("EMBEDDED_NEXT_DATA", next).confirmed, true);
  assert.equal(verifyFamilyClaim("EMBEDDED_NUXT_STATE", next).confirmed, false);
});

test("the audit accepts BOTH Next.js payload shapes — an over-strict rule under-states readiness", () => {
  // The defect this guards: the rule originally checked only
  // __NEXT_DATA__ (Pages Router) and so reported 71 of 80 genuine Next.js
  // sources as misclassified. Those sites were real; they use the App
  // Router, which streams RSC chunks onto self.__next_f instead. A false
  // downgrade understates readiness just as badly as over-classification
  // overstates it.
  const pagesRouter = `<html><script id="__NEXT_DATA__" type="application/json">{"props":{}}</script></html>`;
  const appRouter = `<html><script>self.__next_f.push([1,"a:[\\"events\\"]"])</script></html>`;
  const frameworkOnly = `<html><link rel="preload" href="/_next/static/chunks/main.js"></html>`;

  assert.equal(verifyFamilyClaim("EMBEDDED_NEXT_DATA", pagesRouter).confirmed, true);
  assert.equal(verifyFamilyClaim("EMBEDDED_NEXT_DATA", appRouter).confirmed, true, "App Router RSC payloads are embedded data too");
  assert.equal(verifyFamilyClaim("EMBEDDED_NEXT_DATA", frameworkOnly).confirmed, false, "/_next/static proves the framework built the page, not that data is embedded in it");
});

test("the audit is idempotent — a corrected rule can give back readiness a flawed run took away", async () => {
  const downgradedByFlawedRun = [{
    calendar_source_id: "a", source_url: "https://a.test/x", source_family: "EMBEDDED_NEXT_DATA",
    collector_route: "GENERIC_CAPABILITY_WIDENING", http_status: 200,
    acquisition_readiness: "SOURCE_REVIEW_REQUIRED",
    family_audit_verdict: "NOT_CONFIRMED", family_audit_detail: "stale rule", family_audit_checked_at: "2026-09-20T00:00:00.000Z",
  }];
  const verdicts = await auditSourceFamilies(downgradedByFlawedRun, {
    fetchDocument: async () => ({ status: 200, body: `<html><script>self.__next_f.push([1,"x"])</script></html>` }),
  });
  assert.equal(verdicts[0].verdict, "CONFIRMED");

  const { sources, downgraded } = applyAuditVerdicts(downgradedByFlawedRun, verdicts, {
    resetReadiness: (source) => readinessFromFingerprint({ ok: true, mechanism: source.source_family, collectorRoute: source.collector_route }),
  });
  assert.equal(downgraded, 0);
  assert.equal(sources[0].acquisition_readiness, "TIER2_REUSABLE_FAMILY", "readiness must be restored from the retained fingerprint, not left downgraded");
  assert.equal(sources[0].family_audit_verdict, undefined, "the stale verdict must be cleared, not kept alongside a restored readiness");
});

test("the family audit only ever REMOVES false confidence — it never promotes a source", async () => {
  const sources = [
    { calendar_source_id: "a", source_url: "https://a.test/x", source_family: "OTHER_EMBEDDED_APP_STATE", acquisition_readiness: "TIER2_REUSABLE_FAMILY" },
    { calendar_source_id: "b", source_url: "https://b.test/x", source_family: "OTHER_EMBEDDED_APP_STATE", acquisition_readiness: "TIER2_REUSABLE_FAMILY" },
    { calendar_source_id: "c", source_url: "https://c.test/x", source_family: "CLIENT_RENDERED_UNKNOWN", acquisition_readiness: "TIER3_BROWSER_OR_COMPLEX" },
  ];
  const bodies = {
    "https://a.test/x": `<html><script type="application/json">{"props":{"pageProps":{"events":[{"title":"Gig One","startDate":"2026-10-01","venue":"Example Arena"},{"title":"Gig Two","startDate":"2026-10-08","venue":"Example Arena"},{"title":"Gig Three","startDate":"2026-11-02","venue":"Example Arena"}]}}}</script></html>`,
    "https://b.test/x": `<html><head><script type="application/json">{"concatemoji":"wp-emoji-release.min.js"}</script></head></html>`,
  };
  const verdicts = await auditSourceFamilies(sources, {
    concurrency: 2,
    fetchDocument: async (url) => ({ status: 200, body: bodies[url] ?? "" }),
  });

  // CLIENT_RENDERED_UNKNOWN is already the conservative answer and is not audited.
  assert.equal(verdicts.length, 2, "only TIER2-contributing families are audited");
  assert.equal(verdicts.find((v) => v.calendar_source_id === "a").verdict, "CONFIRMED");
  assert.equal(verdicts.find((v) => v.calendar_source_id === "b").verdict, "NOT_CONFIRMED");

  const { sources: updated, downgraded } = applyAuditVerdicts(sources, verdicts);
  assert.equal(downgraded, 1);
  assert.equal(updated.find((s) => s.calendar_source_id === "a").acquisition_readiness, "TIER2_REUSABLE_FAMILY", "a confirmed source is left exactly as it was");
  assert.equal(updated.find((s) => s.calendar_source_id === "b").acquisition_readiness, "SOURCE_REVIEW_REQUIRED");
  assert.ok(updated.find((s) => s.calendar_source_id === "b").family_audit_detail, "the downgrade must retain its reason");
  assert.equal(updated.find((s) => s.calendar_source_id === "c").acquisition_readiness, "TIER3_BROWSER_OR_COMPLEX", "an unaudited source is untouched");
});

test("one source's audit failure never changes another source's verdict", async () => {
  const sources = [
    { calendar_source_id: "boom", source_url: "https://boom.test/x", source_family: "EMBEDDED_NEXT_DATA", acquisition_readiness: "TIER2_REUSABLE_FAMILY" },
    { calendar_source_id: "fine", source_url: "https://fine.test/x", source_family: "EMBEDDED_NEXT_DATA", acquisition_readiness: "TIER2_REUSABLE_FAMILY" },
  ];
  const verdicts = await auditSourceFamilies(sources, {
    concurrency: 2,
    fetchDocument: async (url) => {
      if (url.includes("boom")) throw new Error("connection reset");
      return { status: 200, body: `<html><script id="__NEXT_DATA__" type="application/json">{"props":{}}</script></html>` };
    },
  });
  assert.equal(verdicts.find((v) => v.calendar_source_id === "boom").verdict, "UNREACHABLE");
  assert.equal(verdicts.find((v) => v.calendar_source_id === "fine").verdict, "CONFIRMED");

  // An unreachable source keeps its existing readiness — it is not evidence of anything.
  const { downgraded } = applyAuditVerdicts(sources, verdicts);
  assert.equal(downgraded, 0, "UNREACHABLE must never be treated as a failed claim");
});

test("an official URL is never called valid on HTTP 200 alone — the page must name the venue", () => {
  const venue = { canonical_name: "Harlaw Park", city: "Inverurie", official_url: "https://bowerhinton.test/", alternative_names: [], operator: null };
  const ok = (body, finalUrl = "https://bowerhinton.test/") => ({ ok: true, status: 200, finalUrl, body, error: null });

  // Gambling spam returning 200 is not valid.
  assert.equal(classifyOfficialUrl(venue, ok("TOTO12: Pilihan Situs Paling Rekomendasi bandar togel judi gacor")).verdict, "HIJACKED_DOMAIN");
  // A 200 shell that names nothing is unproven, not valid AND not condemned.
  assert.equal(classifyOfficialUrl(venue, ok("<div id=root>Loading…</div>")).verdict, "REVIEW_REQUIRED");
  // Naming the venue is what makes it valid.
  assert.equal(classifyOfficialUrl(venue, ok("Fixtures at Harlaw Park, Inverurie")).verdict, "VALID_OFFICIAL");

  // A racecourse legitimately mentions betting. Spam markers must only
  // condemn a page that ALSO fails to identify the venue, or every
  // racecourse and greyhound track would be falsely flagged.
  const racecourse = { canonical_name: "Ascot Racecourse", city: "Ascot", official_url: "https://ascot.test/", alternative_names: [], operator: null };
  assert.equal(classifyOfficialUrl(racecourse, ok("Ascot Racecourse racedays. Online casino partners and betting.", "https://ascot.test/")).verdict, "VALID_OFFICIAL");
});

test("a ground recorded with its RESIDENT club's official site is valid, not a wrong entity", () => {
  // The defect this guards: an attempt to auto-detect WRONG_ENTITY by
  // requiring the page to match the venue's OWN name condemned 51 records
  // where a ground is legitimately recorded against its resident club's
  // website — and also condemned venues whose names leave no usable token
  // once generic words are stripped ("The Den", "The Old Vic").
  const ok = (body, finalUrl) => ({ ok: true, status: 200, finalUrl, body, error: null });

  const crownGround = { canonical_name: "Crown Ground", city: "Accrington", official_url: "https://accringtonstanley.test/", alternative_names: [], operator: "Accrington Stanley" };
  assert.equal(classifyOfficialUrl(crownGround, ok("Accrington Stanley FC official site", "https://accringtonstanley.test/")).verdict, "VALID_OFFICIAL");

  const theDen = { canonical_name: "The Den", city: "Bermondsey, London", official_url: "https://millwallfc.test/", alternative_names: [], operator: "Millwall FC" };
  assert.equal(classifyOfficialUrl(theDen, ok("Millwall Football Club, Bermondsey", "https://millwallfc.test/")).verdict, "VALID_OFFICIAL");

  // And the sweep must NOT claim to detect wrong-entity cases: it cannot
  // separate a venue's own site from a page that merely mentions it.
  assert.equal(classifyOfficialUrl(theDen, ok("<div id=root>Loading…</div>", "https://millwallfc.test/")).verdict, "REVIEW_REQUIRED");
});

test("a transport failure is not a dead domain — only a domain that does not resolve is", () => {
  // The defect this guards: the first version mapped every fetch error to
  // DEAD_DOMAIN, which declared Olympia London, Co-op Live, The Lowry and
  // Caird Hall dead. They are live venues with TLS faults, cookie-consent
  // redirect loops and timeouts.
  const venue = { canonical_name: "The Lowry", city: "Salford", official_url: "https://thelowry.test/", alternative_names: [], operator: null };
  const failed = (error) => ({ ok: false, status: null, finalUrl: null, body: "", error });

  assert.equal(classifyOfficialUrl(venue, failed("fetch failed: getaddrinfo ENOTFOUND thelowry.test")).verdict, "DEAD_DOMAIN");
  assert.equal(classifyOfficialUrl(venue, failed("fetch failed: redirect count exceeded")).verdict, "REVIEW_REQUIRED");
  assert.equal(classifyOfficialUrl(venue, failed("fetch failed: certificate has expired")).verdict, "REVIEW_REQUIRED");
  assert.equal(classifyOfficialUrl(venue, failed("fetch failed: Connect Timeout Error")).verdict, "REVIEW_REQUIRED");

  // A block is not disproof either.
  assert.equal(classifyOfficialUrl(venue, { ok: false, status: 403, finalUrl: "https://thelowry.test/", body: "Forbidden", error: null }).verdict, "REVIEW_REQUIRED");
});

test("a quarantined URL cannot resurface as ANOTHER venue's current official site", () => {
  const bad = "https://squatted.test/";
  const quarantining = rawVenue({
    canonical_name: "Venue A", city: "Alpha", official_url: "https://real-a.test/",
    official_url_status: "OFFICIAL_URL_REPLACED", official_url_quarantined: bad,
    official_url_quarantine_reason: "casino spam",
  });
  const reusingIt = rawVenue({ canonical_name: "Venue B", city: "Beta", official_url: bad });
  const { venues, capacityEvidence, calendarSources } = compileCensus(
    [workstream([quarantining], "A"), workstream([reusingIt], "B")], { generatedAt: GENERATED_AT },
  );
  const errors = validateCensusArtifact({
    venues: venues.venues,
    calendarSources: calendarSources.calendar_sources,
    capacityEvidence: capacityEvidence.capacity_evidence,
  });
  assert.ok(
    errors.some((error) => /quarantined as invalid by/.test(error)),
    `a domain quarantined by one venue must not stand as another's truth; got: ${errors.join("; ")}`,
  );
});

test("the READY_TIER1 families are verified structurally, not by the word 'Event' appearing on a page", () => {
  // These are the sources a first acquisition wave would start from, so a
  // false positive here sends that wave at pages it cannot collect.
  const realEvent = `<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"Gig","startDate":"2026-10-01"}</script></html>`;
  const orgOnly = `<html><script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Venue Ltd"}</script></html>`;
  const prose = `<html><body>Our next Event is coming soon. See all Event listings.</body></html>`;

  assert.equal(verifyFamilyClaim("JSON_LD_EVENT", realEvent).confirmed, true);
  assert.equal(verifyFamilyClaim("JSON_LD_EVENT", orgOnly).confirmed, false, "JSON-LD that describes an Organization is not an Event feed");
  assert.equal(verifyFamilyClaim("JSON_LD_EVENT", prose).confirmed, false, "the word 'Event' in body copy proves nothing");

  assert.equal(verifyFamilyClaim("WORDPRESS_TRIBE_API", `<html><a href="/wp-json/tribe/events/v1/events">x</a></html>`).confirmed, true);
  assert.equal(verifyFamilyClaim("WORDPRESS_TRIBE_API", prose).confirmed, false);

  // STATIC_HTML_CARDS presumes dated content is actually server-rendered.
  assert.equal(verifyFamilyClaim("STATIC_HTML_CARDS", `<div>12 October 2026</div><div>19 Oct 2026</div><div>2026-11-05</div>`).confirmed, true);
  assert.equal(verifyFamilyClaim("STATIC_HTML_CARDS", `<div id="root">Loading…</div>`).confirmed, false);
});

test("a derelict venue is not flattened into CLOSED, and a capacity never keeps it operational", () => {
  // The defect this guards: The Camrose was carried OPERATIONAL at 6,000
  // purely because an old capacity source existed, while its council's
  // Cabinet report recorded that football use ceased before 2019. It is
  // also NOT demolished — that report says the stands "still remain" — so
  // collapsing it into CLOSED would assert something no source establishes.
  const derelict = rawVenue({
    canonical_name: "Old Ground", city: "Exampleton",
    venue_type: "FOOTBALL_STADIUM", operational_status: "DERELICT",
    capacity: { capacity_value: 6000, capacity_type: "SPECTATOR", capacity_source: "https://example.test/history", capacity_source_authority: "GRADE_B", capacity_confidence: "MEDIUM" },
  });
  const { venues } = compileCensus([workstream([derelict])], { generatedAt: GENERATED_AT });

  assert.equal(venues.venues.length, 0, "a derelict venue leaves the census POPULATION");
  assert.equal(venues.excluded_non_operational.length, 1, "but is retained as an explicit exclusion, never silently dropped");
  assert.equal(venues.excluded_non_operational[0].operational_status, "DERELICT", "DERELICT must survive as itself, not be flattened to CLOSED");

  // The distinct states stay distinct.
  for (const [input, expected] of [["REDEVELOPED", "REDEVELOPED"], ["NO_LONGER_EVENT_VENUE", "NO_LONGER_EVENT_VENUE"], ["DEMOLISHED", "CLOSED"], ["PERMANENTLY_CLOSED", "CLOSED"]]) {
    const compiled = compileCensus([workstream([rawVenue({ canonical_name: `V ${input}`, operational_status: input })])], { generatedAt: GENERATED_AT });
    assert.equal(compiled.venues.excluded_non_operational[0].operational_status, expected, `${input} should normalise to ${expected}`);
  }
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
