import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseOverpassResponse } from "../ingestion/venue-discovery/overpass/parse.mjs";

async function loadFixture(name) {
  const raw = await readFile(new URL(`../fixtures/venue-discovery/overpass/${name}`, import.meta.url), "utf8");
  return JSON.parse(raw);
}

test("parses named nodes and ways (via center) with tags preserved", async () => {
  const leads = parseOverpassResponse(await loadFixture("barcelona-sample.json"));
  assert.equal(leads.length, 8);

  const salaTestJazz = leads.find((l) => l.source_record_id === "node/1001");
  assert.equal(salaTestJazz.name, "Sala Test Jazz");
  assert.equal(salaTestJazz.latitude, 41.3825);
  assert.equal(salaTestJazz.longitude, 2.1769);
  assert.deepEqual(salaTestJazz.tags, { name: "Sala Test Jazz", amenity: "music_venue", genre: "jazz" });
  assert.equal(salaTestJazz.source_url, "https://www.openstreetmap.org/node/1001");

  const clubRitme = leads.find((l) => l.source_record_id === "way/2002");
  assert.equal(clubRitme.latitude, 41.3902);
  assert.equal(clubRitme.longitude, 2.1701);
});

test("an element with no tags.name yields name: null, never guessed", async () => {
  const leads = parseOverpassResponse(await loadFixture("barcelona-sample.json"));
  const unnamed = leads.find((l) => l.source_record_id === "node/1007");
  assert.equal(unnamed.name, null);
});

test("an empty elements array is a legitimate empty result", async () => {
  assert.deepEqual(parseOverpassResponse(await loadFixture("empty-response.json")), []);
});

test("a response missing the elements array throws rather than silently returning []", async () => {
  await assert.rejects(async () => parseOverpassResponse(await loadFixture("malformed-response.json")), /Malformed Overpass response/);
});

test("throws for a non-object body", () => {
  assert.throws(() => parseOverpassResponse(null), /Malformed Overpass response/);
  assert.throws(() => parseOverpassResponse("oops"), /Malformed Overpass response/);
});

test("skips an element missing type/id rather than fabricating an identity", () => {
  const leads = parseOverpassResponse({ elements: [{ tags: { name: "No Identity" } }, { type: "node", id: 42, lat: 1, lon: 2, tags: {} }] });
  assert.equal(leads.length, 1);
  assert.equal(leads[0].source_record_id, "node/42");
});

test("an element with neither lat/lon nor center yields null coordinates", () => {
  const leads = parseOverpassResponse({ elements: [{ type: "node", id: 1, tags: { name: "No Coords" } }] });
  assert.equal(leads[0].latitude, null);
  assert.equal(leads[0].longitude, null);
});
