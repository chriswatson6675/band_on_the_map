import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchFourvenuesEvents } from "../ingestion/fourvenues/fetch.mjs";

async function loadFixture(name) {
  return readFile(new URL(`../fixtures/fourvenues/${name}`, import.meta.url), "utf8");
}

function fakeFetch(fixtureName, { ok = true, status = 200 } = {}) {
  return async () => ({ ok, status, text: await loadFixture(fixtureName), retrievedAt: "2026-08-26T00:00:00.000Z" });
}

test("fetchFourvenuesEvents returns normalized records with retrieval metadata", async () => {
  const result = await fetchFourvenuesEvents({ slug: "opium-barcelona" }, { fetchImpl: fakeFetch("opium-barcelona-sample.json") });
  assert.equal(result.records.length, 5);
  assert.equal(result.records[0].title, "TYGA CRIB");
  assert.equal(result.retrievedAt, "2026-08-26T00:00:00.000Z");
  assert.ok(result.sourceUrl.includes("slug=opium-barcelona"));
});

test("fetchFourvenuesEvents throws on a non-2xx HTTP response", async () => {
  await assert.rejects(
    () => fetchFourvenuesEvents({ slug: "opium-barcelona" }, { fetchImpl: fakeFetch("opium-barcelona-sample.json", { ok: false, status: 500 }) }),
    /HTTP 500/,
  );
});

test("fetchFourvenuesEvents throws on a malformed body rather than silently returning []", async () => {
  await assert.rejects(
    () => fetchFourvenuesEvents({ slug: "x" }, { fetchImpl: fakeFetch("malformed-response.json") }),
    /no "data" array/,
  );
});

test("fetchFourvenuesEvents returns an empty records array for a genuinely empty organizer", async () => {
  const result = await fetchFourvenuesEvents({ slug: "x" }, { fetchImpl: fakeFetch("empty-response.json") });
  assert.deepEqual(result.records, []);
});
