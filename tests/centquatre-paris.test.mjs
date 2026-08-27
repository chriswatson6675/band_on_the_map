// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — offline, deterministic,
// no-network proof for CENTQUATRE-PARIS: a new, small Hydra/API-Platform
// JSON API adapter (ingestion/centquatre-paris/) reproduces real,
// future, concert-tagged events from one retained API response fixture.
// See research/source-investigations/centquatre-paris-01/ for the
// governed investigation this is the required DETERMINISTIC_DERIVATION
// offline proof for.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { buildConcertEventsUrl, extractEventMembers, CONCERT_TAG_IRI } from "../ingestion/centquatre-paris/discovery.mjs";
import { toObservation, toObservations, deriveSourceRecordId } from "../ingestion/centquatre-paris/observation-adapter.mjs";

async function fixtureJson() {
  const text = await readFile(new URL("../fixtures/centquatre-paris/api-events-concert-future-sample.json", import.meta.url), "utf8");
  return JSON.parse(text);
}

test("buildConcertEventsUrl: builds the documented, proven filter combination", () => {
  const url = buildConcertEventsUrl("2026-08-26");
  assert.equal(
    url,
    `https://www.104.fr/api/events?taggedEntities.tag%5B%5D=${encodeURIComponent(CONCERT_TAG_IRI)}&sortingFirstDateTime%5Bafter%5D=2026-08-26&order%5BsortingFirstDateTime%5D=asc`,
  );
  assert.throws(() => buildConcertEventsUrl("26-08-2026"), "must reject a non-YYYY-MM-DD date");
});

test("extractEventMembers: real retained API response yields real Event resources", async () => {
  const body = await fixtureJson();
  const members = extractEventMembers(body);
  assert.ok(members.length >= 5, `expected at least 5 members, got ${members.length}`);
  assert.ok(members.every((m) => m["@type"] === "https://schema.org/Event"));
});

test("extractEventMembers: throws on a malformed (non-Hydra) response, never silently returns []", () => {
  assert.throws(() => extractEventMembers({ notHydra: true }));
  assert.throws(() => extractEventMembers(null));
});

test("Canine: real event resource reproduces title/dates/venue/price/id", async () => {
  const body = await fixtureJson();
  const members = extractEventMembers(body);
  const canine = members.find((m) => m.slug === "canine-liminal");
  assert.ok(canine, "expected to find the Canine event resource in the retained fixture");

  assert.equal(deriveSourceRecordId(canine), "90");

  const observation = toObservation(canine, {
    retrievedAt: "2026-08-26T23:35:00Z",
    fixturePath: "fixtures/centquatre-paris/api-events-concert-future-sample.json",
  });

  assert.equal(observation.source_id, "centquatre-paris");
  assert.equal(observation.source_record_id, "90");
  assert.equal(observation.title, "Canine");
  assert.equal(observation.start.certainty, "UTC_INSTANT");
  assert.equal(observation.start.date, "2026-11-27");
  assert.equal(observation.start.iso, new Date("2026-11-27T20:30:00+01:00").toISOString());
  assert.equal(observation.end.certainty, "UTC_INSTANT");
  assert.equal(observation.end.iso, new Date("2026-11-27T21:50:00+01:00").toISOString());
  assert.equal(observation.venue_name, "Le CENTQUATRE-PARIS");
  assert.equal(observation.event_url, "https://www.104.fr/fr/programmation/saison-2026-2027/concert/canine-liminal");
  assert.equal(observation.price_text, "De 10 à 28 €");
  assert.ok(observation.source_fields.tags.includes("concert"));
  assert.equal(observation.raw_evidence.byte_faithful, false);
});

test("toObservations: converts every real member in the retained sample without throwing", async () => {
  const body = await fixtureJson();
  const members = extractEventMembers(body);
  const observations = toObservations(members, { retrievedAt: "2026-08-26T23:35:00Z" });
  assert.equal(observations.length, members.length);
  assert.ok(observations.every((o) => o.source_id === "centquatre-paris" && o.source_record_id));
});

test("toObservation: throws (never fabricates an id) for a resource missing the expected @id shape", () => {
  assert.throws(() => toObservation({ "@id": "/api/something-else/1", name: "X" }));
});
