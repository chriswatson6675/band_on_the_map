import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CONCERTO_TAG_TITLE,
  FETCH_ENDPOINT,
  FETCH_HEADERS,
  FREE_ADMISSION_TAG_TITLE,
  buildFetchRequestBody,
  filterConcertoRecords,
  parseFetchResponse,
  resolveTagTitle,
} from "../ingestion/agenda-vila-do-conde/client.mjs";

async function loadFixture(name) {
  return readFile(new URL(`../fixtures/agenda-vila-do-conde/${name}`, import.meta.url), "utf8");
}

// 1. request construction

test("FETCH_ENDPOINT is the real, discovered, public repeater API host", () => {
  assert.equal(FETCH_ENDPOINT, "https://repeater.bondlayer.com/fetch");
});

test("FETCH_HEADERS carries only the retained Content-Type header, no invented auth", () => {
  assert.deepEqual(FETCH_HEADERS, { "Content-Type": "application/json" });
});

test("buildFetchRequestBody builds the exact retained page-1 request shape", async () => {
  const expected = JSON.parse(
    await readFile(
      new URL(
        "../research/source-investigations/agenda-vila-do-conde-01/evidence/request-repeater-fetch.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(buildFetchRequestBody({ page: 1 }), expected);
});

test("buildFetchRequestBody builds the exact retained page-2 request shape", async () => {
  const expected = JSON.parse(
    await readFile(
      new URL(
        "../research/source-investigations/agenda-vila-do-conde-01/evidence/request-repeater-fetch-page2.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  assert.deepEqual(buildFetchRequestBody({ page: 2 }), expected);
});

test("buildFetchRequestBody defaults page to 1 when omitted", () => {
  assert.equal(buildFetchRequestBody().repeater.page, 1);
});

test("buildFetchRequestBody requires a positive integer page, never guesses", () => {
  assert.throws(() => buildFetchRequestBody({ page: 0 }), /positive integer page/);
  assert.throws(() => buildFetchRequestBody({ page: -1 }), /positive integer page/);
  assert.throws(() => buildFetchRequestBody({ page: 1.5 }), /positive integer page/);
  assert.throws(() => buildFetchRequestBody({ page: "1" }), /positive integer page/);
});

test("buildFetchRequestBody returns a fresh object each call (no shared mutable state)", () => {
  const first = buildFetchRequestBody({ page: 1 });
  first.repeater.page = 999;
  const second = buildFetchRequestBody({ page: 1 });
  assert.equal(second.repeater.page, 1);
});

// 2. response parsing against the real retained fixtures

test("parseFetchResponse parses the real retained page-1 fixture", async () => {
  const body = await loadFixture("repeater-fetch-page1.json");
  const { total, totalPages, page, items, related } = parseFetchResponse(body);
  assert.equal(total, 15);
  assert.equal(totalPages, 2);
  assert.equal(page, 1);
  assert.equal(items.length, 15);
  assert.ok(typeof related === "object" && related !== null);
});

test("parseFetchResponse parses the real retained page-2 fixture", async () => {
  const body = await loadFixture("repeater-fetch-page2.json");
  const { totalPages, page, items } = parseFetchResponse(body);
  assert.equal(totalPages, 2);
  assert.equal(page, 2);
  assert.equal(items.length, 14);
});

test("parseFetchResponse throws on malformed (non-JSON) input, never guesses", () => {
  assert.throws(() => parseFetchResponse("{not valid json"), /not valid JSON/);
});

test("parseFetchResponse throws on a non-empty-string requirement", () => {
  assert.throws(() => parseFetchResponse(""), /non-empty response body string/);
  assert.throws(() => parseFetchResponse(null), /non-empty response body string/);
});

test("parseFetchResponse throws when the JSON body has no well-formed items/related/paging shape", () => {
  assert.throws(() => parseFetchResponse('{"related":{},"total":1,"totalPages":1,"page":1}'), /"items" array/);
  assert.throws(() => parseFetchResponse('{"items":[],"total":1,"totalPages":1,"page":1}'), /"related" object/);
  assert.throws(() => parseFetchResponse('{"items":[],"related":{}}'), /numeric "total"\/"totalPages"\/"page"/);
  assert.throws(() => parseFetchResponse("[]"), /did not parse to a JSON object/);
});

test("parseFetchResponse never throws on a genuinely empty items page", () => {
  const { items } = parseFetchResponse('{"items":[],"related":{},"total":0,"totalPages":1,"page":1}');
  assert.deepEqual(items, []);
});

// 3. tag-title resolution via the response's own `related` map

test("resolveTagTitle resolves a real Concerto-tagged record's ref_tags_1o_nivel via the response's own related map", async () => {
  const { items, related } = parseFetchResponse(await loadFixture("repeater-fetch-page1.json"));
  const ivandro = items.find((it) => it._slug.all === "ivandro-1783090101082");
  assert.equal(resolveTagTitle(ivandro.ref_tags_1o_nivel, related), "Concerto");
  assert.equal(resolveTagTitle(ivandro.ref_tags_2o_nivel, related), "Entrada Gratuita");
});

test("resolveTagTitle returns null for a missing/unresolved/null id, never guesses", async () => {
  const { related } = parseFetchResponse(await loadFixture("repeater-fetch-page1.json"));
  assert.equal(resolveTagTitle(null, related), null);
  assert.equal(resolveTagTitle("", related), null);
  assert.equal(resolveTagTitle("not-a-real-id", related), null);
  assert.equal(resolveTagTitle("swG7HKMEvjxvs6Dg", {}), null);
});

test("CONCERTO_TAG_TITLE / FREE_ADMISSION_TAG_TITLE are the exact literal source-provided taxonomy labels", () => {
  assert.equal(CONCERTO_TAG_TITLE, "Concerto");
  assert.equal(FREE_ADMISSION_TAG_TITLE, "Entrada Gratuita");
});

// 4. the Concerto-tag filter — the decisive music-scope mechanism

test("filterConcertoRecords isolates exactly the 3 known Concerto-tagged records on page 1", async () => {
  const { items, related } = parseFetchResponse(await loadFixture("repeater-fetch-page1.json"));
  const concerto = filterConcertoRecords(items, related);
  assert.deepEqual(
    concerto.map((r) => r._slug.all).sort(),
    ["ivandro-1783090101082", "roda-de-samba-1783090298021", "smells-like-90s"].sort(),
  );
});

test("filterConcertoRecords isolates exactly the 1 known Concerto-tagged record on page 2", async () => {
  const { items, related } = parseFetchResponse(await loadFixture("repeater-fetch-page2.json"));
  const concerto = filterConcertoRecords(items, related);
  assert.deepEqual(
    concerto.map((r) => r._title.all),
    ["Vox Cordis | Itinerários"],
  );
});

test("filterConcertoRecords across both real retained pages yields exactly the 4 known Concerto records, and excludes every non-music record", async () => {
  const p1 = parseFetchResponse(await loadFixture("repeater-fetch-page1.json"));
  const p2 = parseFetchResponse(await loadFixture("repeater-fetch-page2.json"));
  const concerto1 = filterConcertoRecords(p1.items, p1.related);
  const concerto2 = filterConcertoRecords(p2.items, p2.related);
  const allConcertoTitles = [...concerto1, ...concerto2].map((r) => r._title.all);

  assert.deepEqual(allConcertoTitles.sort(), ["Ivandro", "Roda de Samba", "Smells Like 90´s", "Vox Cordis | Itinerários"].sort());

  // Excludes non-music records genuinely present in the same retained
  // sample under other real, controlled-vocabulary tags (Exposição,
  // Cinema, Comunidade, Workshop, Festa, Dança, Provas — never merely
  // "not literally named Concerto in the title").
  const allItems = [...p1.items, ...p2.items];
  const nonConcertoTitles = new Set(
    allItems.filter((it) => !allConcertoTitles.includes(it._title.all)).map((it) => it._title.all),
  );
  assert.ok(nonConcertoTitles.size > 0);
  for (const title of allConcertoTitles) {
    assert.equal(nonConcertoTitles.has(title), false);
  }
});

test("filterConcertoRecords never includes a record whose tag merely mentions music-adjacent words in its title/description", async () => {
  const p2 = parseFetchResponse(await loadFixture("repeater-fetch-page2.json"));
  const nonConcerto = p2.items.filter((it) => resolveTagTitle(it.ref_tags_1o_nivel, p2.related) !== "Concerto");
  assert.ok(nonConcerto.length > 0, "expected at least one real non-Concerto record in the retained sample");
  const filtered = filterConcertoRecords(p2.items, p2.related);
  for (const record of nonConcerto) {
    assert.equal(filtered.includes(record), false);
  }
});

// 5. deterministic rerun

test("parsing the same retained fixture twice is deterministic", async () => {
  const body = await loadFixture("repeater-fetch-page1.json");
  assert.deepEqual(parseFetchResponse(body), parseFetchResponse(body));
});
