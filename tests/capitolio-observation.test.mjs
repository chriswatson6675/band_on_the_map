import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { SOURCE_ID, toObservation, toObservations } from "../ingestion/capitolio/observation-adapter.mjs";

const FIXTURE_PATH = new URL("../fixtures/capitolio/events.json", import.meta.url);

async function loadFixture() {
  return JSON.parse(await readFile(FIXTURE_PATH, "utf8"));
}

test("1. Capitólio records parse into independent Observations", async () => {
  const fixture = await loadFixture();
  const observations = toObservations(fixture);
  assert.equal(observations.length, 5);
  for (const observation of observations) {
    assert.equal(observation.source_id, SOURCE_ID);
    assert.equal(observation.source_id, "teatro-variedades-capitolio");
  }
});

test("2. Capitólio source identity is separate from Hot Clube", async () => {
  const fixture = await loadFixture();
  const observations = toObservations(fixture);
  for (const observation of observations) {
    assert.notEqual(observation.source_id, "hot-clube-de-portugal");
  }
});

test("3. Capitólio event URLs belong only to Capitólio Observations (each is that page's own URL)", async () => {
  const fixture = await loadFixture();
  const observations = toObservations(fixture);
  for (const [i, observation] of observations.entries()) {
    assert.equal(observation.event_url, fixture.records[i].url);
    assert.ok(observation.event_url.startsWith("https://teatrovariedades-capitolio.pt/evento/"));
  }
});

test("6. Capitólio does not borrow Hot Clube event_ids as its own source_record_id", async () => {
  const fixture = await loadFixture();
  const observations = toObservations(fixture);
  const hotClubeEventIds = new Set(["3786", "3788", "3790", "3793", "3794", "3795", "3797", "3799", "3801"]);
  for (const observation of observations) {
    assert.equal(hotClubeEventIds.has(observation.source_record_id), false);
  }
});

test("source_record_id is the WordPress shortlink post ID, not a slug or a guessed value", async () => {
  const fixture = await loadFixture();
  const observations = toObservations(fixture);
  const expectedIds = ["2908", "2909", "2911", "2913", "2915"];
  assert.deepEqual(observations.map((o) => o.source_record_id), expectedIds);
  for (const observation of observations) {
    assert.match(observation.source_record_id, /^\d+$/, "must be purely numeric, from the shortlink header");
  }
});

test("price_text is retained only for Bode Wilson; every other record honestly has none", async () => {
  const fixture = await loadFixture();
  const observations = toObservations(fixture);
  const bodeWilson = observations.find((o) => o.title === "Bode Wilson");
  assert.equal(bodeWilson.price_text, "5€");

  const others = observations.filter((o) => o.title !== "Bode Wilson");
  assert.equal(others.length, 4);
  for (const observation of others) {
    assert.equal(observation.price_text, null);
  }
});

test("11-12. a page-specific ticket URL is retained only in source_fields.ticket_url, never as event_url, and no Offer is modelled", async () => {
  const fixture = await loadFixture();
  const observations = toObservations(fixture);
  const bodeWilson = observations.find((o) => o.title === "Bode Wilson");
  assert.equal(bodeWilson.source_fields.ticket_url, "https://hajazznoparquemayer.bol.pt/Comprar/Bilhetes/180745-bode_wilson-capitolio/");
  assert.notEqual(bodeWilson.event_url, bodeWilson.source_fields.ticket_url);
  assert.equal(bodeWilson.event_url, "https://teatrovariedades-capitolio.pt/evento/bode-wilson/");

  for (const observation of observations) {
    const keys = Object.keys(observation);
    for (const forbidden of ["offer", "offers", "price", "ticket_price"]) {
      assert.equal(keys.includes(forbidden), false);
    }
  }
});

test("no coordinates or canonical Event ID are invented by this adapter", async () => {
  const fixture = await loadFixture();
  const observations = toObservations(fixture);
  for (const observation of observations) {
    const keys = Object.keys(observation);
    for (const forbidden of ["latitude", "longitude", "coordinates", "event_id", "canonical_event_id", "id"]) {
      assert.equal(keys.includes(forbidden), false, forbidden);
    }
  }
});

test("toObservation throws without a wp_shortlink_post_id (never derives one from the URL)", () => {
  assert.throws(() => toObservation({ url: "https://teatrovariedades-capitolio.pt/evento/x/", title: "X" }));
});

test("Observation generation is deterministic from the retained fixture", async () => {
  const fixture = await loadFixture();
  assert.deepEqual(toObservations(fixture), toObservations(fixture));
});

test("raw_evidence is honestly non-byte-faithful (a curated fact extract, not the raw HTTP body)", async () => {
  const fixture = await loadFixture();
  const observations = toObservations(fixture);
  for (const observation of observations) {
    assert.equal(observation.raw_evidence.byte_faithful, false);
    assert.equal(observation.raw_evidence.fixture_path, "fixtures/capitolio/events.json");
  }
});
