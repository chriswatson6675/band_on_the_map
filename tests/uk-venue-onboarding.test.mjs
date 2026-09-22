import assert from "node:assert/strict";
import test from "node:test";

import { classifyVenue, classifyAllVenues, summariseClassification, indexCalendarSourcesByVenue, SCOPE_CLASSIFICATIONS } from "../ingestion/uk-venue-onboarding/classification.mjs";
import { findExistingMatch, dedupeAgainstRegistries } from "../ingestion/uk-venue-onboarding/dedupe.mjs";
import { buildCanonicalUkVenue, buildAddressString, buildCanonicalUkVenues } from "../ingestion/uk-venue-onboarding/build-registry.mjs";
import { validateVenue } from "../ingestion/venue/contract.mjs";

function censusVenue(overrides = {}) {
  return {
    venue_census_id: "ukmec-england-testville-test-venue",
    canonical_name: "Test Venue",
    city: "Testville",
    nation: "England",
    address: null,
    postcode: null,
    latitude: null,
    longitude: null,
    official_url: "https://www.testvenue.example/",
    official_url_status: "OFFICIAL_URL_VERIFIED",
    venue_type: "THEATRE",
    operational_status: "OPERATIONAL",
    identity_review: false,
    identity_review_reason: null,
    provenance: { workstream: "TEST", evidence: [] },
    ...overrides,
  };
}

function calendarSource(overrides = {}) {
  return {
    calendar_source_id: "cal-1",
    venue_census_id: "ukmec-england-testville-test-venue",
    source_url: "https://www.testvenue.example/whats-on",
    source_type: "CONCERTS",
    first_party: true,
    publicly_accessible: true,
    events_currently_present: true,
    ...overrides,
  };
}

test("classification is deterministic: same input always produces the same output", () => {
  const venue = censusVenue({ venue_type: "FOOTBALL_STADIUM" });
  const byVenueId = indexCalendarSourcesByVenue([]);
  const first = classifyVenue(venue, byVenueId);
  const second = classifyVenue(venue, byVenueId);
  assert.deepEqual(first, second);
});

test("a performance venue type (THEATRE/CONCERT_HALL/AUDITORIUM/INDOOR_ARENA) is always IN_SCOPE regardless of calendar evidence", () => {
  for (const type of ["THEATRE", "CONCERT_HALL", "AUDITORIUM", "INDOOR_ARENA"]) {
    const venue = censusVenue({ venue_type: type });
    const result = classifyVenue(venue, indexCalendarSourcesByVenue([]));
    assert.equal(result.classification, "IN_SCOPE_PUBLIC_PERFORMANCE_VENUE", `${type} should be auto in-scope`);
  }
});

test("a sport-typed venue (football stadium) with no evidenced non-sport programme is excluded as SPORT_ONLY, never in-scope merely by type", () => {
  const venue = censusVenue({ venue_census_id: "ukmec-england-x-stadium", venue_type: "FOOTBALL_STADIUM" });
  const result = classifyVenue(venue, indexCalendarSourcesByVenue([]));
  assert.equal(result.classification, "SPORT_ONLY");
});

test("an outdoor sport venue (racecourse) with no evidenced non-sport programme is excluded as OUTDOOR_SPORT_ONLY", () => {
  const venue = censusVenue({ venue_census_id: "ukmec-england-x-racecourse", venue_type: "RACECOURSE" });
  const result = classifyVenue(venue, indexCalendarSourcesByVenue([]));
  assert.equal(result.classification, "OUTDOOR_SPORT_ONLY");
});

test("a stadium IS escalated to IN_SCOPE when a genuine, retained, first-party, currently-live CONCERTS/PERFORMING_ARTS calendar source is on record", () => {
  const venue = censusVenue({ venue_census_id: "ukmec-england-y-stadium", venue_type: "FOOTBALL_STADIUM" });
  const sources = [calendarSource({ venue_census_id: "ukmec-england-y-stadium", source_type: "CONCERTS" })];
  const result = classifyVenue(venue, indexCalendarSourcesByVenue(sources));
  assert.equal(result.classification, "IN_SCOPE_PUBLIC_PERFORMANCE_VENUE");
  assert.equal(result.evidence.length, 1);
  assert.equal(result.evidence[0].calendar_source_id, "cal-1");
});

