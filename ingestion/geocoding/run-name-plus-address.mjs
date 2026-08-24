#!/usr/bin/env node
// VENUE-LOCATION-RESOLUTION-02 — the one manual entry point this package
// adds: `npm run geocode:venues:name-plus-address`.
//
// Runs the bounded, capped NAME_PLUS_ADDRESS_QUERY second geocoding
// strategy against every currently ADDRESS_ONLY canonical Venue in
// venues/lisbon.json + venues/porto.json (derived live — never a
// hardcoded famous-venue list), on top of the existing, completely
// UNCHANGED ADDRESS_ONLY_QUERY machinery (ingestion/geocoding/{nominatim,
// match-address,run}.mjs).
//
// Strategy order per venue (this package's brief, section 2):
//   1. reuse (never re-issue) the venue's existing cached ADDRESS_ONLY_QUERY
//      evidence;
//   2. a venue that is still ADDRESS_ONLY by definition never had an
//      ACCEPTED first-strategy match, so this step is structurally
//      satisfied by this script's own eligibility filter, not extra code;
//   3. NAME_PLUS_ADDRESS_QUERY may only be attempted once a REJECTED
//      first-strategy attempt is actually on record (no address-only
//      attempt on record at all -> left alone, never silently upgraded to
//      a first-strategy live query here — that remains VENUE-GEOCODING-01's
//      own job);
//   4. the second strategy runs its OWN full, independent, equally strict
//      acceptance rules (ingestion/geocoding/match-address.mjs's
//      evaluateNamePlusAddressCandidate) — a first-strategy hard identity
//      conflict is never "papered over": the second query must
//      independently satisfy every check itself;
//   5. still-rejected venues remain ADDRESS_ONLY.
//
// Bounded target set (section 8) + hard 15-live-request cap (section 9),
// ranked by real current unresolved-Observation payoff (highest first) so
// a cap-constrained run still processes the venues that would unlock the
// most Observations, reusing ingestion/venue-onboarding/bounded-geocoding.mjs's
// EXISTING, unmodified cap-enforcement orchestration (never duplicated).

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireLisbonPorto } from "../lisbon-porto/run.mjs";
import { resolveObservation } from "../venue/resolver.mjs";
import { selectGeocodeMatch } from "./match-address.mjs";
import {
  geocodeOneVenue,
  loadCachedFixture,
  validateCacheIdentity,
  CACHE_DIR,
  QUERY_STRATEGIES,
} from "./run.mjs";
import { geocodeAdmittedVenues, DEFAULT_MAX_LIVE_GEOCODE_REQUESTS } from "../venue-onboarding/bounded-geocoding.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Hard bound (this package's brief, section 9) — never exceeded, whatever
// the real eligible-venue count turns out to be.
export const MAX_LIVE_NAME_PLUS_ADDRESS_REQUESTS = DEFAULT_MAX_LIVE_GEOCODE_REQUESTS;

async function loadJson(relativePath) {
  const fullPath = resolve(ROOT, relativePath);
  return JSON.parse(await readFile(fullPath, "utf8"));
}

// Same rule ingestion/venue-onboarding/run.mjs uses: a Venue's own city
// field decides its registry, never which package touched it.
function registryTargetForVenue(venue) {
  if (String(venue.city ?? "").trim().toLowerCase() === "porto") {
    return { region: "porto", registryPath: "venues/porto.json" };
  }
  return { region: "lisbon", registryPath: "venues/lisbon.json" };
}

// Section 8: bounded target set, derived live — never a hardcoded famous-
// venue list.
export function isEligibleForSecondaryStrategy(venue) {
  return (
    venue?.location_status === "ADDRESS_ONLY" &&
    typeof venue.canonical_name === "string" &&
    venue.canonical_name.trim() !== "" &&
    typeof venue.address === "string" &&
    venue.address.trim() !== "" &&
    Array.isArray(venue.evidence) &&
    venue.evidence.length > 0
  );
}

/**
 * Section 2 steps 1/3: a venue may only be attempted under
 * NAME_PLUS_ADDRESS_QUERY once a REJECTED ADDRESS_ONLY_QUERY attempt is
 * actually on record for it (its existing cached fixture, reused — never
 * re-queried). No address-only attempt on record at all -> not eligible
 * here (this script never issues a first-strategy live request itself).
 */
