import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  extractCmSintraEventFacts,
  parseCmSintraAgendaMusicRecords,
} from "../ingestion/cm-sintra-agenda-cultural/discovery.mjs";
import {
  deriveSourceRecordId,
  SOURCE_ID,
  toObservation,
  toObservations,
} from "../ingestion/cm-sintra-agenda-cultural/observation-adapter.mjs";

async function fixture(name) {
  return readFile(new URL(`../fixtures/cm-sintra-agenda-cultural/${name}`, import.meta.url), "utf8");
}

async function listRecords() {
  return parseCmSintraAgendaMusicRecords(await fixture("agenda-musica-upcoming-excerpt.html"));
}

test("SOURCE_ID is the existing registry id, exactly", () => {
  assert.equal(SOURCE_ID, "cm-sintra-agenda-cultural");
});

// --- The core regression test this task requires: two different calendar
// dates of the SAME underlying production (internal id 148) must produce
// two DIFFERENT source_record_id values, because that internal id is
// proven NOT to be per-occurrence-unique (investigation.json
// field_assessment.source_record_id.notes) but the full permalink is.
test("REGRESSION: the two Evita dates share internal id 148 but produce two DIFFERENT source_record_id values", async () => {
  const [evita1, evita2] = await listRecords();

  assert.equal(evita1.date_iso, "2026-09-03");
  assert.equal(evita2.date_iso, "2026-09-04");
  assert.match(evita1.permalink, /evita-no-olga-cadaval-com-sofia-escobar-e-diogo-morgado\/2026-09-03-21-00$/);
  assert.match(evita2.permalink, /evita-no-olga-cadaval-com-sofia-escobar-e-diogo-morgado\/2026-09-04-21-00$/);

  const id1 = deriveSourceRecordId(evita1.permalink);
  const id2 = deriveSourceRecordId(evita2.permalink);
  assert.notEqual(id1, id2, "source_record_id must differ even though both dates share internal id 148");
  assert.equal(id1, "evita-no-olga-cadaval-com-sofia-escobar-e-diogo-morgado/2026-09-03-21-00");
  assert.equal(id2, "evita-no-olga-cadaval-com-sofia-escobar-e-diogo-morgado/2026-09-04-21-00");

  const obs1 = toObservation(evita1, { retrievedAt: "2026-08-27T09:48:00Z" });
  const obs2 = toObservation(evita2, { retrievedAt: "2026-08-27T09:48:00Z" });
  assert.notEqual(obs1.source_record_id, obs2.source_record_id);
  assert.equal(obs1.source_record_id, id1);
  assert.equal(obs2.source_record_id, id2);
});

test("deriveSourceRecordId returns the full slug+date-time path (this source's URLs never carry a numeric id prefix)", () => {
  const id = deriveSourceRecordId(
    "https://cm-sintra.pt/agenda/sintra-celebra-musica-e-mitologia-nas-noites-de-orfeu/2026-10-17-21-00",
  );
  assert.equal(id, "sintra-celebra-musica-e-mitologia-nas-noites-de-orfeu/2026-10-17-21-00");
});

test("deriveSourceRecordId throws on a missing or malformed permalink", () => {
  assert.throws(() => deriveSourceRecordId(""), /non-empty/);
  assert.throws(() => deriveSourceRecordId(null), /non-empty/);
  assert.throws(() => deriveSourceRecordId("https://cm-sintra.pt/not-agenda/x"), /agenda/);
});

test("toObservation uses the exact existing registry source_id", async () => {
  const [evita1] = await listRecords();
  const observation = toObservation(evita1, { retrievedAt: "2026-08-27T09:48:00Z" });
  assert.equal(observation.source_id, "cm-sintra-agenda-cultural");
  assert.equal(observation.source_id, SOURCE_ID);
});

test("toObservation throws without a permalink (never derives source_record_id from nothing)", () => {
  assert.throws(() => toObservation({ title: "x" }), /permalink/);
});

test("start.date/certainty match field_assessment.start_date's PROVEN/DIRECT_SOURCE state: DATE_ONLY, never fabricated to a UTC instant", async () => {
  const [evita1] = await listRecords();
  const observation = toObservation(evita1, { retrievedAt: "2026-08-27T09:48:00Z" });
  assert.equal(observation.start.date, "2026-09-03");
  assert.equal(observation.start.certainty, "DATE_ONLY");
  assert.equal(observation.start.iso, null);
  assert.equal(observation.start.is_utc, null);
  assert.equal(observation.start.tzid, null);
  assert.equal(observation.start.raw, "2026-09-03 21:00");
});

