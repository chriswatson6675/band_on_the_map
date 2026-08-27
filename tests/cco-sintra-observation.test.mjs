import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractCcoSintraEventFacts, parseCcoSintraAgendaLinks } from "../ingestion/cco-sintra/discovery.mjs";
import {
  deriveSourceRecordId,
  SOURCE_ID,
  toObservation,
  toObservations,
} from "../ingestion/cco-sintra/observation-adapter.mjs";

async function fixture(name) {
  return readFile(new URL(`../fixtures/cco-sintra/${name}`, import.meta.url), "utf8");
}

async function factsFor(name) {
  return extractCcoSintraEventFacts(await fixture(name));
}

test("SOURCE_ID is the existing registry id, exactly", () => {
  assert.equal(SOURCE_ID, "cco-sintra");
});

// --- The core regression test this task requires: two different calendar
// dates of the SAME underlying production (bare content-item id 543) must
// produce two DIFFERENT source_record_id values, because the bare id is
// proven NOT to be per-occurrence-unique (investigation.json
// field_assessment.source_record_id.notes) but the full permalink is.
test("REGRESSION: the two Evita dates share bare id 543 but produce two DIFFERENT source_record_id values", async () => {
  const evita1 = await factsFor("event-evita1.html");
  const evita2 = await factsFor("event-evita2.html");

  // Both permalinks genuinely start with the same bare content-item id.
  assert.match(evita1.permalink, /\/agenda\/543-/);
  assert.match(evita2.permalink, /\/agenda\/543-/);
  assert.equal(evita1.date_iso, "2026-09-03");
  assert.equal(evita2.date_iso, "2026-09-04");

  const id1 = deriveSourceRecordId(evita1.permalink);
  const id2 = deriveSourceRecordId(evita2.permalink);
  assert.notEqual(id1, id2, "source_record_id must differ even though the bare numeric id (543) is identical");
  assert.equal(id1, "543-ciclo-de-teatro-evita-com-sofia-escobar-e-diogo-morgado/2026-09-03-21-00");
  assert.equal(id2, "543-ciclo-de-teatro-evita-com-sofia-escobar-e-diogo-morgado/2026-09-04-21-00");

  const obs1 = toObservation(evita1, { retrievedAt: "2026-08-27T08:00:00Z" });
  const obs2 = toObservation(evita2, { retrievedAt: "2026-08-27T08:00:00Z" });
  assert.notEqual(obs1.source_record_id, obs2.source_record_id);
  assert.equal(obs1.source_record_id, id1);
  assert.equal(obs2.source_record_id, id2);
});

test("deriveSourceRecordId never returns the bare numeric id alone", () => {
  const id = deriveSourceRecordId("https://ccolgacadaval.pt/agenda/519-gnr/2026-09-11-21-00");
  assert.notEqual(id, "519");
  assert.equal(id, "519-gnr/2026-09-11-21-00");
});

test("deriveSourceRecordId throws on a missing or malformed permalink", () => {
  assert.throws(() => deriveSourceRecordId(""), /non-empty/);
  assert.throws(() => deriveSourceRecordId(null), /non-empty/);
  assert.throws(() => deriveSourceRecordId("https://ccolgacadaval.pt/not-agenda/519-gnr"), /agenda/);
});

test("toObservation uses the exact existing registry source_id", async () => {
  const facts = await factsFor("event-gnr.html");
  const observation = toObservation(facts, { retrievedAt: "2026-08-27T08:00:00Z" });
  assert.equal(observation.source_id, "cco-sintra");
  assert.equal(observation.source_id, SOURCE_ID);
});

test("toObservation throws without a permalink (never derives source_record_id from nothing)", () => {
  assert.throws(() => toObservation({ title: "x" }), /permalink/);
});

test("start.date/certainty match field_assessment.start_date's PROVEN/DIRECT_SOURCE state: DATE_ONLY, never fabricated to a UTC instant", async () => {
  const facts = await factsFor("event-gnr.html");
  const observation = toObservation(facts, { retrievedAt: "2026-08-27T08:00:00Z" });
  assert.equal(observation.start.date, "2026-09-11");
  assert.equal(observation.start.certainty, "DATE_ONLY");
  assert.equal(observation.start.iso, null);
  assert.equal(observation.start.is_utc, null);
  assert.equal(observation.start.tzid, null);
  assert.equal(observation.start.raw, "2026-09-11 21:00");
});

test("start.date is still honestly PROVEN (DATE_ONLY) even when time_text is genuinely absent (event id 551)", async () => {
  const facts = await factsFor("event-orquestra.html");
  assert.equal(facts.time_text, null);
  const observation = toObservation(facts, { retrievedAt: "2026-08-27T08:00:00Z" });
  assert.equal(observation.start.date, "2026-09-20");
  assert.equal(observation.start.certainty, "DATE_ONLY");
  assert.equal(observation.start.raw, "2026-09-20");
});