async function loadAddressOnlyContext(venue) {
  const fixture = await loadCachedFixture(venue.venue_id, CACHE_DIR, QUERY_STRATEGIES.ADDRESS_ONLY);
  if (!fixture) {
    return { eligible: false, reason: "NO_ADDRESS_ONLY_ATTEMPT_ON_RECORD" };
  }
  const identity = validateCacheIdentity(fixture, { venue_id: venue.venue_id }, venue);
  if (!identity.valid) {
    return { eligible: false, reason: `STALE_ADDRESS_ONLY_CACHE(${identity.failures.join(",")})` };
  }
  const match = selectGeocodeMatch(fixture.candidates, venue);
  if (match.status === "ACCEPTED") {
    // Cannot actually happen for a venue whose location_status is still
    // ADDRESS_ONLY (an accepted match would already have promoted it to
    // GEOCODED) — guarded anyway, fail-closed, never re-litigated here.
    return { eligible: false, reason: "ADDRESS_ONLY_ALREADY_ACCEPTED" };
  }
  return {
    eligible: true,
    addressOnlyFixture: fixture,
    addressOnlyMatch: match,
  };
}

/**
 * Reporting-only classification of a match/rejection outcome into the
 * categories this package's brief (section 13) asks to be distinguished.
 * Never used for acceptance/rejection itself — purely descriptive.
 */
export function classifyOutcome(match) {
  if (!match) return "NOT_ATTEMPTED";
  if (match.status === "ACCEPTED") return "BUILDING_OR_VENUE_SPECIFIC_HIT";
  if (match.reason === "NO_CANDIDATES_RETURNED") return "NO_RESULT";
  if (match.reason === "AMBIGUOUS_MULTIPLE_CANDIDATES_PASSED") return "AMBIGUOUS";

  const evaluated = match.evaluated ?? [];
  const total = evaluated.length;
  const failureCount = (check) => evaluated.filter((entry) => entry.checks?.[check] === false).length;

  // Priority order matters for an honest label: when EVERY candidate is
  // already road/non-specific (or, under NAME_PLUS_ADDRESS_QUERY, an
  // implausible feature type), that is the dominant, actually-decisive
  // rejection reason even if some of those same non-specific candidates
  // also happen to carry a differing postcode/house-number/name — a
  // road segment's own postcode disagreeing with the canonical address is
  // incidental noise, not the reason the match failed. A postcode/house-
  // number/name conflict is only reported as such when it was the thing
  // that actually kept an otherwise-specific-enough candidate from
  // passing.
  if (total > 0 && failureCount("country") === total) return "WRONG_COUNTRY";
  if (total > 0 && (failureCount("specificEnough") === total || failureCount("featureCompatible") === total)) {
    return "ROAD_OR_NON_SPECIFIC_ONLY";
  }
  if (failureCount("postcode") > 0) return "POSTCODE_CONFLICT";
  if (failureCount("houseNumber") > 0) return "HOUSE_NUMBER_CONFLICT";
  if (failureCount("nameCompatible") > 0) return "NAME_IDENTITY_CONFLICT";
  return "OTHER_REJECTION";
}

