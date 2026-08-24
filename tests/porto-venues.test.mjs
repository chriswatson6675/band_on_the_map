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
// to GEOCODED via ADDRESS_ONLY_QUERY. VENUE-LOCATION-RESOLUTION-02 later
// legitimately promoted Teatro Rivoli and Teatro Campo Alegre too, via the
// SECOND, stricter NAME_PLUS_ADDRESS_QUERY strategy (their own
// ADDRESS_ONLY_QUERY attempts returned only road/square-level OSM results —
// see fixtures/geocoding/nominatim/venue-porto-teatro-{rivoli,
// campo-alegre}.json, still on record, unchanged) — never a coordinate
// guessed, and never reprocessing Casa da Música, which remains exactly as
// VENUE-GEOCODING-01 left it.
test("Casa da Música, Teatro Rivoli, and Teatro Campo Alegre are all GEOCODED, each with its own honest strategy/provenance on record", async () => {
  const venues = await loadPortoVenues();

  const casaDaMusica = venues.find((v) => v.venue_id === "venue-porto-casa-da-musica");
  assert.equal(casaDaMusica.location_status, "GEOCODED");
  assert.equal(typeof casaDaMusica.latitude, "number");
  assert.equal(typeof casaDaMusica.longitude, "number");
  assert.equal(casaDaMusica.latitude, 41.1589025);
  assert.equal(casaDaMusica.longitude, -8.6307748);
  assert.equal(casaDaMusica.coordinate_provenance.method, "GEOCODED_FROM_OFFICIAL_ADDRESS");
  assert.equal(casaDaMusica.coordinate_provenance.query_address, casaDaMusica.address);
  assert.notEqual(casaDaMusica.coordinate_provenance.query_strategy, "NAME_PLUS_ADDRESS_QUERY");

  const rivoli = venues.find((v) => v.venue_id === "venue-porto-teatro-rivoli");
  assert.equal(rivoli.location_status, "GEOCODED");
  assert.equal(typeof rivoli.latitude, "number");
  assert.equal(typeof rivoli.longitude, "number");
  assert.equal(rivoli.coordinate_provenance.query_strategy, "NAME_PLUS_ADDRESS_QUERY");
  assert.equal(rivoli.coordinate_provenance.query_name, "Teatro Rivoli");

  const campoAlegre = venues.find((v) => v.venue_id === "venue-porto-teatro-campo-alegre");
  assert.equal(campoAlegre.location_status, "GEOCODED");
  assert.equal(typeof campoAlegre.latitude, "number");
  assert.equal(typeof campoAlegre.longitude, "number");
  assert.equal(campoAlegre.coordinate_provenance.query_strategy, "NAME_PLUS_ADDRESS_QUERY");
  assert.equal(campoAlegre.coordinate_provenance.query_name, "Teatro Campo Alegre");

  for (const venue of venues) {
    assert.ok(typeof venue.address === "string" && venue.address.length > 0);
    assert.ok(Array.isArray(venue.evidence) && venue.evidence.length >= 1);
    assert.deepEqual(validateVenue(venue), []);
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
