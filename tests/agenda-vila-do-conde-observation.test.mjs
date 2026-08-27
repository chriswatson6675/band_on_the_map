import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { filterConcertoRecords, parseFetchResponse } from "../ingestion/agenda-vila-do-conde/client.mjs";
import { SOURCE_ID, parseFloatingLocalStart, toObservation, toObservations } from "../ingestion/agenda-vila-do-conde/observation-adapter.mjs";

async function loadPage(name) {
  const body = await readFile(new URL(`../fixtures/agenda-vila-do-conde/${name}`, import.meta.url), "utf8");
  return parseFetchResponse(body);
}

async function loadAllConcertoRecords() {
  const p1 = await loadPage("repeater-fetch-page1.json");
  const p2 = await loadPage("repeater-fetch-page2.json");
  return {
    p1,
    p2,
    concerto1: filterConcertoRecords(p1.items, p1.related),
    concerto2: filterConcertoRecords(p2.items, p2.related),
  };
}

const RETRIEVED_AT = "2026-08-27T11:05:00.000Z";
const SOURCE_URL = "https://repeater.bondlayer.com/fetch";

// 1. every real Concerto-tagged record becomes a valid Observation

test("toObservations produces one Observation per real Concerto-tagged record across both pages", async () => {
  const { p1, p2, concerto1, concerto2 } = await loadAllConcertoRecords();
  const observations = [
    ...toObservations(concerto1, { related: p1.related, retrievedAt: RETRIEVED_AT, sourceUrl: SOURCE_URL }),
    ...toObservations(concerto2, { related: p2.related, retrievedAt: RETRIEVED_AT, sourceUrl: SOURCE_URL }),
  ];
  assert.equal(observations.length, 4);
});

test("every Observation carries the agenda-vila-do-conde source id", async () => {
  const { p1, concerto1 } = await loadAllConcertoRecords();
  assert.equal(SOURCE_ID, "agenda-vila-do-conde");
  const observations = toObservations(concerto1, { related: p1.related, retrievedAt: RETRIEVED_AT });
  for (const o of observations) {
    assert.equal(o.source_id, "agenda-vila-do-conde");
  }
});

// 2. THE regression test: the "Z" suffix must never be trusted as UTC

test("REGRESSION: start is never marked UTC_INSTANT / is_utc:true despite the source's own trailing Z suffix", async () => {
  const { p1, concerto1 } = await loadAllConcertoRecords();
  const observations = toObservations(concerto1, { related: p1.related, retrievedAt: RETRIEVED_AT });
  assert.ok(observations.length > 0);
  for (const o of observations) {
    assert.notEqual(o.start.certainty, "UTC_INSTANT");
    assert.notEqual(o.start.is_utc, true);
    assert.equal(o.start.iso, null, "no fabricated resolved-UTC instant may ever appear in start.iso");
  }
});

test("start is FLOATING_LOCAL (cross-confirmed) with is_utc explicitly false, for every real Concerto record", async () => {
  const { p1, p2, concerto1, concerto2 } = await loadAllConcertoRecords();
  const observations = [
    ...toObservations(concerto1, { related: p1.related, retrievedAt: RETRIEVED_AT }),
    ...toObservations(concerto2, { related: p2.related, retrievedAt: RETRIEVED_AT }),
  ];
  assert.equal(observations.length, 4);
  for (const o of observations) {
    assert.equal(o.start.certainty, "FLOATING_LOCAL");
    assert.equal(o.start.is_utc, false);
    assert.equal(o.start.iso, null);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(o.start.date));
    assert.ok(/Z$/.test(o.start.raw), "raw must preserve the source's own original (misleading) Z-suffixed text");
  }

  const ivandro = observations.find((o) => o.source_record_id === "ivandro-1783090101082");
  assert.equal(ivandro.start.date, "2026-08-28");
  assert.equal(ivandro.start.raw, "2026-08-28T22:00:00.000Z");
});

test("parseFloatingLocalStart cross-confirms hour:minute against the independent free-text field", () => {
  const confirmed = parseFloatingLocalStart({
    datetime_start_date: "2026-08-28T22:00:00.000Z",
    text_datas_em_texto: { all: "22h00" },
  });
  assert.deepEqual(confirmed, { date: "2026-08-28", hour: 22, minute: 0, crossConfirmed: true });

  const mismatched = parseFloatingLocalStart({
    datetime_start_date: "2026-08-28T22:00:00.000Z",
    text_datas_em_texto: { all: "20h00" },
  });
  assert.equal(mismatched.crossConfirmed, false);

  const missingText = parseFloatingLocalStart({ datetime_start_date: "2026-08-28T22:00:00.000Z" });
  assert.equal(missingText.crossConfirmed, false);

  assert.equal(parseFloatingLocalStart({ datetime_start_date: "not-a-date" }), null);
  assert.equal(parseFloatingLocalStart({}), null);
  assert.equal(parseFloatingLocalStart(null), null);
});