test("a stadium is NOT escalated by a sport-fixtures calendar source, only CONCERTS/PERFORMING_ARTS", () => {
  const venue = censusVenue({ venue_census_id: "ukmec-england-z-stadium", venue_type: "FOOTBALL_STADIUM" });
  const sources = [calendarSource({ venue_census_id: "ukmec-england-z-stadium", source_type: "SPORT_FIXTURES" })];
  const result = classifyVenue(venue, indexCalendarSourcesByVenue(sources));
  assert.equal(result.classification, "SPORT_ONLY");
});

test("a stadium is NOT escalated by a stale/non-live/third-party CONCERTS source", () => {
  const venue = censusVenue({ venue_census_id: "ukmec-england-w-stadium", venue_type: "FOOTBALL_STADIUM" });
  const notLive = calendarSource({ venue_census_id: "ukmec-england-w-stadium", source_type: "CONCERTS", events_currently_present: false });
  const notFirstParty = calendarSource({ venue_census_id: "ukmec-england-w-stadium", source_type: "CONCERTS", first_party: false, calendar_source_id: "cal-2" });
  const result = classifyVenue(venue, indexCalendarSourcesByVenue([notLive, notFirstParty]));
  assert.equal(result.classification, "SPORT_ONLY");
});

test("operational_status other than OPERATIONAL always overrides to AMBIGUOUS, even for an auto-in-scope type", () => {
  const venue = censusVenue({ venue_type: "THEATRE", operational_status: "STATUS_REVIEW_REQUIRED" });
  const result = classifyVenue(venue, indexCalendarSourcesByVenue([]));
  assert.equal(result.classification, "AMBIGUOUS");
});

test("identity_review=true always overrides to AMBIGUOUS, even for an auto-in-scope type", () => {
  const venue = censusVenue({ venue_type: "CONCERT_HALL", identity_review: true, identity_review_reason: "possible duplicate" });
  const result = classifyVenue(venue, indexCalendarSourcesByVenue([]));
  assert.equal(result.classification, "AMBIGUOUS");
});

test("every SCOPE_CLASSIFICATIONS bucket is a valid, checkable enum member and classifyAllVenues never produces UNEXPLAINED", () => {
  const venues = [
    censusVenue({ venue_census_id: "a", venue_type: "THEATRE" }),
    censusVenue({ venue_census_id: "b", venue_type: "FOOTBALL_STADIUM" }),
    censusVenue({ venue_census_id: "c", venue_type: "RACECOURSE" }),
    censusVenue({ venue_census_id: "d", venue_type: "EXHIBITION_CENTRE" }),
    censusVenue({ venue_census_id: "e", venue_type: "MULTI_PURPOSE_EVENT_COMPLEX" }),
    censusVenue({ venue_census_id: "f", venue_type: "SOME_FUTURE_TYPE" }),
  ];
  const classified = classifyAllVenues(venues, []);
  const summary = summariseClassification(classified);
  assert.equal(summary.unexplained, 0);
  assert.equal(summary.total, venues.length);
  for (const entry of classified) {
    assert.ok(SCOPE_CLASSIFICATIONS.has(entry.classification), `${entry.classification} must be a real bucket`);
  }
});

// ---------------------------------------------------------------------
// Dedup
// ---------------------------------------------------------------------

function existingVenue(overrides = {}) {
  return {
    venue_id: "venue-london-existing-club",
    canonical_name: "Existing Club",
    country_code: "GB",
    city: "London",
    municipality: "London",
    address: "1 Test Street, N1 1AA, London",
    latitude: 51.5,
    longitude: -0.1,
    location_status: "GEOCODED",
    evidence: [{ url: "https://www.existingclub.example/whatson", kind: "OFFICIAL_VENUE_WEBSITE", note: "test" }],
    coordinate_provenance: { method: "OSM_ID_LOOKUP", osm_ref: "osm-node-1" },
    ...overrides,
  };
}

