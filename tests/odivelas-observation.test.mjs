import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { findEventsFeedUrl } from "../ingestion/odivelas/discovery.mjs";
import {
  SOURCE_ID,
  dateTimeFromPubDate,
  extractContactText,
  toObservation,
  toObservations,
} from "../ingestion/odivelas/observation-adapter.mjs";
import { parseRSS } from "../ingestion/rss/parse.mjs";
import { resolveObservation, resolveOdivelasObservation } from "../ingestion/venue/resolver.mjs";

async function loadItems() {
  const text = await readFile(new URL("../fixtures/odivelas/rss-de-eventos-excerpt.rss", import.meta.url), "utf8");
  return parseRSS(text).items;
}

// 3. Odivelas RSS -> Observation.

test("discovery finds the RSS de Eventos feed URL, not the RSS de Notícias one", async () => {
  const html = await readFile(
    new URL("../fixtures/odivelas/rss-feed-directory-excerpt.html", import.meta.url),
    "utf8",
  );
  assert.equal(findEventsFeedUrl(html), "https://www.cm-odivelas.pt/pages/322.rss");
});

test("discovery rejects empty input and returns null when the label is absent", () => {
  assert.throws(() => findEventsFeedUrl(""), /non-empty/);
  assert.equal(findEventsFeedUrl("<html>no feeds here</html>"), null);
});

test("every retained live RSS item adapts to an Observation", async () => {
  const items = await loadItems();
  assert.ok(items.length >= 2);
  const observations = toObservations(items, { retrievedAt: "2026-08-24T00:00:00Z" });
  assert.equal(observations.length, items.length);
  for (const o of observations) {
    assert.equal(o.source_id, SOURCE_ID);
    assert.equal(o.source_id, "cm-odivelas-agenda-cultura");
  }
});

// 5/6. provenance survives; null facts stay null.

test("source_record_id comes from guid; event_url from link; both independently preserved", async () => {
  const items = await loadItems();
  const observations = toObservations(items, { retrievedAt: "2026-08-24T00:00:00Z" });
  for (const [i, o] of observations.entries()) {
    assert.equal(o.source_record_id, items[i].guid);
    assert.equal(o.event_url, items[i].link);
  }
});

test("toObservation throws when both guid and link are absent (no fabricated identity)", () => {
  assert.throws(() => toObservation({ title: "x" }), /guid or link/);
});

test("price_text is always null (never exposed by this feed); venue_name never fabricated from location_text", async () => {
  const items = await loadItems();
  const observations = toObservations(items, { retrievedAt: "2026-08-24T00:00:00Z" });
  for (const o of observations) {
    assert.equal(o.price_text, null);
    assert.equal(o.venue_name, null);
  }
});

test("extractContactText finds a real Contacto: anchor and returns null when absent", () => {
  const withContact =
    '<p><strong>Contacto:</strong> <a href="https://example.test" target="_self">Centro Cultural Malaposta</a></p>';
  assert.equal(extractContactText(withContact), "Centro Cultural Malaposta");
  assert.equal(extractContactText("<p>No contact line here</p>"), null);
  assert.equal(extractContactText(null), null);
});

test("pubDate maps honestly to start: real RFC822 offsets compute a genuine UTC instant", () => {
  const dt = dateTimeFromPubDate("Sat, 19 Dec 2026 10:00:00 +0000");
  assert.equal(dt.certainty, "UTC_INSTANT");
  assert.equal(dt.iso, "2026-12-19T10:00:00Z");
  assert.equal(dt.is_utc, true);
  assert.equal(dt.date, "2026-12-19");
});

test("dateTimeFromPubDate honestly falls back to TEXT_ONLY for an unrecognised shape; empty stays UNKNOWN", () => {
  const unrecognised = dateTimeFromPubDate("not a real date");
  assert.equal(unrecognised.certainty, "TEXT_ONLY");
  assert.equal(unrecognised.iso, null);

  const empty = dateTimeFromPubDate(null);
  assert.equal(empty.certainty, "UNKNOWN");
  assert.equal(empty.raw, null);
});

// 7. venue resolution fails closed.

test("Odivelas's own hardcoded resolver table stays fail-closed: every retained item is UNRESOLVED via resolveOdivelasObservation (still no HARDCODED mapping — see ingestion/venue/resolver.mjs's ODIVELAS_LOCATION_TEXT_TO_CANONICAL, deliberately left empty)", async () => {
  const items = await loadItems();
  const observations = toObservations(items, { retrievedAt: "2026-08-24T00:00:00Z" });
  for (const o of observations) {
    const result = resolveOdivelasObservation(o);
    assert.equal(result.resolution_status, "UNRESOLVED");
    assert.equal(result.venue_id, null);
  }
});

// VENUE-AUTO-ONBOARDING-01: resolveObservation() now ALSO checks the
// data-driven mapping table (venues/source-venue-mappings.json), so it
// can legitimately differ from the still-empty hardcoded
// resolveOdivelasObservation() above for the one retained item whose
// exact location_text ("Centro Cultural Malaposta") this task
// independently evidence-admitted — see venues/candidate-research.json.
// Every OTHER retained item (no evidenced mapping) still resolves the
// same way through both functions.
test("resolveObservation resolves the one retained Odivelas item newly mapped by VENUE-AUTO-ONBOARDING-01's data-driven layer; every other retained item is still UNRESOLVED via both paths", async () => {
  const items = await loadItems();
  const observations = toObservations(items, { retrievedAt: "2026-08-24T00:00:00Z" });

  const malaposta = observations.find((o) => o.location_text === "Centro Cultural Malaposta");
  assert.ok(malaposta, "the retained fixture must still contain the Malaposta item this assertion depends on");
  const malapostaResult = resolveObservation(malaposta);
  assert.equal(malapostaResult.resolution_status, "RESOLVED");
  assert.equal(malapostaResult.venue_id, "venue-odivelas-centro-cultural-malaposta");
  assert.match(malapostaResult.resolution_method, /^DATA_DRIVEN_MAPPING:/);

  for (const o of observations) {
    if (o === malaposta) continue;
    assert.deepEqual(resolveObservation(o), resolveOdivelasObservation(o));
  }
});

test("adaptation is deterministic against the same retained fixture", async () => {
  const items = await loadItems();
  assert.deepEqual(
    toObservations(items, { retrievedAt: "2026-08-24T00:00:00Z" }),
    toObservations(items, { retrievedAt: "2026-08-24T00:00:00Z" }),
  );
});
