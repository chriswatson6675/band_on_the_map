import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractMatosinhosEventDetailFacts } from "../ingestion/cm-matosinhos-agenda-cultural/discovery.mjs";
import {
  SOURCE_ID,
  deriveDateTime,
  deriveSourceRecordId,
  formatPriceText,
  toObservation,
  toObservations,
} from "../ingestion/cm-matosinhos-agenda-cultural/observation-adapter.mjs";

const SLUGS = ["quarteto-cordas", "hospitalarios"];

async function factsFor(slug) {
  const html = await readFile(new URL(`../fixtures/cm-matosinhos-agenda-cultural/pages/detail-${slug}.html`, import.meta.url), "utf8");
  return extractMatosinhosEventDetailFacts(html);
}

async function allFacts() {
  return Promise.all(SLUGS.map((slug) => factsFor(slug)));
}

test("createObservation() succeeds with honest TZID_QUALIFIED_UNRESOLVED certainty for a real single-instant event", async () => {
  const facts = await factsFor("quarteto-cordas");
  const observation = toObservation(facts, {
    retrievedAt: "2026-08-27T10:00:00Z",
    fixturePath: "fixtures/cm-matosinhos-agenda-cultural/pages/detail-quarteto-cordas.html",
  });

  assert.equal(observation.source_id, "cm-matosinhos-agenda-cultural");
  assert.equal(observation.source_id, SOURCE_ID);
  assert.equal(observation.source_record_id, "quarteto-de-cordas-de-matosinhos-com-joao-reis");
  assert.equal(observation.title, "Quarteto de Cordas de Matosinhos com João Reis");
  assert.equal(observation.event_url, "https://www.cm-matosinhos.pt/evento/quarteto-de-cordas-de-matosinhos-com-joao-reis");
  assert.equal(observation.location_text, "Teatro Municipal de Matosinhos Constantino Nery");
  assert.equal(observation.venue_name, null, "venue name is never invented from an unresolved location string");

  assert.equal(observation.start.date, "2026-04-02");
  assert.equal(observation.start.raw, "2026-04-02 21:30:00");
  assert.equal(observation.start.tzid, "Europe/Lisbon");
  assert.equal(observation.start.certainty, "TZID_QUALIFIED_UNRESOLVED");
  assert.equal(observation.start.iso, null, "never promoted to a fabricated UTC instant — this project performs no DST/offset inference");
  assert.equal(observation.start.is_utc, null);

  assert.deepEqual(observation.end, observation.start, "a genuine single-instant event: source states end === start");

  assert.ok(observation.price_text.includes("Preço Inteiro – 7,50€"));
  assert.equal(observation.source_fields.page_id, "2805");
  assert.equal(observation.source_fields.schedule_text, "21h30");
  assert.equal(observation.source_fields.organizer_text, null);
});

test("createObservation() succeeds for a real genuine multi-day event with a distinct end and no price/schedule text", async () => {
  const facts = await factsFor("hospitalarios");
  const observation = toObservation(facts, { retrievedAt: "2026-08-27T10:00:05Z" });

  assert.equal(observation.source_record_id, "os-hospitalarios-no-caminho-de-santiago-4");
  assert.equal(observation.location_text, "Mosteiro de Leça do Balio");

  assert.equal(observation.start.date, "2026-09-08");
  assert.equal(observation.start.tzid, "Europe/Lisbon");
  assert.equal(observation.start.certainty, "TZID_QUALIFIED_UNRESOLVED");

  assert.equal(observation.end.date, "2026-09-13");
  assert.equal(observation.end.raw, "2026-09-13 23:00:00");
  assert.equal(observation.end.certainty, "TZID_QUALIFIED_UNRESOLVED");
  assert.notEqual(observation.start.date, observation.end.date, "a real, source-stated multi-day span");

  assert.equal(observation.price_text, null, "no price information was stated for this event — never fabricated");
  assert.equal(observation.source_fields.schedule_text, null, "no 'Horário:' field was stated for this event — never fabricated");
});

test("location_text produced across both retained fixture events is exactly 2 distinct real venue strings", async () => {
  const facts = await allFacts();
  const observations = facts.map((f) => toObservation(f, { retrievedAt: "2026-08-27T10:00:00Z" }));
  const distinctVenues = new Set(observations.map((o) => o.location_text));

  assert.deepEqual(
    [...distinctVenues].sort(),
    ["Mosteiro de Leça do Balio", "Teatro Municipal de Matosinhos Constantino Nery"].sort(),
  );
  for (const observation of observations) {
    assert.equal(observation.venue_name, null);
  }
});

test("source_record_id is derived only from the detail page's own canonical /evento/{slug} URL, never from wm:page_id", async () => {
  const facts = await allFacts();
  const observations = facts.map((f) => toObservation(f, { retrievedAt: "2026-08-27T10:00:00Z" }));

  assert.deepEqual(
    observations.map((o) => o.source_record_id),
    ["quarteto-de-cordas-de-matosinhos-com-joao-reis", "os-hospitalarios-no-caminho-de-santiago-4"],
  );
  // The page-id trap: both retained fixtures literally carry the SAME
  // wm:page_id (2805) — proving it must never leak into source_record_id.
  assert.equal(facts[0].page_id, facts[1].page_id, "both real fixtures share the same internal numeric page id");
  assert.notEqual(observations[0].source_record_id, observations[1].source_record_id, "yet identity is correctly distinct");
  for (const observation of observations) {
    assert.notEqual(observation.source_record_id, observation.source_fields.page_id, "identity never equals the numeric page id");
    assert.notEqual(observation.source_record_id, "2805");
  }
});

