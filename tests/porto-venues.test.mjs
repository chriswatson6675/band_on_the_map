import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateVenue } from "../ingestion/venue/contract.mjs";

async function loadPortoVenues() {
  const registry = JSON.parse(await readFile(new URL("../venues/porto.json", import.meta.url), "utf8"));
  return registry.venues;
}

test("venues/porto.json contains exactly the three evidence-backed venues known as of VENUE-AUTO-ONBOARDING-01", async () => {
  const venues = await loadPortoVenues();
  assert.equal(venues.length, 3);
  assert.deepEqual(
    venues.map((v) => v.venue_id).sort(),
    ["venue-porto-casa-da-musica", "venue-porto-teatro-campo-alegre", "venue-porto-teatro-rivoli"],
  );
});

test("every venue in venues/porto.json passes validateVenue()", async () => {
  const venues = await loadPortoVenues();
  for (const venue of venues) {
    assert.deepEqual(validateVenue(venue), [], `venue ${venue.venue_id} failed validation`);
  }
});

// VENUE-GEOCODING-01: Casa da Música's official address was deterministically
// geocoded (a specific, single-building amenity=concert_hall OSM match with
// agreeing postcode/house_number/city — see
// fixtures/geocoding/nominatim/venue-porto-casa-da-musica.json) and promoted
// to GEOCODED. Teatro Rivoli's own address query returned only road/square-
// level OSM results (no building-specific match), so it fails-closed and
// honestly remains ADDRESS_ONLY — no coordinate was guessed for it.
test("Casa da Música was deterministically GEOCODED; Teatro Rivoli honestly remains ADDRESS_ONLY (no coordinate guessed)", async () => {
  const venues = await loadPortoVenues();

  const casaDaMusica = venues.find((v) => v.venue_id === "venue-porto-casa-da-musica");
  assert.equal(casaDaMusica.location_status, "GEOCODED");
  assert.equal(typeof casaDaMusica.latitude, "number");
  assert.equal(typeof casaDaMusica.longitude, "number");
  assert.equal(casaDaMusica.coordinate_provenance.method, "GEOCODED_FROM_OFFICIAL_ADDRESS");
  assert.equal(casaDaMusica.coordinate_provenance.query_address, casaDaMusica.address);

  const rivoli = venues.find((v) => v.venue_id === "venue-porto-teatro-rivoli");
  assert.equal(rivoli.location_status, "ADDRESS_ONLY");
  assert.equal(rivoli.latitude, null);
  assert.equal(rivoli.longitude, null);

  for (const venue of venues) {
    assert.ok(typeof venue.address === "string" && venue.address.length > 0);
    assert.ok(Array.isArray(venue.evidence) && venue.evidence.length >= 1);
  }
});

test("every venue is city Porto / municipality Porto and country PT", async () => {
  const venues = await loadPortoVenues();
  for (const venue of venues) {
    assert.equal(venue.country_code, "PT");
    assert.equal(venue.city, "Porto");
    assert.equal(venue.municipality, "Porto");
  }
});
