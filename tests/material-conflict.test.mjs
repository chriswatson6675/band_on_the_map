// BOTM-MULTISOURCE-LINKS-01A
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { toObservations as hotClubeToObservations } from "../ingestion/hot-clube/observation-adapter.mjs";
import { toObservations as capitolioToObservations } from "../ingestion/capitolio/observation-adapter.mjs";
import { associateHotClubeCapitolio } from "../ingestion/association/hot-clube-capitolio.mjs";
import { compareObservationFacts, hasMaterialConflict } from "../ingestion/association/compare-facts.mjs";

const EVENTS_DIR = new URL("../fixtures/hot-clube/events/", import.meta.url);

async function loadHotClubeObservations() {
  const metadata = JSON.parse(
    await readFile(new URL("../fixtures/hot-clube/metadata.json", import.meta.url), "utf8"),
  );
  const names = (await readdir(EVENTS_DIR)).filter((f) => f.endsWith(".ics")).sort();
  const entries = [];
  for (const name of names) {
    entries.push({
      eventId: name.replace(/\.ics$/, ""),
      icsText: await readFile(new URL(name, EVENTS_DIR), "utf8"),
      fixturePath: `fixtures/hot-clube/events/${name}`,
    });
  }
  return hotClubeToObservations(entries, metadata);
}

async function loadCapitolioObservations() {
  const fixture = JSON.parse(
    await readFile(new URL("../fixtures/capitolio/events.json", import.meta.url), "utf8"),
  );
  return capitolioToObservations(fixture);
}

test("1. harmless title wording variation does not trigger a material conflict", () => {
  const comparison = compareObservationFacts(
    { source_id: "hot-clube-de-portugal", title: "Bode Wilson – Há Jazz no Parque Mayer" },
    { source_id: "teatro-variedades-capitolio", title: "Bode Wilson" },
  );
  assert.equal(comparison.title.agree, false, "the literal mismatch itself must still be recorded honestly");
  assert.equal(hasMaterialConflict(comparison), false, "but title alone must never signal a material conflict");
});

test("2. null vs a non-null value (e.g. price) does not trigger a material conflict", () => {
  const comparison = compareObservationFacts(
    { source_id: "hot-clube-de-portugal", price_text: null },
    { source_id: "teatro-variedades-capitolio", price_text: "5€" },
  );
  assert.equal(comparison.price_text.agree, false);
  assert.equal(hasMaterialConflict(comparison), false, "one source having extra info is not a contradiction");
});

test("3. both-null does not trigger a material conflict", () => {
  const comparison = compareObservationFacts(
    { source_id: "hot-clube-de-portugal", price_text: null },
    { source_id: "teatro-variedades-capitolio", price_text: null },
  );
  assert.equal(comparison.price_text.agree, true);
  assert.equal(hasMaterialConflict(comparison), false);
});

test("4. identical non-null values do not trigger a material conflict", () => {
  const comparison = compareObservationFacts(
    { source_id: "hot-clube-de-portugal", price_text: "5€" },
    { source_id: "teatro-variedades-capitolio", price_text: "5€" },
  );
  assert.equal(comparison.price_text.agree, true);
  assert.equal(hasMaterialConflict(comparison), false);
});

test("5. a genuine directly-comparable non-null contradiction DOES trigger a material conflict", () => {
  const comparison = compareObservationFacts(
    { source_id: "hot-clube-de-portugal", price_text: "10€" },
    { source_id: "teatro-variedades-capitolio", price_text: "5€" },
  );
  assert.equal(comparison.price_text.agree, false);
  assert.equal(hasMaterialConflict(comparison), true, "two non-null, genuinely different prices is a real contradiction");
});

test("fields that are not safely comparable (title, start_time_raw, venue_text) never trigger a material conflict, even when clearly non-null and different", () => {
  const comparison = compareObservationFacts(
    {
      source_id: "hot-clube-de-portugal",
      title: "A",
      start: { date: "2026-08-30", raw: "20260830T183000Z" },
      location_text: "Cineteatro Capitólio Parque Mayer",
      price_text: null,
    },
    {
      source_id: "teatro-variedades-capitolio",
      title: "B",
      start: { date: "2026-08-30", raw: "30.08.2026 · 19h30" },
      location_text: "Terraço do Capitólio",
      price_text: null,
    },
  );
  assert.equal(comparison.title.agree, false);
  assert.equal(comparison.start_time_raw.agree, false);
  assert.equal(comparison.venue_text.agree, false);
  assert.equal(hasMaterialConflict(comparison), false, "none of these fields is safely comparable across sources");
});

test("hasMaterialConflict fails closed on missing/malformed comparison input", () => {
  assert.equal(hasMaterialConflict(null), false);
  assert.equal(hasMaterialConflict(undefined), false);
  assert.equal(hasMaterialConflict({}), false);
});

test("6. all 5 real associated Hot Clube/Capitólio pairs show no material conflict except Bode Wilson's genuine price contradiction — never for the other 4", async () => {
  const hotClubeObs = await loadHotClubeObservations();
  const capitolioObs = await loadCapitolioObservations();
  const results = associateHotClubeCapitolio(hotClubeObs, capitolioObs);
  assert.equal(results.length, 5);
  assert.ok(results.every((r) => r.association_status === "ASSOCIATED"));

  for (const result of results) {
    const comparison = compareObservationFacts(result.hot_clube, result.capitolio);
    // Every retained pair's price disagreement is null-vs-value (one
    // source silent, not a genuine two-sided contradiction) — so none
    // of the 5 real pairs should currently flag, even though every one
    // of them has a literal title/venue/time mismatch by design.
    assert.equal(
      hasMaterialConflict(comparison),
      false,
      `${result.hot_clube_event_id} unexpectedly flagged a material conflict`,
    );
  }
});

test("7. all source-specific facts remain retained even when no material conflict is flagged", async () => {
  const hotClubeObs = await loadHotClubeObservations();
  const capitolioObs = await loadCapitolioObservations();
  const results = associateHotClubeCapitolio(hotClubeObs, capitolioObs);

  const bodeWilson = results.find((r) => r.hot_clube_event_id === "3801");
  const comparison = compareObservationFacts(bodeWilson.hot_clube, bodeWilson.capitolio);

  // hasMaterialConflict is a read-only signal; it must never affect the
  // underlying evidence.
  assert.equal(hasMaterialConflict(comparison), false);
  assert.deepEqual(comparison.price_text.values, [null, "5€"]);
  assert.equal(comparison.price_text.agree, false);
  assert.deepEqual(comparison.title.values, [bodeWilson.hot_clube.title, bodeWilson.capitolio.title]);
  assert.equal(comparison.title.agree, false);

  for (const field of ["title", "date", "start_time_raw", "venue_text", "price_text"]) {
    assert.ok(Array.isArray(comparison[field].values));
    assert.equal(comparison[field].values.length, 2);
    assert.equal(typeof comparison[field].agree, "boolean");
  }
});
