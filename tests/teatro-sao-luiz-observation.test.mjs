import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  extractTeatroSaoLuizSeasonLabel,
  extractTeatroSaoLuizEventFacts,
} from "../ingestion/teatro-sao-luiz/discovery.mjs";
import { SOURCE_ID, toObservation, toObservations } from "../ingestion/teatro-sao-luiz/observation-adapter.mjs";

const FIXTURE_DIR = "../fixtures/teatro-sao-luiz";

async function readFixture(name) {
  return readFile(new URL(`${FIXTURE_DIR}/${name}`, import.meta.url), "utf8");
}

async function loadRealFacts(key) {
  const html = await readFixture(`detail-${key}.html`);
  const headersText = await readFixture(`detail-${key}-headers.txt`);
  return extractTeatroSaoLuizEventFacts(html, { headersText });
}

const RETRIEVED_AT = "2026-08-27T08:00:00.000Z"; // matches the retained investigation's own acquired_at timestamps

test("source_id is the exact 'teatro-sao-luiz' registry id, distinct from the unrelated 'tnsc-sao-carlos' source", async () => {
  const facts = await loadRealFacts("batucadeiras");
  const observation = toObservation(facts, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(SOURCE_ID, "teatro-sao-luiz");
  assert.equal(observation.source_id, "teatro-sao-luiz");
  assert.notEqual(observation.source_id, "tnsc-sao-carlos");
});

test("source_record_id is the WordPress shortlink post id, never the URL slug", async () => {
  const facts = await loadRealFacts("batucadeiras");
  const observation = toObservation(facts, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(observation.source_record_id, "35378");
  assert.equal(typeof observation.source_record_id, "string");
});

test("toObservation throws without a wp_shortlink_post_id — never fabricates a stable id from the URL slug", async () => {
  const html = await readFixture("detail-batucadeiras.html");
  const facts = extractTeatroSaoLuizEventFacts(html); // no headersText -> wp_shortlink_post_id is null
  assert.throws(
    () => toObservation(facts, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT }),
    /wp_shortlink_post_id/,
  );
});

// ---------------------------------------------------------------------
// start.date / start.certainty — the DETERMINISTIC_CONTEXT derivation,
// exercising REAL events on both sides of the season year boundary
// ---------------------------------------------------------------------

test("start.date is correctly derived for a real month>=8 event (Batucadeiras, September -> season START year 2026)", async () => {
  const facts = await loadRealFacts("batucadeiras");
  const observation = toObservation(facts, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(observation.start.date, "2026-09-09");
});

test("start.date is correctly derived for a real month<=7 event (André Rosinha Trio, January -> season END year 2027)", async () => {
  const facts = await loadRealFacts("andre-rosinha");
  const observation = toObservation(facts, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(observation.start.date, "2027-01-14");
});

test("start.date is correctly derived for real multi-day ranges on both sides of the boundary (O PAI -> 2026-09-16, VÁCUO -> 2027-01-28)", async () => {
  const oPai = toObservation(await loadRealFacts("o-pai"), { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(oPai.start.date, "2026-09-16");

  const vacuo = toObservation(await loadRealFacts("vacuo"), { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(vacuo.start.date, "2027-01-28");
});

test("start.certainty is honestly FLOATING_LOCAL (never UTC_INSTANT) — field_assessment.time remains PARTIAL: a local time-of-day is known but no UTC offset/timezone is stated anywhere on this source", async () => {
  const facts = await loadRealFacts("batucadeiras");
  const observation = toObservation(facts, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(observation.start.certainty, "FLOATING_LOCAL");
  assert.equal(observation.start.is_utc, null);
  assert.equal(observation.start.iso, null);
});

test("start.certainty falls back to DATE_ONLY when a date is derived but no time_text is present", async () => {
  const facts = await loadRealFacts("batucadeiras");
  facts.time_text = null;
  const observation = toObservation(facts, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(observation.start.date, "2026-09-09");
  assert.equal(observation.start.certainty, "DATE_ONLY");
});

test("start.date fails closed to null with certainty TEXT_ONLY when no seasonLabel is supplied — never guesses a year", async () => {
  const facts = await loadRealFacts("batucadeiras");
  const observation = toObservation(facts, { retrievedAt: RETRIEVED_AT }); // no seasonLabel
  assert.equal(observation.start.date, null);
  assert.equal(observation.start.certainty, "TEXT_ONLY");
  assert.ok(observation.start.raw.includes("9 September"));
});

test("start.date fails closed to null when day_month_text does not match this source's known shapes — never guesses", async () => {
  const facts = await loadRealFacts("batucadeiras");
  facts.day_month_text = "sometime in autumn";
  const observation = toObservation(facts, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(observation.start.date, null);
  assert.equal(observation.start.certainty, "TEXT_ONLY");
});

// ---------------------------------------------------------------------
// end — always empty (field_assessment.end is PARTIAL, not PROVEN)
// ---------------------------------------------------------------------

test("end is always empty — no end date/time is ever fabricated from a multi-day run's own last day", async () => {
  const facts = await loadRealFacts("o-pai");
  const observation = toObservation(facts, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(observation.end.date, null);
  assert.equal(observation.end.certainty, "UNKNOWN");
});

// ---------------------------------------------------------------------
// venue / location
// ---------------------------------------------------------------------

test("venue_name stays null (multiple internal rooms, never canonicalized here); location_text carries the room text", async () => {
  const facts = await loadRealFacts("batucadeiras");
  const observation = toObservation(facts, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(observation.venue_name, null);
  assert.equal(observation.location_text, "Largo do Picadeiro");

  const andreRosinha = toObservation(await loadRealFacts("andre-rosinha"), {
    seasonLabel: "2026-2027",
    retrievedAt: RETRIEVED_AT,
  });
  assert.equal(andreRosinha.location_text, "Sala Bernardo Sassetti");
});

// ---------------------------------------------------------------------
// price — deliberately never fabricated (not part of this facts shape)
// ---------------------------------------------------------------------

test("price_text is always null — never fabricated from a facts shape that does not extract it", async () => {
  const facts = await loadRealFacts("batucadeiras");
  const observation = toObservation(facts, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(observation.price_text, null);
});

// ---------------------------------------------------------------------
// event_url / source_url
// ---------------------------------------------------------------------

test("event_url is the detail page's own canonical URL", async () => {
  const facts = await loadRealFacts("vacuo");
  const observation = toObservation(facts, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(observation.event_url, "https://www.teatrosaoluiz.pt/en/performance/vacuo/");
});

// ---------------------------------------------------------------------
// Observation contract compliance / forbidden identity fields
// ---------------------------------------------------------------------

test("every Observation is contract-valid and carries no canonical Event identity field", async () => {
  const facts = await loadRealFacts("batucadeiras");
  const observation = toObservation(facts, {
    seasonLabel: "2026-2027",
    retrievedAt: RETRIEVED_AT,
    sourceUrl: "https://www.teatrosaoluiz.pt/en/programme/",
    fixturePath: "fixtures/teatro-sao-luiz/detail-batucadeiras.html",
    byteFaithful: false,
  });
  assert.equal(observation.source_id, "teatro-sao-luiz");
  assert.equal("event_id" in observation, false);
  assert.equal("canonical_event_id" in observation, false);
  assert.equal(typeof observation.raw_evidence.byte_faithful, "boolean");
  assert.equal(observation.source_url, "https://www.teatrosaoluiz.pt/en/programme/");
});

test("toObservations converts a whole batch, sharing one seasonLabel/retrievedAt context", async () => {
  const factsList = await Promise.all(
    ["batucadeiras", "andre-rosinha", "o-pai", "vacuo"].map((key) => loadRealFacts(key)),
  );
  const observations = toObservations(factsList, { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT });
  assert.equal(observations.length, 4);
  const byId = Object.fromEntries(observations.map((o) => [o.source_record_id, o]));
  assert.equal(byId["35378"].start.date, "2026-09-09"); // Batucadeiras (2026 side)
  assert.equal(byId["35376"].start.date, "2027-01-14"); // André Rosinha Trio (2027 side)
  assert.equal(byId["35368"].start.date, "2026-09-16"); // O PAI (2026 side)
  assert.equal(byId["35306"].start.date, "2027-01-28"); // VÁCUO (2027 side)
});

// ---------------------------------------------------------------------
// Deterministic rerun
// ---------------------------------------------------------------------

test("adaptation is deterministic against the same retained fixtures", async () => {
  const facts = await loadRealFacts("o-pai");
  const options = { seasonLabel: "2026-2027", retrievedAt: RETRIEVED_AT };
  assert.deepEqual(toObservation(facts, options), toObservation(facts, options));
});

// ---------------------------------------------------------------------
// end-to-end: real list page's own season label feeds every real detail
// page, exercising both sides of the season year boundary together
// ---------------------------------------------------------------------

test("end-to-end: the retained list page's own season label produces correct Observations for real events on BOTH sides of the boundary", async () => {
  const listHtml = await readFixture("list-page-excerpt.html");
  const seasonLabel = extractTeatroSaoLuizSeasonLabel(listHtml);

  const augDecSide = toObservation(await loadRealFacts("batucadeiras"), { seasonLabel, retrievedAt: RETRIEVED_AT });
  const janJulSide = toObservation(await loadRealFacts("andre-rosinha"), { seasonLabel, retrievedAt: RETRIEVED_AT });

  assert.equal(augDecSide.start.date, "2026-09-09");
  assert.ok(augDecSide.start.date.startsWith("2026-"), "month 9 (Aug-Dec side) resolves to the season's START year");

  assert.equal(janJulSide.start.date, "2027-01-14");
  assert.ok(janJulSide.start.date.startsWith("2027-"), "month 1 (Jan-Jul side) resolves to the season's END year");
});
