import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { buildOperatorVenueDashboard } from "../ingestion/geocoding/venue-coordinate-dashboard.mjs";
import { buildManualCoordinateQueue } from "../ingestion/geocoding/manual-coordinate-queue.mjs";
import { saveManualCoordinate } from "../ingestion/geocoding/manual-coordinate-store.mjs";

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

function confirmedVenue(overrides = {}) {
  return {
    venue_id: "venue-test-confirmed",
    canonical_name: "Confirmed Venue",
    country_code: "PT",
    city: "Porto",
    municipality: "Porto",
    address: "Rua Confirmada, 4000-000 Porto",
    latitude: 41.15,
    longitude: -8.6,
    location_status: "CONFIRMED",
    evidence: [{ url: "https://example.test/official" }],
    ...overrides,
  };
}

async function makeTempRoot(lisbonVenues, portoVenues) {
  const root = await mkdtemp(join(tmpdir(), "botm-operator-dashboard-test-"));
  const venuesDir = join(root, "venues");
  await mkdir(venuesDir, { recursive: true });
  await writeFile(join(venuesDir, "lisbon.json"), JSON.stringify({ region: "Lisbon", venues: lisbonVenues }));
  await writeFile(join(venuesDir, "porto.json"), JSON.stringify({ region: "Porto", venues: portoVenues }));
  return root;
}

test("assembles outstanding / manuallyCompleted / alreadyMapEnabled from a synthetic estate, with no live proof file present", async (t) => {
  const root = await makeTempRoot([addressOnlyVenue(), addressOnlyVenue({ venue_id: "venue-test-second" })], [confirmedVenue()]);
  t.after(() => rm(root, { recursive: true, force: true }));

  const dashboard = await buildOperatorVenueDashboard({ root });
  assert.equal(dashboard.totals.needCoordinates, 2);
  assert.equal(dashboard.totals.manuallyCompleted, 0);
  assert.equal(dashboard.totals.alreadyMapEnabled, 1);

  // No committed live-run proof exists under this synthetic root, so
  // waiting_listings must be omitted (null), never guessed.
  for (const entry of dashboard.outstanding) {
    assert.equal(entry.waiting_listings, null);
  }
});

test("a manually-completed venue moves from outstanding to manuallyCompleted and out of the totals.needCoordinates count", async (t) => {
  const venues = [addressOnlyVenue(), addressOnlyVenue({ venue_id: "venue-test-second" })];
  const root = await makeTempRoot(venues, []);
  t.after(() => rm(root, { recursive: true, force: true }));

  await saveManualCoordinate({ venueId: "venue-test-address-only", latitude: 38.7, longitude: -9.1, venues, root });

  const dashboard = await buildOperatorVenueDashboard({ root });
  assert.equal(dashboard.totals.needCoordinates, 1);
  assert.equal(dashboard.totals.manuallyCompleted, 1);
  assert.deepEqual(
    dashboard.outstanding.map((e) => e.venue_id),
    ["venue-test-second"],
  );
  assert.equal(dashboard.manuallyCompleted[0].venue_id, "venue-test-address-only");
  assert.equal(dashboard.manuallyCompleted[0].manual.latitude, 38.7);
});

test("outstanding venues are sorted by waiting_listings descending when a live-run proof file is present", async (t) => {
  const venues = [addressOnlyVenue(), addressOnlyVenue({ venue_id: "venue-test-second" })];
  const root = await makeTempRoot(venues, []);
  t.after(() => rm(root, { recursive: true, force: true }));

  const mapDir = join(root, "fixtures", "map");
  await mkdir(mapDir, { recursive: true });
  await writeFile(
    join(mapDir, "lisbon-porto-overnight-coverage-01-live-run-proof.json"),
    JSON.stringify({
      lisbon: { resolved_but_unmapped_by_venue_id: { "venue-test-address-only": 3, "venue-test-second": 17 } },
      porto: { resolved_but_unmapped_by_venue_id: {} },
    }),
  );

  const dashboard = await buildOperatorVenueDashboard({ root });
  assert.deepEqual(
    dashboard.outstanding.map((e) => e.venue_id),
    ["venue-test-second", "venue-test-address-only"],
  );
  assert.equal(dashboard.outstanding[0].waiting_listings, 17);
  assert.equal(dashboard.outstanding[1].waiting_listings, 3);
});

test("against the real committed repository, the dashboard's outstanding list matches buildManualCoordinateQueue exactly", async () => {
  const dashboard = await buildOperatorVenueDashboard();
  const queue = await buildManualCoordinateQueue();
  assert.deepEqual(
    dashboard.outstanding.map((e) => e.venue_id).sort(),
    queue.entries.map((e) => e.venue_id).sort(),
  );
});
