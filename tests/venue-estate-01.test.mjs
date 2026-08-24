// LISBON-PORTO-VENUE-ESTATE-01 — deterministic tests over the broad
// venue-first research dataset (research/venue-estate/). These tests never
// hit the network or any live research website; they only validate the
// shape and internal consistency of the two retained research JSON files,
// plus the canonical Venue registries this package legitimately extended.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateVenue, createVenueId } from "../ingestion/venue/contract.mjs";

async function loadJson(relPath) {
  return JSON.parse(await readFile(new URL(`../${relPath}`, import.meta.url), "utf8"));
}

async function loadVenueEstate() {
  return loadJson("research/venue-estate/lisbon-porto-venue-estate-01.json");
}

async function loadEventEvidence() {
  return loadJson("research/venue-estate/lisbon-porto-event-evidence-01.json");
}

async function loadAllCanonicalVenues() {
  const lisbon = await loadJson("venues/lisbon.json");
  const porto = await loadJson("venues/porto.json");
  return [...lisbon.venues, ...porto.venues];
}

const REQUIRED_FIELDS = [
  "venue_candidate_id",
  "canonical_name_candidate",
  "city",
  "official_website",
  "official_events_url",
  "venue_type",
  "music_styles_or_programme",
  "evidence_urls",
  "address_text",
  "existing_canonical_venue_id",
  "current_event_status",
  "current_event_count",
  "sample_event_titles",
  "acquisition_feasibility",
  "notes",
  "researched_at",
  "classification",
];

const VALID_CLASSIFICATIONS = new Set([
  "EXISTING_CANONICAL",
  "NEW_HIGH_CONFIDENCE",
  "NEW_NEEDS_REVIEW",
  "DUPLICATE_OR_ALIAS",
  "CLOSED_OR_INACTIVE",
]);

const VALID_EVENT_STATUSES = new Set([
  "ACTIVE_WITH_CURRENT_EVENTS",
  "ACTIVE_NO_CURRENT_EVENTS_FOUND",
  "MUSIC_VENUE_NO_CALENDAR_FOUND",
  "UNCERTAIN",
  "CLOSED_OR_INACTIVE",
]);

// 1. venue-estate dataset schema
test("1. every venue-estate candidate carries every required field with the right basic type", async () => {
  const estate = await loadVenueEstate();
  assert.ok(Array.isArray(estate.venues) && estate.venues.length >= 25, "expects a genuinely broad dataset");
  for (const v of estate.venues) {
    for (const field of REQUIRED_FIELDS) {
      assert.ok(Object.prototype.hasOwnProperty.call(v, field), `${v.venue_candidate_id}: missing field ${field}`);
    }
    assert.ok(typeof v.venue_candidate_id === "string" && v.venue_candidate_id.length > 0);
    assert.ok(typeof v.canonical_name_candidate === "string" && v.canonical_name_candidate.length > 0);
    assert.ok(typeof v.city === "string" && v.city.length > 0);
    assert.ok(Array.isArray(v.evidence_urls));
    assert.ok(Array.isArray(v.music_styles_or_programme));
    assert.ok(Array.isArray(v.sample_event_titles));
    assert.ok(typeof v.current_event_count === "number" && v.current_event_count >= 0);
    assert.ok(VALID_EVENT_STATUSES.has(v.current_event_status), `${v.venue_candidate_id}: bad current_event_status`);
    assert.ok(VALID_CLASSIFICATIONS.has(v.classification), `${v.venue_candidate_id}: bad classification`);
  }
});

// 2. unique venue_candidate_id
test("2. every venue_candidate_id in the research dataset is unique", async () => {
  const estate = await loadVenueEstate();
  const ids = estate.venues.map((v) => v.venue_candidate_id);
  assert.equal(new Set(ids).size, ids.length);
});

