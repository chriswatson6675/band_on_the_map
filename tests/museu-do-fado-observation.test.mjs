import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractMuseuDoFadoEventFacts } from "../ingestion/museu-do-fado/discovery.mjs";
import { SOURCE_ID, deriveSourceRecordId, toObservation, toObservations } from "../ingestion/museu-do-fado/observation-adapter.mjs";

const SLUGS = ["marco-rodrigues-canta-carlos-do-carmo", "sul", "pop-up-fado-4", "o-fado-sou-eu"];

async function factsFor(slug) {
  const html = await readFile(new URL(`../fixtures/museu-do-fado/pages/detail-${slug}.html`, import.meta.url), "utf8");
  return extractMuseuDoFadoEventFacts(html);
}

async function allFacts() {
  return Promise.all(SLUGS.map((slug) => factsFor(slug)));
}

test("createObservation() succeeds with honestly-certain fields for a real sampled event (Marco Rodrigues canta Carlos do Carmo)", async () => {
  const facts = await factsFor("marco-rodrigues-canta-carlos-do-carmo");
  const observation = toObservation(facts, {
    retrievedAt: "2026-08-25T01:33:10Z",
    fixturePath: "fixtures/museu-do-fado/pages/detail-marco-rodrigues-canta-carlos-do-carmo.html",
  });

  assert.equal(observation.source_id, "museu-do-fado");
  assert.equal(observation.source_id, SOURCE_ID);
  assert.equal(observation.source_record_id, "marco-rodrigues-canta-carlos-do-carmo");
  assert.equal(observation.title, "Marco Rodrigues canta Carlos do Carmo");
  assert.equal(observation.event_url, "https://museudofado.pt/evento/marco-rodrigues-canta-carlos-do-carmo");
  assert.equal(observation.location_text, "Centro Cultural de Belém - Grande Auditório");
  assert.equal(observation.venue_name, null, "venue name is never invented from an unresolved location string");
  assert.equal(observation.price_text, "12,50€-25,00€");

  assert.equal(observation.start.date, "2026-11-07");
  assert.equal(observation.start.certainty, "FLOATING_LOCAL");
  assert.equal(observation.start.iso, null, "never promoted to a fabricated UTC instant");
  assert.equal(observation.start.is_utc, null);
  assert.equal(observation.start.tzid, null);

  assert.equal(observation.end.date, "2026-11-07");
  assert.equal(observation.end.certainty, "FLOATING_LOCAL");
});

test("createObservation() succeeds for a second real sampled event (SUL)", async () => {
  const facts = await factsFor("sul");
  const observation = toObservation(facts, { retrievedAt: "2026-08-25T01:33:12Z" });

  assert.equal(observation.source_record_id, "sul");
  assert.equal(observation.start.date, "2026-10-30");
  assert.equal(observation.start.certainty, "FLOATING_LOCAL");
  assert.equal(observation.end.date, "2026-10-30");
  assert.equal(observation.price_text, "12,00€-15,00€");
});

test("source_record_id is derived only from the event page's own URL slug, never guessed", async () => {
  const facts = await allFacts();
  const observations = facts.map((f) => toObservation(f, { retrievedAt: "2026-08-25T01:33:10Z" }));
  assert.deepEqual(
    observations.map((o) => o.source_record_id),
    SLUGS,
  );
  for (const observation of observations) {
    assert.equal(observation.source_fields.source_record_id_basis, "URL_SLUG_PARTIAL_UNCONFIRMED_STABILITY");
  }
});

test("deriveSourceRecordId only accepts this source's own detail-page URL shape", () => {
  assert.equal(deriveSourceRecordId("https://museudofado.pt/evento/sul"), "sul");
  assert.equal(deriveSourceRecordId("https://museudofado.pt/evento/sul/"), null, "trailing slash is not this source's own shape");
  assert.equal(deriveSourceRecordId("https://www.bol.pt/Comprar/Bilhetes/162165-x/"), null, "never borrows a third-party ticketing URL/id");
  assert.equal(deriveSourceRecordId(null), null);
  assert.equal(deriveSourceRecordId(undefined), null);
});

test("toObservation throws without a usable event_url (never derives a source_record_id another way)", () => {
  assert.throws(() => toObservation({ title: "X", event_url: null }), /event_url/);
  assert.throws(() => toObservation({ title: "X", event_url: "https://example.com/not-museu-do-fado" }), /event_url/);
});

test("toObservations converts every fixture-derived facts object independently", async () => {
  const facts = await allFacts();
  const observations = toObservations(facts, { retrievedAt: "2026-08-25T01:33:10Z" });
  assert.equal(observations.length, SLUGS.length);
  for (const observation of observations) {
    assert.equal(observation.source_id, "museu-do-fado");
  }
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, SLUGS.length, "distinct identities, no collisions");
});

test("Observation generation is deterministic from the same retained facts", async () => {
  const facts = await factsFor("pop-up-fado-4");
  const a = toObservation(facts, { retrievedAt: "2026-08-25T01:33:13Z" });
  const b = toObservation(facts, { retrievedAt: "2026-08-25T01:33:13Z" });
  assert.deepEqual(a, b);
});

test("raw_evidence is honestly non-byte-faithful (a bounded excerpt, not the full HTTP response body)", async () => {
  const facts = await factsFor("o-fado-sou-eu");
  const observation = toObservation(facts, {
    retrievedAt: "2026-08-25T01:33:14Z",
    fixturePath: "fixtures/museu-do-fado/pages/detail-o-fado-sou-eu.html",
  });
  assert.equal(observation.raw_evidence.byte_faithful, false);
  assert.equal(observation.raw_evidence.fixture_path, "fixtures/museu-do-fado/pages/detail-o-fado-sou-eu.html");
  assert.equal(observation.raw_evidence.evidence_kind, "PARSED_STRUCTURED_HTML");
});

test("no coordinates or canonical Event ID are invented by this adapter", async () => {
  const facts = await allFacts();
  const observations = toObservations(facts, { retrievedAt: "2026-08-25T01:33:10Z" });
  for (const observation of observations) {
    const keys = Object.keys(observation);
    for (const forbidden of ["latitude", "longitude", "coordinates", "event_id", "canonical_event_id", "id", "offer", "offers"]) {
      assert.equal(keys.includes(forbidden), false, forbidden);
    }
  }
});
