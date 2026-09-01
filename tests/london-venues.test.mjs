// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01 —
// venues/london.json's own registry tests, mirroring the existing
// venues/porto.json / venues/berlin.json test conventions.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateVenue, MAP_ELIGIBLE_LOCATION_STATUSES } from "../ingestion/venue/contract.mjs";

async function loadLondonVenues() {
  const registry = JSON.parse(await readFile(new URL("../venues/london.json", import.meta.url), "utf8"));
  return registry.venues;
}

test("venues/london.json contains exactly the 6 live-verified first-tranche venues plus the 2 live-verified second-tranche venues", async () => {
  const venues = await loadLondonVenues();
  assert.equal(venues.length, 8);
  assert.deepEqual(
    venues.map((v) => v.venue_id).sort(),
    [
      "venue-london-100-club",
      "venue-london-downstairs-at-the-dome",
      "venue-london-eventim-apollo",
      "venue-london-jamboree",
      "venue-london-jazz-cafe-posk",
      "venue-london-night-tales-loft",
      "venue-london-the-roxy",
      "venue-london-the-underworld",
    ],
  );
});

test("every venue in venues/london.json passes validateVenue()", async () => {
  const venues = await loadLondonVenues();
  for (const venue of venues) {
    assert.deepEqual(validateVenue(venue), [], `venue ${venue.venue_id} failed validation`);
  }
});

// Every London first-tranche venue was originally discovered as a specific
// OpenStreetMap object; its coordinates come from a direct OSM_ID_LOOKUP
// (ingestion/geocoding/nominatim.mjs's lookupNominatimOsmIdLive()) of that
// exact object, never a fuzzy address search — see fixtures/geocoding/
// nominatim/venue-london-*.json for the retained live response each one
// cites.
test("every venue is GEOCODED via OSM_ID_LOOKUP, map-eligible, and cites its own retained Nominatim lookup fixture", async () => {
  const venues = await loadLondonVenues();
  for (const venue of venues) {
    assert.equal(venue.location_status, "GEOCODED", `${venue.venue_id} must be GEOCODED`);
    assert.ok(MAP_ELIGIBLE_LOCATION_STATUSES.has(venue.location_status));
    assert.equal(venue.coordinate_provenance.method, "OSM_ID_LOOKUP");
    assert.match(venue.coordinate_provenance.osm_ref, /^osm-(node|way|relation)-\d+$/);
    assert.match(venue.coordinate_provenance.retrieved_evidence, /^fixtures\/geocoding\/nominatim\/venue-london-.+\.json$/);
  }
});

test("every venue is country GB, city London, with a real, non-empty municipality (its actual London borough)", async () => {
  const venues = await loadLondonVenues();
  for (const venue of venues) {
    assert.equal(venue.country_code, "GB");
    assert.equal(venue.city, "London");
    assert.ok(typeof venue.municipality === "string" && venue.municipality.trim() !== "", `${venue.venue_id}: municipality must be set`);
    assert.ok(typeof venue.address === "string" && venue.address.trim() !== "", `${venue.venue_id}: address must be non-empty`);
    assert.ok(Array.isArray(venue.evidence) && venue.evidence.length >= 1);
  }
});

// Every venue's own retained Nominatim /lookup fixture must actually exist
// and agree with the coordinates committed to the registry — never a
// coordinate that drifted from its own cited evidence.
test("every venue's committed coordinates match its own retained Nominatim lookup fixture exactly", async () => {
  const venues = await loadLondonVenues();
  for (const venue of venues) {
    const fixture = JSON.parse(
      await readFile(new URL(`../${venue.coordinate_provenance.retrieved_evidence}`, import.meta.url), "utf8"),
    );
    const candidate = fixture.candidates?.[0];
    assert.ok(candidate, `${venue.venue_id}: retained fixture must carry at least one candidate`);
    assert.equal(venue.latitude, Number(candidate.lat), `${venue.venue_id}: latitude must match its own retained fixture`);
    assert.equal(venue.longitude, Number(candidate.lon), `${venue.venue_id}: longitude must match its own retained fixture`);
    assert.equal(candidate.address?.country_code, "gb");
  }
});
