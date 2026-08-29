import assert from "node:assert/strict";
import test from "node:test";
import { runCityAcquisition } from "../ingestion/programme-acquisition/city-batch.mjs";

const page = (url) => ({ url, at: "2026-08-29T00:00:00.000Z", status: 200, content_type: "text/html", body: '<link rel="canonical" href="/events/a"><script type="application/ld+json">{"@context":"https://schema.org","@type":"Event","name":"A","startDate":"2026-09-01","url":"/events/a"}</script>' });
test("batch retains an exact outcome for success, unresolved, and network failure without stopping", async () => {
  const result = await runCityAcquisition({ sources: [{ source_id: "a", venue: "A", programme_url: "https://a.example/events" }, { source_id: "b", venue: "B" }, { source_id: "c", venue: "C", programme_url: "https://c.example/events" }], fetchDocument: async (url) => { if (url.includes("c.example")) throw new Error("offline"); return page(url.includes("/a") ? url : "https://a.example/events/a"); } });
  assert.deepEqual(result.map((row) => row.state), ["ACQUISITION_PROVEN", "PROGRAMME_SOURCE_UNRESOLVED", "NETWORK_FAILURE"]);
});
