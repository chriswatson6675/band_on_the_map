import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseFamaDAlfamaAgenda } from "../ingestion/fama-dalfama/discovery.mjs";
import {
  AGENDA_URL,
  SOURCE_ID,
  VENUE_LOCATION_TEXT,
  VENUE_NAME,
  toObservation,
  toObservations,
} from "../ingestion/fama-dalfama/observation-adapter.mjs";

const FIXTURE_PATH = "fixtures/fama-dalfama/agenda-excerpt.html";

async function loadFixtureRecords() {
  const html = await readFile(new URL("../fixtures/fama-dalfama/agenda-excerpt.html", import.meta.url), "utf8");
  return parseFamaDAlfamaAgenda(html);
}

// 1. record count / end-to-end conversion

test("every discovery record becomes exactly one valid Observation", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-25T01:29:32Z", fixturePath: FIXTURE_PATH });
  assert.equal(observations.length, 11);
  for (const o of observations) {
    assert.equal(o.source_id, SOURCE_ID);
    assert.equal(o.source_id, "fama-dalfama");
    assert.equal(typeof o.raw_evidence.byte_faithful, "boolean");
    assert.equal("event_id" in o, false);
    assert.equal("canonical_event_id" in o, false);
  }
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({ title: "x" }), /source_record_id/);
});

// 2. source_record_id forwarded verbatim from discovery's composite key

test("source_record_id is forwarded verbatim from the discovery record's own composite key", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-25T01:29:32Z" });
  for (let i = 0; i < records.length; i++) {
    assert.equal(observations[i].source_record_id, records[i].source_record_id);
    assert.equal(observations[i].source_record_id, `fama-dalfama:${records[i].date_iso}`);
  }
});

// 3. start date derivation: honest DATE_ONLY certainty, at least one date
// cross-checked against real Gregorian calendar math

test("start.date is the mechanically-derived calendar date at honest DATE_ONLY certainty (no timezone-qualified time is proven)", async () => {
  const records = await loadFixtureRecords();
  const [obs] = toObservations(
    records.filter((r) => r.date_iso === "2026-08-01"),
    { retrievedAt: "2026-08-25T01:29:32Z" },
  );
  assert.equal(obs.start.date, "2026-08-01");
  assert.equal(obs.start.certainty, "DATE_ONLY");
  assert.equal(obs.start.iso, null); // never promoted to an instant — no timezone/UTC offset is stated anywhere
  assert.equal(obs.start.is_utc, false);
  assert.equal(obs.start.tzid, null);

  // Independently re-verify against real Gregorian calendar arithmetic
  // (never against "today") that 1 August 2026 really is a Saturday —
  // matching the exact cross-check already proven in
  // research/source-investigations/fama-dalfama-lisbon-01/evidence/offline-proof.mjs
  assert.equal(new Date(Date.UTC(2026, 7, 1)).getUTCDay(), 6);
});

test("end is honestly NOT_PRESENT — no end time or duration exists anywhere in the retained evidence", async () => {
  const records = await loadFixtureRecords();
  const [obs] = toObservations(records.slice(0, 1), { retrievedAt: "2026-08-25T01:29:32Z" });
  assert.equal(obs.end.date, null);
  assert.equal(obs.end.iso, null);
  assert.equal(obs.end.certainty, "UNKNOWN");
});

// 4. shared page-level time is retained honestly, never promoted into a
// confirmed per-night instant

test("the shared page-level time text is retained in source_fields and description, never promoted into start.iso", async () => {
  const records = await loadFixtureRecords();
  const [obs] = toObservations(records.slice(0, 1), { retrievedAt: "2026-08-25T01:29:32Z" });
  assert.equal(obs.source_fields.shared_fado_start_time_text, "20h30");
  assert.equal(obs.source_fields.shared_opens_time_text, "19h00");
  assert.ok(obs.description.includes("20h30"));
  assert.equal(obs.start.iso, null);
  assert.equal(obs.start.certainty, "DATE_ONLY");
});

// 5. venue identity — single-venue source

test("venue_name/location_text carry this source's own single, proven venue identity", async () => {
  const records = await loadFixtureRecords();
  const [obs] = toObservations(records.slice(0, 1), { retrievedAt: "2026-08-25T01:29:32Z" });
  assert.equal(obs.venue_name, VENUE_NAME);
  assert.equal(obs.venue_name, "Fama D'Alfama");
  assert.equal(obs.location_text, VENUE_LOCATION_TEXT);
});

// 6. event_url deliberately NOT promoted (PARTIAL, not PROVEN); source_url retained

test("event_url stays null (PARTIAL, not per-night PROVEN) while source_url retains the one shared agenda page", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-25T01:29:32Z", sourceUrl: AGENDA_URL });
  for (const o of observations) {
    assert.equal(o.event_url, null);
    assert.equal(o.source_url, "https://famadalfama.pt/agenda-de-fados-em-lisboa/");
  }
});

// 7. price honestly absent

test("price_text is honestly null — NOT_PRESENT anywhere in the retained evidence", async () => {
  const records = await loadFixtureRecords();
  const [obs] = toObservations(records.slice(0, 1), { retrievedAt: "2026-08-25T01:29:32Z" });
  assert.equal(obs.price_text, null);
});

// 8. raw_day_block_text and performers retained in source_fields for provenance

test("raw_day_block_text and performers_text are retained in source_fields", async () => {
  const records = await loadFixtureRecords();
  const [obs] = toObservations(records.slice(0, 1), { retrievedAt: "2026-08-25T01:29:32Z" });
  assert.ok(obs.source_fields.raw_day_block_text.includes("01/08"));
  assert.deepEqual(obs.source_fields.performers_text, [
    "Miguel Dias & Matilde Cid",
    "Tomás Pauseiro – Guitarra Portuguesa",
    "Diogo de Castro – Viola de Fado",
  ]);
});

// 9. deterministic rerun

test("adaptation is deterministic against the same retained fixture", async () => {
  const records = await loadFixtureRecords();
  assert.deepEqual(
    toObservations(records, { retrievedAt: "2026-08-25T01:29:32Z" }),
    toObservations(records, { retrievedAt: "2026-08-25T01:29:32Z" }),
  );
});
