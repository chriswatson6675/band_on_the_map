// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01 —
// OSM_ID_LOOKUP: resolving a London venue's already-recorded `osm_ref`
// (research/venue-estate/london-venue-estate-01.json) directly to that
// exact OSM object's own coordinates/address via Nominatim's `/lookup`
// endpoint, sharing ingestion/geocoding/nominatim.mjs's existing
// rate-limited queue. See that module's own doc comment for why this is a
// direct id lookup, never a fuzzy name/address search.

import assert from "node:assert/strict";
import test from "node:test";
import {
  buildNominatimLookupUrl,
  lookupNominatimOsmIdLive,
  NOMINATIM_USER_AGENT,
  parseOsmRef,
} from "../ingestion/geocoding/nominatim.mjs";

test("parseOsmRef parses node/way/relation refs exactly as retained in london-venue-estate-01.json", () => {
  assert.deepEqual(parseOsmRef("osm-node-10251739583"), { osmType: "node", osmId: "10251739583" });
  assert.deepEqual(parseOsmRef("osm-way-1110282368"), { osmType: "way", osmId: "1110282368" });
  assert.deepEqual(parseOsmRef("osm-relation-2023676"), { osmType: "relation", osmId: "2023676" });
});

test("parseOsmRef throws on anything not matching the exact retained shape — never guesses", () => {
  assert.throws(() => parseOsmRef("node-123"), /not a recognised/);
  assert.throws(() => parseOsmRef("osm-point-123"), /not a recognised/);
  assert.throws(() => parseOsmRef(""), /not a recognised/);
  assert.throws(() => parseOsmRef(undefined), /not a recognised/);
});

test("buildNominatimLookupUrl builds osm_ids=N<id>/W<id>/R<id> with format=jsonv2&addressdetails=1", () => {
  const url = new URL(buildNominatimLookupUrl("node", "10251739583"));
  assert.equal(url.origin + url.pathname, "https://nominatim.openstreetmap.org/lookup");
  assert.equal(url.searchParams.get("osm_ids"), "N10251739583");
  assert.equal(url.searchParams.get("format"), "jsonv2");
  assert.equal(url.searchParams.get("addressdetails"), "1");

  assert.equal(new URL(buildNominatimLookupUrl("way", 1110282368)).searchParams.get("osm_ids"), "W1110282368");
  assert.equal(new URL(buildNominatimLookupUrl("relation", 2023676)).searchParams.get("osm_ids"), "R2023676");
});

test("buildNominatimLookupUrl rejects an unrecognised osmType and an empty osmId", () => {
  assert.throws(() => buildNominatimLookupUrl("point", "1"), /osmType/);
  assert.throws(() => buildNominatimLookupUrl("node", ""), /osmId/);
});

test("lookupNominatimOsmIdLive sends the identifying User-Agent and returns the mocked object's own address/coordinates", async (t) => {
  const originalFetch = globalThis.fetch;
  let capturedUrl = null;
  let capturedHeaders = null;
  globalThis.fetch = async (url, init) => {
    capturedUrl = url;
    capturedHeaders = init.headers;
    return {
      ok: true,
      status: 200,
      headers: { get: (name) => (name === "content-type" ? "application/json" : null) },
      text: async () =>
        JSON.stringify([
          {
            osm_type: "node",
            osm_id: 13162024712,
            lat: "51.5572911",
            lon: "-0.1383822",
            name: "The Dome",
            display_name: "The Dome, 178-180, Junction Road, Upper Holloway, London Borough of Islington, London, N19 5QQ, United Kingdom",
            address: { house_number: "178-180", road: "Junction Road", postcode: "N19 5QQ", country: "United Kingdom", country_code: "gb" },
          },
        ]),
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  const result = await lookupNominatimOsmIdLive("node", "13162024712");

  assert.equal(capturedHeaders["User-Agent"], NOMINATIM_USER_AGENT);
  assert.ok(capturedUrl.includes("osm_ids=N13162024712"));
  assert.equal(result.ok, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].lat, "51.5572911");
  assert.equal(result.candidates[0].address.postcode, "N19 5QQ");
});

test("lookupNominatimOsmIdLive shares the same rate-limited queue as searchNominatimLive — never bypasses it", async (t) => {
  const originalFetch = globalThis.fetch;
  const callTimes = [];
  globalThis.fetch = async () => {
    callTimes.push(Date.now());
    return {
      ok: true,
      status: 200,
      headers: { get: () => "application/json" },
      text: async () => "[]",
    };
  };
  t.after(() => {
    globalThis.fetch = originalFetch;
  });

  await Promise.all([lookupNominatimOsmIdLive("node", "1"), lookupNominatimOsmIdLive("node", "2")]);

  assert.equal(callTimes.length, 2);
  assert.ok(callTimes[1] - callTimes[0] >= 1000, "the two lookups must still be spaced at least ~1s apart");
});