test("end is honestly empty; free-text duration is never fabricated into an end instant", async () => {
  const facts = await factsFor("event-gnr.html"); // GNR has a "Duração: 75 minutos" free-text sentence
  const observation = toObservation(facts, { retrievedAt: "2026-08-27T08:00:00Z" });
  assert.deepEqual(observation.end, { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" });
});

test("venue_name is honestly null; the per-event auditorium is retained only in location_text/source_fields", async () => {
  const facts = await factsFor("event-gnr.html");
  const observation = toObservation(facts, { retrievedAt: "2026-08-27T08:00:00Z" });
  assert.equal(observation.venue_name, null);
  assert.equal(observation.location_text, "Auditório Jorge Sampaio");
  assert.equal(observation.source_fields.venue_text, "Auditório Jorge Sampaio");
});

test("price_text is retained verbatim where present (GNR) and honestly null where absent (Evita, orquestra)", async () => {
  const gnr = toObservation(await factsFor("event-gnr.html"), { retrievedAt: "2026-08-27T08:00:00Z" });
  const evita1 = toObservation(await factsFor("event-evita1.html"), { retrievedAt: "2026-08-27T08:00:00Z" });
  const orquestra = toObservation(await factsFor("event-orquestra.html"), { retrievedAt: "2026-08-27T08:00:00Z" });

  assert.equal(gnr.price_text, "1ª e 2ª Plateia: 25,00 € | Balcão e Galerias: 20,00 €");
  assert.equal(evita1.price_text, null);
  assert.equal(orquestra.price_text, null);
});

test("event_url is this source's own permalink, never a third-party ticketing URL", async () => {
  const facts = await factsFor("event-gnr.html");
  const observation = toObservation(facts, { retrievedAt: "2026-08-27T08:00:00Z" });
  assert.equal(observation.event_url, "https://ccolgacadaval.pt/agenda/519-gnr/2026-09-11-21-00");
  assert.equal(observation.event_url, facts.permalink);
});

test("raw_evidence is honestly non-byte-faithful (a bounded, curated excerpt, not the complete raw HTTP body)", async () => {
  const facts = await factsFor("event-gnr.html");
  const observation = toObservation(facts, {
    retrievedAt: "2026-08-27T08:00:00Z",
    fixturePath: "fixtures/cco-sintra/event-gnr.html",
  });
  assert.equal(observation.raw_evidence.byte_faithful, false);
  assert.equal(observation.raw_evidence.fixture_path, "fixtures/cco-sintra/event-gnr.html");
});

test("no coordinates or canonical Event/Venue ID are invented by this adapter", async () => {
  const facts = await factsFor("event-gnr.html");
  const observation = toObservation(facts, { retrievedAt: "2026-08-27T08:00:00Z" });
  const keys = Object.keys(observation);
  for (const forbidden of ["latitude", "longitude", "coordinates", "event_id", "canonical_event_id", "id", "venue_id"]) {
    assert.equal(keys.includes(forbidden), false, forbidden);
  }
});

test("toObservations converts every discovered+extracted list-page-1 event end-to-end", async () => {
  const listHtml = await fixture("agenda-page-1-excerpt.html");
  const links = parseCcoSintraAgendaLinks(listHtml);
  assert.equal(links.length, 5);

  // This bounded fixture set only retains full detail-page HTML for the
  // GNR and both Evita permalinks; adapt just those, proving the full
  // discovery -> extraction -> adaptation pipeline end-to-end.
  const detailFixtureByPermalink = {
    "https://ccolgacadaval.pt/agenda/519-gnr/2026-09-11-21-00": "event-gnr.html",
    "https://ccolgacadaval.pt/agenda/543-ciclo-de-teatro-evita-com-sofia-escobar-e-diogo-morgado/2026-09-03-21-00": "event-evita1.html",
    "https://ccolgacadaval.pt/agenda/543-ciclo-de-teatro-evita-com-sofia-escobar-e-diogo-morgado/2026-09-04-21-00": "event-evita2.html",
  };

  const records = [];
  for (const link of links) {
    const fixtureName = detailFixtureByPermalink[link];
    if (!fixtureName) continue;
    records.push(await factsFor(fixtureName));
  }
  assert.equal(records.length, 3);

  const observations = toObservations(records, { retrievedAt: "2026-08-27T08:00:00Z" });
  assert.equal(observations.length, 3);
  const ids = observations.map((o) => o.source_record_id);
  assert.equal(new Set(ids).size, 3, "all 3 source_record_id values must be distinct, including the two id-543 dates");
  for (const o of observations) {
    assert.equal(o.source_id, "cco-sintra");
  }
});

test("Observation generation is deterministic from the same retained fixture", async () => {
  const facts = await factsFor("event-gnr.html");
  const options = { retrievedAt: "2026-08-27T08:00:00Z" };
  assert.deepEqual(toObservation(facts, options), toObservation(facts, options));
});