test("end is honestly empty; field_assessment.end.state is NOT_PRESENT and this adapter never fabricates one", async () => {
  const [evita1] = await listRecords();
  const observation = toObservation(evita1, { retrievedAt: "2026-08-27T09:48:00Z" });
  assert.deepEqual(observation.end, { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" });
});

// --- The two known productions this task's report is expected to cover.
test("venue_name is honestly null; location_text carries the source's own text for BOTH known productions", async () => {
  const [evita1, , orfeu] = await listRecords();

  const evitaObs = toObservation(evita1, { retrievedAt: "2026-08-27T09:48:00Z" });
  assert.equal(evitaObs.venue_name, null);
  assert.equal(evitaObs.location_text, "Centro Cultural Olga Cadaval");
  assert.equal(evitaObs.source_fields.venue_text, "Centro Cultural Olga Cadaval");

  const orfeuObs = toObservation(orfeu, { retrievedAt: "2026-08-27T09:48:00Z" });
  assert.equal(orfeuObs.venue_name, null);
  assert.equal(orfeuObs.location_text, "Museu Arqueológico de São Miguel de Odrinhas");
  assert.equal(orfeuObs.source_fields.venue_text, "Museu Arqueológico de São Miguel de Odrinhas");
});

test("price_text is honestly null for both known productions (no dedicated price field exists on this source)", async () => {
  const evitaFacts = await extractCmSintraEventFacts(await fixture("event-evita.html"));
  const orfeuFacts = await extractCmSintraEventFacts(await fixture("event-orfeu.html"));

  const evitaObs = toObservation(evitaFacts, { retrievedAt: "2026-08-27T09:48:00Z" });
  const orfeuObs = toObservation(orfeuFacts, { retrievedAt: "2026-08-27T09:48:00Z" });

  assert.equal(evitaObs.price_text, null);
  assert.equal(orfeuObs.price_text, null);
});

test("event_url is this source's own permalink, never a third-party ticketing URL", async () => {
  const evitaFacts = await extractCmSintraEventFacts(await fixture("event-evita.html"));
  const observation = toObservation(evitaFacts, { retrievedAt: "2026-08-27T09:48:00Z" });
  assert.equal(
    observation.event_url,
    "https://cm-sintra.pt/agenda/evita-no-olga-cadaval-com-sofia-escobar-e-diogo-morgado/2026-09-03-21-00",
  );
  assert.equal(observation.event_url, evitaFacts.permalink);
  assert.doesNotMatch(observation.event_url, /ticketline/);
});

test("raw_evidence is honestly non-byte-faithful (a bounded, curated excerpt, not the complete raw HTTP body)", async () => {
  const [evita1] = await listRecords();
  const observation = toObservation(evita1, {
    retrievedAt: "2026-08-27T09:48:00Z",
    fixturePath: "fixtures/cm-sintra-agenda-cultural/agenda-musica-upcoming-excerpt.html",
  });
  assert.equal(observation.raw_evidence.byte_faithful, false);
  assert.equal(observation.raw_evidence.fixture_path, "fixtures/cm-sintra-agenda-cultural/agenda-musica-upcoming-excerpt.html");
});

test("no coordinates or canonical Event/Venue ID are invented by this adapter", async () => {
  const [evita1] = await listRecords();
  const observation = toObservation(evita1, { retrievedAt: "2026-08-27T09:48:00Z" });
  const keys = Object.keys(observation);
  for (const forbidden of ["latitude", "longitude", "coordinates", "event_id", "canonical_event_id", "id", "venue_id"]) {
    assert.equal(keys.includes(forbidden), false, forbidden);
  }
});

test("toObservations converts every discovered list row end-to-end, all 3 source_record_id values distinct", async () => {
  const records = await listRecords();
  assert.equal(records.length, 3);

  const observations = toObservations(records, { retrievedAt: "2026-08-27T09:48:00Z" });
  assert.equal(observations.length, 3);
  const ids = observations.map((o) => o.source_record_id);
  assert.equal(new Set(ids).size, 3, "all 3 source_record_id values must be distinct, including the two id-148 dates");
  for (const o of observations) {
    assert.equal(o.source_id, "cm-sintra-agenda-cultural");
  }
});

test("Observation generation is deterministic from the same retained fixture", async () => {
  const [evita1] = await listRecords();
  const options = { retrievedAt: "2026-08-27T09:48:00Z" };
  assert.deepEqual(toObservation(evita1, options), toObservation(evita1, options));
});