test("deriveSourceRecordId only accepts this source's own canonical /evento/{slug} URL shape", () => {
  assert.equal(
    deriveSourceRecordId("https://www.cm-matosinhos.pt/evento/quarteto-de-cordas-de-matosinhos-com-joao-reis"),
    "quarteto-de-cordas-de-matosinhos-com-joao-reis",
  );
  assert.equal(deriveSourceRecordId("https://www.cm-matosinhos.pt/pages/2805"), null, "never derives an id from a numeric page-id-shaped URL");
  assert.equal(deriveSourceRecordId("https://iporto.amp.pt/eventos/quarteto-de-cordas-de-matosinhos-joao-reis/"), null, "never borrows the third-party AMP portal's own URL");
  assert.equal(deriveSourceRecordId(null), null);
  assert.equal(deriveSourceRecordId(undefined), null);
});

test("toObservation throws without a usable event_url (never derives a source_record_id another way)", () => {
  assert.throws(() => toObservation({ title: "X", event_url: null, location_text: "Somewhere" }), /event_url/);
  assert.throws(
    () => toObservation({ title: "X", event_url: "https://example.com/not-cm-matosinhos", location_text: "Somewhere" }),
    /event_url/,
  );
});

test("toObservation throws without a usable location_text (never invents a venue name)", () => {
  assert.throws(
    () => toObservation({ title: "X", event_url: "https://www.cm-matosinhos.pt/evento/x", location_text: null }),
    /location_text/,
  );
  assert.throws(
    () => toObservation({ title: "X", event_url: "https://www.cm-matosinhos.pt/evento/x", location_text: "" }),
    /location_text/,
  );
});

test("toObservations converts every fixture-derived facts object independently", async () => {
  const facts = await allFacts();
  const observations = toObservations(facts, { retrievedAt: "2026-08-27T10:00:00Z" });
  assert.equal(observations.length, SLUGS.length);
  for (const observation of observations) {
    assert.equal(observation.source_id, "cm-matosinhos-agenda-cultural");
  }
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, SLUGS.length, "distinct identities, no collisions");
});

test("deriveDateTime derives TZID_QUALIFIED_UNRESOLVED for a full local datetime plus a named timezone, never a fabricated UTC instant", () => {
  const dt = deriveDateTime("2026-04-02 21:30:00", "Europe/Lisbon");
  assert.deepEqual(dt, {
    raw: "2026-04-02 21:30:00",
    date: "2026-04-02",
    iso: null,
    is_utc: null,
    tzid: "Europe/Lisbon",
    certainty: "TZID_QUALIFIED_UNRESOLVED",
  });
});

test("deriveDateTime falls back to FLOATING_LOCAL when no timezone is supplied", () => {
  const dt = deriveDateTime("2026-04-02 21:30:00", null);
  assert.equal(dt.date, "2026-04-02");
  assert.equal(dt.tzid, null);
  assert.equal(dt.certainty, "FLOATING_LOCAL");
});

test("deriveDateTime is honestly UNKNOWN for missing input, TEXT_ONLY for unparseable text", () => {
  assert.equal(deriveDateTime(null, "Europe/Lisbon").certainty, "UNKNOWN");
  assert.equal(deriveDateTime("", "Europe/Lisbon").certainty, "UNKNOWN");
  const textOnly = deriveDateTime("sometime in the future", "Europe/Lisbon");
  assert.equal(textOnly.certainty, "TEXT_ONLY");
  assert.equal(textOnly.date, null);
});

test("formatPriceText faithfully transcribes every line, never collapses to a single scalar", () => {
  assert.equal(
    formatPriceText(["Preço Inteiro – 7,50€", "Sénior – 5,00€"]),
    "Preço Inteiro – 7,50€ | Sénior – 5,00€",
  );
  assert.equal(formatPriceText([]), null);
  assert.equal(formatPriceText(null), null);
  assert.equal(formatPriceText(undefined), null);
});

test("Observation generation is deterministic from the same retained facts", async () => {
  const facts = await factsFor("quarteto-cordas");
  const a = toObservation(facts, { retrievedAt: "2026-08-27T10:00:15Z" });
  const b = toObservation(facts, { retrievedAt: "2026-08-27T10:00:15Z" });
  assert.deepEqual(a, b);
});

test("raw_evidence is honestly non-byte-faithful (a bounded excerpt, not the full HTTP response body)", async () => {
  const facts = await factsFor("hospitalarios");
  const observation = toObservation(facts, {
    retrievedAt: "2026-08-27T10:00:20Z",
    fixturePath: "fixtures/cm-matosinhos-agenda-cultural/pages/detail-hospitalarios.html",
  });
  assert.equal(observation.raw_evidence.byte_faithful, false);
  assert.equal(observation.raw_evidence.fixture_path, "fixtures/cm-matosinhos-agenda-cultural/pages/detail-hospitalarios.html");
  assert.equal(observation.raw_evidence.evidence_kind, "PARSED_STRUCTURED_HTML");
});

test("no fabricated field appears anywhere in the produced Observations — no coordinates, no canonical Event ID, no organizer text, no Organização field", async () => {
  const facts = await allFacts();
  const observations = toObservations(facts, { retrievedAt: "2026-08-27T10:00:00Z" });
  for (const observation of observations) {
    const keys = Object.keys(observation);
    for (const forbidden of [
      "latitude",
      "longitude",
      "coordinates",
      "event_id",
      "canonical_event_id",
      "id",
      "offer",
      "offers",
      "organizacao",
      "organizacao_text",
    ]) {
      assert.equal(keys.includes(forbidden), false, forbidden);
    }
    // atc_organizer was genuinely empty on both sampled events — never
    // backfilled with a guessed organizer name.
    assert.equal(observation.source_fields.organizer_text, null);
  }
});
