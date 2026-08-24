#!/usr/bin/env node
// VENUE-LOCATION-RESOLUTION-03 — the one manual entry point this package
// adds: `npm run geocode:venues:structured-poi`.
//
// Runs the bounded, capped STRUCTURED_POI_QUERY third geocoding strategy
// against every currently ADDRESS_ONLY canonical Venue in
// venues/lisbon.json + venues/porto.json (derived live — never a
// hardcoded famous-venue list) for which BOTH earlier strategies
// (ADDRESS_ONLY_QUERY, NAME_PLUS_ADDRESS_QUERY) already have a REJECTED
// attempt on record — completely on top of the existing, UNCHANGED
// ADDRESS_ONLY_QUERY/NAME_PLUS_ADDRESS_QUERY machinery (ingestion/geocoding/
// {nominatim,match-address,run,run-name-plus-address}.mjs).
//
// STRUCTURED_POI_QUERY itself uses Nominatim's documented STRUCTURED search
// form — separate amenity/street/city/county/state/country/postalcode
// fields (never a single free-text `q=` string), with layer=poi so only
// point-of-interest-shaped results are ever returned — see
// ingestion/geocoding/nominatim.mjs#buildStructuredPoiFields/
// buildStructuredPoiSearchUrl/searchNominatimStructuredLive, and
// ingestion/geocoding/match-address.mjs#evaluateStructuredPoiCandidate/
// selectStructuredPoiMatch (which reuse NAME_PLUS_ADDRESS_QUERY's own
// strict acceptance rules verbatim — never loosened).
//
// Strategy order per venue (this package's brief):
//   1. already GEOCODED/CONFIRMED -> untouched (structurally: no longer
//      ADDRESS_ONLY, so isEligibleForSecondaryStrategy() excludes it);
//   2. reuse (never re-issue) the venue's existing cached ADDRESS_ONLY_QUERY
//      evidence — must be REJECTED on record, or this venue is BLOCKED
//      here (never silently upgraded to a first-strategy live query by
//      this script);
//   3. reuse (never re-issue) the venue's existing cached
//      NAME_PLUS_ADDRESS_QUERY evidence — must ALSO be REJECTED on record,
//      or this venue is BLOCKED here (never silently upgraded to a
//      second-strategy live query by this script);
//   4. STRUCTURED_POI_QUERY runs its OWN full, independent, equally strict
//      acceptance rules — a first- or second-strategy rejection is never
//      "papered over": the structured query must independently satisfy
//      every check itself;
//   5. still-rejected venues remain ADDRESS_ONLY.
//
// Bounded target set + hard 15-live-request cap (this package's brief),
// ranked by real current unresolved-Observation payoff (highest first) so
// a cap-constrained run still processes the venues that would unlock the
// most Observations — reusing
// ingestion/venue-onboarding/bounded-geocoding.mjs's EXISTING, unmodified
// cap-enforcement orchestration (never duplicated), exactly as
// run-name-plus-address.mjs does.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireLisbonPorto } from "../lisbon-porto/run.mjs";
import { resolveObservation } from "../venue/resolver.mjs";
import { selectGeocodeMatch, selectNamePlusAddressMatch } from "./match-address.mjs";
import {
  geocodeOneVenue,
  loadCachedFixture,
  validateCacheIdentity,
  CACHE_DIR,
  QUERY_STRATEGIES,
} from "./run.mjs";
import { isEligibleForSecondaryStrategy, classifyOutcome } from "./run-name-plus-address.mjs";
import { geocodeAdmittedVenues, DEFAULT_MAX_LIVE_GEOCODE_REQUESTS } from "../venue-onboarding/bounded-geocoding.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Hard bound (this package's brief: "Maximum 15 new live STRUCTURED_POI
// requests") — never exceeded, whatever the real eligible-venue count
// turns out to be.
export const MAX_LIVE_STRUCTURED_POI_REQUESTS = DEFAULT_MAX_LIVE_GEOCODE_REQUESTS;

async function loadJson(relativePath) {
  const fullPath = resolve(ROOT, relativePath);
  return JSON.parse(await readFile(fullPath, "utf8"));
}

