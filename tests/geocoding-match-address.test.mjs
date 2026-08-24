import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCandidate,
  extractHouseNumber,
  extractPostcode,
  selectGeocodeMatch,
} from "../ingestion/geocoding/match-address.mjs";

// -- extractPostcode / extractHouseNumber against the five real bounded
//    target addresses (see venues/lisbon.json, venues/porto.json).

test("extractPostcode finds the Portuguese NNNN-NNN postcode in each of the five target addresses", () => {
  assert.equal(extractPostcode("Largo da Graça, 1170-165 Lisboa"), "1170-165");
  assert.equal(extractPostcode("Largo de Santa Bárbara, 3D, 1150-287 Lisboa"), "1150-287");
  assert.equal(extractPostcode("Avenida da Índia 52, 1300-299 Lisboa"), "1300-299");
  assert.equal(extractPostcode("Av. da Boavista 604-610, 4149-071 Porto"), "4149-071");
  assert.equal(extractPostcode("Praça Dom João I, 4000-295 Porto"), "4000-295");
});

test("extractHouseNumber correctly finds/omits a house number for each of the five target addresses", () => {
  assert.equal(extractHouseNumber("Largo da Graça, 1170-165 Lisboa"), null, "a Largo with no street number");
  assert.equal(extractHouseNumber("Largo de Santa Bárbara, 3D, 1150-287 Lisboa"), "3D");
  assert.equal(extractHouseNumber("Avenida da Índia 52, 1300-299 Lisboa"), "52");
  assert.equal(extractHouseNumber("Av. da Boavista 604-610, 4149-071 Porto"), "604-610");
  assert.equal(extractHouseNumber("Praça Dom João I, 4000-295 Porto"), null, "Roman numeral 'I' is not a house number");
});

function baseCandidate(overrides = {}) {
  return {
    lat: "38.7147",
    lon: "-9.1306",
    class: "amenity",
    type: "place_of_worship",
    addresstype: "amenity",
    osm_type: "way",
    osm_id: 123456,
    display_name: "Igreja da Graça, Largo da Graça, Lisboa, Portugal",
    address: {
      city: "Lisboa",
      postcode: "1170-165",
      country_code: "pt",
    },
    ...overrides,
  };
}

function baseVenue(overrides = {}) {
  return {
    canonical_name: "Igreja e Convento da Graça",
    city: "Lisboa",
    municipality: "Lisboa",
    address: "Largo da Graça, 1170-165 Lisboa",
    ...overrides,
  };
}

// 3. Portugal validation works.
test("3. country_code must be pt — a non-pt candidate fails the country check", () => {
  const { passed, checks } = evaluateCandidate(baseCandidate({ address: { ...baseCandidate().address, country_code: "es" } }), baseVenue());
  assert.equal(checks.country, false);
  assert.equal(passed, false);
});

// 4. city/municipality validation works.
test("4. municipality/city compatibility — Lisboa/Lisbon accepted, an unrelated city rejected", () => {
  const lisbonPass = evaluateCandidate(baseCandidate(), baseVenue());
  assert.equal(lisbonPass.checks.city, true);

  const lisbonEnglish = evaluateCandidate(
    baseCandidate({ address: { ...baseCandidate().address, city: "Lisbon" } }),
    baseVenue(),
  );
  assert.equal(lisbonEnglish.checks.city, true, "Lisboa/Lisbon are the same municipality under two names");

  const wrongCity = evaluateCandidate(
    baseCandidate({ address: { ...baseCandidate().address, city: "Porto" } }),
    baseVenue(),
  );
  assert.equal(wrongCity.checks.city, false);
  assert.equal(wrongCity.passed, false);
});

// 5. postcode mismatch fails closed.
test("5. a conflicting postcode is a hard rejection", () => {
  const { checks, passed } = evaluateCandidate(
    baseCandidate({ address: { ...baseCandidate().address, postcode: "1170-999" } }),
    baseVenue(),
  );
  assert.equal(checks.postcode, false);
  assert.equal(passed, false);
});

test("postcode formatting differences (whitespace/case) do not cause a false rejection", () => {
  const { checks } = evaluateCandidate(
    baseCandidate({ address: { ...baseCandidate().address, postcode: " 1170-165 " } }),
    baseVenue(),
  );
  assert.equal(checks.postcode, true);
});

test("no rejection when the canonical address has no postcode-comparable value on one side", () => {
  const { checks } = evaluateCandidate(baseCandidate({ address: { ...baseCandidate().address, postcode: undefined } }), baseVenue());
  assert.equal(checks.postcode, true, "nothing to compare must not itself reject");
});

// 6. house-number conflict fails closed.
test("6. a conflicting house number is a hard rejection", () => {
  const venue = baseVenue({ address: "Avenida da Índia 52, 1300-299 Lisboa" });
  const candidate = baseCandidate({
    address: { ...baseCandidate().address, house_number: "54", postcode: "1300-299" },
  });
  const { checks, passed } = evaluateCandidate(candidate, venue);
  assert.equal(checks.houseNumber, false);
  assert.equal(passed, false);
});

test("agreeing house numbers pass", () => {
  const venue = baseVenue({ address: "Avenida da Índia 52, 1300-299 Lisboa" });
  const candidate = baseCandidate({
    address: { ...baseCandidate().address, house_number: "52", postcode: "1300-299" },
  });
  const { checks } = evaluateCandidate(candidate, venue);
  assert.equal(checks.houseNumber, true);
});