async function main() {
  console.log(`VENUE-LOCATION-RESOLUTION-02 geocode:venues:name-plus-address starting (${new Date().toISOString()})`);

  // Real, live Observation acquisition (the same nine already-proven
  // sources ingestion/lisbon-porto/run.mjs uses) — used ONLY to rank
  // eligible venues by real current unresolved-Observation payoff
  // (section 9). No new source, no Observation mutation, no fuzzy
  // matching: resolveObservation() is the existing, unmodified resolver.
  const { lisbonObservations, portoObservations } = await acquireLisbonPorto({});
  const allObservations = [...lisbonObservations, ...portoObservations];

  const payoffByVenueId = new Map();
  for (const observation of allObservations) {
    const resolution = resolveObservation(observation);
    if (resolution.resolution_status !== "RESOLVED") continue;
    payoffByVenueId.set(resolution.venue_id, (payoffByVenueId.get(resolution.venue_id) ?? 0) + 1);
  }

  const lisbonVenues = await loadJson("venues/lisbon.json");
  const portoVenues = await loadJson("venues/porto.json");
  const allVenues = [...lisbonVenues.venues, ...portoVenues.venues];

  const eligible = allVenues.filter(isEligibleForSecondaryStrategy);
  console.log(`\n  ${eligible.length} ADDRESS_ONLY venue(s) eligible by section-8 criteria: ${eligible.map((v) => v.venue_id).join(", ")}`);

  const withContext = [];
  for (const venue of eligible) {
    const context = await loadAddressOnlyContext(venue);
    withContext.push({ venue, context });
  }

  const readyForAttempt = withContext.filter((entry) => entry.context.eligible);
  const blockedNoAddressOnlyRecord = withContext.filter((entry) => !entry.context.eligible);

  // Section 9: rank by real current resolved (but, being ADDRESS_ONLY,
  // necessarily unmapped) Observation payoff, highest first; ties broken
  // deterministically by venue_id. Only actually changes processing order
  // (and thus which venues fall inside vs. outside the 15-request cap)
  // when the eligible count exceeds the cap.
  readyForAttempt.sort((a, b) => {
    const payoffA = payoffByVenueId.get(a.venue.venue_id) ?? 0;
    const payoffB = payoffByVenueId.get(b.venue.venue_id) ?? 0;
    if (payoffB !== payoffA) return payoffB - payoffA;
    return a.venue.venue_id.localeCompare(b.venue.venue_id);
  });

  console.log(`\n  target ordering (payoff = current resolved-but-unmapped Observations):`);
  for (const { venue } of readyForAttempt) {
    console.log(`    ${venue.venue_id}: payoff=${payoffByVenueId.get(venue.venue_id) ?? 0}`);
  }
  for (const { venue, context } of blockedNoAddressOnlyRecord) {
    console.log(`    ${venue.venue_id}: BLOCKED (${context.reason}) — not attempted`);
  }

  const orderedVenues = readyForAttempt.map((entry) => entry.venue);

  const boundLoadCachedFixture = (venueId, cacheDir) =>
    loadCachedFixture(venueId, cacheDir, QUERY_STRATEGIES.NAME_PLUS_ADDRESS);
  const boundValidateCacheIdentity = (fixture, target, venue) =>
    validateCacheIdentity(fixture, { ...target, strategy: QUERY_STRATEGIES.NAME_PLUS_ADDRESS }, venue);
  const boundGeocodeOneVenue = (target, opts) =>
    geocodeOneVenue(target, { ...opts, strategy: QUERY_STRATEGIES.NAME_PLUS_ADDRESS });

  const { results, liveRequestCount } = await geocodeAdmittedVenues(orderedVenues, {
    maxLiveRequests: MAX_LIVE_NAME_PLUS_ADDRESS_REQUESTS,
    registryTargetForVenue,
    loadCachedFixture: boundLoadCachedFixture,
    validateCacheIdentity: boundValidateCacheIdentity,
    geocodeOneVenue: boundGeocodeOneVenue,
    cacheDir: CACHE_DIR,
  });

  console.log(`\n=== geocode:venues:name-plus-address summary ===`);
  console.log(`  live NAME_PLUS_ADDRESS_QUERY requests used: ${liveRequestCount}/${MAX_LIVE_NAME_PLUS_ADDRESS_REQUESTS}`);

  const byId = new Map(withContext.map((entry) => [entry.venue.venue_id, entry]));
  const report = [];
  for (const result of results) {
    const entry = byId.get(result.venue_id);
    const addressOnlyOutcome = entry ? classifyOutcome(entry.context.addressOnlyMatch) : "UNKNOWN";
    console.log(
      `  [${result.outcome}] ${result.venue_id}${result.reason ? `: ${result.reason}` : ""} ` +
        `(address-only was: ${addressOnlyOutcome})`,
    );
    report.push({
      venue_id: result.venue_id,
      canonical_name: entry?.venue?.canonical_name ?? null,
      address_only_outcome: addressOnlyOutcome,
      address_only_query: entry?.context?.addressOnlyFixture?.query_address ?? null,
      name_plus_address_result: result,
    });
  }
  for (const { venue, context } of blockedNoAddressOnlyRecord) {
    report.push({
      venue_id: venue.venue_id,
      canonical_name: venue.canonical_name,
      address_only_outcome: "NOT_ON_RECORD",
      name_plus_address_result: { venue_id: venue.venue_id, outcome: "NOT_ATTEMPTED", reason: context.reason },
    });
  }

  const geocodedCount = results.filter((r) => r.outcome === "GEOCODED").length;
  const readyForGeocodingCount = results.filter((r) => r.outcome === "READY_FOR_GEOCODING").length;
  const leftAddressOnlyCount = results.filter((r) => r.outcome === "LEFT_ADDRESS_ONLY").length;
  console.log(`  geocoded: ${geocodedCount}`);
  console.log(`  left ADDRESS_ONLY (attempted, rejected): ${leftAddressOnlyCount}`);
  console.log(`  ready-for-geocoding (over cap): ${readyForGeocodingCount}`);
  console.log(`  blocked (no address-only attempt on record): ${blockedNoAddressOnlyRecord.length}`);

  return { report, liveRequestCount, results };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
