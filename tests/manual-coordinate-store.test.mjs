import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  MANUAL_ENTRY_METHOD,
  FORBIDDEN_PATH_SUBSTRINGS,
  resolveManualCoordinatesPath,
  loadManualCoordinateStore,
  validateLatitude,
  validateLongitude,
  validateManualCoordinateEntry,
  validateManualCoordinateStore,
  saveManualCoordinate,
  removeManualCoordinate,
  findManualEntry,
} from "../ingestion/geocoding/manual-coordinate-store.mjs";

// VENUE-MANUAL-COORDINATES-DASHBOARD-01: this suite proves the canonical
// manual-coordinate persistence contract. Every write test uses an
// isolated temporary directory (mkdtemp) — never the real repository
// root — so no test ever touches the real, committed
// venues/manual-coordinates.json.

function addressOnlyVenue(overrides = {}) {
  return {
    venue_id: "venue-test-address-only",
    canonical_name: "Test Venue",
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

async function makeTempRoot() {
  const root = await mkdtemp(join(tmpdir(), "botm-manual-coord-store-test-"));
  await mkdir(join(root, "venues"), { recursive: true });
  return root;
}

// --- 1. schema validation ---------------------------------------------

test("1. a well-formed manual-coordinate store validates cleanly", () => {
  const store = {
    entries: [
      {
        venue_id: "venue-a",
        latitude: 38.7,
        longitude: -9.1,
        method: MANUAL_ENTRY_METHOD,
        entered_at: "2026-08-24T14:30:00.000Z",
      },
    ],
  };
  assert.deepEqual(validateManualCoordinateStore(store), []);
});

// --- 2. venue_id must reference a real canonical Venue ------------------

test("2. saveManualCoordinate rejects a venue_id that is not a real canonical Venue", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await saveManualCoordinate({
    venueId: "venue-does-not-exist",
    latitude: 38.7,
    longitude: -9.1,
    venues: [addressOnlyVenue()],
    root,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "VENUE_NOT_FOUND");
});

// --- 3. duplicate venue_id entries rejected -----------------------------

test("3. validateManualCoordinateStore rejects duplicate venue_id entries", () => {
  const entry = {
    venue_id: "venue-dup",
    latitude: 38.7,
    longitude: -9.1,
    method: MANUAL_ENTRY_METHOD,
    entered_at: "2026-08-24T14:30:00.000Z",
  };
  const errors = validateManualCoordinateStore({ entries: [entry, { ...entry }] });
  assert.ok(errors.some((e) => e.includes("duplicate venue_id")));
});

test("saveManualCoordinate itself never produces a duplicate: a second save for the same venue_id replaces, not appends", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const venues = [addressOnlyVenue()];

  await saveManualCoordinate({ venueId: "venue-test-address-only", latitude: 38.7, longitude: -9.1, venues, root });
  await saveManualCoordinate({ venueId: "venue-test-address-only", latitude: 38.8, longitude: -9.2, venues, root });

  const store = await loadManualCoordinateStore({ root });
  assert.equal(store.entries.filter((e) => e.venue_id === "venue-test-address-only").length, 1);
  assert.equal(store.entries[0].latitude, 38.8);
});

// --- 4/5/6. coordinate bounds + NaN/Infinity ----------------------------

test("4. latitude bounds are enforced", () => {
  assert.equal(validateLatitude(90), true);
  assert.equal(validateLatitude(-90), true);
  assert.equal(validateLatitude(90.0001), false);
  assert.equal(validateLatitude(-90.0001), false);
});

test("5. longitude bounds are enforced", () => {
  assert.equal(validateLongitude(180), true);
  assert.equal(validateLongitude(-180), true);
  assert.equal(validateLongitude(180.0001), false);
  assert.equal(validateLongitude(-180.0001), false);
});

test("6. NaN/Infinity/junk are rejected for both latitude and longitude", () => {
  for (const bad of [NaN, Infinity, -Infinity]) {
    assert.equal(validateLatitude(bad), false);
    assert.equal(validateLongitude(bad), false);
  }
});

test("6b. saveManualCoordinate rejects blank/NaN/Infinity/junk/out-of-bounds coordinates end to end", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const venues = [addressOnlyVenue()];

  for (const [latitude, longitude, expectedError] of [
    [NaN, -9.1, "INVALID_LATITUDE"],
    [Infinity, -9.1, "INVALID_LATITUDE"],
    ["not-a-number", -9.1, "INVALID_LATITUDE"],
    [999, -9.1, "INVALID_LATITUDE"],
    [38.7, 999, "INVALID_LONGITUDE"],
    [38.7, Infinity, "INVALID_LONGITUDE"],
  ]) {
    const result = await saveManualCoordinate({ venueId: "venue-test-address-only", latitude, longitude, venues, root });
    assert.equal(result.ok, false, `${latitude}/${longitude} should be rejected`);
    assert.equal(result.error, expectedError, `${latitude}/${longitude} should fail as ${expectedError}`);
  }
});

