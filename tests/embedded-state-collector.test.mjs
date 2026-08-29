import assert from "node:assert/strict";
import test from "node:test";
import { collectEmbeddedStateEvents } from "../ingestion/embedded-state/collector.mjs";

test("collects only embedded records with title, date, and stable identity", () => {
  const document = { url: "https://arbitrary.example/programme", at: "2026-08-29T00:00:00.000Z", body: '<script id="__NEXT_DATA__" type="application/json">{"props":{"events":[{"id":"e1","name":"Real","startDate":"2026-09-01","url":"/events/real"},{"id":"e2","name":"Also real","startDate":"2026-09-02","url":"/events/also-real"},{"name":"Noise","locale":"en"}]}}</script>' };
  const result = collectEmbeddedStateEvents(document, { sourceId: "arbitrary", venueName: "Arbitrary", cutoffDate: "2026-08-29" });
  assert.equal(result.records.length, 2);
  assert.equal(result.records[0].source_record_id, "e1");
});
