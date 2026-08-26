import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { decodeSvelteKitData } from "../ingestion/sveltekit-data/decode.mjs";
import { toObservation, toObservations, deriveDateTimeFromSpaceUtc } from "../ingestion/bi-nuu/observation-adapter.mjs";

test("all 46 real retained Bi Nuu events adapt to Observations, including the real venue-override case", async () => {
  const text = await readFile(new URL("../fixtures/bi-nuu-berlin/events-listing-data.json", import.meta.url), "utf8");
  const decoded = decodeSvelteKitData(text);
  const observations = toObservations(decoded.events, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, 46);

  const oidorno = observations.find((o) => o.title === "Oidorno");
  assert.ok(oidorno);
  assert.equal(oidorno.source_id, "bi-nuu-berlin");
  assert.equal(oidorno.source_record_id, "fko44tarc3g5wlv");
  assert.equal(oidorno.start.iso, "2026-08-28T18:00:00Z");
  assert.equal(oidorno.start.is_utc, true);
  assert.equal(oidorno.source_fields.location_override, "in den Festsaal Kreuzberg");
  // The override is surfaced in location_text too, so the data-driven
  // venue mapping's own key derivation (venue_name > location_text >
  // source_id) never silently forces this record onto Bi Nuu.
  assert.equal(oidorno.venue_name, null);
  assert.equal(oidorno.location_text, "in den Festsaal Kreuzberg");

  const nonOverride = observations.find((o) => o.source_fields.location_override === null);
  assert.ok(nonOverride, "at least one real record has no override");
  assert.equal(nonOverride.location_text, null, "a record with no override falls through to SOURCE_ID resolution");
});

test("deriveDateTimeFromSpaceUtc: honestly certainty-tiers non-matching input", () => {
  assert.equal(deriveDateTimeFromSpaceUtc(null).certainty, "UNKNOWN");
  assert.equal(deriveDateTimeFromSpaceUtc("not a date").certainty, "TEXT_ONLY");
  assert.equal(deriveDateTimeFromSpaceUtc("2026-08-28 18:00:00.000Z").certainty, "UTC_INSTANT");
});

test("toObservation throws without record.id; never fabricates an event_url this source does not provide", () => {
  assert.throws(() => toObservation({}), /record.id/);
  const obs = toObservation({ id: "x", title: "T", start: "2026-01-01 00:00:00.000Z" }, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(obs.event_url, null);
});