// Same rule ingestion/venue-onboarding/run.mjs and run-name-plus-address.mjs
// use: a Venue's own city field decides its registry, never which package
// touched it.
function registryTargetForVenue(venue) {
  if (String(venue.city ?? "").trim().toLowerCase() === "porto") {
    return { region: "porto", registryPath: "venues/porto.json" };
  }
  return { region: "lisbon", registryPath: "venues/lisbon.json" };
}

/**
 * A venue may only be attempted under STRUCTURED_POI_QUERY once BOTH
 * earlier strategies' REJECTED attempts are actually on record for it
 * (their existing cached fixtures, reused — never re-queried). Missing or
 * stale evidence for either prior strategy -> not eligible here (this
 * script never issues a first- or second-strategy live request itself).
 */
async function loadPriorStrategyContext(venue) {
  const addressOnlyFixture = await loadCachedFixture(venue.venue_id, CACHE_DIR, QUERY_STRATEGIES.ADDRESS_ONLY);
  if (!addressOnlyFixture) {
    return { eligible: false, reason: "NO_ADDRESS_ONLY_ATTEMPT_ON_RECORD" };
  }
  const addressOnlyIdentity = validateCacheIdentity(addressOnlyFixture, { venue_id: venue.venue_id }, venue);
  if (!addressOnlyIdentity.valid) {
    return { eligible: false, reason: `STALE_ADDRESS_ONLY_CACHE(${addressOnlyIdentity.failures.join(",")})` };
  }
  const addressOnlyMatch = selectGeocodeMatch(addressOnlyFixture.candidates, venue);
  if (addressOnlyMatch.status === "ACCEPTED") {
    // Cannot actually happen for a venue whose location_status is still
    // ADDRESS_ONLY — guarded anyway, fail-closed, never re-litigated here.
    return { eligible: false, reason: "ADDRESS_ONLY_ALREADY_ACCEPTED" };
  }

  const namePlusAddressFixture = await loadCachedFixture(venue.venue_id, CACHE_DIR, QUERY_STRATEGIES.NAME_PLUS_ADDRESS);
  if (!namePlusAddressFixture) {
    return { eligible: false, reason: "NO_NAME_PLUS_ADDRESS_ATTEMPT_ON_RECORD" };
  }
  const namePlusAddressIdentity = validateCacheIdentity(
    namePlusAddressFixture,
    { venue_id: venue.venue_id, strategy: QUERY_STRATEGIES.NAME_PLUS_ADDRESS },
    venue,
  );
  if (!namePlusAddressIdentity.valid) {
    return { eligible: false, reason: `STALE_NAME_PLUS_ADDRESS_CACHE(${namePlusAddressIdentity.failures.join(",")})` };
  }
  const namePlusAddressMatch = selectNamePlusAddressMatch(namePlusAddressFixture.candidates, venue);
  if (namePlusAddressMatch.status === "ACCEPTED") {
    return { eligible: false, reason: "NAME_PLUS_ADDRESS_ALREADY_ACCEPTED" };
  }

  return {
    eligible: true,
    addressOnlyFixture,
    addressOnlyMatch,
    namePlusAddressFixture,
    namePlusAddressMatch,
  };
}

/**
 * Reporting-only classification of a STRUCTURED_POI_QUERY match/rejection
 * outcome into this package's own diagnostic categories A-F — distinguishes
 * a Nominatim parser/query problem from a genuine OSM dataset gap. Derived
 * ONLY from the actual returned candidates' own evaluated checks — never a
 * guess. Never used for acceptance/rejection itself — purely descriptive.
 */