// 3. no duplicate canonical venue_id assignments (beyond the one documented,
//    evidence-backed alias pair: Teatro Variedades & Capitólio really does
//    map to the same physical building as Cineteatro Capitólio).
test("3. no unexplained duplicate existing_canonical_venue_id assignments", async () => {
  const estate = await loadVenueEstate();
  const byCanonical = new Map();
  for (const v of estate.venues) {
    if (!v.existing_canonical_venue_id) continue;
    const list = byCanonical.get(v.existing_canonical_venue_id) ?? [];
    list.push(v.venue_candidate_id);
    byCanonical.set(v.existing_canonical_venue_id, list);
  }
  const duplicates = [...byCanonical.entries()].filter(([, ids]) => ids.length > 1);
  assert.deepEqual(
    duplicates.map(([canonicalId, ids]) => ({ canonicalId, ids: ids.sort() })),
    [
      {
        canonicalId: "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado",
        ids: ["cand-lisboa-cineteatro-capitolio", "cand-lisboa-teatro-variedades-capitolio"],
      },
    ],
    "the only two candidates sharing a canonical venue_id must be the documented Capitólio/Teatro Variedades alias pair",
  );
  // And that pair must itself be explicitly recorded as an alias, not silently doubled.
  const alias = estate.venues.find((v) => v.venue_candidate_id === "cand-lisboa-teatro-variedades-capitolio");
  assert.equal(alias.classification, "DUPLICATE_OR_ALIAS");
});

// 4. current event evidence requires a source URL
test("4. every event-evidence record carries a non-empty source_url and event_url", async () => {
  const evidence = await loadEventEvidence();
  assert.ok(Array.isArray(evidence.events) && evidence.events.length >= 20);
  for (const e of evidence.events) {
    assert.ok(typeof e.source_url === "string" && e.source_url.startsWith("http"), `${e.event_id}: missing source_url`);
    assert.ok(typeof e.event_url === "string" && e.event_url.startsWith("http"), `${e.event_id}: missing event_url`);
    assert.ok(typeof e.raw_date_text === "string" && e.raw_date_text.length > 0, `${e.event_id}: missing raw_date_text`);
  }
});

// 5. parsed dates cannot appear without raw date evidence
test("5. no parsed_date/parsed_date_range appears without raw_date_text, and every parsed_date is a real calendar date", async () => {
  const evidence = await loadEventEvidence();
  for (const e of evidence.events) {
    if (e.parsed_date !== null && e.parsed_date !== undefined) {
      assert.ok(e.raw_date_text, `${e.event_id}: parsed_date without raw_date_text`);
      assert.match(e.parsed_date, /^\d{4}-\d{2}-\d{2}$/, `${e.event_id}: parsed_date not ISO`);
      assert.ok(!Number.isNaN(Date.parse(e.parsed_date)), `${e.event_id}: parsed_date not a real date`);
    }
    if (e.parsed_date_range) {
      assert.ok(e.raw_date_text, `${e.event_id}: parsed_date_range without raw_date_text`);
      assert.match(e.parsed_date_range.start, /^\d{4}-\d{2}-\d{2}$/);
      assert.match(e.parsed_date_range.end, /^\d{4}-\d{2}-\d{2}$/);
    }
  }
});

// 6. NEW_HIGH_CONFIDENCE requires evidence
test("6. every NEW_HIGH_CONFIDENCE candidate carries at least one evidence URL", async () => {
  const estate = await loadVenueEstate();
  const highConfidence = estate.venues.filter((v) => v.classification === "NEW_HIGH_CONFIDENCE");
  assert.ok(highConfidence.length >= 10);
  for (const v of highConfidence) {
    assert.ok(v.evidence_urls.length >= 1, `${v.venue_candidate_id}: NEW_HIGH_CONFIDENCE with no evidence`);
  }
});