// --- 7/8. method + entered_at -------------------------------------------

test("7. manual entries always carry method exactly MANUAL_OPERATOR_ENTRY", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const result = await saveManualCoordinate({
    venueId: "venue-test-address-only",
    latitude: 38.7,
    longitude: -9.1,
    venues: [addressOnlyVenue()],
    root,
  });
  assert.equal(result.ok, true);
  assert.equal(result.entry.method, "MANUAL_OPERATOR_ENTRY");

  const wrongMethodEntry = { venue_id: "x", latitude: 1, longitude: 1, method: "SOMETHING_ELSE", entered_at: new Date().toISOString() };
  assert.ok(validateManualCoordinateEntry(wrongMethodEntry).some((e) => e.includes("method")));
});

test("8. entered_at is required and must be a valid ISO timestamp", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await saveManualCoordinate({
    venueId: "venue-test-address-only",
    latitude: 38.7,
    longitude: -9.1,
    venues: [addressOnlyVenue()],
    root,
  });
  assert.equal(typeof result.entry.entered_at, "string");
  assert.equal(Number.isNaN(Date.parse(result.entry.entered_at)), false);

  const missing = { venue_id: "x", latitude: 1, longitude: 1, method: MANUAL_ENTRY_METHOD };
  assert.ok(validateManualCoordinateEntry(missing).some((e) => e.includes("entered_at")));

  const junk = { venue_id: "x", latitude: 1, longitude: 1, method: MANUAL_ENTRY_METHOD, entered_at: "not-a-date" };
  assert.ok(validateManualCoordinateEntry(junk).some((e) => e.includes("entered_at")));
});

// --- CONFIRMED/GEOCODED never overridden --------------------------------

test("saveManualCoordinate refuses a venue that already carries authoritative CONFIRMED coordinates", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await saveManualCoordinate({
    venueId: "venue-test-confirmed",
    latitude: 38.7,
    longitude: -9.1,
    venues: [confirmedVenue()],
    root,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "VENUE_ALREADY_AUTHORITATIVE");

  const store = await loadManualCoordinateStore({ root });
  assert.equal(store.entries.length, 0);
});

test("saveManualCoordinate refuses a venue that already carries authoritative GEOCODED coordinates", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await saveManualCoordinate({
    venueId: "venue-test-geocoded",
    latitude: 38.7,
    longitude: -9.1,
    venues: [confirmedVenue({ venue_id: "venue-test-geocoded", location_status: "GEOCODED" })],
    root,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, "VENUE_ALREADY_AUTHORITATIVE");
});

// --- 15/16. persistence to canonical file + fresh reload -----------------

test("15. save persists to the canonical manual-coordinate store abstraction", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await saveManualCoordinate({
    venueId: "venue-test-address-only",
    latitude: 38.736,
    longitude: -9.142,
    note: "Test note",
    venues: [addressOnlyVenue()],
    root,
  });
  assert.equal(result.ok, true);

  const onDisk = JSON.parse(await readFile(resolveManualCoordinatesPath({ root }), "utf8"));
  const entry = onDisk.entries.find((e) => e.venue_id === "venue-test-address-only");
  assert.ok(entry);
  assert.equal(entry.latitude, 38.736);
  assert.equal(entry.longitude, -9.142);
  assert.equal(entry.note, "Test note");
});

test("16. persistence survives a fresh store reload (no reliance on in-memory/client state)", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const venues = [addressOnlyVenue()];

  await saveManualCoordinate({ venueId: "venue-test-address-only", latitude: 38.7, longitude: -9.1, venues, root });

  // A brand-new call, simulating a fresh process/store instance ("restart") —
  // never reusing any in-memory reference from the save above.
  const reloaded = await loadManualCoordinateStore({ root });
  const entry = findManualEntry(reloaded, "venue-test-address-only");
  assert.ok(entry, "the entry must still be present after a fresh reload");
  assert.equal(entry.latitude, 38.7);
  assert.equal(entry.longitude, -9.1);
});

// --- 17. process.cwd() independence ---------------------------------------

test("17. process.cwd() never redirects canonical persistence", async (t) => {
  const originalCwd = process.cwd();
  const nestedUnrelatedDir = await mkdtemp(join(tmpdir(), "botm-cwd-elsewhere-"));
  t.after(async () => {
    process.chdir(originalCwd);
    await rm(nestedUnrelatedDir, { recursive: true, force: true });
  });

  const pathFromRepoRootCwd = resolveManualCoordinatesPath();

  process.chdir(nestedUnrelatedDir);
  const pathFromNestedCwd = resolveManualCoordinatesPath();

  assert.equal(pathFromRepoRootCwd, pathFromNestedCwd);
  assert.ok(pathFromRepoRootCwd.endsWith(join("venues", "manual-coordinates.json")));
});

// --- 18. no authoritative scratchpad/ephemeral path -----------------------

