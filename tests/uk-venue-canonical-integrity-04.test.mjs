// BEATMAPPED-UK-VENUE-CANONICAL-INTEGRITY-04 — regression tests for two
// pre-existing canonical-integrity defects found by the preceding
// source-discovery package:
//
//   1. approximateNation() classified Liverpool, Birkenhead and the whole
//      Wirral as Wales, Bristol/Weston-super-Mare as Wales, Dumfries &
//      Galloway as England, and Berwick-upon-Tweed as Scotland.
//   2. 64 venues in venues/uk.json failed validateVenue() with "a GEOCODED
//      venue must carry a non-empty address", because the contract keyed
//      its addressless-geocode exemption on a METHOD NAME rather than on
//      whether the geocode was actually anchored on an address.
//
// Neither defect is repaired by editing venue rows: no address is invented
// and no canonical venue record is touched by this package at all.

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import { validateVenue, wasAnchoredOnAnAddress } from "../ingestion/venue/contract.mjs";
import { approximateNation } from "../ingestion/uk-national-discovery/coverage-plan.mjs";

const ROOT = process.cwd();
const ukVenues = JSON.parse(fs.readFileSync(path.join(ROOT, "venues", "uk.json"), "utf8")).venues;
const census = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "research", "programme-acquisition", "uk-national-01", "venue-source-census.json"),
    "utf8",
  ),
);
const geographic = JSON.parse(
  fs.readFileSync(
    path.join(ROOT, "research", "programme-acquisition", "uk-national-01", "geographic-coverage.json"),
    "utf8",
  ),
);

// --- the postcode arbiter -------------------------------------------------
// A venue's own postcode decides its nation, independently of any
// coordinate rule. Only areas (and, where an area straddles the border, only
// the districts) whose nation is unambiguous are used; everything else is
// left unarbitrated rather than guessed.
const WELSH_AREAS = new Set(["CF", "LL", "NP", "SA", "LD"]);
const SCOTTISH_AREAS = new Set(["AB", "DD", "DG", "EH", "FK", "G", "HS", "IV", "KA", "KW", "KY", "ML", "PA", "PH", "ZE"]);
const ENGLISH_AREAS = new Set([
  "CA", "NE", "DH", "SR", "DL", "LA", "YO", "TS", "BD", "L", "WA", "BS", "HR",
  "GL", "PR", "M", "ST", "TF", "WV", "DY", "B", "BA", "TA", "EX", "CW",
]);

function postcodeOf(venue) {
  const tags = (venue.evidence ?? []).find((e) => e.kind === "DISCOVERY_OSM_TAGS");
  if (tags?.note) {
    const match = tags.note.match(/OSM_TAGS=(\{.*\})\s*$/s);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        if (parsed["addr:postcode"]) return String(parsed["addr:postcode"]).toUpperCase();
      } catch {
        /* an unparseable tag blob simply yields no arbiter */
      }
    }
  }
  const displayName = venue.coordinate_provenance?.result_display_name ?? "";
  const fromDisplay = displayName.match(/\b([A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2})\b/);
  return fromDisplay ? fromDisplay[1].toUpperCase() : null;
}

function nationFromPostcode(postcode) {
  if (!postcode) return null;
  const match = postcode.match(/^([A-Z]{1,2})(\d{1,2})/);
  if (!match) return null;
  const area = match[1];
  const district = Number.parseInt(match[2], 10);
  // TD spans the border: TD15 is Berwick-upon-Tweed, in England.
  if (area === "TD") return district === 15 ? "England" : "Scotland";
  // CH5-CH8 are Flintshire (Wales); the rest is Chester and the Wirral.
  if (area === "CH") return district >= 5 && district <= 8 ? "Wales" : "England";
  // SY15-SY25 are Montgomeryshire/Ceredigion; the rest is Shropshire.
  if (area === "SY") return district >= 15 && district <= 25 ? "Wales" : "England";
  if (area === "BT") return "Northern Ireland";
  if (WELSH_AREAS.has(area)) return "Wales";
  if (SCOTTISH_AREAS.has(area)) return "Scotland";
  if (ENGLISH_AREAS.has(area)) return "England";
  return null;
}

// --- 1 & 2: the two venues named in the defect report ---------------------

test("Liverpool is classified as England, not Wales", () => {
  assert.equal(approximateNation(53.4084, -2.9916), "England");
  const liverpool = census.venues.filter((v) => v.city === "Liverpool");
  assert.ok(liverpool.length > 0, "expected Liverpool venues in the census");
  for (const venue of liverpool) {
    assert.notEqual(venue.nation, "Wales", `${venue.venue_id} is in Liverpool and must not be Wales`);
  }
});

test("Birkenhead is classified as England, not Wales", () => {
  assert.equal(approximateNation(53.3933, -3.014), "England");
  const birkenhead = census.venues.filter((v) => v.city === "Birkenhead");
  assert.ok(birkenhead.length > 0, "expected Birkenhead venues in the census");
  for (const venue of birkenhead) {
    assert.notEqual(venue.nation, "Wales", `${venue.venue_id} is in Birkenhead and must not be Wales`);
  }
});