// 7. existing canonical venues are correctly linked
test("7. every EXISTING_CANONICAL / admitted candidate's existing_canonical_venue_id resolves to a real registry venue", async () => {
  const estate = await loadVenueEstate();
  const canonicalVenues = await loadAllCanonicalVenues();
  const canonicalIds = new Set(canonicalVenues.map((v) => v.venue_id));

  const linked = estate.venues.filter((v) => v.existing_canonical_venue_id);
  assert.ok(linked.length >= 15);
  for (const v of linked) {
    assert.ok(canonicalIds.has(v.existing_canonical_venue_id), `${v.venue_candidate_id}: dangling canonical link ${v.existing_canonical_venue_id}`);
  }

  for (const v of estate.venues) {
    if (v.classification === "EXISTING_CANONICAL") {
      assert.ok(v.existing_canonical_venue_id, `${v.venue_candidate_id}: EXISTING_CANONICAL without a link`);
    }
  }
});

// 8. ADDRESS_ONLY is allowed
test("8. every venue admitted this package is ADDRESS_ONLY (never CONFIRMED/GEOCODED) — coordinate research stays closed", async () => {
  const estate = await loadVenueEstate();
  const canonicalVenues = await loadAllCanonicalVenues();
  const byId = new Map(canonicalVenues.map((v) => [v.venue_id, v]));

  const admitted = estate.venues.filter((v) => v.admitted_this_package);
  assert.equal(admitted.length, 12);
  for (const v of admitted) {
    const venue = byId.get(v.existing_canonical_venue_id);
    assert.ok(venue, `${v.venue_candidate_id}: admitted venue missing from registry`);
    assert.equal(venue.location_status, "ADDRESS_ONLY", `${v.venue_candidate_id}: must be ADDRESS_ONLY, never CONFIRMED/GEOCODED`);
    assert.equal(venue.latitude, null);
    assert.equal(venue.longitude, null);
    assert.deepEqual(validateVenue(venue), []);
  }
});

// 9. no geocoder is invoked
test("9. this package's research files never mention a geocoder provider or coordinate_provenance", async () => {
  const estate = await loadVenueEstate();
  const raw = JSON.stringify(estate);
  for (const forbidden of ["nominatim", "foursquare", "geoapify", "tomtom", "coordinate_provenance"]) {
    assert.ok(!raw.toLowerCase().includes(forbidden), `research dataset must never reference ${forbidden}`);
  }
  // And no admitted venue carries latitude/longitude (checked again here, independent of test 8).
  const canonicalVenues = await loadAllCanonicalVenues();
  const admittedIds = new Set(
    estate.venues.filter((v) => v.admitted_this_package).map((v) => v.existing_canonical_venue_id),
  );
  for (const venue of canonicalVenues) {
    if (admittedIds.has(venue.venue_id)) {
      assert.equal(venue.latitude, null);
      assert.equal(venue.longitude, null);
    }
  }
});

