import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractCampoPequenoEventFacts } from "../ingestion/campo-pequeno/discovery.mjs";
import {
  SOURCE_ID,
  deriveSourceRecordId,
  formatPriceText,
  toObservation,
  toObservations,
} from "../ingestion/campo-pequeno/observation-adapter.mjs";

const SLUGS = ["alphaville", "megadeth", "nutcracker", "cancelado"];

async function factsFor(slug) {
  const html = await readFile(new URL(`../fixtures/campo-pequeno/pages/detail-${slug}.html`, import.meta.url), "utf8");
  return extractCampoPequenoEventFacts(html);
}

async function allFacts() {
  return Promise.all(SLUGS.map((slug) => factsFor(slug)));
}

test("createObservation() succeeds with honestly-certain fields for a real sampled event (Alphaville)", async () => {
  const facts = await factsFor("alphaville");
  const observation = toObservation(facts, {
    retrievedAt: "2026-08-27T08:10:00Z",
    fixturePath: "fixtures/campo-pequeno/pages/detail-alphaville.html",
  });

  assert.equal(observation.source_id, "campo-pequeno");
  assert.equal(observation.source_id, SOURCE_ID);
  assert.equal(observation.source_record_id, "alphaville");
  assert.equal(observation.title, "Alphaville");
  assert.equal(observation.event_url, "https://www.sagrescampopequeno.pt/pt/alphaville");
  assert.equal(observation.location_text, "Lisboa - Sagres Campo Pequeno");
  assert.equal(observation.venue_name, null, "venue name is never invented from an unresolved location string");
  assert.equal(
    observation.price_text,
    "Plateia VIP: 60€ | 1ª Plateia: 55€ | 2ª Plateia: 50€ | Bancada A: 55€ | Bancada B: 50€ | Bancada C (Vis. Reduzida): 45€ | Mobilidade Condicionada: 45€",
  );
  assert.equal(observation.description, null, "no cancellation, so no description text is fabricated");

  assert.equal(observation.start.date, "2026-10-16");
  assert.equal(observation.start.certainty, "FLOATING_LOCAL");
  assert.equal(observation.start.iso, null, "never promoted to a fabricated UTC instant");
  assert.equal(observation.start.is_utc, null);
  assert.equal(observation.start.tzid, null);

  assert.deepEqual(observation.end, {
    raw: null,
    date: null,
    iso: null,
    is_utc: null,
    tzid: null,
    certainty: "UNKNOWN",
  });

  assert.equal(observation.source_fields.is_cancelled, false);
  assert.equal(observation.source_fields.price_tiers.length, 7);
});

test("createObservation() succeeds for a second real sampled event with the reversed pattern-B time text (Megadeth)", async () => {
  const facts = await factsFor("megadeth");
  const observation = toObservation(facts, { retrievedAt: "2026-08-27T08:10:05Z" });

  assert.equal(observation.source_record_id, "megadeth");
  assert.equal(observation.start.date, "2027-04-13");
  assert.equal(observation.start.certainty, "FLOATING_LOCAL");
  assert.equal(observation.source_fields.time_text, "Início de espetáculo: 19h30 · Abertura de portas: 18h30");
});

test("the cancelled event (Brandi Carlile) is retained honestly as a real Observation, never silently dropped", async () => {
  const facts = await factsFor("cancelado");
  const observation = toObservation(facts, { retrievedAt: "2026-08-27T08:10:10Z" });

  assert.equal(observation.source_id, "campo-pequeno");
  assert.equal(observation.source_record_id, "brandi-carlile---cancelado");
  assert.equal(observation.title, "Brandi Carlile - cancelado");
  assert.equal(observation.source_fields.is_cancelled, true);
  assert.match(observation.description, /CANCELLED/);
  // Retained, not dropped: date, venue, and the full pre-cancellation
  // 10-tier price list are all still present.
  assert.equal(observation.start.date, "2026-11-01");
  assert.equal(observation.location_text, "Lisboa - Sagres Campo Pequeno");
  assert.equal(observation.source_fields.price_tiers.length, 10);
  assert.ok(observation.price_text.includes("Plateia em Pé: 47€"));
});

