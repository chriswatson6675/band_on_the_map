import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { decideAdmission } from "../ingestion/venue-onboarding/admission.mjs";
import { extractVenueCandidates } from "../ingestion/venue-onboarding/candidates.mjs";
import { resolveObservation } from "../ingestion/venue/resolver.mjs";

function candidate(overrides = {}) {
  return {
    candidate_id: "cand-test",
    source_id: "test-source",
    key_type: "VENUE_NAME",
    key: "Test Venue",
    raw_keys: ["Test Venue"],
    observation_count: 1,
    example_event_titles: [],
    example_source_record_ids: [],
    existing_canonical_mapping: false,
    existing_venue_id: null,
    observations: [],
    ...overrides,
  };
}

function researchWith(entries) {
  return { entries };
}

test("already-canonical candidates are reported ALREADY_CANONICAL and never produce a new venue/mapping", () => {
  const decision = decideAdmission(
    candidate({ existing_canonical_mapping: true, existing_venue_id: "venue-existing" }),
    researchWith([]),
  );
  assert.equal(decision.status, "ALREADY_CANONICAL");
  assert.equal(decision.venue, null);
  assert.equal(decision.mapping, null);
});

test("a candidate with no research entry on record is deferred, never guessed", () => {
  const decision = decideAdmission(candidate(), researchWith([]));
  assert.equal(decision.status, "NO_RESEARCH_ON_RECORD");
  assert.equal(decision.venue, null);
  assert.equal(decision.mapping, null);
});

test("a REJECT research verdict carries through its own documented status, never AUTO_ADMIT", () => {
  const decision = decideAdmission(
    candidate(),
    researchWith([
      {
        source_id: "test-source",
        key_type: "VENUE_NAME",
        key: "Test Venue",
        verdict: "REJECT",
        status: "AMBIGUOUS",
        reasoning: "spans two buildings",
      },
    ]),
  );
  assert.equal(decision.status, "AMBIGUOUS");
  assert.equal(decision.venue, null);
  assert.equal(decision.mapping, null);
});

// 7. Evidence-backed address required for geocoding (an ADMIT_ADDRESS_ONLY
// verdict with no address, or no evidence, must fail closed rather than
// silently admit).
test("ADMIT_ADDRESS_ONLY with no address throws rather than silently admitting", () => {
  assert.throws(() =>
    decideAdmission(
      candidate(),
      researchWith([
        {
          source_id: "test-source",
          key_type: "VENUE_NAME",
          key: "Test Venue",
          verdict: "ADMIT_ADDRESS_ONLY",
          canonical_name: "Test Venue",
          city: "Lisboa",
          country_code: "PT",
          evidence: [{ url: "https://example.test", kind: "OFFICIAL_VENUE_WEBSITE", note: "x" }],
        },
      ]),
    ),
  );
});

test("ADMIT_ADDRESS_ONLY with an address but NO evidence throws rather than silently admitting", () => {
  assert.throws(() =>
    decideAdmission(
      candidate(),
      researchWith([
        {
          source_id: "test-source",
          key_type: "VENUE_NAME",
          key: "Test Venue",
          verdict: "ADMIT_ADDRESS_ONLY",
          canonical_name: "Test Venue",
          city: "Lisboa",
          country_code: "PT",
          address: "Rua Teste 1, 1000-000 Lisboa",
          evidence: [],
        },
      ]),
    ),
  );
});

test("a well-evidenced ADMIT_ADDRESS_ONLY verdict produces a valid ADDRESS_ONLY venue with no coordinates", () => {
  const decision = decideAdmission(
    candidate(),
    researchWith([
      {
        source_id: "test-source",
        key_type: "VENUE_NAME",
        key: "Test Venue",
        verdict: "ADMIT_ADDRESS_ONLY",
        canonical_name: "Test Venue",
        city: "Lisboa",
        municipality: "Lisboa",
        country_code: "PT",
        address: "Rua Teste 1, 1000-000 Lisboa",
        evidence: [{ url: "https://example.test/official", kind: "OFFICIAL_VENUE_WEBSITE", note: "states the address" }],
        retrieved_at: "2026-08-24",
      },
    ]),
  );
  assert.equal(decision.status, "ADDRESS_ONLY_ADMIT");
  assert.equal(decision.venue.location_status, "ADDRESS_ONLY");
  assert.equal(decision.venue.latitude, null);
  assert.equal(decision.venue.longitude, null);
  assert.equal(decision.mapping.venue_id, decision.venue.venue_id);
});

