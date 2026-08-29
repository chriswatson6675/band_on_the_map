import assert from "node:assert/strict";
import test from "node:test";
import { resolveProgrammeSource } from "../ingestion/programme-acquisition/programme-resolver.mjs";

test("bounded resolver selects an event-rich same-origin page over misleading navigation", async () => {
  const homepage = { url: "https://arbitrary.example/", body: '<a href="/news">News</a><a href="/whats-on">What\'s On</a>' };
  const result = await resolveProgrammeSource({ homepage, fetchDocument: async (url) => ({ url, status: 200, body: '<script type="application/ld+json">{"@type":"Event","name":"A","startDate":"2026-09-01","url":"/event/a"}</script>' }) });
  assert.equal(result.state, "PROGRAMME_SOURCE_RESOLVED");
  assert.equal(result.selected.url, "https://arbitrary.example/whats-on");
});

test("resolver fails closed when no programme evidence crosses threshold", async () => {
  const result = await resolveProgrammeSource({ homepage: { url: "https://arbitrary.example/", body: '<a href="/about">About</a>' }, fetchDocument: async () => { throw new Error("must not fetch"); } });
  assert.equal(result.state, "PROGRAMME_SOURCE_UNRESOLVED");
});
