import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseGulbenkianEventDetail } from "../ingestion/gulbenkian/discovery.mjs";
import { SOURCE_ID, toObservation, toObservations } from "../ingestion/gulbenkian/observation-adapter.mjs";

const RETRIEVED_AT = "2026-08-25T00:37:58Z";

async function loadRecord(slug) {
  const html = await readFile(new URL(`../fixtures/gulbenkian/pages/${slug}.html`, import.meta.url), "utf8");
  return parseGulbenkianEventDetail(html);
}

test("createObservation() succeeds for an honestly-certain Gulbenkian record", async () => {
  const record = await loadRecord("kafka-fragmente");
  const observation = toObservation(record, {
    retrievedAt: "2026-08-25T00:37:58Z",
    fixturePath: "fixtures/gulbenkian/pages/kafka-fragmente.html",
  });

  assert.equal(observation.source_id, "gulbenkian");
  assert.equal(observation.source_id, SOURCE_ID);
  assert.equal(observation.source_record_id, "106787");
  assert.equal(observation.retrieved_at, "2026-08-25T00:37:58Z");
  assert.equal(observation.title, "Kafka-Fragmente");
  assert.equal(observation.event_url, "https://gulbenkian.pt/musica/agenda/kafka-fragmente/");
  assert.equal(observation.price_text, "Entrada gratuita");
});

test("datetime certainty is honestly FLOATING_LOCAL, never UTC_INSTANT (no timezone/offset in the source's own JSON-LD)", async () => {
  const record = await loadRecord("beatrice-rana-4");
  const observation = toObservation(record, { retrievedAt: RETRIEVED_AT });

  assert.equal(observation.start.certainty, "FLOATING_LOCAL");
  assert.equal(observation.end.certainty, "FLOATING_LOCAL");
  assert.equal(observation.start.date, "2026-10-11");
  assert.equal(observation.start.raw, "2026-10-11T18:00:00");
  assert.equal(observation.start.iso, null, "never a confirmed UTC instant");
  assert.notEqual(observation.start.certainty, "UTC_INSTANT");
  assert.notEqual(observation.end.certainty, "UTC_INSTANT");
});

test("venue_name is never hardcoded — this source varies location per event", async () => {
  const [vale, kafka] = await Promise.all([loadRecord("vale-do-silencio-3"), loadRecord("kafka-fragmente")]);
  const valeObs = toObservation(vale, { retrievedAt: RETRIEVED_AT });
  const kafkaObs = toObservation(kafka, { retrievedAt: RETRIEVED_AT });

  assert.equal(valeObs.venue_name, null);
  assert.equal(kafkaObs.venue_name, null);
  assert.equal(valeObs.location_text, "Parque Vale do Silêncio");
  assert.equal(kafkaObs.location_text, "Grande Auditório");
  assert.notEqual(valeObs.location_text, kafkaObs.location_text);
});

test("description is honestly null when the source's own JSON-LD genuinely omits it (Beatrice Rana)", async () => {
  const record = await loadRecord("beatrice-rana-4");
  const observation = toObservation(record, { retrievedAt: RETRIEVED_AT });
  assert.equal(observation.description, null);
});

test("description is retained verbatim when the source does provide it", async () => {
  const record = await loadRecord("vale-do-silencio-3");
  const observation = toObservation(record, { retrievedAt: RETRIEVED_AT });
  assert.equal(observation.description, "Coro e Orquestra Gulbenkian");
});

test("toObservation throws without a source_record_id (never derives one from a title/slug)", () => {
  assert.throws(() => toObservation({ title: "X", event_url: "https://gulbenkian.pt/musica/agenda/x/" }));
});

test("toObservations converts every fixture record, all sharing the same source_id", async () => {
  const records = await Promise.all(
    ["vale-do-silencio-3", "kafka-fragmente", "quarteto-diotima", "beatrice-rana-4"].map(loadRecord),
  );
  const observations = toObservations(records, { retrievedAt: RETRIEVED_AT });

  assert.equal(observations.length, 4);
  for (const observation of observations) {
    assert.equal(observation.source_id, "gulbenkian");
  }
  assert.deepEqual(
    observations.map((o) => o.source_record_id),
    ["106594", "106787", "106799", "106821"],
  );
});

test("raw_evidence is honestly non-byte-faithful (a bounded excerpt, not the full raw HTTP response)", async () => {
  const record = await loadRecord("kafka-fragmente");
  const observation = toObservation(record, {
    retrievedAt: RETRIEVED_AT,
    fixturePath: "fixtures/gulbenkian/pages/kafka-fragmente.html",
  });

  assert.equal(observation.raw_evidence.byte_faithful, false);
  assert.equal(observation.raw_evidence.fixture_path, "fixtures/gulbenkian/pages/kafka-fragmente.html");
  assert.equal(observation.raw_evidence.evidence_kind, "PARSED_STRUCTURED_HTML");
});

test("no coordinates or canonical Event ID are invented by this adapter", async () => {
  const record = await loadRecord("kafka-fragmente");
  const observation = toObservation(record, { retrievedAt: RETRIEVED_AT });
  const keys = Object.keys(observation);
  for (const forbidden of ["latitude", "longitude", "coordinates", "event_id", "canonical_event_id", "venue_id"]) {
    assert.equal(keys.includes(forbidden), false, forbidden);
  }
});

test("Observation generation is deterministic from the retained fixtures", async () => {
  const records = await Promise.all(["vale-do-silencio-3", "kafka-fragmente"].map(loadRecord));
  const options = { retrievedAt: RETRIEVED_AT };
  assert.deepEqual(toObservations(records, options), toObservations(records, options));
});
