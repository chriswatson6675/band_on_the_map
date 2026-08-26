import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { toObservations, toObservationsBatch, deriveDateTimeFromPerformanceText } from "../ingestion/heimathafen-neukoelln/observation-adapter.mjs";

async function fixture() {
  const text = await readFile(new URL("../fixtures/heimathafen-neukoelln-berlin/events-sample.json", import.meta.url), "utf8");
  return JSON.parse(text);
}

test("deriveDateTimeFromPerformanceText: reproduces the investigation's own proven MM/DD/YYYY derivation", () => {
  // The exact worked example from research/source-investigations/heimathafen-neukoelln-berlin-01/investigation.json
  assert.equal(deriveDateTimeFromPerformanceText("03/05/2027 8:00 p.m.").date, "2027-03-05");
  assert.equal(deriveDateTimeFromPerformanceText("09/29/2026 7:00 p.m.").date, "2026-09-29");
  assert.equal(deriveDateTimeFromPerformanceText("11/27/2026 8:00 p.m.").date, "2026-11-27");
  assert.equal(deriveDateTimeFromPerformanceText("02/19/2027 8:00 p.m.").date, "2027-02-19");
  assert.equal(deriveDateTimeFromPerformanceText("02/19/2027 8:00 p.m.").certainty, "FLOATING_LOCAL");
});

test("all 5 real retained Heimathafen Neukölln wp/v2 records adapt to real Observations", async () => {
  const records = await fixture();
  const observations = toObservationsBatch(records, { retrievedAt: "2026-08-26T13:00:00Z" });
  // 5 wp/v2 posts, but one genuinely lists more than one real performance
  // date (acf.event_performances[] with length > 1) — each is its own
  // Observation, not a duplicate.
  assert.equal(observations.length, 6);
  const lena = observations.find((o) => o.title?.includes("LENA"));
  assert.ok(lena);
  assert.equal(lena.source_id, "heimathafen-neukoelln-berlin");
  assert.equal(lena.start.date, "2027-03-05");
  assert.equal(lena.venue_name, "Heimathafen Neukölln");
  assert.equal(lena.price_text, "Tickets 35,90 €");
  assert.equal(lena.title, "LENA & LINUS"); // HTML entity decoded
});

test("toObservations produces one Observation per performance, and throws without record.id", () => {
  assert.throws(() => toObservations({}), /record.id/);
  const multi = toObservations(
    {
      id: 1,
      title: { rendered: "X" },
      acf: { event_performances: [{ performance_date_time: "01/02/2027 8:00 p.m." }, { performance_date_time: "01/03/2027 8:00 p.m." }] },
    },
    { retrievedAt: "2026-08-26T13:00:00Z" },
  );
  assert.equal(multi.length, 2);
  assert.notEqual(multi[0].source_record_id, multi[1].source_record_id);
});
