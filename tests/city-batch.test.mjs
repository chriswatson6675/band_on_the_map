import assert from "node:assert/strict";
import test from "node:test";
import { runCityAcquisition } from "../ingestion/programme-acquisition/city-batch.mjs";

const page = (url) => ({ url, at: "2026-08-29T00:00:00.000Z", status: 200, content_type: "text/html", body: '<link rel="canonical" href="/events/a"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"A","startDate":"2026-09-01","url":"/events/a"}</script>' });
test("batch retains an exact outcome for success, unresolved, and network failure without stopping", async () => {
  const result = await runCityAcquisition({ sources: [{ source_id: "a", venue: "A", programme_url: "https://a.example/events" }, { source_id: "b", venue: "B" }, { source_id: "c", venue: "C", programme_url: "https://c.example/events" }], fetchDocument: async (url) => { if (url.includes("c.example")) throw new Error("offline"); return page(url.includes("/a") ? url : "https://a.example/events/a"); } });
  assert.deepEqual(result.map((row) => row.state), ["ACQUISITION_PROVEN", "PROGRAMME_SOURCE_UNRESOLVED", "NETWORK_FAILURE"]);
});

// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01: sources with only
// `website` (no pre-known `programme_url` — this package's own UK estate
// shape) must still be throttled per their OWN real host, never all
// lumped together under the single literal host "none".
test("perHost throttling keys on website's own host when programme_url is not yet known — different real hosts run concurrently, not serialised", async () => {
  let concurrentByHost = { "a.example": 0, "b.example": 0 };
  let maxConcurrentAcrossBothHosts = 0;
  const fetchDocument = async (url) => {
    const host = new URL(url).host;
    concurrentByHost[host] = (concurrentByHost[host] ?? 0) + 1;
    maxConcurrentAcrossBothHosts = Math.max(maxConcurrentAcrossBothHosts, concurrentByHost["a.example"] + concurrentByHost["b.example"]);
    await new Promise((resolve) => setTimeout(resolve, 20));
    concurrentByHost[host] -= 1;
    return page(url);
  };
  await runCityAcquisition({
    sources: [
      { source_id: "a1", venue: "A1", website: "https://a.example/" },
      { source_id: "b1", venue: "B1", website: "https://b.example/" },
    ],
    fetchDocument,
    concurrency: 4,
    perHost: 1,
  });
  assert.equal(maxConcurrentAcrossBothHosts, 2, "two DIFFERENT hosts must be able to run at the same time even with perHost=1 — only requests to the SAME host should ever be serialised");
});

test("perHost throttling still serialises two sources sharing the SAME website host", async () => {
  let concurrentSameHost = 0;
  let maxConcurrentSameHost = 0;
  const fetchDocument = async (url) => {
    concurrentSameHost += 1;
    maxConcurrentSameHost = Math.max(maxConcurrentSameHost, concurrentSameHost);
    await new Promise((resolve) => setTimeout(resolve, 20));
    concurrentSameHost -= 1;
    return page(url);
  };
  await runCityAcquisition({
    sources: [
      { source_id: "a1", venue: "A1", website: "https://shared.example/venue-a" },
      { source_id: "a2", venue: "A2", website: "https://shared.example/venue-b" },
    ],
    fetchDocument,
    concurrency: 4,
    perHost: 1,
  });
  assert.equal(maxConcurrentSameHost, 1, "two sources sharing the same real host must still be serialised under perHost=1");
});