// 7. ambiguous candidates fail closed. Covered at selectGeocodeMatch level below.

// 8. broad/city/road-only result fails closed.
test("8. an administrative-boundary/city-level result is rejected as not specific enough", () => {
  const cityCandidate = baseCandidate({ class: "boundary", type: "administrative", addresstype: "city" });
  const { checks, passed } = evaluateCandidate(cityCandidate, baseVenue());
  assert.equal(checks.specificEnough, false);
  assert.equal(passed, false);
});

test("8b. a postcode-centroid result is rejected", () => {
  const postcodeCandidate = baseCandidate({ class: "place", type: "postcode", addresstype: "postcode" });
  const { checks } = evaluateCandidate(postcodeCandidate, baseVenue());
  assert.equal(checks.specificEnough, false);
});

test("8c. a road-only result (class=highway) is rejected", () => {
  const roadCandidate = baseCandidate({ class: "highway", type: "residential", addresstype: "road" });
  const { checks } = evaluateCandidate(roadCandidate, baseVenue());
  assert.equal(checks.specificEnough, false);
});

test("a building/amenity/site-level result is accepted as specific enough", () => {
  const { checks } = evaluateCandidate(baseCandidate(), baseVenue());
  assert.equal(checks.specificEnough, true);
});

// Regression coverage for a real live-run bug (VENUE-GEOCODING-01): real
// Nominatim jsonv2 responses name this field `category`, not the legacy
// `class` — a candidate shaped exactly like a genuine live response must
// still be rejected when it is road-only.
test("a real-shaped Nominatim jsonv2 road result (category=highway, no `class` field at all) is rejected, not silently accepted", () => {
  const liveShapedRoadCandidate = {
    lat: "38.7267232",
    lon: "-9.1365621",
    category: "highway",
    type: "secondary",
    addresstype: "road",
    osm_type: "way",
    osm_id: 23148096,
    display_name: "Largo de Santa Bárbara, Anjos, Arroios, Lisboa, 1150-287, Portugal",
    address: { road: "Largo de Santa Bárbara", city: "Lisboa", postcode: "1150-287", country_code: "pt" },
  };
  const venue = baseVenue({
    canonical_name: "BOTA Anjos",
    address: "Largo de Santa Bárbara, 3D, 1150-287 Lisboa",
  });
  const { checks, passed } = evaluateCandidate(liveShapedRoadCandidate, venue);
  assert.equal(checks.specificEnough, false, "category=highway must be rejected even without a `class` field");
  assert.equal(passed, false);
});

test("a real-shaped Nominatim jsonv2 pedestrian-square result (category=highway, addresstype=road) is rejected", () => {
  const liveShapedSquareCandidate = {
    lat: "41.1478135",
    lon: "-8.6089930",
    category: "highway",
    type: "pedestrian",
    addresstype: "road",
    osm_type: "relation",
    osm_id: 18990284,
    display_name: "Praça de Dom João I, Porto, 4000-295, Portugal",
    address: { road: "Praça de Dom João I", city: "Porto", postcode: "4000-295", country_code: "pt" },
  };
  const venue = baseVenue({ canonical_name: "Teatro Rivoli", city: "Porto", municipality: "Porto", address: "Praça Dom João I, 4000-295 Porto" });
  const { checks, passed } = evaluateCandidate(liveShapedSquareCandidate, venue);
  assert.equal(checks.specificEnough, false);
  assert.equal(passed, false);
});

// selectGeocodeMatch — end-to-end acceptance/rejection.

test("selectGeocodeMatch accepts the sole candidate that passes every check", () => {
  const match = selectGeocodeMatch([baseCandidate()], baseVenue());
  assert.equal(match.status, "ACCEPTED");
  assert.equal(match.candidate.osm_id, 123456);
});

test("selectGeocodeMatch rejects with NO_CANDIDATES_RETURNED for an empty list", () => {
  const match = selectGeocodeMatch([], baseVenue());
  assert.equal(match.status, "REJECTED");
  assert.equal(match.reason, "NO_CANDIDATES_RETURNED");
});

test("selectGeocodeMatch rejects with NO_CANDIDATE_PASSED_ALL_CHECKS when every candidate fails a rule", () => {
  const match = selectGeocodeMatch(
    [baseCandidate({ address: { ...baseCandidate().address, country_code: "es" } })],
    baseVenue(),
  );
  assert.equal(match.status, "REJECTED");
  assert.equal(match.reason, "NO_CANDIDATE_PASSED_ALL_CHECKS");
});

// 7. ambiguous candidates fail closed (no manual override).
test("7. selectGeocodeMatch rejects as ambiguous when two distinct real places both pass every check", () => {
  const candidateA = baseCandidate({ lat: "38.7147", lon: "-9.1306", osm_id: 1 });
  const candidateB = baseCandidate({ lat: "38.7200", lon: "-9.1400", osm_id: 2 });
  const match = selectGeocodeMatch([candidateA, candidateB], baseVenue());
  assert.equal(match.status, "REJECTED");
  assert.equal(match.reason, "AMBIGUOUS_MULTIPLE_CANDIDATES_PASSED");
});

test("two candidates that pass but denote the exact same real place (identical lat/lon) are not treated as ambiguous", () => {
  const candidateA = baseCandidate({ osm_id: 1, osm_type: "way" });
  const candidateB = baseCandidate({ osm_id: 2, osm_type: "relation" });
  const match = selectGeocodeMatch([candidateA, candidateB], baseVenue());
  assert.equal(match.status, "ACCEPTED");
});
