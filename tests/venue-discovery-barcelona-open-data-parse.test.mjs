import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseBarcelonaOpenData } from "../ingestion/venue-discovery/barcelona-open-data/parse.mjs";

async function loadFixture(name) {
  const raw = await readFile(new URL(`../fixtures/venue-discovery/barcelona-open-data/${name}`, import.meta.url), "utf8");
  return JSON.parse(raw);
}

test("parses records with name, address, coordinates, website, and categories", async () => {
  const leads = parseBarcelonaOpenData(await loadFixture("sample.json"));
  const sala = leads.find((l) => l.source_record_id === "90000001");
  assert.equal(sala.name, "Sala Nota Test");
  assert.equal(sala.address, "C Test, 12, 08001, BARCELONA");
  assert.equal(sala.latitude, 41.383);
  assert.equal(sala.longitude, 2.1739);
  assert.equal(sala.website_url, "http://www.salanotatest.example.cat");
  assert.deepEqual(sala.categories, ["Locals de música en viu"]);
});

test("a record with an empty name yields name: null, never guessed", async () => {
  const leads = parseBarcelonaOpenData(await loadFixture("sample.json"));
  const unnamed = leads.find((l) => l.source_record_id === "90000006");
  assert.equal(unnamed.name, null);
});

test("a record with no addresses/website yields null, never fabricated", async () => {
  const leads = parseBarcelonaOpenData(await loadFixture("sample.json"));
  const tablao = leads.find((l) => l.source_record_id === "90000002");
  assert.equal(tablao.website_url, null);
});

test("an empty array is a legitimate empty result", async () => {
  assert.deepEqual(parseBarcelonaOpenData(await loadFixture("empty-response.json")), []);
});

test("a non-array body throws rather than silently returning []", async () => {
  await assert.rejects(async () => parseBarcelonaOpenData(await loadFixture("malformed-response.json")), /Malformed Barcelona Open Data response/);
});

test("throws for a non-array, non-object body", () => {
  assert.throws(() => parseBarcelonaOpenData(null), /Malformed Barcelona Open Data response/);
});

test("skips a record missing register_id rather than fabricating an identity", () => {
  const leads = parseBarcelonaOpenData([{ name: "No Identity" }, { register_id: 7, name: "Has Identity" }]);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].source_record_id, "7");
});
