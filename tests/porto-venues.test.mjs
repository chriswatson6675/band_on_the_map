import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateVenue } from "../ingestion/venue/contract.mjs";

async function loadPortoVenues() {
  const registry = JSON.parse(await readFile(new URL("../venues/porto.json", import.meta.url), "utf8"));
  return registry.venues;
}

test("venues/porto.json contains exactly the two evidence-backed venues from this proof", async () => {
  const venues = await loadPortoVenues();
  assert.equal(venues.length, 2);
  assert.deepEqual(
    venues.map((v) => v.venue_id).sort(),
    ["venue-porto-casa-da-musica", "venue-porto-teatro-rivoli"],
  );
});

test("every venue in venues/porto.json passes validateVenue()", async () => {
  const venues = await loadPortoVenues();
  for (const venue of venues) {
    assert.deepEqual(validateVenue(venue), [], `venue ${venue.venue_id} failed validation`);
  }
});

test("both Porto venues are honestly ADDRESS_ONLY — no coordinates were fabricated tonight", async () => {
  const venues = await loadPortoVenues();
  for (const venue of venues) {
    assert.equal(venue.location_status, "ADDRESS_ONLY");
    assert.equal(venue.latitude, null);
    assert.equal(venue.longitude, null);
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
