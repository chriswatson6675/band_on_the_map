import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fetchAllEvents } from "../ingestion/events-calendar-api/fetch-all.mjs";

async function loadFixture(path) {
  return readFile(new URL(`../fixtures/${path}`, import.meta.url), "utf8");
}

const CCB_CONFIG = {
  source_id: "ccb-centro-cultural-belem",
  baseUrl: "https://www.ccb.pt",
  category: "musica",
  perPage: 3,
  maxPages: 20,
};

const CCB_PAGE_1_URL = "https://www.ccb.pt/wp-json/tribe/events/v1/events/?categories=musica&per_page=3";
const CCB_PAGE_2_URL = "https://www.ccb.pt/wp-json/tribe/events/v1/events/?page=2&per_page=3&categories=musica";

/** A deterministic, offline, in-memory fetchPage keyed by exact URL. */
function fixtureFetchPage(map) {
  return async (url) => {
    if (!(url in map)) {
      throw new Error(`fixtureFetchPage: no fixture registered for ${url}`);
    }
    return map[url];
  };
}

test("fetchAllEvents follows real CCB pagination across 2 pages, deduplicated, until next_rest_url is null", async () => {
  const page1 = await loadFixture("ccb/events-page-1.json");
  const page2 = await loadFixture("ccb/events-page-2.json");

  const fetchPage = fixtureFetchPage({
    [CCB_PAGE_1_URL]: { ok: true, status: 200, text: page1, url: CCB_PAGE_1_URL },
    "https://www.ccb.pt/wp-json/tribe/events/v1/events/?page=2&per_page=3&categories=musica": {
      ok: true,
      status: 200,
      text: page2,
      url: CCB_PAGE_2_URL,
    },
  });

  const result = await fetchAllEvents(CCB_CONFIG, { fetchPage });

  assert.equal(result.ok, true);
  assert.equal(result.pagesFetched, 2);
  assert.equal(result.truncated, false);
  assert.equal(result.totalDeclared, 90);
  assert.equal(result.records.length, 5);
  assert.deepEqual(
    result.records.map((r) => r.source_record_id),
    ["292314", "294811", "281912", "285974", "285991"],
  );
  assert.deepEqual(result.errors, []);
});

test("fetchAllEvents stops correctly on a single-page source (next_rest_url null from page 1)", async () => {
  const page2 = await loadFixture("ccb/events-page-2.json"); // already has next_rest_url: null
  const fetchPage = fixtureFetchPage({
    "https://www.ccb.pt/wp-json/tribe/events/v1/events/?categories=musica&per_page=3": {
      ok: true,
      status: 200,
      text: page2,
      url: "x",
    },
  });

  const result = await fetchAllEvents(CCB_CONFIG, { fetchPage });
  assert.equal(result.pagesFetched, 1);
  assert.equal(result.ok, true);
  assert.equal(result.records.length, 2);
});

test("fetchAllEvents deduplicates a record repeated across an overlapping page boundary", async () => {
  const page1 = await loadFixture("events-calendar-api/duplicate-records-page-1.json");
  const page2 = await loadFixture("events-calendar-api/duplicate-records-page-2.json");

  const url1 = "https://example.test/wp-json/tribe/events/v1/events/?per_page=2";
  const url2 = "https://example.test/wp-json/tribe/events/v1/events/?page=2&per_page=2";
  const fetchPage = fixtureFetchPage({
    [url1]: { ok: true, status: 200, text: page1, url: url1 },
    [url2]: { ok: true, status: 200, text: page2, url: url2 },
  });

  const result = await fetchAllEvents({ baseUrl: "https://example.test", perPage: 2, maxPages: 20 }, { fetchPage });

  assert.equal(result.pagesFetched, 2);
  assert.equal(result.records.length, 3); // 500003, 500004, 500005 — 500003 kept only once, not twice
  assert.deepEqual(
    result.records.map((r) => r.source_record_id).sort(),
    ["500003", "500004", "500005"].sort(),
  );
});

test("fetchAllEvents respects maxPages and reports truncated:true rather than silently continuing", async () => {
  const page1 = await loadFixture("ccb/events-page-1.json");
  const url1 = "https://www.ccb.pt/wp-json/tribe/events/v1/events/?categories=musica&per_page=3";
  let secondPageFetched = false;
  const fetchPage = async (url) => {
    if (url === url1) return { ok: true, status: 200, text: page1, url };
    secondPageFetched = true;
    throw new Error("should never be reached: maxPages=1 must stop before page 2");
  };

  const result = await fetchAllEvents({ ...CCB_CONFIG, maxPages: 1 }, { fetchPage });

  assert.equal(result.pagesFetched, 1);
  assert.equal(result.truncated, true);
  assert.equal(result.ok, true); // truncation is not an error — it's a bounded, honestly-reported stop
  assert.equal(secondPageFetched, false);
  assert.equal(result.records.length, 3);
});

test("fetchAllEvents reports an HTTP failure explicitly, preserving records already collected — never a silent empty success", async () => {
  const page1 = await loadFixture("ccb/events-page-1.json");
  const url1 = "https://www.ccb.pt/wp-json/tribe/events/v1/events/?categories=musica&per_page=3";
  const fetchPage = async (url) => {
    if (url === url1) return { ok: true, status: 200, text: page1, url };
    return { ok: false, status: 500, text: "", url };
  };

  const result = await fetchAllEvents(CCB_CONFIG, { fetchPage });

  assert.equal(result.ok, false);
  assert.equal(result.records.length, 3); // page 1's records are kept
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0].message, /HTTP 500/);
});

test("fetchAllEvents reports a transport-level failure (rejected fetchPage) explicitly", async () => {
  const fetchPage = async () => {
    throw new Error("ECONNRESET");
  };
  const result = await fetchAllEvents(CCB_CONFIG, { fetchPage });
  assert.equal(result.ok, false);
  assert.equal(result.records.length, 0);
  assert.match(result.errors[0].message, /transport failure/);
});

test("fetchAllEvents reports a parse failure (malformed body) explicitly, not as zero records", async () => {
  const body = await loadFixture("events-calendar-api/malformed-response.json");
  const fetchPage = async (url) => ({ ok: true, status: 200, text: body, url });
  const result = await fetchAllEvents(CCB_CONFIG, { fetchPage });
  assert.equal(result.ok, false);
  assert.match(result.errors[0].message, /parse failure/);
});

test("fetchAllEvents throws if config.maxPages is not a positive number", async () => {
  await assert.rejects(() => fetchAllEvents({ baseUrl: "https://example.test", maxPages: 0 }), /maxPages/);
});