test("18. the canonical path never resolves under a scratchpad/ephemeral/cache location", () => {
  const path = resolveManualCoordinatesPath();
  for (const forbidden of FORBIDDEN_PATH_SUBSTRINGS) {
    assert.equal(path.toLowerCase().includes(forbidden.toLowerCase()), false, `path must not contain "${forbidden}": ${path}`);
  }
  assert.ok(path.endsWith(join("venues", "manual-coordinates.json")));
});

test("18b. an isolated temporary test root is still resolved as venues/manual-coordinates.json under that root, never elsewhere", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const path = resolveManualCoordinatesPath({ root });
  assert.equal(path, resolve(root, "venues", "manual-coordinates.json"));
});

// --- edit existing entries -------------------------------------------------

test("editing an existing manual entry keeps venue_id, replaces lat/lon, refreshes entered_at, method stays MANUAL_OPERATOR_ENTRY", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const venues = [addressOnlyVenue()];

  const first = await saveManualCoordinate({ venueId: "venue-test-address-only", latitude: 38.7, longitude: -9.1, venues, root });
  await new Promise((r) => setTimeout(r, 5));
  const second = await saveManualCoordinate({ venueId: "venue-test-address-only", latitude: 39.0, longitude: -9.5, venues, root });

  assert.equal(second.entry.venue_id, first.entry.venue_id);
  assert.equal(second.entry.latitude, 39.0);
  assert.equal(second.entry.longitude, -9.5);
  assert.equal(second.entry.method, "MANUAL_OPERATOR_ENTRY");
  assert.notEqual(second.entry.entered_at, first.entry.entered_at);
});

// --- delete/clear ------------------------------------------------------

test("removeManualCoordinate deletes exactly one entry and is idempotent", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const venues = [addressOnlyVenue()];

  await saveManualCoordinate({ venueId: "venue-test-address-only", latitude: 38.7, longitude: -9.1, venues, root });
  const removed = await removeManualCoordinate({ venueId: "venue-test-address-only", root });
  assert.equal(removed.ok, true);
  assert.equal(removed.removed, true);

  const store = await loadManualCoordinateStore({ root });
  assert.equal(store.entries.length, 0);

  const removedAgain = await removeManualCoordinate({ venueId: "venue-test-address-only", root });
  assert.equal(removedAgain.ok, true);
  assert.equal(removedAgain.removed, false);
});

// --- atomic write: no abandoned temp files on success ----------------------

test("a successful save leaves no abandoned temp sibling files behind", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await saveManualCoordinate({ venueId: "venue-test-address-only", latitude: 38.7, longitude: -9.1, venues: [addressOnlyVenue()], root });

  const { readdir } = await import("node:fs/promises");
  const files = await readdir(join(root, "venues"));
  const tmpFiles = files.filter((f) => f.includes(".tmp"));
  assert.deepEqual(tmpFiles, []);
});

// --- 21. no arbitrary path injection ---------------------------------------

test("21. saveManualCoordinate's input shape has no filePath/path field, and any such extra field is silently ignored", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await saveManualCoordinate({
    venueId: "venue-test-address-only",
    latitude: 38.7,
    longitude: -9.1,
    venues: [addressOnlyVenue()],
    root,
    // An attacker-controlled extra field — must have zero effect.
    filePath: "../../../../etc/passwd",
    path: "C:\\Windows\\System32\\evil.json",
  });
  assert.equal(result.ok, true);
  // Still wrote to the real resolved canonical path under `root`, not the
  // injected one.
  const onDisk = JSON.parse(await readFile(resolveManualCoordinatesPath({ root }), "utf8"));
  assert.ok(onDisk.entries.some((e) => e.venue_id === "venue-test-address-only"));
});

// --- against the REAL committed store: schema/duplicate sanity -----------

test("the real committed venues/manual-coordinates.json validates cleanly and has no duplicates", async () => {
  const store = await loadManualCoordinateStore();
  assert.deepEqual(validateManualCoordinateStore(store), []);
});

// BOTM-CCB-MANUAL-COORDINATE-01: the real committed CCB entry carries
// exactly the operator-supplied coordinate pair (38.695679 / -9.20730 —
// JSON/IEEE754 serializes the latter as -9.2073, the identical numeric
// value, never a deliberate rounding), method MANUAL_OPERATOR_ENTRY, and
// resolves against the SAME already-canonical venue this package did not
// create or duplicate.
test("BOTM-CCB-MANUAL-COORDINATE-01: the real committed CCB manual-coordinate entry carries exactly the operator-supplied pair", async () => {
  const store = await loadManualCoordinateStore();
  const ccb = findManualEntry(store, "venue-lisboa-centro-cultural-de-belem-ccb");
  assert.ok(ccb, "expected a manual-coordinate entry for venue-lisboa-centro-cultural-de-belem-ccb");
  assert.equal(ccb.latitude, 38.695679);
  assert.equal(ccb.longitude, -9.2073);
  assert.equal(ccb.method, MANUAL_ENTRY_METHOD);
});