export function classifyStructuredFailure(match) {
  if (!match || match.status === "ACCEPTED") return null;

  if (match.reason === "NO_CANDIDATES_RETURNED") return "A. NO_POI_RETURNED";
  if (match.reason === "AMBIGUOUS_MULTIPLE_CANDIDATES_PASSED") return "E. MULTIPLE_AMBIGUOUS_POIS";

  const evaluated = match.evaluated ?? [];
  const total = evaluated.length;
  if (total === 0) return "A. NO_POI_RETURNED";

  const failureCount = (check) => evaluated.filter((entry) => entry.checks?.[check] === false).length;

  // Every returned candidate is itself non-specific (a road/boundary/
  // administrative feature) or not a plausible venue feature kind at
  // all — the dataset simply never returned a real POI candidate to
  // evaluate against name/address.
  if (failureCount("specificEnough") === total || failureCount("featureCompatible") === total) {
    return "B. ONLY_ROAD_OR_ADDRESS_RETURNED";
  }

  // Among the candidates that WERE specific-enough/feature-plausible POIs,
  // classify why none of them was accepted.
  const plausiblePois = evaluated.filter(
    (entry) => entry.checks?.specificEnough !== false && entry.checks?.featureCompatible !== false,
  );
  if (plausiblePois.length > 0) {
    const nameFailures = plausiblePois.filter((entry) => entry.checks?.nameCompatible === false).length;
    const addressFailures = plausiblePois.filter(
      (entry) =>
        entry.checks?.country === false ||
        entry.checks?.city === false ||
        entry.checks?.postcode === false ||
        entry.checks?.houseNumber === false,
    ).length;
    if (nameFailures === plausiblePois.length && addressFailures === 0) return "C. POI_RETURNED_BUT_WRONG_NAME";
    if (addressFailures > 0) return "D. POI_RETURNED_BUT_ADDRESS_CONFLICT";
    if (nameFailures > 0) return "C. POI_RETURNED_BUT_WRONG_NAME";
  }

  return "F. OTHER";
}