// --- 3: the root-cause rule no longer misclassifies this way --------------

test("approximateNation agrees with the postcode of every arbitrable UK venue", () => {
  let arbitrated = 0;
  const disagreements = [];
  for (const venue of ukVenues) {
    const truth = nationFromPostcode(postcodeOf(venue));
    if (!truth) continue;
    const got = approximateNation(venue.latitude, venue.longitude);
    if (got === "UNKNOWN") continue;
    arbitrated += 1;
    if (got !== truth) {
      disagreements.push(`${venue.venue_id} (${venue.city}): got ${got}, postcode says ${truth}`);
    }
  }
  // Guards against the arbiter silently becoming a no-op and the assertion
  // below passing vacuously.
  assert.ok(arbitrated >= 900, `expected a large arbitrated sample, got ${arbitrated}`);
  assert.deepEqual(disagreements, [], "every arbitrable venue must land in the nation its own postcode implies");
});

test("the estuary and border cases the old straight-line rule got wrong", () => {
  const cases = [
    // The reported defect: east of the Dee, so England, not Wales.
    ["Liverpool", 53.4084, -2.9916, "England"],
    ["Birkenhead", 53.3933, -3.014, "England"],
    ["West Kirby (Wirral)", 53.3725, -3.1841, "England"],
    // South of the Severn, so England despite being west of Cardiff.
    ["Weston-super-Mare", 51.3458, -2.9773, "England"],
    ["Bristol", 51.4545, -2.5879, "England"],
    ["Backwell", 51.4353, -2.8524, "England"],
    // Welsh side of both estuaries stays Welsh.
    ["Cardiff", 51.4816, -3.1791, "Wales"],
    ["Rhyl", 53.3213, -3.4886, "Wales"],
    ["Prestatyn", 53.3325, -3.4083, "Wales"],
    // The land border, both sides, at several latitudes.
    ["Chester", 53.1934, -2.8931, "England"],
    ["Wrexham", 53.0466, -2.9925, "Wales"],
    ["Mold", 53.1667, -3.1333, "Wales"],
    ["Weston Rhyn", 52.9009, -3.0551, "England"],
    ["Shrewsbury", 52.7069, -2.7527, "England"],
    ["Welshpool", 52.6595, -3.1482, "Wales"],
    ["Ludlow", 52.3681, -2.7211, "England"],
    ["Hereford", 52.0567, -2.716, "England"],
    ["Monmouth", 51.8118, -2.716, "Wales"],
    ["Chepstow", 51.6418, -2.6754, "Wales"],
    ["Newport", 51.5842, -2.9977, "Wales"],
    // England/Scotland: the old rule put Dumfries & Galloway in England
    // and Berwick-upon-Tweed in Scotland.
    ["Berwick-upon-Tweed", 55.7709, -2.0054, "England"],
    ["Alnwick", 55.4125, -1.7032, "England"],
    ["Dumfries", 55.069, -3.609, "Scotland"],
    ["Lockerbie", 55.1226, -3.3553, "Scotland"],
    ["Kirkcudbright", 54.8352, -4.0559, "Scotland"],
    // ... without dragging the Cumbrian coast across the Solway with it.
    ["Workington", 54.643, -3.543, "England"],
    ["Carlisle", 54.8951, -2.9441, "England"],
    // Unchanged anchors.
    ["London", 51.5074, -0.1278, "England"],
    ["Manchester", 53.4808, -2.2426, "England"],
    ["Edinburgh", 55.9533, -3.1883, "Scotland"],
    ["Belfast", 54.5973, -5.9301, "Northern Ireland"],
    ["Swansea", 51.6214, -3.9436, "Wales"],
    ["Aberystwyth", 52.414, -4.081, "Wales"],
  ];
  const wrong = cases
    .filter(([, lat, lon, expected]) => approximateNation(lat, lon) !== expected)
    .map(([name, lat, lon, expected]) => `${name}: got ${approximateNation(lat, lon)}, expected ${expected}`);
  assert.deepEqual(wrong, []);
});

test("approximateNation still returns UNKNOWN for non-finite input, never a guess", () => {
  assert.equal(approximateNation(null, null), "UNKNOWN");
  assert.equal(approximateNation(Number.NaN, 1), "UNKNOWN");
  assert.equal(approximateNation(53.4, undefined), "UNKNOWN");
});

// --- 4: the canonical estate satisfies its own contract -------------------

test("every canonical UK venue satisfies the Venue contract", () => {
  const failures = [];
  for (const venue of ukVenues) {
    const errors = validateVenue(venue);
    if (errors.length > 0) failures.push(`${venue.venue_id}: ${errors.join("; ")}`);
  }
  assert.deepEqual(failures, [], "venues/uk.json must validate cleanly");
});

// --- 5: the repair invented nothing ---------------------------------------