test("dedupe matches an existing venue by official domain, even with a different name spelling", () => {
  const census = censusVenue({ canonical_name: "Existing Club (Official)", official_url: "https://www.existingclub.example/tickets" });
  const match = findExistingMatch(census, [existingVenue()]);
  assert.ok(match);
  assert.equal(match.method, "OFFICIAL_DOMAIN_MATCH");
  assert.equal(match.existing.venue_id, "venue-london-existing-club");
});

test("dedupe matches an existing venue by exact name+city when no domain evidence overlaps", () => {
  const census = censusVenue({ canonical_name: "Existing Club", city: "London", official_url: "https://www.some-other-domain.example/" });
  const match = findExistingMatch(census, [existingVenue()]);
  assert.ok(match);
  assert.equal(match.method, "NAME_AND_CITY_MATCH");
});

test("dedupe does NOT match a genuinely different venue with a similar-sounding name in a different city", () => {
  const census = censusVenue({ canonical_name: "Existing Club", city: "Manchester", official_url: "https://www.some-other-domain.example/" });
  const match = findExistingMatch(census, [existingVenue()]);
  assert.equal(match, null);
});

test("dedupeAgainstRegistries splits into duplicates and newVenues without losing any input venue", () => {
  const census = [
    censusVenue({ venue_census_id: "dup", canonical_name: "Existing Club", city: "London", official_url: "https://www.existingclub.example/" }),
    censusVenue({ venue_census_id: "new", canonical_name: "Brand New Theatre", city: "Leeds", official_url: "https://www.brandnewtheatre.example/" }),
  ];
  const { duplicates, newVenues } = dedupeAgainstRegistries(census, { "venues/london.json": { venues: [existingVenue()] } });
  assert.equal(duplicates.length, 1);
  assert.equal(newVenues.length, 1);
  assert.equal(duplicates[0].existing_venue_id, "venue-london-existing-club");
  assert.equal(newVenues[0].venue_census_id, "new");
});

// ---------------------------------------------------------------------
// Registry build
// ---------------------------------------------------------------------

test("buildAddressString combines street/postcode/city without duplicating a value already present", () => {
  assert.equal(buildAddressString(censusVenue({ address: "Oaklands Park", postcode: "PO19 6AP", city: "Chichester" })), "Oaklands Park, PO19 6AP, Chichester");
  assert.equal(buildAddressString(censusVenue({ address: null, postcode: null, city: "Chichester" })), null);
  assert.equal(
    buildAddressString(censusVenue({ address: "Goldington Road, Bedford", postcode: "MK40 3NF", city: "Bedford" })),
    "Goldington Road, Bedford, MK40 3NF",
  );
});

test("a census venue WITH an address becomes a valid ADDRESS_ONLY canonical Venue, never coordinates", () => {
  const venue = buildCanonicalUkVenue(censusVenue({ address: "Oaklands Park", postcode: "PO19 6AP", canonical_name: "Chichester Festival Theatre", city: "Chichester" }));
  assert.equal(venue.location_status, "ADDRESS_ONLY");
  assert.equal(venue.latitude, null);
  assert.equal(venue.longitude, null);
  assert.equal(venue.country_code, "GB");
  assert.deepEqual(validateVenue(venue), []);
});

test("a census venue WITHOUT an address becomes a valid UNRESOLVED canonical Venue, never a guessed address", () => {
  const venue = buildCanonicalUkVenue(censusVenue({ address: null, postcode: null }));
  assert.equal(venue.location_status, "UNRESOLVED");
  assert.equal(venue.address, null);
  assert.deepEqual(validateVenue(venue), []);
});

test("buildCanonicalUkVenues detects a venue_id collision rather than silently dropping one venue", () => {
  const a = censusVenue({ venue_census_id: "a", canonical_name: "Same Name", city: "Sametown" });
  const b = censusVenue({ venue_census_id: "b", canonical_name: "Same Name", city: "Sametown" });
  const { venues, collisions } = buildCanonicalUkVenues([a, b]);
  assert.equal(venues.length, 1);
  assert.equal(collisions.length, 1);
});
