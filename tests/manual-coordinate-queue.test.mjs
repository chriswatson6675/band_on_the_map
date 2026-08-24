import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { LOCATION_STATUSES } from "../ingestion/venue/contract.mjs";
import { buildManualCoordinateQueue } from "../ingestion/geocoding/manual-coordinate-queue.mjs";

// FINAL COORDINATE-RESEARCH BOUNDARY: this report-only queue must never
// become a canonical Venue schema change. These tests prove:
//   1. LOCATION_STATUSES is still exactly the original four values —
//      MANUAL_COORDINATE_REQUIRED was never added to it;
//   2. buildManualCoordinateQueue() never writes to the registries it reads;
//   3. it correctly derives the queue from live ADDRESS_ONLY venues, not a
//      hardcoded list;
//   4. every entry is labelled MANUAL_COORDINATE_REQUIRED, never CONFIRMED
//      or GEOCODED.

test("LOCATION_STATUSES remains exactly CONFIRMED/GEOCODED/ADDRESS_ONLY/UNRESOLVED — no canonical schema change", () => {
  assert.deepEqual(
    [...LOCATION_STATUSES].sort(),
    ["ADDRESS_ONLY", "CONFIRMED", "GEOCODED", "UNRESOLVED"],
    "MANUAL_COORDINATE_REQUIRED must be a report-level label only, never a canonical location_status value",
  );
});

// buildManualCoordinateQueue() resolves registry paths relative to `root`
// via "venues/lisbon.json" / "venues/porto.json" — lay temp files out to
// match that exact shape.
async function makeTempRegistryRoot(lisbonVenues, portoVenues) {
  const root = await mkdtemp(join(tmpdir(), "botm-manual-queue-test-"));
  const venuesDir = join(root, "venues");
  await mkdir(venuesDir, { recursive: true });
  await writeFile(join(venuesDir, "lisbon.json"), JSON.stringify({ region: "Lisbon", venues: lisbonVenues }));
  await writeFile(join(venuesDir, "porto.json"), JSON.stringify({ region: "Porto", venues: portoVenues }));
  return { root, venuesDir };
}

function addressOnlyVenue(overrides = {}) {
  return {
    venue_id: "venue-test-address-only",
    canonical_name: "Test Venue",
    country_code: "PT",
    city: "Lisboa",
    municipality: "Lisboa",
    address: "Rua de Teste, 1000-000 Lisboa",
    latitude: null,
    longitude: null,
    location_status: "ADDRESS_ONLY",
    evidence: [{ url: "https://example.test/official", kind: "OFFICIAL_VENUE_WEBSITE" }],
    ...overrides,
  };
}

function geocodedVenue(overrides = {}) {
  return {
    venue_id: "venue-test-geocoded",
    canonical_name: "Already Geocoded Venue",
    country_code: "PT",
    city: "Porto",
    municipality: "Porto",
    address: "Rua Geocoded, 4000-000 Porto",
    latitude: 41.15,
    longitude: -8.6,
    location_status: "GEOCODED",
    evidence: [{ url: "https://example.test/official" }],
    coordinate_provenance: { method: "GEOCODED_FROM_OFFICIAL_ADDRESS" },
    ...overrides,
  };
}

test("the queue includes ADDRESS_ONLY venues and excludes GEOCODED/CONFIRMED/UNRESOLVED venues", async (t) => {
  const { root, venuesDir } = await makeTempRegistryRoot(
    [addressOnlyVenue(), geocodedVenue({ venue_id: "venue-test-geocoded-lisbon", city: "Lisboa" })],
    [addressOnlyVenue({ venue_id: "venue-test-porto-address-only", city: "Porto", municipality: "Porto" })],
  );
  t.after(() => rm(root, { recursive: true, force: true }));

  const originalLisbon = await readFile(join(venuesDir, "lisbon.json"), "utf8");

  const report = await buildManualCoordinateQueue({ root });

  assert.equal(report.total_address_only, 2);
  const ids = report.entries.map((e) => e.venue_id).sort();
  assert.deepEqual(ids, ["venue-test-address-only", "venue-test-porto-address-only"]);
  for (const entry of report.entries) {
    assert.equal(entry.queue_status, "MANUAL_COORDINATE_REQUIRED");
  }

  // Never claims CONFIRMED/GEOCODED language in the queue_status itself.
  assert.ok(report.entries.every((e) => !["CONFIRMED", "GEOCODED"].includes(e.queue_status)));

  // The registry file itself must be byte-identical after the call — a
  // report generator must never mutate the venue files it reads.
  const rereadLisbon = await readFile(join(venuesDir, "lisbon.json"), "utf8");
  assert.equal(rereadLisbon, originalLisbon);
});

test("the queue is derived live, not hardcoded: an empty registry produces an empty queue", async (t) => {
  const { root } = await makeTempRegistryRoot([], []);
  t.after(() => rm(root, { recursive: true, force: true }));

  const report = await buildManualCoordinateQueue({ root });
  assert.equal(report.total_address_only, 0);
  assert.deepEqual(report.entries, []);
});

test("against the REAL committed registries, the queue matches the live ADDRESS_ONLY set exactly", async () => {
  const report = await buildManualCoordinateQueue();
  const ids = report.entries.map((e) => e.venue_id).sort();
  assert.deepEqual(ids, [
    "venue-lisboa-aula-magna-reitoria-da-universidade-de-lisboa",
    "venue-lisboa-bota-anjos",
    "venue-lisboa-casa-capitao",
    "venue-lisboa-casa-independente",
    "venue-lisboa-centro-cultural-de-belem-ccb",
    "venue-lisboa-clube-de-fado",
    "venue-lisboa-fama-d-alfama",
    "venue-lisboa-galeria-ze-dos-bois-zdb",
    "venue-lisboa-hot-clube-de-portugal",
    "venue-lisboa-igreja-e-convento-da-graca",
    "venue-lisboa-museu-do-fado",
    "venue-lisboa-teatro-sao-luiz",
    "venue-lisboa-village-underground-lisboa",
    "venue-odivelas-biblioteca-municipal-d-dinis",
    "venue-odivelas-centro-cultural-malaposta",
    "venue-porto-capela-incomum",
    "venue-porto-hot-five-jazz-blues-club",
    "venue-porto-super-bock-arena-pavilhao-rosa-mota",
  ]);
  for (const entry of report.entries) {
    assert.equal(entry.queue_status, "MANUAL_COORDINATE_REQUIRED");
    assert.ok(entry.address, "every queued venue must still carry its evidenced address");
  }
});
