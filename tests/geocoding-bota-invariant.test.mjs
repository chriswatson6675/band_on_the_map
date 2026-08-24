import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildNominatimSearchUrl } from "../ingestion/geocoding/nominatim.mjs";
import { selectGeocodeMatch } from "../ingestion/geocoding/match-address.mjs";

// BOTA invariant (VENUE-GEOCODING-01 critical requirement): BOTA's source
// ICS carries a known-bad GEO value (40.720756;-74.000761 — resolves to
// the United States, not Lisbon; see
// ingestion/bota/observation-adapter.mjs's `ics_geo_untrusted` field).
// This must remain completely unrelated to canonical Venue geocoding: the
// BOTA geocoder query is derived SOLELY from venues/lisbon.json's own
// canonical official address, never from any ICS-derived field.

const BAD_ICS_LATITUDE = 40.720756;
const BAD_ICS_LONGITUDE = -74.000761;

test("BOTA's canonical address in venues/lisbon.json contains no trace of the bad ICS GEO numbers", async () => {
  const registry = JSON.parse(await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"));
  const bota = registry.venues.find((v) => v.venue_id === "venue-lisboa-bota-anjos");
  assert.ok(bota, "expected the BOTA Anjos venue to exist");
  assert.ok(!bota.address.includes("40.720756"));
  assert.ok(!bota.address.includes("74.000761"));
});

test("the Nominatim query built for BOTA's address never contains the bad ICS GEO numbers", async () => {
  const registry = JSON.parse(await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"));
  const bota = registry.venues.find((v) => v.venue_id === "venue-lisboa-bota-anjos");

  const url = buildNominatimSearchUrl(bota.address);
  assert.ok(!url.includes("40.720756"));
  assert.ok(!url.includes("74.000761"));

  // And the query is built from exactly the canonical address string —
  // nothing else is concatenated in.
  const decodedQuery = new URL(url).searchParams.get("q");
  assert.equal(decodedQuery, bota.address);
});

test("neither ingestion/geocoding/nominatim.mjs, match-address.mjs, nor run.mjs ever reference the ICS-derived untrusted field or Observation source_fields at all", async () => {
  const files = [
    new URL("../ingestion/geocoding/nominatim.mjs", import.meta.url),
    new URL("../ingestion/geocoding/match-address.mjs", import.meta.url),
    new URL("../ingestion/geocoding/run.mjs", import.meta.url),
  ];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    assert.ok(!text.includes("ics_geo_untrusted"), `${file} must never reference ics_geo_untrusted`);
    assert.ok(!text.includes("source_fields"), `${file} must never read Observation.source_fields`);
    assert.ok(!text.includes("location_text"), `${file} must never read Observation.location_text`);
  }
});

// If BOTA's own official-address query were ever (now or later) accepted,
// its coordinates must not coincide with the bad ICS placeholder.
test("a plausible, correctly-Lisbon-located accepted geocode candidate for BOTA is NOT equal to the bad ICS GEO values", () => {
  const venue = {
    canonical_name: "BOTA Anjos",
    city: "Lisboa",
    municipality: "Lisboa",
    address: "Largo de Santa Bárbara, 3D, 1150-287 Lisboa",
  };
  const plausibleLisbonCandidate = {
    lat: "38.7267",
    lon: "-9.1347",
    class: "amenity",
    type: "bar",
    addresstype: "amenity",
    osm_type: "way",
    osm_id: 987654,
    display_name: "BOTA, Largo de Santa Bárbara, Lisboa, Portugal",
    address: { city: "Lisboa", postcode: "1150-287", house_number: "3D", country_code: "pt" },
  };

  const match = selectGeocodeMatch([plausibleLisbonCandidate], venue);
  assert.equal(match.status, "ACCEPTED");
  assert.notEqual(Number(match.candidate.lat), BAD_ICS_LATITUDE);
  assert.notEqual(Number(match.candidate.lon), BAD_ICS_LONGITUDE);
  // Sanity: the accepted coordinate is genuinely in Lisbon, not the US.
  assert.ok(Number(match.candidate.lat) > 38 && Number(match.candidate.lat) < 39);
  assert.ok(Number(match.candidate.lon) > -10 && Number(match.candidate.lon) < -8);
});

test("if venues/lisbon.json's BOTA entry has been geocoded, its actual coordinates are not the bad ICS values", async () => {
  const registry = JSON.parse(await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"));
  const bota = registry.venues.find((v) => v.venue_id === "venue-lisboa-bota-anjos");
  if (bota.location_status === "GEOCODED") {
    assert.notEqual(bota.latitude, BAD_ICS_LATITUDE);
    assert.notEqual(bota.longitude, BAD_ICS_LONGITUDE);
    assert.equal(bota.coordinate_provenance.method, "GEOCODED_FROM_OFFICIAL_ADDRESS");
    assert.equal(bota.coordinate_provenance.query_address, bota.address);
  }
});
