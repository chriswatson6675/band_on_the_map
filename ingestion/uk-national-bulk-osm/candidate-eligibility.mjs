// BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02 — a pre-candidacy
// eligibility gate for raw bulk-OSM elements, applied BEFORE any element
// becomes a VenueDiscoveryCandidate.
//
// Founder correction (this package, mid-run): a generic physical place
// that could theoretically host an event is NOT automatically a
// BeatMapped live-event venue candidate. At national bulk scale, letting
// every governed-tag-matching OSM element (including bare
// amenity=community_centre, which package-01/02's TAG_CLAUSES
// deliberately still QUERIES as a broad discovery net — see
// ingestion/uk-national-discovery/admission.mjs's own header comment)
// reach candidate construction floods the campaign's own candidate/
// review/insufficient-evidence counts with thousands of village/church
// halls that are not live-event venues. This module is the fix: it runs
// BETWEEN raw extraction and candidate construction, so a bare noisy
// category never reaches ingestion/venue-discovery/providers/overpass.mjs's
// parseOverpassCandidates() at all unless it clears one of two governed
// bars — never a third, invented bar:
//
//   1. DIRECT TAG ELIGIBILITY — the element's own tags satisfy one of
//      ingestion/uk-national-discovery/admission.mjs's own
//      AUTO_ADMIT_ELIGIBLE_SIGNALS (amenity=nightclub/theatre/arts_centre,
//      live_music=yes, music_venue=yes, or a noisy category WITH explicit
//      live_music=yes on the same element) — reused unchanged, never a
//      second, independently-drifting signal set.
//
//   2. EXISTING REGISTRY EVIDENCE — BeatMapped already independently
//      knows this place as an ACTIVE source or a canonical venue (a real,
//      already-established live-event programme this campaign did not
//      need to discover), via a STRONG match — reusing
//      ingestion/venue-discovery/existing-registry.mjs's own matchGroup()
//      unchanged. A merely POSSIBLE (name-only, unconfirmed) match is
//      NOT sufficient here — "independent retained evidence" means
//      confident knowledge, not a coincidence-prone name match.
//
// Everything else — a bare community_centre, pub, bar, restaurant,
// hotel, place_of_worship, school, sports_centre, social_centre, or any
// other non-eligible tag combination — is FILTERED_GENERIC_NON_EVENT_LEAD:
// retained in full (real OSM identity, tags, coordinates — provenance is
// NEVER discarded), but never constructed into a VenueDiscoveryCandidate,
// so it can never inflate TOTAL CANDIDATES / REVIEW REQUIRED /
// INSUFFICIENT EVIDENCE.

import { deriveAdmitSignals, AUTO_ADMIT_ELIGIBLE_SIGNALS } from "../uk-national-discovery/admission.mjs";
import { matchGroup } from "../venue-discovery/existing-registry.mjs";
import { address as deriveAddress } from "../venue-discovery/providers/overpass.mjs";

export const ELIGIBILITY_REASONS = Object.freeze({
  DIRECT_TAG_SIGNAL: "DIRECT_TAG_SIGNAL",
  EXISTING_REGISTRY_STRONG_MATCH: "EXISTING_REGISTRY_STRONG_MATCH",
  FILTERED_GENERIC_NON_EVENT_LEAD: "FILTERED_GENERIC_NON_EVENT_LEAD",
});

/**
 * Classify one raw OSM element ({type, id, lat, lon, tags, ...}) as
 * eligible for the main candidate census, or a filtered generic lead.
 * `registryRecords` is ingestion/venue-discovery/existing-registry.mjs's
 * own buildRegistryRecords() output (sources + venues) — pass `[]` when
 * no registry check is wanted (e.g. a pure unit test of tag-only logic).
 * Pure function — no network, no filesystem.
 */
export function classifyElementEligibility(element, registryRecords = []) {
  const tags = element.tags ?? {};
  const signals = deriveAdmitSignals(tags);
  const directSignal = signals.find((s) => AUTO_ADMIT_ELIGIBLE_SIGNALS.has(s));
  if (directSignal) {
    return { eligible: true, reason: ELIGIBILITY_REASONS.DIRECT_TAG_SIGNAL, signals, registryMatch: null };
  }

  if (tags.name && registryRecords.length > 0) {
    const shimGroup = {
      reported_names: [tags.name],
      reported_addresses: [deriveAddress(tags)].filter(Boolean),
      reported_websites: [tags.website ?? tags["contact:website"] ?? null].filter(Boolean),
    };
    const { strong } = matchGroup(shimGroup, registryRecords);
    if (strong.length > 0) {
      return {
        eligible: true,
        reason: ELIGIBILITY_REASONS.EXISTING_REGISTRY_STRONG_MATCH,
        signals,
        registryMatch: strong.map(({ kind, id }) => ({ kind, id })),
      };
    }
  }

  return { eligible: false, reason: ELIGIBILITY_REASONS.FILTERED_GENERIC_NON_EVENT_LEAD, signals, registryMatch: null };
}

/**
 * Split a full raw-element list into { eligible, filtered } — `eligible`
 * feeds the normal candidate-construction pipeline unchanged; `filtered`
 * retains every excluded element's full original data (never trimmed,
 * never discarded) plus the classification reason, for this package's
 * required "generic noisy records filtered before candidacy" reporting.
 */
export function partitionByEligibility(elements, registryRecords = []) {
  const eligible = [];
  const filtered = [];
  const signalCounts = {};
  for (const element of elements) {
    const decision = classifyElementEligibility(element, registryRecords);
    if (decision.eligible) {
      eligible.push(element);
      for (const signal of decision.signals) {
        if (AUTO_ADMIT_ELIGIBLE_SIGNALS.has(signal) || decision.reason === ELIGIBILITY_REASONS.EXISTING_REGISTRY_STRONG_MATCH) {
          signalCounts[signal] = (signalCounts[signal] ?? 0) + 1;
        }
      }
      if (decision.reason === ELIGIBILITY_REASONS.EXISTING_REGISTRY_STRONG_MATCH && decision.signals.length === 0) {
        signalCounts.EXISTING_REGISTRY_STRONG_MATCH = (signalCounts.EXISTING_REGISTRY_STRONG_MATCH ?? 0) + 1;
      }
    } else {
      filtered.push({
        type: element.type,
        id: element.id,
        lat: element.lat,
        lon: element.lon,
        tags: element.tags,
        osm_version: element.osm_version ?? null,
        osm_timestamp: element.osm_timestamp ?? null,
        reason: decision.reason,
      });
    }
  }
  return { eligible, filtered, signalCounts };
}
