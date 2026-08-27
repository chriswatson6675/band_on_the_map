// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Supersonic (Paris).
// PARIS_ZERO_CODE: no new collector code exists for this venue. This test
// proves, offline and deterministically, that this project's EXISTING,
// unmodified generic families — ingestion/events-calendar-api/ (The
// Events Calendar / Events Calendar Pro WordPress plugin's own public
// REST API v1) and ingestion/json-ld/ (schema.org Event JSON-LD) — fully
// reproduce this source's real, retained sample. See
// research/source-investigations/supersonic-paris-01/.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { parseEventsPage, normalizeEventRecord } from "../ingestion/events-calendar-api/client.mjs";
import { toObservation as tribeToObservation, deriveDateTime } from "../ingestion/events-calendar-api/observation-adapter.mjs";
import { extractEventNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";
import { toObservation as jsonLdToObservation } from "../ingestion/json-ld/observation-adapter.mjs";

async function fixture(name) {
  return readFile(new URL(`../fixtures/supersonic-paris/${name}`, import.meta.url), "utf8");
}

test("events-calendar-api: the real retained REST API page parses into 50 events, both room names present", async () => {
  const body = await fixture("tribe-events-api-p1.json");
  const page = parseEventsPage(body);
  assert.equal(page.events.length, 50);
  assert.equal(page.total, 95);
  assert.equal(page.totalPages, 2);

  const records = page.events.map(normalizeEventRecord);
  const gregFreeman = records.find((r) => r.title === "Greg Freeman • Twine • Jobie");
  assert.ok(gregFreeman);
  assert.equal(gregFreeman.venue.name, "SUPERSONIC");
  assert.equal(gregFreeman.venue.address, "9 Rue Biscornet");

  const roomNames = new Set(records.map((r) => r.venue?.name).filter(Boolean));
  assert.ok(roomNames.has("SUPERSONIC"));
  assert.ok(roomNames.has("Supersonic Records"), "the sister room must be present in the real retained sample");
  // Both rooms share the exact same address — one venue entity, not two.
  for (const r of records) {
    if (r.venue?.name === "Supersonic Records") assert.equal(r.venue.address, "9 Rue Biscornet");
  }
});

test("events-calendar-api: toObservation reproduces the exact real fields for one sampled record", async () => {
  const body = await fixture("tribe-events-api-p1.json");
  const page = parseEventsPage(body);
  const records = page.events.map(normalizeEventRecord);
  const gregFreeman = records.find((r) => r.title === "Greg Freeman • Twine • Jobie");

  const obs = tribeToObservation(gregFreeman, { source_id: "supersonic-paris" }, { retrievedAt: "2026-08-26T22:47:00Z", sourceUrl: "https://supersonic-club.fr/wp-json/tribe/events/v1/events" });
  assert.equal(obs.source_id, "supersonic-paris");
  assert.equal(obs.title, "Greg Freeman • Twine • Jobie");
  assert.equal(obs.start.date, "2026-08-27");
  assert.equal(obs.venue_name, "SUPERSONIC");
  assert.equal(obs.price_text, "Gratuit");
});

test("events-calendar-api: deriveDateTime's own utc_start_date is present but must NOT be blindly trusted as a correct UTC instant for this source (French Summer Time caveat)", async () => {
  const body = await fixture("tribe-events-api-p1.json");
  const page = parseEventsPage(body);
  const records = page.events.map(normalizeEventRecord);
  const gregFreeman = records.find((r) => r.title === "Greg Freeman • Twine • Jobie");

  // The default adapter behaviour (matching CCB Lisbon's own proven
  // precedent) trusts a present utc_start_date as UTC_INSTANT:
  const dt = deriveDateTime(gregFreeman, "start");
  assert.equal(dt.certainty, "UTC_INSTANT");
  assert.equal(dt.iso, "2026-08-27T18:00:00Z");
  // But this source's own local wall-clock time is 19:00 on the same
  // calendar day — a fixed 1-hour delta (UTC+1), which is NOT the correct
  // real-world Paris offset for a date in August (France observes Central
  // European SUMMER Time, UTC+2, from late March to late October). This
  // source's own WordPress/Events-Calendar-Pro timezone configuration
  // therefore appears to compute "UTC" using a fixed, non-DST-aware
  // offset — see research/source-investigations/supersonic-paris-01/
  // investigation.json's collector_assessment.blockers for the full,
  // honest write-up and the recommended wiring-time mitigation (do not
  // pass/trust utc_start_date/utc_end_date for this specific source;
  // treat the local start_local/end_local fields as the honestly-certain
  // ones instead).
  assert.equal(gregFreeman.start_local, "2026-08-27 19:00:00");
  assert.equal(gregFreeman.start_utc, "2026-08-27 18:00:00");
});

test("json-ld: the real retained events page's own JSON-LD block reproduces the same record independently (corroboration, not the primary data path)", async () => {
  const html = await fixture("events-page.html");
  const nodes = extractEventNodes(html);
  assert.ok(nodes.length > 0);
  const record = normaliseJsonLdEvent(nodes[0], { deriveId: (n) => n.url });
  assert.equal(record.title, "Greg Freeman • Twine • Jobie");
  assert.equal(record.start_raw, "2026-08-27T19:00:00+01:00");
  assert.equal(record.location_address.streetAddress, "9 Rue Biscornet");

  const obs = jsonLdToObservation(record, { source_id: "supersonic-paris" }, { retrievedAt: "2026-08-26T22:47:00Z", sourceUrl: "https://supersonic-club.fr/events/" });
  assert.equal(obs.title, "Greg Freeman • Twine • Jobie");
  assert.equal(obs.event_url, "https://supersonic-club.fr/event/greg-freeman-twine/");
});
