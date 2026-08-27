// Offline, no-network proof for ingestion/salle-pleyel/ — parses the
// retained fixture (a real, disclosed excerpt of
// research/source-investigations/salle-pleyel-paris-01/evidence/) and
// deterministically reproduces the claimed field values. This IS the
// DETERMINISTIC_DERIVATION evidence item cited by that investigation's
// evidence[] and field_assessment entries.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";

import { extractEventDetail } from "../ingestion/salle-pleyel/discovery.mjs";
import { toObservation } from "../ingestion/salle-pleyel/observation-adapter.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE_PATH = "fixtures/salle-pleyel-paris/evenement-fkj-detail.html";
const html = readFileSync(resolve(ROOT, FIXTURE_PATH), "utf8");
const PAGE_URL = "https://www.sallepleyel.com/evenement/fkj/";

test("extractEventDetail derives title from the JSON-LD breadcrumb, not the SEO <title>", () => {
  const detail = extractEventDetail(html);
  assert.equal(detail.title, "FKJ");
});

test("extractEventDetail derives date/time from the schedule <time> attribute", () => {
  const detail = extractEventDetail(html);
  assert.equal(detail.date, "2026-10-16");
  assert.equal(detail.time, "20:00");
});

test("extractEventDetail derives the price range and ticket URL", () => {
  const detail = extractEventDetail(html);
  assert.equal(detail.lowPrice, "25");
  assert.equal(detail.highPrice, "85");
  assert.equal(detail.priceCurrency, "EURO");
  assert.equal(detail.ticketUrl, "https://tickets.sallepleyel.com/fr/product/1299/salle_pleyel/fkj");
});

test("toObservation assembles a full Observation deterministically", () => {
  const detail = extractEventDetail(html);
  const observation = toObservation(
    { pageUrl: PAGE_URL, detail },
    { retrievedAt: "2026-08-26T00:00:00Z", fixturePath: FIXTURE_PATH },
  );
  assert.equal(observation.title, "FKJ");
  assert.equal(observation.source_record_id, "fkj");
  assert.equal(observation.start.date, "2026-10-16");
  assert.equal(observation.start.certainty, "FLOATING_LOCAL");
  assert.equal(observation.start.is_utc, null);
  assert.equal(observation.price_text, "25-85 EUR");
  assert.equal(observation.venue_name, "Salle Pleyel");
  assert.equal(observation.event_url, PAGE_URL);
  assert.equal(observation.source_fields.ticket_url, "https://tickets.sallepleyel.com/fr/product/1299/salle_pleyel/fkj");
});

test("re-parsing the same fixture is fully deterministic", () => {
  const first = toObservation({ pageUrl: PAGE_URL, detail: extractEventDetail(html) }, { retrievedAt: "2026-08-26T00:00:00Z" });
  const second = toObservation({ pageUrl: PAGE_URL, detail: extractEventDetail(html) }, { retrievedAt: "2026-08-26T00:00:00Z" });
  assert.deepEqual(first, second);
});
