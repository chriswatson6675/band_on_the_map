import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildManualCoordinateQueue } from "../ingestion/geocoding/manual-coordinate-queue.mjs";
import { saveManualCoordinate, removeManualCoordinate } from "../ingestion/geocoding/manual-coordinate-store.mjs";

// VENUE-MANUAL-COORDINATES-DASHBOARD-01, tests 19/20: the generated queue
// must exclude venues that already have a valid manual-coordinate entry
// (without touching their canonical ADDRESS_ONLY status), and removing
// that manual entry must re-add the venue to the queue.

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
    evidence: [{ url: "https://example.test/official" }],
    ...overrides,
  };
}

async function makeTempRegistryRoot(lisbonVenues, portoVenues) {
  const root = await mkdtemp(join(tmpdir(), "botm-manual-queue-exclusion-test-"));
  const venuesDir = join(root, "venues");
  await mkdir(venuesDir, { recursive: true });
  await writeFile(join(venuesDir, "lisbon.json"), JSON.stringify({ region: "Lisbon", venues: lisbonVenues }));
  await writeFile(join(venuesDir, "porto.json"), JSON.stringify({ region: "Porto", venues: portoVenues }));
  return { root, venuesDir };
}

test("19. the queue excludes a venue that already has a valid manual-coordinate entry, without changing its canonical status", async (t) => {
  const { root } = await makeTempRegistryRoot([addressOnlyVenue(), addressOnlyVenue({ venue_id: "venue-test-second" })], []);
  t.after(() => rm(root, { recursive: true, force: true }));

  const before = await buildManualCoordinateQueue({ root });
  assert.deepEqual(
    before.entries.map((e) => e.venue_id).sort(),
    ["venue-test-address-only", "venue-test-second"],
  );

  const saveResult = await saveManualCoordinate({
    venueId: "venue-test-address-only",
    latitude: 38.7,
    longitude: -9.1,
    venues: [addressOnlyVenue(), addressOnlyVenue({ venue_id: "venue-test-second" })],
    root,
  });
  assert.equal(saveResult.ok, true);

  const after = await buildManualCoordinateQueue({ root });
  assert.equal(after.total_address_only, 1);
  assert.deepEqual(after.entries.map((e) => e.venue_id), ["venue-test-second"]);

  // 19b: canonical ADDRESS_ONLY status on the underlying registry file is
  // unaffected — buildManualCoordinateQueue never mutates the venue
  // registries it reads.
  const { readFile } = await import("node:fs/promises");
  const lisbon = JSON.parse(await readFile(join(root, "venues", "lisbon.json"), "utf8"));
  const venue = lisbon.venues.find((v) => v.venue_id === "venue-test-address-only");
  assert.equal(venue.location_status, "ADDRESS_ONLY");
});

test("20. removing a manual coordinate entry re-adds the ADDRESS_ONLY venue to the queue", async (t) => {
  const venues = [addressOnlyVenue()];
  const { root } = await makeTempRegistryRoot(venues, []);
  t.after(() => rm(root, { recursive: true, force: true }));

  await saveManualCoordinate({ venueId: "venue-test-address-only", latitude: 38.7, longitude: -9.1, venues, root });
  const whileManual = await buildManualCoordinateQueue({ root });
  assert.equal(whileManual.total_address_only, 0);

  await removeManualCoordinate({ venueId: "venue-test-address-only", root });
  const afterRemoval = await buildManualCoordinateQueue({ root });
  assert.equal(afterRemoval.total_address_only, 1);
  assert.deepEqual(afterRemoval.entries.map((e) => e.venue_id), ["venue-test-address-only"]);
});

test("against the REAL committed registries + committed (currently empty) manual store, the queue is unaffected by this exclusion change", async () => {
  const report = await buildManualCoordinateQueue();
  // The committed venues/manual-coordinates.json ships empty in this
  // package — so the exclusion logic must be a strict no-op against the
  // real repository right now, matching manual-coordinate-queue.test.mjs's
  // own already-committed 19-venue expectation.
  assert.equal(report.total_address_only, 19);
});