test("a record whose datetime_start_date cannot be cross-confirmed degrades to DATE_ONLY, never a fabricated FLOATING_LOCAL", () => {
  const record = {
    id: "synthetic-mismatch-01",
    _slug: { all: "synthetic-mismatch-01" },
    _title: { all: "[TEST-ONLY SYNTHETIC RECORD — NOT REAL RETAINED EVIDENCE] Cross-check mismatch" },
    text_local: { all: "" },
    text_price: { all: "" },
    datetime_start_date: "2026-09-01T19:00:00.000Z",
    // deliberately mismatched free-text local time, to exercise the
    // degrade-to-DATE_ONLY path this adapter must take rather than
    // trusting the ISO field's hour:minute unconditionally
    text_datas_em_texto: { all: "17h00" },
    ref_tags_1o_nivel: null,
    ref_tags_2o_nivel: null,
  };
  const observation = toObservation(record, { related: {}, retrievedAt: RETRIEVED_AT });
  assert.equal(observation.start.certainty, "DATE_ONLY");
  assert.equal(observation.start.date, "2026-09-01");
  assert.equal(observation.start.is_utc, false);
  assert.equal(observation.start.iso, null);
});

// 3. end is deliberately NOT promoted beyond what was proven

test("end is never derived from datetime_end_date; the raw value is retained only as informational provenance", async () => {
  const { p1, concerto1 } = await loadAllConcertoRecords();
  const observations = toObservations(concerto1, { related: p1.related, retrievedAt: RETRIEVED_AT });
  const ivandro = observations.find((o) => o.source_record_id === "ivandro-1783090101082");
  assert.equal(ivandro.end.certainty, "UNKNOWN");
  assert.equal(ivandro.end.iso, null);
  assert.equal(ivandro.end.date, null);
  assert.equal(ivandro.source_fields.datetime_end_date_raw, "2026-08-28T14:50:41.045Z");
  for (const o of observations) {
    assert.equal(o.end.certainty, "UNKNOWN");
    assert.equal(o.end.iso, null);
  }
});

// 4. price_text derived honestly (admission-tag based, never inferred from empty text_price alone)

test("price_text is FREE for every real Concerto record, derived from ref_tags_2o_nivel, not inferred from empty text_price", async () => {
  const { p1, p2, concerto1, concerto2 } = await loadAllConcertoRecords();
  const observations = [
    ...toObservations(concerto1, { related: p1.related, retrievedAt: RETRIEVED_AT }),
    ...toObservations(concerto2, { related: p2.related, retrievedAt: RETRIEVED_AT }),
  ];
  assert.equal(observations.length, 4);
  for (const o of observations) {
    assert.equal(o.price_text, "FREE");
    assert.equal(o.source_fields.text_price, null, "text_price is genuinely empty on every real Concerto record");
    assert.equal(o.source_fields.ref_tags_2o_nivel_title, "Entrada Gratuita");
  }
});

test("price_text uses a real non-empty text_price verbatim when present, in preference to the admission tag", async () => {
  const { p1 } = await loadAllConcertoRecords();
  const paidRecord = p1.items.find((it) => it._title.all.includes("Homem Aranha"));
  assert.ok(paidRecord, "expected a real paid, non-Concerto record in the retained sample");
  const observation = toObservation(paidRecord, { related: p1.related, retrievedAt: RETRIEVED_AT });
  assert.equal(observation.price_text, "3€");
});

// 5. location_text is the source's own free-text venue label; venue_name stays null

test("location_text is the source's own text_local; venue_name is left null (never a canonical name invented)", async () => {
  const { p1, p2, concerto1, concerto2 } = await loadAllConcertoRecords();
  const observations = [
    ...toObservations(concerto1, { related: p1.related, retrievedAt: RETRIEVED_AT }),
    ...toObservations(concerto2, { related: p2.related, retrievedAt: RETRIEVED_AT }),
  ];
  const byTitle = Object.fromEntries(observations.map((o) => [o.title, o]));

  assert.equal(byTitle["Ivandro"].location_text, "Cais da Alfândega");
  assert.equal(byTitle["Roda de Samba"].location_text, "Mercado Municipal de Vila do Conde");
  assert.equal(byTitle["Smells Like 90´s"].location_text, "Mercado Municipal de Vila do Conde");
  assert.equal(byTitle["Vox Cordis | Itinerários"].location_text, "Igreja da Misericórdia de Vila do Conde");

  for (const o of observations) {
    assert.equal(o.venue_name, null);
  }
});

// 6. event_url deterministically constructed from slug

