import assert from "node:assert/strict";
import test from "node:test";

import { createEndpointMemory, chooseResolutionPath } from "../ingestion/browser-resolution/memory.mjs";
import { runBrowserResolutionQueue } from "../ingestion/browser-resolution/queue.mjs";

test("persisted endpoints avoid repeat browser research until validation fails", () => {
  const memory = createEndpointMemory({ inspected_programme_url: "https://example.org/events", state: "PROGRAMME_ENDPOINT_PROVEN", probed_at: "2026-08-27T00:00:00.000Z", discovered_endpoints: [{ url: "https://example.org/api/events" }], collector_fit: "EXISTING_COLLECTOR_ZERO_CODE", browser_required_for_refresh: false, next_action: "DETERMINISTIC_CONTINUE" });
  assert.equal(chooseResolutionPath(memory).path, "DETERMINISTIC_COLLECTION");
  assert.equal(chooseResolutionPath(memory, { deterministicValidationPassed: false }).path, "BROWSER_RESOLUTION");
});

test("one failed site does not stop the queue", async () => {
  let index = 0;
  const sessionFactory = async () => {
    index += 1;
    if (index === 1) throw new Error("browser launch failed");
    let listener = () => {};
    return { onResponse(value) { listener = value; }, async navigate() { await listener({ url: "https://porto.example/api/events", status: 200, content_type: "application/json", content_length: 160, body: JSON.stringify({ events: [{ id: 1, name: "A", startDate: "2026-09-01", url: "/a" }, { id: 2, name: "B", startDate: "2026-09-02", url: "/b" }] }) }); return { status: 200, initialText: "" }; }, async wait() {}, async snapshot() { return { html: "", text: "", links: [] }; }, async close() {} };
  };
  const results = await runBrowserResolutionQueue([{ candidate_id: "one", url: "https://failed.example/events" }, { candidate_id: "porto", url: "https://porto.example/events" }], { sessionFactory });
  assert.equal(results.length, 2);
  assert.equal(results[0].primary_result, "TECHNICAL_PROBE_FAILURE");
  assert.equal(results[1].primary_result, "STRUCTURED_ENDPOINT_DISCOVERED");
});

test("an arbitrary non-Berlin URL traverses probe, classification, routing, and persistence", () => {
  const handoff = { inspected_programme_url: "https://music.example.net/agenda", state: "PROGRAMME_ENDPOINT_PROVEN", probed_at: "2026-08-27T00:00:00.000Z", discovered_endpoints: [{ url: "https://music.example.net/api/agenda", mechanism: "PUBLIC_REST_JSON" }], collector_fit: "EXISTING_COLLECTOR_ZERO_CODE", browser_required_for_refresh: false, next_action: "DETERMINISTIC_CONTINUE" };
  const memory = createEndpointMemory(handoff);
  assert.equal(memory.programme_url, "https://music.example.net/agenda");
  assert.equal(chooseResolutionPath(memory).path, "DETERMINISTIC_COLLECTION");
});