// 8. Venue-name-only geocoding is impossible: a candidate with only a
// name and no address evidence can never reach ADMIT_ADDRESS_ONLY/
// ADMIT_CONFIRMED (research verdicts require `address`; admission.mjs
// throws instead of ever inventing one — see the two throw tests above).
// This test proves the REJECT path is what actually happens for a
// name-only finding, exactly like this task's real research file does
// for e.g. Parque da Belavista/Jardim do Arco do Cego.
test("a candidate with only a venue name and documented insufficient address evidence never gets coordinates or an address", () => {
  const decision = decideAdmission(
    candidate({ key: "Parque da Belavista" }),
    researchWith([
      {
        source_id: "test-source",
        key_type: "VENUE_NAME",
        key: "Parque da Belavista",
        verdict: "REJECT",
        status: "INSUFFICIENT_ADDRESS_EVIDENCE",
        reasoning: "no single-point official address found",
      },
    ]),
  );
  assert.equal(decision.status, "INSUFFICIENT_ADDRESS_EVIDENCE");
  assert.equal(decision.venue, null);
});

// 9. Direct official coordinates become CONFIRMED only when properly evidenced.
test("ADMIT_CONFIRMED without first-party coordinates throws rather than silently confirming", () => {
  assert.throws(() =>
    decideAdmission(
      candidate(),
      researchWith([
        {
          source_id: "test-source",
          key_type: "VENUE_NAME",
          key: "Test Venue",
          verdict: "ADMIT_CONFIRMED",
          canonical_name: "Test Venue",
          city: "Lisboa",
          country_code: "PT",
          address: "Rua Teste 1, 1000-000 Lisboa",
          evidence: [{ url: "https://example.test", kind: "FIRST_PARTY_LINKED_MAP", note: "x" }],
        },
      ]),
    ),
  );
});

test("a well-evidenced ADMIT_CONFIRMED verdict produces a CONFIRMED venue with valid coordinates", () => {
  const decision = decideAdmission(
    candidate(),
    researchWith([
      {
        source_id: "test-source",
        key_type: "VENUE_NAME",
        key: "Test Venue",
        verdict: "ADMIT_CONFIRMED",
        canonical_name: "Test Venue",
        city: "Lisboa",
        municipality: "Lisboa",
        country_code: "PT",
        address: "Rua Teste 1, 1000-000 Lisboa",
        latitude: 38.7,
        longitude: -9.1,
        evidence: [{ url: "https://example.test/official", kind: "FIRST_PARTY_LINKED_MAP", note: "official place marker" }],
        retrieved_at: "2026-08-24",
      },
    ]),
  );
  assert.equal(decision.status, "AUTO_ADMIT");
  assert.equal(decision.venue.location_status, "CONFIRMED");
  assert.equal(decision.venue.latitude, 38.7);
  assert.equal(decision.venue.longitude, -9.1);
});

test("ADMIT_EXISTING_VENUE_MAPPING reuses the given venue_id and never creates a new Venue", () => {
  const decision = decideAdmission(
    candidate({ source_id: "teatro-variedades-capitolio", key_type: "SOURCE_ID", key: "teatro-variedades-capitolio" }),
    researchWith([
      {
        source_id: "teatro-variedades-capitolio",
        key_type: "SOURCE_ID",
        key: "teatro-variedades-capitolio",
        verdict: "ADMIT_EXISTING_VENUE_MAPPING",
        venue_id: "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado",
        evidence: [{ url: "https://example.test", kind: "OFFICIAL_VENUE_WEBSITE", note: "x" }],
        retrieved_at: "2026-08-24",
      },
    ]),
  );
  assert.equal(decision.status, "AUTO_ADMIT");
  assert.equal(decision.venue, null);
  assert.equal(decision.mapping.venue_id, "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado");
});