test("the 64 addressless GEOCODED venues still have a null address — none was fabricated", () => {
  const addressless = ukVenues.filter(
    (v) =>
      v.location_status === "GEOCODED" &&
      v.coordinate_provenance?.method === "STRUCTURED_POI_NAME_CITY_MATCH" &&
      !wasAnchoredOnAnAddress(v.coordinate_provenance),
  );
  assert.equal(addressless.length, 64, "the cohort this package explains must still be exactly 64 venues");
  for (const venue of addressless) {
    assert.equal(venue.address, null, `${venue.venue_id}: an address was invented to satisfy the contract`);
    assert.deepEqual(validateVenue(venue), [], `${venue.venue_id} must now validate`);
    assert.equal(venue.coordinate_provenance.query_address, null);
  }
});

test("a geocode that WAS anchored on an address must still carry one — the rule did not go slack", () => {
  const anchored = ukVenues.filter((v) => wasAnchoredOnAnAddress(v.coordinate_provenance));
  assert.ok(anchored.length > 0, "expected some address-anchored venues");
  for (const venue of anchored) {
    assert.ok(
      typeof venue.address === "string" && venue.address.trim() !== "",
      `${venue.venue_id}: anchored on an address but has none`,
    );
  }
  // Losing the address of an anchored venue is still a validation failure.
  const probe = { ...anchored[0], address: null };
  assert.deepEqual(validateVenue(probe), ["a GEOCODED venue must carry a non-empty address"]);
});

test("wasAnchoredOnAnAddress is false for absent, malformed or blank anchors", () => {
  assert.equal(wasAnchoredOnAnAddress(undefined), false);
  assert.equal(wasAnchoredOnAnAddress(null), false);
  assert.equal(wasAnchoredOnAnAddress({}), false);
  assert.equal(wasAnchoredOnAnAddress({ query_address: null }), false);
  assert.equal(wasAnchoredOnAnAddress({ query_address: "   " }), false);
  assert.equal(wasAnchoredOnAnAddress({ query_address: "1 Example Street" }), true);
});

// --- 6: the corrected artifact is deterministically reproducible ----------

test("every census nation is exactly what approximateNation returns for that venue", () => {
  const byId = new Map(ukVenues.map((v) => [v.venue_id, v]));
  const wrong = [];
  for (const row of census.venues) {
    const venue = byId.get(row.venue_id);
    assert.ok(venue, `census row has no canonical venue: ${row.venue_id}`);
    const expected =
      Number.isFinite(venue.latitude) && Number.isFinite(venue.longitude)
        ? approximateNation(venue.latitude, venue.longitude)
        : "UNKNOWN";
    if (row.nation !== expected) wrong.push(`${row.venue_id}: artifact says ${row.nation}, rule says ${expected}`);
  }
  assert.deepEqual(wrong, [], "the artifact must be reproducible from the rule");
});

test("geographic-coverage by_nation is the census aggregated, and still balances", () => {
  const expected = new Map();
  for (const row of census.venues) {
    if (!expected.has(row.nation)) {
      expected.set(row.nation, { venues_with_listings: 0, listings: 0, venue_only: 0 });
    }
    const bucket = expected.get(row.nation);
    if (row.proven_event_count > 0) {
      bucket.venues_with_listings += 1;
      bucket.listings += row.proven_event_count;
    } else {
      bucket.venue_only += 1;
    }
  }
  assert.deepEqual(geographic.by_nation, Object.fromEntries(expected));
  const totalVenues = Object.values(geographic.by_nation).reduce(
    (sum, b) => sum + b.venues_with_listings + b.venue_only,
    0,
  );
  assert.equal(totalVenues, census.venues.length);
  assert.equal(totalVenues, census.total_venues);
});

// --- 7: nothing unrelated moved -------------------------------------------

test("the correction changed no canonical venue record and lost no census information", () => {
  // nation is a reporting field on the research artifact only; it is
  // deliberately never written onto a canonical Venue.
  assert.ok(
    ukVenues.every((v) => v.nation === undefined),
    "approximateNation must never be written into venues/uk.json",
  );
  // The census still explains every venue, and still carries the 30
  // SKIPPED_SHARED_WEBSITE rows, which a full regeneration would drop
  // because that run's checkpoints were never committed.
  assert.equal(census.total_venues, ukVenues.length);
  assert.equal(census.unexplained, 0);
  assert.equal(census.venues.length, ukVenues.length);
  assert.deepEqual(census.state_counts, {
    OFFICIAL_SITE_FOUND_NO_PROGRAMME: 1404,
    NO_SOURCE_FOUND: 2014,
    REVIEW_REQUIRED: 30,
    OFFICIAL_PROGRAMME_FOUND: 89,
  });
  // The preceding package's 79 website-evidence entries are untouched.
  const withDiscoveryEvidence = ukVenues.filter((v) =>
    (v.evidence ?? []).some(
      (e) => e.kind === "OFFICIAL_VENUE_WEBSITE" && typeof e.note === "string" && e.note.includes("SOURCE-DISCOVERY-03"),
    ),
  );
  assert.equal(withDiscoveryEvidence.length, 79);
});