// 10. manual-coordinate queue remains valid (report-only label, schema unchanged)
// BOTM-MANUAL-COORDINATES-PRESERVE-MERGE-01: "newly admitted ADDRESS_ONLY
// venue" (this package's own admissions) and "currently outstanding
// manual-coordinate exception" (this repo's live queue) are two distinct
// concepts — a newly admitted venue that a human operator has since
// completed via the dashboard is correctly EXCLUDED from the outstanding
// queue, without ever losing its ADDRESS_ONLY canonical status. This test
// now asserts the correct, weaker-but-precise relationship: every admitted
// venue is in exactly one of {outstanding queue, manually completed} —
// never neither (that would mean it vanished from tracking entirely) and
// never both (the exclusion logic must actually exclude it).
test("10. LOCATION_STATUSES is unchanged and every newly admitted ADDRESS_ONLY venue is either still outstanding in the manual-coordinate queue or already manually completed by the operator", async () => {
  const { LOCATION_STATUSES } = await import("../ingestion/venue/contract.mjs");
  assert.deepEqual([...LOCATION_STATUSES].sort(), ["ADDRESS_ONLY", "CONFIRMED", "GEOCODED", "UNRESOLVED"]);

  const { loadManualCoordinateStore } = await import("../ingestion/geocoding/manual-coordinate-store.mjs");
  const manualStore = await loadManualCoordinateStore();
  const manuallyCompletedIds = new Set(manualStore.entries.map((e) => e.venue_id));

  const queue = await loadJson("fixtures/geocoding/manual-coordinate-queue.json");
  const queueIds = new Set(queue.entries.map((e) => e.venue_id));
  const estate = await loadVenueEstate();
  const admittedIds = estate.venues.filter((v) => v.admitted_this_package).map((v) => v.existing_canonical_venue_id);

  for (const id of admittedIds) {
    const inQueue = queueIds.has(id);
    const manuallyCompleted = manuallyCompletedIds.has(id);
    assert.ok(
      inQueue || manuallyCompleted,
      `${id}: newly admitted ADDRESS_ONLY venue is neither in the outstanding manual-coordinate queue nor manually completed — it has vanished from tracking`,
    );
    assert.ok(
      !(inQueue && manuallyCompleted),
      `${id}: cannot be simultaneously outstanding in the queue and manually completed — the exclusion logic failed`,
    );
  }
  for (const entry of queue.entries) {
    assert.equal(entry.queue_status, "MANUAL_COORDINATE_REQUIRED");
  }
});

// 11. no hardcoded venue-specific resolver branches added
test("11. ingestion/venue/resolver.mjs was not modified to add new hardcoded per-venue branches for this package's admissions", async () => {
  const resolverSource = await readFile(new URL("../ingestion/venue/resolver.mjs", import.meta.url), "utf8");
  // None of the venues newly admitted this package should appear as a
  // resolver literal — admission only ever adds data (venues/*.json,
  // venues/source-venue-mappings.json), never new resolver code.
  for (const name of [
    "Hot Clube de Portugal",
    "Galeria Zé dos Bois",
    "Fama d'Alfama",
    "Museu do Fado",
    "Casa Independente",
    "Clube de Fado",
    "Teatro São Luiz",
    "Centro Cultural de Belém",
    "Aula Magna",
    "Hot Five",
    "Capela Incomum",
    "Super Bock Arena",
  ]) {
    assert.ok(!resolverSource.includes(name), `resolver.mjs must not hardcode "${name}" — use data-driven mappings instead`);
  }
});

// 12. existing ingestion tests continue passing — proven simply by `npm test`
// running this file alongside the full suite; nothing extra to assert here
// beyond confirming the two registries this package extended still validate.
test("12. venues/lisbon.json and venues/porto.json still fully validate after this package's admissions", async () => {
  const canonicalVenues = await loadAllCanonicalVenues();
  assert.ok(canonicalVenues.length >= 23);
  const seen = new Set();
  for (const venue of canonicalVenues) {
    assert.deepEqual(validateVenue(venue), [], `${venue.venue_id} failed validation`);
    assert.equal(venue.venue_id, createVenueId(venue.canonical_name, venue.city), `${venue.venue_id}: non-deterministic id`);
    assert.ok(!seen.has(venue.venue_id), `duplicate venue_id ${venue.venue_id}`);
    seen.add(venue.venue_id);
  }
});

test("event-evidence venue_candidate_id values all resolve to a real venue-estate candidate", async () => {
  const estate = await loadVenueEstate();
  const evidence = await loadEventEvidence();
  const candidateIds = new Set(estate.venues.map((v) => v.venue_candidate_id));
  for (const e of evidence.events) {
    assert.ok(candidateIds.has(e.venue_candidate_id), `${e.event_id}: unknown venue_candidate_id ${e.venue_candidate_id}`);
  }
});

test("every event_id in the evidence file is unique", async () => {
  const evidence = await loadEventEvidence();
  const ids = evidence.events.map((e) => e.event_id);
  assert.equal(new Set(ids).size, ids.length);
});