test("source_record_id is derived only from the detail page's own canonical URL, never guessed", async () => {
  const facts = await allFacts();
  const observations = facts.map((f) => toObservation(f, { retrievedAt: "2026-08-27T08:10:00Z" }));
  assert.deepEqual(
    observations.map((o) => o.source_record_id),
    ["alphaville", "megadeth", "the-nutcracker-ice-show", "brandi-carlile---cancelado"],
  );
});

test("deriveSourceRecordId only accepts this source's own canonical detail-page URL shape", () => {
  assert.equal(deriveSourceRecordId("https://www.sagrescampopequeno.pt/pt/alphaville"), "alphaville");
  assert.equal(
    deriveSourceRecordId("https://www.sagrescampopequeno.pt/pt/agenda/alphaville"),
    null,
    "the agenda-relative form is not this adapter's own canonical shape",
  );
  assert.equal(deriveSourceRecordId("https://blueticket.meo.pt/pt/event/15712/alphaville-in-concert"), null, "never borrows a third-party ticketing URL/id");
  assert.equal(deriveSourceRecordId(null), null);
  assert.equal(deriveSourceRecordId(undefined), null);
});

test("toObservation throws without a usable event_url (never derives a source_record_id another way)", () => {
  assert.throws(() => toObservation({ title: "X", event_url: null }), /event_url/);
  assert.throws(() => toObservation({ title: "X", event_url: "https://example.com/not-campo-pequeno" }), /event_url/);
});

test("toObservations converts every fixture-derived facts object independently", async () => {
  const facts = await allFacts();
  const observations = toObservations(facts, { retrievedAt: "2026-08-27T08:10:00Z" });
  assert.equal(observations.length, SLUGS.length);
  for (const observation of observations) {
    assert.equal(observation.source_id, "campo-pequeno");
  }
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, SLUGS.length, "distinct identities, no collisions");
  // The cancelled event is included in the batch output, not filtered out.
  assert.ok(observations.some((o) => o.source_fields.is_cancelled === true));
  assert.equal(observations.filter((o) => o.source_fields.is_cancelled === true).length, 1);
});

test("formatPriceText faithfully transcribes every tier, never collapses to a single scalar", () => {
  assert.equal(
    formatPriceText([
      { area: "Plateia VIP", price: "60€" },
      { area: "Bancada A", price: "55€" },
    ]),
    "Plateia VIP: 60€ | Bancada A: 55€",
  );
  assert.equal(formatPriceText([]), null);
  assert.equal(formatPriceText(null), null);
  assert.equal(formatPriceText(undefined), null);
});

test("Observation generation is deterministic from the same retained facts", async () => {
  const facts = await factsFor("nutcracker");
  const a = toObservation(facts, { retrievedAt: "2026-08-27T08:10:15Z" });
  const b = toObservation(facts, { retrievedAt: "2026-08-27T08:10:15Z" });
  assert.deepEqual(a, b);
});

test("raw_evidence is honestly non-byte-faithful (a bounded excerpt, not the full HTTP response body)", async () => {
  const facts = await factsFor("nutcracker");
  const observation = toObservation(facts, {
    retrievedAt: "2026-08-27T08:10:20Z",
    fixturePath: "fixtures/campo-pequeno/pages/detail-nutcracker.html",
  });
  assert.equal(observation.raw_evidence.byte_faithful, false);
  assert.equal(observation.raw_evidence.fixture_path, "fixtures/campo-pequeno/pages/detail-nutcracker.html");
  assert.equal(observation.raw_evidence.evidence_kind, "PARSED_STRUCTURED_HTML");
});

test("no coordinates or canonical Event ID are invented by this adapter", async () => {
  const facts = await allFacts();
  const observations = toObservations(facts, { retrievedAt: "2026-08-27T08:10:00Z" });
  for (const observation of observations) {
    const keys = Object.keys(observation);
    for (const forbidden of ["latitude", "longitude", "coordinates", "event_id", "canonical_event_id", "id", "offer", "offers"]) {
      assert.equal(keys.includes(forbidden), false, forbidden);
    }
  }
});
