// Offline, no-network proof for ingestion/zenith-la-villette/ — parses the
// retained fixture (a real, disclosed excerpt of
// research/source-investigations/zenith-la-villette-paris-01/evidence/)
// and deterministically reproduces the claimed field values. This IS the
// DETERMINISTIC_DERIVATION evidence item cited by that investigation's
// evidence[] and field_assessment entries.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { extractEventCards } from "../ingestion/zenith-la-villette/discovery.mjs";
import { toObservations } from "../ingestion/zenith-la-villette/observation-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = "fixtures/zenith-la-villette-paris/program.html";
const html = readFileSync(resolve(ROOT, FIXTURE_PATH), "utf8");

test("extractEventCards finds all 8 retained cards", () => {
  const cards = extractEventCards(html);
  assert.equal(cards.length, 8);
});

test("the BINI card is honestly marked cancelled with its date struck through", () => {
  const cards = extractEventCards(html);
  const bini = cards.find((c) => c.title === "BINI");
  assert.ok(bini);
  assert.equal(bini.cancelled, true);
  assert.equal(bini.stateText, "Annulé");
  assert.equal(bini.dateRaw, "Vendredi 04 sept. 2026");
});

test("toObservations excludes both struck-through/cancelled cards", () => {
  const cards = extractEventCards(html);
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T00:00:00Z" });
  // BINI ("Annulé") and Hexagone MMA ("Reporté") both carry a
  // struck-through date with no replacement printed anywhere.
  assert.equal(observations.length, 6);
  assert.ok(!observations.some((o) => o.title === "BINI"));
  assert.ok(!observations.some((o) => o.title === "Hexagone MMA"));
});

test("toObservations deterministically derives date/url for a non-cancelled card", () => {
  const cards = extractEventCards(html);
  const observations = toObservations(cards, { retrievedAt: "2026-08-26T00:00:00Z", fixturePath: FIXTURE_PATH });
  const inesMisericorde = observations.find((o) => o.title === "Inès de la Miséricorde");
  assert.ok(inesMisericorde);
  assert.equal(inesMisericorde.start.date, "2026-09-05");
  assert.equal(inesMisericorde.start.certainty, "DATE_ONLY");
  assert.equal(inesMisericorde.event_url, "https://le-zenith.com/shows/In%C3%A8s%20de%20la%20Mis%C3%A9ricorde-22278");
  assert.equal(inesMisericorde.source_record_id, "Inès de la Miséricorde-22278");
  assert.equal(inesMisericorde.venue_name, "Zénith Paris - La Villette");
  assert.equal(inesMisericorde.price_text, null);
});

test("re-parsing the same fixture is fully deterministic", () => {
  const first = toObservations(extractEventCards(html), { retrievedAt: "2026-08-26T00:00:00Z" });
  const second = toObservations(extractEventCards(html), { retrievedAt: "2026-08-26T00:00:00Z" });
  assert.deepEqual(first, second);
});
