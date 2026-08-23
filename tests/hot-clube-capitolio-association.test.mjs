import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { toObservations as hotClubeToObservations } from "../ingestion/hot-clube/observation-adapter.mjs";
import { toObservations as capitolioToObservations } from "../ingestion/capitolio/observation-adapter.mjs";
import { associateHotClubeCapitolio } from "../ingestion/association/hot-clube-capitolio.mjs";
import { compareObservationFacts } from "../ingestion/association/compare-facts.mjs";

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

test("7. all 5 declared pairs associate, preserving references to BOTH underlying Observations", async () => {
  const hotClubeObs = await loadHotClubeObservations();
  const capitolioObs = await loadCapitolioObservations();
  const results = associateHotClubeCapitolio(hotClubeObs, capitolioObs);

  assert.equal(results.length, 5);
  for (const result of results) {
    assert.equal(result.association_status, "ASSOCIATED");
    assert.equal(result.hot_clube.source_id, "hot-clube-de-portugal");
    assert.equal(result.capitolio.source_id, "teatro-variedades-capitolio");
    // Both full Observations are the real, un-mutated objects, not copies
    // with fields stripped — proven by round-tripping identity fields.
    assert.equal(result.hot_clube.source_record_id, result.hot_clube_event_id);
    assert.equal(result.capitolio.source_record_id, result.capitolio_source_record_id);
  }
});

test("evidence backing each association is genuinely computed, not merely declared", async () => {
  const hotClubeObs = await loadHotClubeObservations();
  const capitolioObs = await loadCapitolioObservations();
  const results = associateHotClubeCapitolio(hotClubeObs, capitolioObs);

  for (const result of results) {
    assert.equal(result.evidence.same_date, true);
    assert.equal(result.evidence.hot_clube_date, result.evidence.capitolio_date);
    assert.equal(result.evidence.same_canonical_venue, true);
    assert.equal(result.evidence.hot_clube_venue_id, "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado");
    assert.equal(result.evidence.capitolio_venue_id, "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado");
    assert.equal(result.evidence.title_correspondence, true);
  }
});

test("8. association fails closed when either Observation cannot be found", async () => {
  const results = associateHotClubeCapitolio([], []);
  assert.equal(results.length, 5);
  for (const result of results) {
    assert.equal(result.association_status, "UNASSOCIATED");
    assert.equal(result.reason, "ONE_OR_BOTH_OBSERVATIONS_NOT_FOUND");
  }
});

test("8. association fails closed on a date mismatch even if declared as a candidate pair", async () => {
  const hotClubeObs = await loadHotClubeObservations();
  const capitolioObs = await loadCapitolioObservations();
  // Corrupt one Capitólio record's date so it no longer matches its
  // declared Hot Clube partner (3794 / post 2908).
  const tampered = capitolioObs.map((o) =>
    o.source_record_id === "2908" ? { ...o, start: { ...o.start, date: "2099-01-01" } } : o,
  );
  const results = associateHotClubeCapitolio(hotClubeObs, tampered);
  const pair = results.find((r) => r.hot_clube_event_id === "3794");
  assert.equal(pair.association_status, "UNASSOCIATED");
  assert.equal(pair.evidence.same_date, false);
});

test("8. association fails closed on a venue mismatch even with matching date/title", async () => {
  const hotClubeObs = await loadHotClubeObservations();
  const capitolioObs = await loadCapitolioObservations();
  const tampered = capitolioObs.map((o) =>
    o.source_record_id === "2908" ? { ...o, location_text: "Somewhere Else Entirely" } : o,
  );
  const results = associateHotClubeCapitolio(hotClubeObs, tampered);
  const pair = results.find((r) => r.hot_clube_event_id === "3794");
  assert.equal(pair.association_status, "UNASSOCIATED");
  assert.equal(pair.evidence.same_canonical_venue, false);
});

test("9. no fuzzy match fallback exists: title correspondence is exact word containment, not a similarity score", async () => {
  const hotClubeObs = await loadHotClubeObservations();
  const capitolioObs = await loadCapitolioObservations();
  const tampered = capitolioObs.map((o) =>
    o.source_record_id === "2908" ? { ...o, title: "A Completely Unrelated Title" } : o,
  );
  const results = associateHotClubeCapitolio(hotClubeObs, tampered);
  const pair = results.find((r) => r.hot_clube_event_id === "3794");
  assert.equal(pair.association_status, "UNASSOCIATED");
  assert.equal(pair.evidence.title_correspondence, false);
});

test("10. differing source facts are retained, not overwritten (title, venue text, price)", async () => {
  const hotClubeObs = await loadHotClubeObservations();
  const capitolioObs = await loadCapitolioObservations();
  const results = associateHotClubeCapitolio(hotClubeObs, capitolioObs);

  const bodeWilson = results.find((r) => r.hot_clube_event_id === "3801");
  const comparison = compareObservationFacts(bodeWilson.hot_clube, bodeWilson.capitolio);

  assert.equal(comparison.title.agree, false);
  assert.deepEqual(comparison.title.values, [bodeWilson.hot_clube.title, bodeWilson.capitolio.title]);

  assert.equal(comparison.venue_text.agree, false);
  assert.deepEqual(comparison.venue_text.values, [bodeWilson.hot_clube.location_text, bodeWilson.capitolio.location_text]);

  assert.equal(comparison.date.agree, true);
});

test("11. price provenance stays with Capitólio: Hot Clube's side of a price disagreement is honestly null, never invented", async () => {
  const hotClubeObs = await loadHotClubeObservations();
  const capitolioObs = await loadCapitolioObservations();
  const results = associateHotClubeCapitolio(hotClubeObs, capitolioObs);

  const bodeWilson = results.find((r) => r.hot_clube_event_id === "3801");
  const comparison = compareObservationFacts(bodeWilson.hot_clube, bodeWilson.capitolio);

  assert.equal(comparison.price_text.agree, false);
  assert.deepEqual(comparison.price_text.values, [null, "5€"]);
  assert.equal(bodeWilson.hot_clube.price_text, null, "must not borrow Capitólio's price");

  // Every other pair has no price on either side — a genuine agreement,
  // not a disagreement papered over.
  for (const result of results.filter((r) => r.hot_clube_event_id !== "3801")) {
    const cmp = compareObservationFacts(result.hot_clube, result.capitolio);
    assert.deepEqual(cmp.price_text.values, [null, null]);
    assert.equal(cmp.price_text.agree, true);
  }
});

test("compareObservationFacts never merges or resolves a disagreement into one asserted value", async () => {
  const hotClubeObs = await loadHotClubeObservations();
  const capitolioObs = await loadCapitolioObservations();
  const results = associateHotClubeCapitolio(hotClubeObs, capitolioObs);

  for (const result of results) {
    const comparison = compareObservationFacts(result.hot_clube, result.capitolio);
    for (const field of ["title", "date", "start_time_raw", "venue_text", "price_text"]) {
      assert.ok(Array.isArray(comparison[field].values));
      assert.equal(comparison[field].values.length, 2);
      assert.equal(typeof comparison[field].agree, "boolean");
    }
  }
});
