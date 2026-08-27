import assert from "node:assert/strict";
import test from "node:test";

import { normalizeBrowserProbeOptions } from "../ingestion/browser-resolution/contract.mjs";
import { runControlledBrowserProbe } from "../ingestion/browser-resolution/probe.mjs";

function fakeFactory({ responses = [], snapshot = { html: "<html></html>", text: "", links: [] }, navigation = { status: 200, initialText: "Loading" }, interactions = 0, neverNavigate = false, state = {} } = {}) {
  return async (options) => {
    state.options = options;
    let listener = () => {};
    let interaction = 0;
    return {
      onResponse(value) { listener = value; },
      async navigate() {
        if (neverNavigate) return new Promise(() => {});
        for (const response of responses) await listener(response);
        return navigation;
      },
      async wait() {},
      async interact() { interaction += 1; return interaction <= interactions; },
      async flushResponses() {},
      async snapshot() { return snapshot; },
      async close() { state.closed = true; },
    };
  };
}

test("browser options enforce explicit operational bounds", () => {
  assert.throws(() => normalizeBrowserProbeOptions({ maxNetworkResponses: 0 }), /positive integer/);
  assert.throws(() => normalizeBrowserProbeOptions({ navigationTimeoutMs: 20, totalProbeTimeoutMs: 10 }), /at least/);
  assert.equal(normalizeBrowserProbeOptions({ maxInteractions: 0 }).sameOriginOnly, true);
});

test("same-origin JSON response becomes a deterministic handoff and external noise is ignored", async () => {
  const body = JSON.stringify({ events: [{ id: 1, name: "A", startDate: "2026-09-01", url: "/a" }, { id: 2, name: "B", startDate: "2026-09-02", url: "/b" }] });
  const result = await runControlledBrowserProbe({ url: "https://venue.example/programme", options: { waitAfterLoadMs: 0, maxInteractions: 0 } }, { sessionFactory: fakeFactory({ responses: [
    { url: "https://analytics.example/events", status: 200, content_type: "application/json", content_length: body.length, body },
    { url: "https://venue.example/api/events", status: 200, content_type: "application/json", content_length: body.length, body },
  ] }), now: () => "2026-08-27T00:00:00.000Z" });
  assert.equal(result.primary_result, "STRUCTURED_ENDPOINT_DISCOVERED");
  assert.equal(result.network_responses_considered, 1);
  assert.equal(result.discovered_endpoints[0].deterministic_collector_candidate, "JSON_API");
  assert.equal(result.browser_required_for_refresh, false);
});

test("interaction count is bounded", async () => {
  const result = await runControlledBrowserProbe({ url: "https://venue.example/programme", options: { waitAfterLoadMs: 0, maxInteractions: 2 } }, { sessionFactory: fakeFactory({ interactions: 9 }) });
  assert.equal(result.interactions_performed, 2);
});

test("total timeout always closes the browser session", async () => {
  const state = {};
  const result = await runControlledBrowserProbe({ url: "https://venue.example/programme", options: { navigationTimeoutMs: 5, totalProbeTimeoutMs: 10, waitAfterLoadMs: 0 } }, { sessionFactory: fakeFactory({ neverNavigate: true, state }) });
  assert.equal(result.failure.type, "TOTAL_PROBE_TIMEOUT");
  assert.equal(state.closed, true);
});

test("access-block handling stops at a processable result", async () => {
  const result = await runControlledBrowserProbe({ url: "https://venue.example/programme", options: { waitAfterLoadMs: 0 } }, { sessionFactory: fakeFactory({ responses: [{ url: "https://venue.example/api", status: 403, content_type: "application/json", content_length: 2, body: "{}" }] }) });
  assert.equal(result.primary_result, "ACCESS_BLOCKED");
  assert.equal(result.next_action, "RETRY_LATER");
});

test("navigation access blocks classify even without an inspectable response body", async () => {
  const result = await runControlledBrowserProbe({ url: "https://venue.example/programme", options: { waitAfterLoadMs: 0 } }, { sessionFactory: fakeFactory({ navigation: { status: 429, initialText: "Too many requests" } }) });
  assert.equal(result.primary_result, "ACCESS_BLOCKED");
  assert.equal(result.next_action, "RETRY_LATER");
});

test("credentials are redacted before endpoint evidence is retained", async () => {
  const token = `AIza${"x".repeat(35)}`;
  const body = JSON.stringify({ events: [{ id: 1, name: "A", startDate: "2026-09-01", url: "/a" }, { id: 2, name: "B", startDate: "2026-09-02", url: "/b" }] });
  const unsafe = new URL("https://venue.example/api/events");
  unsafe.searchParams.set(["api", "key"].join("_"), token);
  const result = await runControlledBrowserProbe({ url: "https://venue.example/programme", options: { waitAfterLoadMs: 0 } }, { sessionFactory: fakeFactory({ responses: [{ url: unsafe.href, status: 200, content_type: "application/json", content_length: body.length, body }] }) });
  assert.doesNotMatch(JSON.stringify(result), /AIza/);
  assert.match(result.discovered_endpoints[0].url, /REDACTED_CREDENTIAL/);
});
