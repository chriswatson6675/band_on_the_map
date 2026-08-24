#!/usr/bin/env node
// FINAL COORDINATE-RESEARCH BOUNDARY — closing report for the current
// Lisbon+Porto proof's automated venue-coordinate research (VENUE-
// GEOCODING-01/01A, VENUE-AUTO-ONBOARDING-01, VENUE-LOCATION-
// RESOLUTION-02/03, and this package's Casa Capitão re-evaluation +
// bounded Foursquare Places evaluation).
//
// This module is REPORT-ONLY. It never mutates venues/lisbon.json or
// venues/porto.json, and it never adds a new location_status value to
// ingestion/venue/contract.mjs's LOCATION_STATUSES set. A canonical
// Venue remains exactly ADDRESS_ONLY until it actually receives
// evidenced coordinates — whether from a future governed geocoding
// attempt or a future MANUAL_OPERATOR_ENTRY dashboard step (not yet
// implemented — see docs/VENUE_COORDINATE_RESEARCH_CLOSED.md).
// `queue_status: "MANUAL_COORDINATE_REQUIRED"` below is an operational
// report label attached only to this generated queue entry, never
// written back onto the Venue record itself.
//
// `npm run report:manual-coordinate-queue` regenerates
// fixtures/geocoding/manual-coordinate-queue.json from the live
// venues/*.json registries — nothing here is hand-edited.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadManualCoordinateStore } from "./manual-coordinate-store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REPORT_PATH = resolve(ROOT, "fixtures/geocoding/manual-coordinate-queue.json");

const REGISTRIES = [
  { region: "lisbon", path: "venues/lisbon.json" },
  { region: "porto", path: "venues/porto.json" },
];

const CLOSURE_NOTE =
  "Automated coordinate research is closed for this venue for the current Lisbon+Porto proof: " +
  "ADDRESS_ONLY_QUERY, NAME_PLUS_ADDRESS_QUERY, and STRUCTURED_POI_QUERY (all via OpenStreetMap " +
  "Nominatim) were attempted and none accepted a candidate; a bounded Foursquare Places evaluation " +
  "was in scope for this closing package but was not performed — no Foursquare API credentials were " +
  "available in this environment, and none were fabricated. Queued for a future MANUAL_OPERATOR_ENTRY " +
  "step via the Band on the Map dashboard (not yet implemented) — see " +
  "docs/VENUE_COORDINATE_RESEARCH_CLOSED.md.";

async function loadRegistryVenues(path, root) {
  const full = resolve(root, path);
  const parsed = JSON.parse(await readFile(full, "utf8"));
  return Array.isArray(parsed.venues) ? parsed.venues : [];
}

/**
 * Build the manual-coordinate-entry queue: every canonical Venue across
 * both registries whose location_status is still ADDRESS_ONLY, derived
 * live from venues/lisbon.json + venues/porto.json — never hardcoded,
 * never mutating the source registries.
 *
 * VENUE-MANUAL-COORDINATES-DASHBOARD-01: a venue that already carries a
 * valid MANUAL_OPERATOR_ENTRY in venues/manual-coordinates.json is
 * excluded from this OUTSTANDING queue — it has already been handled by
 * an operator — WITHOUT altering its canonical location_status, which
 * stays exactly ADDRESS_ONLY (this function never mutates
 * venues/lisbon.json or venues/porto.json). Removing that manual entry
 * (the dashboard's "Remove manual coordinates" action) makes the venue
 * reappear here automatically on the next call — no separate bookkeeping.
 */
export async function buildManualCoordinateQueue({ root = ROOT } = {}) {
  const manualStore = await loadManualCoordinateStore({ root });
  const manuallyCompletedVenueIds = new Set(manualStore.entries.map((entry) => entry.venue_id));

  const entries = [];
  for (const { region, path } of REGISTRIES) {
    const venues = await loadRegistryVenues(path, root);
    for (const venue of venues) {
      if (venue.location_status !== "ADDRESS_ONLY") continue;
      if (manuallyCompletedVenueIds.has(venue.venue_id)) continue;
      entries.push({
        region,
        venue_id: venue.venue_id,
        canonical_name: venue.canonical_name,
        city: venue.city,
        municipality: venue.municipality,
        address: venue.address,
        queue_status: "MANUAL_COORDINATE_REQUIRED",
        note: CLOSURE_NOTE,
      });
    }
  }
  return {
    generated_note:
      "Report-only artifact. Does not mutate venues/lisbon.json or venues/porto.json, and does not " +
      "add a new location_status value — MANUAL_COORDINATE_REQUIRED is an operational queue label on " +
      "this report, not canonical Venue schema. Excludes venues already carrying a valid " +
      "MANUAL_OPERATOR_ENTRY in venues/manual-coordinates.json (see " +
      "ingestion/geocoding/manual-coordinate-store.mjs). Regenerate with " +
      "`npm run report:manual-coordinate-queue`.",
    total_address_only: entries.length,
    entries,
  };
}

async function main() {
  const report = await buildManualCoordinateQueue();
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Manual coordinate-entry queue (${report.total_address_only} venue(s)):`);
  for (const entry of report.entries) {
    console.log(`  [${entry.region}] ${entry.venue_id} — ${entry.canonical_name}`);
  }
  console.log(`\nWritten to ${REPORT_PATH}`);
  return report;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
