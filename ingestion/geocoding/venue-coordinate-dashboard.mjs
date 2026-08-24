// VENUE-MANUAL-COORDINATES-DASHBOARD-01 — server-only data assembly for
// the /operator/venues dashboard. Node-only (fs access); never imported
// from client-side/browser bundle code. Reuses existing, already-proven
// modules rather than re-implementing anything:
//   - ingestion/geocoding/manual-coordinate-queue.mjs for the live,
//     derived outstanding-venue queue (already excludes venues with a
//     valid manual entry — see that module's own doc comment)
//   - ingestion/geocoding/manual-coordinate-store.mjs for the canonical
//     manual-coordinate store itself
//   - ingestion/venue/contract.mjs's MAP_ELIGIBLE_LOCATION_STATUSES for
//     "already map-enabled" (CONFIRMED/GEOCODED)
//
// "Waiting listings" (resolved-but-unmapped Observations currently
// blocked only by a missing map coordinate) is read from the committed,
// already-generated fixtures/map/lisbon-porto-overnight-coverage-01-live-run-proof.json
// proof — a per-venue breakdown computed once by
// ingestion/lisbon-porto/run.mjs's summariseCity() (`npm run
// ingest:lisbon-porto`), never recomputed live at dashboard render time
// and never estimated. If that proof file is unavailable (e.g. never
// generated in a given checkout), the per-venue number is omitted
// (`null`) rather than guessed — matching this package's "exact numbers
// only, never estimates" rule.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildManualCoordinateQueue } from "./manual-coordinate-queue.mjs";
import { loadManualCoordinateStore } from "./manual-coordinate-store.mjs";
import { MAP_ELIGIBLE_LOCATION_STATUSES } from "../venue/contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const REGISTRIES = [
  { region: "lisbon", path: "venues/lisbon.json" },
  { region: "porto", path: "venues/porto.json" },
];

const LIVE_RUN_PROOF_RELATIVE_PATH = "fixtures/map/lisbon-porto-overnight-coverage-01-live-run-proof.json";

async function loadAllVenues(root) {
  const all = [];
  for (const { path } of REGISTRIES) {
    const parsed = JSON.parse(await readFile(resolve(root, path), "utf8"));
    all.push(...(Array.isArray(parsed.venues) ? parsed.venues : []));
  }
  return all;
}

/**
 * `{ venue_id: count }` of current resolved-but-unmapped Observations, or
 * `{}` if the proof file does not exist in this checkout — never thrown,
 * never guessed.
 */
// Returns { available, counts }. `available` distinguishes "the proof
// file exists, and this venue simply has zero resolved-but-unmapped
// Observations right now" (a real, exact 0) from "no proof file exists in
// this checkout at all" (genuinely unknown — every venue's number must be
// omitted as null, never guessed as 0).
async function loadWaitingListingsByVenueId(root) {
  try {
    const raw = JSON.parse(await readFile(resolve(root, LIVE_RUN_PROOF_RELATIVE_PATH), "utf8"));
    return {
      available: true,
      counts: {
        ...(raw?.lisbon?.resolved_but_unmapped_by_venue_id ?? {}),
        ...(raw?.porto?.resolved_but_unmapped_by_venue_id ?? {}),
      },
    };
  } catch (error) {
    if (error.code === "ENOENT") return { available: false, counts: {} };
    throw error;
  }
}

/**
 * Assemble everything /operator/venues needs to render, from the current
 * live canonical estate — never a hardcoded venue list.
 *
 * Returns:
 *   outstanding        - venues still needing coordinates (ADDRESS_ONLY,
 *                         no valid manual entry), sorted by waiting_listings
 *                         DESCENDING when that number is known (unknown
 *                         values sort last, never invented as 0)
 *   manuallyCompleted   - ADDRESS_ONLY venues that already have a valid
 *                         manual entry
 *   alreadyMapEnabled   - CONFIRMED/GEOCODED venues
 *   totals              - the three live counts for the summary line
 */
export async function buildOperatorVenueDashboard({ root = ROOT } = {}) {
  const [venues, manualStore, queue, waitingListings] = await Promise.all([
    loadAllVenues(root),
    loadManualCoordinateStore({ root }),
    buildManualCoordinateQueue({ root }),
    loadWaitingListingsByVenueId(root),
  ]);

  const manualByVenueId = new Map(manualStore.entries.map((entry) => [entry.venue_id, entry]));
  const venueById = new Map(venues.map((venue) => [venue.venue_id, venue]));

  const outstanding = queue.entries
    .map((entry) => ({
      ...entry,
      // available + present  -> that exact count
      // available + absent   -> a real, exact 0 (this venue has no
      //                         resolved-but-unmapped Observations right now)
      // not available at all -> null (genuinely unknown — never guessed)
      waiting_listings: waitingListings.available ? (waitingListings.counts[entry.venue_id] ?? 0) : null,
    }))
    .sort((a, b) => {
      if (a.waiting_listings == null && b.waiting_listings == null) return 0;
      if (a.waiting_listings == null) return 1;
      if (b.waiting_listings == null) return -1;
      return b.waiting_listings - a.waiting_listings;
    });

  const manuallyCompleted = venues
    .filter((venue) => venue.location_status === "ADDRESS_ONLY" && manualByVenueId.has(venue.venue_id))
    .map((venue) => ({ ...venue, manual: manualByVenueId.get(venue.venue_id) }));

  const alreadyMapEnabled = venues.filter((venue) => MAP_ELIGIBLE_LOCATION_STATUSES.has(venue.location_status));

  // Stale-override report only (never used for eligibility — canonical
  // coordinates always win, per resolveVenueMapCoordinates in
  // ingestion/map/projection.mjs): a manual entry that exists for a venue
  // which has since become CONFIRMED/GEOCODED.
  const staleManualOverrides = manualStore.entries
    .map((entry) => ({ entry, venue: venueById.get(entry.venue_id) }))
    .filter(({ venue }) => venue && (venue.location_status === "CONFIRMED" || venue.location_status === "GEOCODED"));

  return {
    outstanding,
    manuallyCompleted,
    alreadyMapEnabled,
    staleManualOverrides,
    totals: {
      needCoordinates: outstanding.length,
      manuallyCompleted: manuallyCompleted.length,
      alreadyMapEnabled: alreadyMapEnabled.length,
    },
    // Exposed so the UI/API layer can validate a save/remove request
    // against the real current registry without re-reading it itself.
    venues,
  };
}

/** Exported for the write API route, which needs the current combined
 * canonical Venue array to validate a save/remove request without pulling
 * in the queue/proof-loading work buildOperatorVenueDashboard also does. */
export async function loadCombinedVenues({ root = ROOT } = {}) {
  return loadAllVenues(root);
}

export { ROOT as VENUE_COORDINATE_DASHBOARD_ROOT };
