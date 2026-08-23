import assert from "node:assert/strict";
import test from "node:test";
import { createVenue, createVenueId, validateVenue } from "../ingestion/venue/contract.mjs";

test("createVenueId is deterministic: same inputs always produce the same ID", () => {
  const a = createVenueId("Cineteatro Capitólio – Teatro Raul Solnado", "Lisboa");
  const b = createVenueId("Cineteatro Capitólio – Teatro Raul Solnado", "Lisboa");
  assert.equal(a, b);
  assert.equal(a, "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado");
});

test("createVenueId produces different IDs for different names/cities", () => {
  const capitolio = createVenueId("Cineteatro Capitólio – Teatro Raul Solnado", "Lisboa");
  const graca = createVenueId("Igreja e Convento da Graça", "Lisboa");
  const capitolioOtherCity = createVenueId("Cineteatro Capitólio – Teatro Raul Solnado", "Porto");
  assert.notEqual(capitolio, graca);
  assert.notEqual(capitolio, capitolioOtherCity);
});

test("createVenue defaults venue_id to createVenueId(canonical_name, city)", () => {
  const venue = createVenue({
    canonical_name: "Example Venue",
    city: "Lisboa",
    country_code: "PT",
    location_status: "UNRESOLVED",
  });
  assert.equal(venue.venue_id, createVenueId("Example Venue", "Lisboa"));
});

test("coordinates must be within valid numeric latitude/longitude ranges", () => {
  const base = {
    canonical_name: "Example Venue",
    city: "Lisboa",
    location_status: "CONFIRMED",
    evidence: [{ url: "https://example.test", note: "evidence" }],
  };

  assert.throws(() => createVenue({ ...base, latitude: 91, longitude: -9 }), /latitude/);
  assert.throws(() => createVenue({ ...base, latitude: 38, longitude: 181 }), /longitude/);
  assert.throws(() => createVenue({ ...base, latitude: "38", longitude: -9 }), /latitude/);
  assert.doesNotThrow(() => createVenue({ ...base, latitude: 38.71, longitude: -9.14 }));
});

test("an UNRESOLVED venue must not carry coordinates (no fabricated pins)", () => {
  const errors = validateVenue({
    venue_id: "venue-lisboa-example",
    canonical_name: "Example",
    location_status: "UNRESOLVED",
    latitude: 38.7,
    longitude: -9.1,
    evidence: [],
  });
  assert.ok(errors.some((e) => e.includes("UNRESOLVED")));
});

test("createVenue with location_status UNRESOLVED and no coordinates is valid", () => {
  assert.doesNotThrow(() =>
    createVenue({
      canonical_name: "Some Unresolved Place",
      city: "Lisboa",
      location_status: "UNRESOLVED",
    }),
  );
});

test("a CONFIRMED venue must carry coordinates; ADDRESS_ONLY may omit them", () => {
  assert.throws(
    () =>
      createVenue({
        canonical_name: "Example",
        city: "Lisboa",
        location_status: "CONFIRMED",
        address: "Somewhere",
      }),
    /CONFIRMED venue must carry coordinates/,
  );

  assert.doesNotThrow(() =>
    createVenue({
      canonical_name: "Example",
      city: "Lisboa",
      location_status: "ADDRESS_ONLY",
      address: "Somewhere",
    }),
  );
});

test("coordinates without at least one evidence entry are rejected", () => {
  const errors = validateVenue({
    venue_id: "venue-lisboa-example",
    canonical_name: "Example",
    location_status: "CONFIRMED",
    latitude: 38.7,
    longitude: -9.1,
    evidence: [],
  });
  assert.ok(errors.some((e) => e.includes("evidence")));
});

test("latitude/longitude must both be present or both be null, never just one", () => {
  const errors = validateVenue({
    venue_id: "venue-lisboa-example",
    canonical_name: "Example",
    location_status: "ADDRESS_ONLY",
    latitude: 38.7,
    longitude: null,
    evidence: [],
  });
  assert.ok(errors.some((e) => e.includes("both")));
});
