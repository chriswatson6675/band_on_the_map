import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateVenue } from "../ingestion/venue/contract.mjs";

async function loadPortoVenues() {
  const registry = JSON.parse(await readFile(new URL("../venues/porto.json", import.meta.url), "utf8"));
  return registry.venues;
}

test("venues/porto.json contains exactly the evidence-backed venues known as of PORTUGAL-SECOND-PASS-30-40-VENUE-POPULATION-01", async () => {
  const venues = await loadPortoVenues();
  // PORTUGAL-SECOND-PASS-30-40-VENUE-POPULATION-01 first added two new
  // evidence-backed Porto-city venues (Coliseu Porto Ageas, Hard Club) to
  // the six already admitted as of LISBON-PORTO-VENUE-ESTATE-01, then added
  // five more real venues from newly-activated Greater-Porto municipal
  // sources (Matosinhos: Teatro Municipal de Matosinhos Constantino Nery,
  // Mosteiro de Leça do Balio; Vila do Conde: Cais da Alfândega, Mercado
  // Municipal de Vila do Conde, Igreja da Misericórdia de Vila do Conde),
  // then finally six more real, named Matosinhos venues surfaced by that
  // same cm-matosinhos-agenda-cultural-amp source's own unresolved
  // observations (parks, a library, squares — each with ≥2 real retained
  // events, deliberately excluding bare locality/parish names) — see
  // research/source-investigations/coliseu-ageas-porto-01/,
  // hard-club-porto-02/, cm-matosinhos-agenda-cultural-amp-01/, and
  // agenda-vila-do-conde-01/.
  assert.equal(venues.length, 19);
  assert.deepEqual(
    venues.map((v) => v.venue_id).sort(),
    [
      "venue-matosinhos-biblioteca-municipal-florbela-espanca",
      "venue-matosinhos-jardim-basilio-teles",
      "venue-matosinhos-jardins-do-senhor-do-padrao",
      "venue-matosinhos-mosteiro-de-leca-do-balio",
      "venue-matosinhos-parque-das-varas",
      "venue-matosinhos-praca-da-cidadania",
      "venue-matosinhos-praca-guilhermina-suggia",
      "venue-matosinhos-teatro-municipal-de-matosinhos-constantino-nery",
      "venue-porto-capela-incomum",
      "venue-porto-casa-da-musica",
      "venue-porto-coliseu-porto-ageas",
      "venue-porto-hard-club",
      "venue-porto-hot-five-jazz-blues-club",
      "venue-porto-super-bock-arena-pavilhao-rosa-mota",
      "venue-porto-teatro-campo-alegre",
      "venue-porto-teatro-rivoli",
      "venue-vila-do-conde-cais-da-alfandega",
      "venue-vila-do-conde-igreja-da-misericordia-de-vila-do-conde",
      "venue-vila-do-conde-mercado-municipal-de-vila-do-conde",
    ],
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

// venues/porto.json covers the whole Greater Porto metro area, the same
// way venues/lisbon.json already hosts non-Lisboa-city venues (e.g.
// Odivelas) — city/municipality must always agree with each other and be
// PT, but need not literally be "Porto" once a source outside Porto city
// itself is genuinely activated (PORTUGAL-SECOND-PASS-30-40-VENUE-
// POPULATION-01 added the first two: Matosinhos and Vila do Conde).
test("every venue is country PT, and every venue's city equals its own municipality", async () => {
  const venues = await loadPortoVenues();
  const allowedMunicipalities = new Set(["Porto", "Matosinhos", "Vila do Conde"]);
  for (const venue of venues) {
    assert.equal(venue.country_code, "PT");
    assert.equal(venue.city, venue.municipality, `${venue.venue_id}: city must equal municipality`);
    assert.ok(
      allowedMunicipalities.has(venue.municipality),
      `${venue.venue_id}: unexpected municipality "${venue.municipality}"`,
    );
  }
});