test("event_url is deterministically constructed as https://agenda.cm-viladoconde.pt/en/evento/{slug}/", async () => {
  const { p1, concerto1 } = await loadAllConcertoRecords();
  const observations = toObservations(concerto1, { related: p1.related, retrievedAt: RETRIEVED_AT });
  const ivandro = observations.find((o) => o.source_record_id === "ivandro-1783090101082");
  assert.equal(ivandro.event_url, "https://agenda.cm-viladoconde.pt/en/evento/ivandro-1783090101082/");
  for (const o of observations) {
    assert.ok(o.event_url.startsWith("https://agenda.cm-viladoconde.pt/en/evento/"));
    assert.ok(o.event_url.endsWith("/"));
  }
});

// 7. source_record_id is the permalink slug, not the internal id

test("source_record_id is the record's own permalink slug, not its internal id", async () => {
  const { p1, concerto1 } = await loadAllConcertoRecords();
  const observations = toObservations(concerto1, { related: p1.related, retrievedAt: RETRIEVED_AT });
  assert.deepEqual(
    observations.map((o) => o.source_record_id).sort(),
    ["ivandro-1783090101082", "roda-de-samba-1783090298021", "smells-like-90s"].sort(),
  );
  const ivandro = observations.find((o) => o.source_record_id === "ivandro-1783090101082");
  assert.equal(ivandro.source_fields.internal_id, "sIfxtwEI5cLkXfTi");
  for (const o of observations) {
    assert.equal(typeof o.source_record_id, "string");
  }
});

// 8. provenance retained, never promoted to a stronger canonical field

test("text_datas_em_texto/ref_tags titles/link_link are retained in source_fields only", async () => {
  const { p2, concerto2 } = await loadAllConcertoRecords();
  const observations = toObservations(concerto2, { related: p2.related, retrievedAt: RETRIEVED_AT });
  const voxCordis = observations[0];
  assert.equal(voxCordis.title, "Vox Cordis | Itinerários");
  assert.equal(voxCordis.source_fields.text_datas_em_texto, "21h30");
  assert.equal(voxCordis.source_fields.ref_tags_1o_nivel_title, "Concerto");
  assert.equal(voxCordis.source_fields.ref_tags_2o_nivel_title, "Entrada Gratuita");
  assert.equal(voxCordis.source_fields.link_link, "https://www.facebook.com/santacasamisericordiaviladoconde");
});

// 9. fails closed rather than fabricating an identity

test("toObservation throws without a record slug, never fabricates a source_record_id", () => {
  assert.throws(() => toObservation({ _title: { all: "x" } }, { related: {} }), /non-empty _slug\.all/);
  assert.throws(() => toObservation(null, { related: {} }), /non-empty _slug\.all/);
});

// 10. Observation contract validity / no fabricated fields, no direct Event fields

test("every Observation is a valid Observation and carries no field this source never proved", async () => {
  const { p1, p2, concerto1, concerto2 } = await loadAllConcertoRecords();
  const observations = [
    ...toObservations(concerto1, { related: p1.related, retrievedAt: RETRIEVED_AT }),
    ...toObservations(concerto2, { related: p2.related, retrievedAt: RETRIEVED_AT }),
  ];
  assert.equal(observations.length, 4);
  for (const o of observations) {
    assert.equal("event_id" in o, false);
    assert.equal("canonical_event_id" in o, false);
    assert.equal("tzid_resolved" in o, false);
    assert.equal(typeof o.raw_evidence.byte_faithful, "boolean");
    assert.equal(o.raw_evidence.byte_faithful, false);
    // never a machine-declared timezone this source did not itself state
    assert.equal(o.start.tzid, null);
  }
});

// 11. deterministic rerun

test("adaptation is deterministic against the same retained fixtures", async () => {
  const { p1, concerto1 } = await loadAllConcertoRecords();
  assert.deepEqual(
    toObservations(concerto1, { related: p1.related, retrievedAt: RETRIEVED_AT }),
    toObservations(concerto1, { related: p1.related, retrievedAt: RETRIEVED_AT }),
  );
});

// 12. only Concerto-tagged records ever reach the adapter as a batch (defense in depth,
// complementing the client-level filter tests) — a non-Concerto record can still be
// individually adapted (toObservation itself does not re-check the tag), but it is
// never part of what filterConcertoRecords hands to toObservations.

test("a non-Concerto record is never present in the batch produced from filterConcertoRecords output", async () => {
  const { p1, p2 } = await loadAllConcertoRecords();
  const allSlugs = new Set([...p1.items, ...p2.items].map((it) => it._slug.all));
  const concertoSlugs = new Set(
    [...filterConcertoRecords(p1.items, p1.related), ...filterConcertoRecords(p2.items, p2.related)].map(
      (it) => it._slug.all,
    ),
  );
  assert.ok(allSlugs.size > concertoSlugs.size, "expected real non-Concerto records to exist in the retained sample");
  assert.equal(concertoSlugs.size, 4);
});
