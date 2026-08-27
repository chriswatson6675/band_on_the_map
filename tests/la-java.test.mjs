// Offline, no-network DETERMINISTIC_DERIVATION proof for
// research/source-investigations/la-java-paris-01/ — re-parses the
// retained fixture (a real, byte-faithful excerpt of the single Next.js
// RSC `self.__next_f.push` chunk from La Java's own /programmation page
// that carries its embedded "events" array) through the bespoke
// ingestion/la-java-paris/ collector and confirms the exact claimed field
// values reproduce deterministically.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { extractEmbeddedEvents } from "../ingestion/la-java-paris/discovery.mjs";
import { toObservations, toObservation } from "../ingestion/la-java-paris/observation-adapter.mjs";

const FIXTURE_PATH = resolve("fixtures/la-java-paris/programmation-rsc-chunk.html");

test("extractEmbeddedEvents finds the full embedded events array in the retained fixture", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const events = extractEmbeddedEvents(html);
  assert.equal(events.length, 19);
});

test("extractEmbeddedEvents reproduces the exact claimed raw field values for one event", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const events = extractEmbeddedEvents(html);
  const brunoMars = events.find((e) => e.id === "2026-08-28-100-bruno-mars-party-paris");
  assert.ok(brunoMars);
  assert.equal(brunoMars.name, "100% Bruno Mars Party !! (Paris )");
  assert.equal(brunoMars.date, "2026-08-28T17:30:00.000Z");
  assert.equal(brunoMars.type, "concert");
  assert.equal(brunoMars.ticketUrl, "https://shotgun.live/fr/events/100-bruno-mars-party-in-paris");
});

test("extractEmbeddedEvents throws rather than silently returning an empty list when no events chunk is present", () => {
  assert.throws(() => extractEmbeddedEvents("<html><body>no rsc chunks here</body></html>"), /No self\.__next_f\.push chunk/);
});

test("toObservations builds valid Observations with the honest FLOATING_LOCAL time certainty, never promoted to a fabricated UTC instant", async () => {
  const html = await readFile(FIXTURE_PATH, "utf8");
  const events = extractEmbeddedEvents(html);
  const observations = toObservations(events, {
    retrievedAt: "2026-08-26T23:00:00.000Z",
    fixturePath: "fixtures/la-java-paris/programmation-rsc-chunk.html",
  });

  assert.equal(observations.length, 19);
  const brunoMars = observations.find((o) => o.source_record_id === "2026-08-28-100-bruno-mars-party-paris");
  assert.ok(brunoMars);
  assert.equal(brunoMars.source_id, "la-java-paris");
  assert.equal(brunoMars.title, "100% Bruno Mars Party !! (Paris )");
  assert.equal(brunoMars.venue_name, "La Java");
  assert.equal(brunoMars.location_text, "105 rue du Faubourg du Temple, 75010 Paris");
  assert.equal(brunoMars.event_url, "https://shotgun.live/fr/events/100-bruno-mars-party-in-paris");
  assert.equal(brunoMars.price_text, null);

  // The critical, deliberate non-fabrication: the source's own ".000Z"
  // suffix is not treated as a confirmed UTC instant (see the module doc
  // comment in ingestion/la-java-paris/observation-adapter.mjs).
  assert.equal(brunoMars.start.date, "2026-08-28");
  assert.equal(brunoMars.start.certainty, "FLOATING_LOCAL");
  assert.equal(brunoMars.start.iso, null);
  assert.equal(brunoMars.start.is_utc, null);
  assert.equal(brunoMars.start.raw, "2026-08-28T17:30:00.000Z");

  assert.equal(brunoMars.source_fields.event_type, "concert");
});

test("toObservation throws rather than fabricating identity for a malformed record missing id/ticketUrl", () => {
  assert.throws(() => toObservation({ name: "No id" }), /event\.id/);
  assert.throws(() => toObservation({ id: "x" }), /event\.ticketUrl/);
});