async function main() {
  console.log(`VENUE-LOCATION-RESOLUTION-03 geocode:venues:structured-poi starting (${new Date().toISOString()})`);

  // Real, live Observation acquisition (the same nine already-proven
  // sources ingestion/lisbon-porto/run.mjs uses) — used ONLY to rank
  // eligible venues by real current unresolved-Observation payoff. No new
  // source, no Observation mutation, no fuzzy matching: resolveObservation()
  // is the existing, unmodified resolver.
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

  // Section-8-style bounded target set, derived live from the canonical
  // Venue registries themselves — never a hardcoded famous-venue list.
  const eligible = allVenues.filter(isEligibleForSecondaryStrategy);
  console.log(
    `\n  ${eligible.length} ADDRESS_ONLY venue(s) eligible by criteria (ADDRESS_ONLY + canonical_name + address + evidence): ` +
      `${eligible.map((v) => v.venue_id).join(", ")}`,
  );

  const withContext = [];
  for (const venue of eligible) {
    const context = await loadPriorStrategyContext(venue);
    withContext.push({ venue, context });
  }

  const readyForAttempt = withContext.filter((entry) => entry.context.eligible);
  const blocked = withContext.filter((entry) => !entry.context.eligible);

  // Rank by real current resolved (but, being ADDRESS_ONLY, necessarily
  // unmapped) Observation payoff, highest first; ties broken deterministically
  // by venue_id. Only actually changes processing order (and thus which
  // venues fall inside vs. outside the 15-request cap) when the eligible
  // count exceeds the cap.
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
  for (const { venue, context } of blocked) {
    console.log(`    ${venue.venue_id}: BLOCKED (${context.reason}) — not attempted`);
  }

  const orderedVenues = readyForAttempt.map((entry) => entry.venue);

  const boundLoadCachedFixture = (venueId, cacheDir) =>
    loadCachedFixture(venueId, cacheDir, QUERY_STRATEGIES.STRUCTURED_POI);
  const boundValidateCacheIdentity = (fixture, target, venue) =>
    validateCacheIdentity(fixture, { ...target, strategy: QUERY_STRATEGIES.STRUCTURED_POI }, venue);
  const boundGeocodeOneVenue = (target, opts) =>
    geocodeOneVenue(target, { ...opts, strategy: QUERY_STRATEGIES.STRUCTURED_POI });

  const { results, liveRequestCount } = await geocodeAdmittedVenues(orderedVenues, {
    maxLiveRequests: MAX_LIVE_STRUCTURED_POI_REQUESTS,
    registryTargetForVenue,
    loadCachedFixture: boundLoadCachedFixture,
    validateCacheIdentity: boundValidateCacheIdentity,
    geocodeOneVenue: boundGeocodeOneVenue,
    cacheDir: CACHE_DIR,
  });

  console.log(`\n=== geocode:venues:structured-poi summary ===`);
  console.log(`  live STRUCTURED_POI_QUERY requests used: ${liveRequestCount}/${MAX_LIVE_STRUCTURED_POI_REQUESTS}`);

  const byId = new Map(withContext.map((entry) => [entry.venue.venue_id, entry]));
  const report = [];
  for (const result of results) {
    const entry = byId.get(result.venue_id);
    const addressOnlyOutcome = entry ? classifyOutcome(entry.context.addressOnlyMatch) : "UNKNOWN";
    const namePlusAddressOutcome = entry ? classifyOutcome(entry.context.namePlusAddressMatch) : "UNKNOWN";

    // Re-derive the STRUCTURED_POI match for reporting (candidate count,
    // per-candidate category, classification) — geocodeOneVenue() already
    // did this internally; we look at its own returned `evaluated`/reason
    // for LEFT_ADDRESS_ONLY outcomes, or reconstruct ACCEPTED trivially.
    const structuredMatch =
      result.outcome === "GEOCODED"
        ? { status: "ACCEPTED" }
        : result.outcome === "LEFT_ADDRESS_ONLY"
          ? { status: "REJECTED", reason: result.reason, evaluated: result.evaluated }
          : null;
    const failureClassification = classifyStructuredFailure(structuredMatch);

    console.log(
      `  [${result.outcome}] ${result.venue_id}${result.reason ? `: ${result.reason}` : ""} ` +
        `(address-only was: ${addressOnlyOutcome}; name-plus-address was: ${namePlusAddressOutcome})` +
        `${failureClassification ? ` [${failureClassification}]` : ""}`,
    );
    if (result.candidate_count !== undefined) {
      console.log(`      candidates returned: ${result.candidate_count}`);
    }

    report.push({
      venue_id: result.venue_id,
      canonical_name: entry?.venue?.canonical_name ?? null,
      address_only_outcome: addressOnlyOutcome,
      name_plus_address_outcome: namePlusAddressOutcome,
      structured_poi_result: result,
      failure_classification: failureClassification,
    });
  }
  for (const { venue, context } of blocked) {
    report.push({
      venue_id: venue.venue_id,
      canonical_name: venue.canonical_name,
      address_only_outcome: "NOT_ON_RECORD",
      name_plus_address_outcome: "NOT_ON_RECORD",
      structured_poi_result: { venue_id: venue.venue_id, outcome: "NOT_ATTEMPTED", reason: context.reason },
      failure_classification: null,
    });
  }

  const geocodedCount = results.filter((r) => r.outcome === "GEOCODED").length;
  const readyForGeocodingCount = results.filter((r) => r.outcome === "READY_FOR_GEOCODING").length;
  const leftAddressOnlyCount = results.filter((r) => r.outcome === "LEFT_ADDRESS_ONLY").length;
  console.log(`  geocoded: ${geocodedCount}`);
  console.log(`  left ADDRESS_ONLY (attempted, rejected): ${leftAddressOnlyCount}`);
  console.log(`  ready-for-geocoding (over cap): ${readyForGeocodingCount}`);
  console.log(`  blocked (no prior-strategy rejection on record for both strategies): ${blocked.length}`);

  const attemptedCount = results.filter((r) => r.outcome === "GEOCODED" || r.outcome === "LEFT_ADDRESS_ONLY").length;
  const acceptanceRate = attemptedCount > 0 ? geocodedCount / attemptedCount : 0;
  console.log(
    `  STRUCTURED_POI_QUERY acceptance rate: ${geocodedCount}/${attemptedCount}` +
      ` (${(acceptanceRate * 100).toFixed(1)}%)`,
  );

  return { report, liveRequestCount, results, geocodedCount, attemptedCount, acceptanceRate };
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main };