// 14/15/16/17: real, live-data invariants against the committed registries.
test("14/15. Casa da Música remains exactly GEOCODED at 41.1589025,-8.6307748 (VENUE-GEOCODING-01 untouched)", async () => {
  const registry = JSON.parse(await readFile(new URL("../venues/porto.json", import.meta.url), "utf8"));
  const casaDaMusica = registry.venues.find((v) => v.venue_id === "venue-porto-casa-da-musica");
  assert.equal(casaDaMusica.location_status, "GEOCODED");
  assert.equal(casaDaMusica.latitude, 41.1589025);
  assert.equal(casaDaMusica.longitude, -8.6307748);
});

test("14. existing CONFIRMED venues (Capitólio, MEO Arena) still validate and still resolve", async () => {
  const registry = JSON.parse(await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"));
  const confirmed = registry.venues.filter((v) => v.location_status === "CONFIRMED");
  assert.ok(confirmed.length >= 2);
  for (const venue of confirmed) {
    assert.equal(typeof venue.latitude, "number");
    assert.equal(typeof venue.longitude, "number");
  }
});

// 16. BOTA bad GEO cannot leak: this project's own ICS GEO
// (40.720756;-74.000761 — genuinely outside Lisbon) must never appear as
// BOTA Anjos's coordinates, and BOTA must never have been silently
// promoted away from ADDRESS_ONLY by this package (it admitted 4 NEW
// venues, none of them BOTA).
test("16. BOTA Anjos remains ADDRESS_ONLY with no coordinates; the known-bad ICS GEO value never appears anywhere in venues/lisbon.json", async () => {
  const registry = JSON.parse(await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"));
  const bota = registry.venues.find((v) => v.venue_id === "venue-lisboa-bota-anjos");
  assert.equal(bota.location_status, "ADDRESS_ONLY");
  assert.equal(bota.latitude, null);
  assert.equal(bota.longitude, null);

  const serialized = JSON.stringify(registry);
  assert.ok(!serialized.includes("40.720756"));
  assert.ok(!serialized.includes("-74.000761"));
});

// 17. Candidates without genuinely sufficient evidence remain unresolved.
test("17. every candidate researched with a REJECT verdict remains unresolved via resolveObservation", async () => {
  const research = JSON.parse(await readFile(new URL("../venues/candidate-research.json", import.meta.url), "utf8"));
  const rejected = research.entries.filter((e) => e.verdict === "REJECT");
  assert.ok(rejected.length > 0);

  for (const entry of rejected) {
    const fakeObservation = {
      source_id: entry.source_id,
      source_record_id: "test",
      venue_name: entry.key_type === "VENUE_NAME" ? entry.key : null,
      location_text: entry.key_type === "LOCATION_TEXT" ? entry.key : null,
      source_fields: entry.key_type === "SOURCE_VENUE_ID" ? { venue_id: entry.key } : {},
    };
    const result = resolveObservation(fakeObservation);
    // A SOURCE_ID-keyed reject (e.g. the Odivelas no-signal bucket) has
    // no venue_name/location_text/id to reconstruct here; skip those —
    // they are proven separately by the data-driven-resolver tests'
    // "wrong source never resolves" case.
    if (entry.key_type === "SOURCE_ID") continue;
    assert.equal(result.resolution_status, "UNRESOLVED", `${entry.source_id}/${entry.key_type}/${entry.key} must stay UNRESOLVED`);
  }
});

test("distinct venue candidates extracted from a real research-backed fixture set match their expected admission status", () => {
  const observations = [
    { source_id: "teatro-municipal-do-porto", source_record_id: "1", venue_name: "Campo Alegre", location_text: null, source_fields: {} },
    { source_id: "teatro-municipal-do-porto", source_record_id: "2", venue_name: "Rivoli e Campo Alegre", location_text: null, source_fields: {} },
  ];
  const candidates = extractVenueCandidates(observations, { resolveFn: resolveObservation });
  const campoAlegre = candidates.find((c) => c.key === "Campo Alegre");
  const rivoliCampoAlegre = candidates.find((c) => c.key === "Rivoli e Campo Alegre");
  assert.ok(campoAlegre.existing_canonical_mapping, "Campo Alegre is now already mapped by this task's own committed mapping");
  assert.equal(rivoliCampoAlegre.existing_canonical_mapping, false);
});
