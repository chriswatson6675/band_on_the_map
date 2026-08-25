// VENUE-DISCOVERY-ENGINE-01 — conservative discovery-candidate
// deduplication.
//
// Merges candidates that are almost certainly the SAME real-world place
// referenced by more than one discovery source, while preserving every
// contributing source's evidence (see PHASE 5). Deliberately
// conservative — matching two candidates requires one of a small set of
// strong, explicit signals; anything short of that is reported as an
// "uncertain pair" for a human to look at, never silently merged and
// never silently dropped (see PHASE 5's "do not merge two distinct
// nearby venues simply because their names resemble one another").
//
// Dependency-free.

import { distanceMeters, normaliseAddress } from "./normalise.mjs";

// A pair whose coordinates are this close is treated as effectively the
// same point (typical address-centroid precision), independent of any
// other evidence.
const EXACT_COORDINATE_METERS = 10;

// A pair sharing an EXACT normalised name additionally needs to be
// within this distance to be treated as the same place — this is the
// "strong normalised-name + geographic proximity" evidence type, never
// name resemblance/fuzzy-matching alone.
const NAME_MATCH_PROXIMITY_METERS = 60;

// Below this distance, two DIFFERENT-looking candidates are flagged as
// an uncertain pair (never auto-merged) rather than ignored outright.
const UNCERTAIN_PROXIMITY_METERS = 150;

function hasCoordinates(candidate) {
  return typeof candidate.latitude === "number" && typeof candidate.longitude === "number";
}

function significantTokens(normalisedName) {
  if (!normalisedName) return [];
  return normalisedName.split("-").filter((token) => token.length >= 4);
}

function shareSignificantToken(a, b) {
  const tokensA = significantTokens(a.normalised_name);
  const tokensB = new Set(significantTokens(b.normalised_name));
  return tokensA.some((token) => tokensB.has(token));
}

/**
 * Decide whether two candidates are the SAME real-world place. Returns
 * `{ match: true, reason }` for exactly the evidence types documented in
 * PHASE 5 (1: same authoritative source ID: not evaluated here, since
 * candidates from a genuinely identical source_kind+source_id+
 * source_record_id are already the same candidate_id and never reach
 * this comparison — 2/3/4 below), or `{ match: false }`.
 */
export function evaluateCandidatePair(a, b) {
  // 2. Same normalised website/domain.
  if (a.normalised_domain && b.normalised_domain && a.normalised_domain === b.normalised_domain) {
    return { match: true, reason: `same normalised domain (${a.normalised_domain})` };
  }

  // 3. Same coordinates (tight tolerance) OR same normalised address text.
  const bothHaveCoords = hasCoordinates(a) && hasCoordinates(b);
  const coordDistance = bothHaveCoords ? distanceMeters(a.latitude, a.longitude, b.latitude, b.longitude) : null;
  if (coordDistance !== null && coordDistance <= EXACT_COORDINATE_METERS) {
    return { match: true, reason: `coordinates within ${EXACT_COORDINATE_METERS}m of each other (${Math.round(coordDistance)}m)` };
  }

  const addressA = normaliseAddress(a.address);
  const addressB = normaliseAddress(b.address);
  if (addressA && addressB && addressA === addressB) {
    return { match: true, reason: "identical normalised address" };
  }

  // 4. Strong (exact) normalised-name match + geographic proximity —
  // never a fuzzy/partial name match.
  if (
    a.normalised_name &&
    b.normalised_name &&
    a.normalised_name === b.normalised_name &&
    coordDistance !== null &&
    coordDistance <= NAME_MATCH_PROXIMITY_METERS
  ) {
    return {
      match: true,
      reason: `identical normalised name within ${NAME_MATCH_PROXIMITY_METERS}m (${Math.round(coordDistance)}m)`,
    };
  }

  // Not a confident match, but flag genuinely ambiguous nearby pairs for
  // human review rather than silently ignoring them.
  if (coordDistance !== null && coordDistance <= UNCERTAIN_PROXIMITY_METERS && shareSignificantToken(a, b)) {
    return {
      match: false,
      uncertain: true,
      reason: `within ${UNCERTAIN_PROXIMITY_METERS}m (${Math.round(coordDistance)}m) and share a name token, but did not meet a confident match rule`,
    };
  }

  return { match: false };
}

function unionFind(size) {
  const parent = Array.from({ length: size }, (_, i) => i);
  function find(i) {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  }
  function union(i, j) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }
  return { find, union };
}

const STATUS_RANK = Object.freeze({
  LIKELY_LIVE_MUSIC_VENUE: 3,
  POSSIBLE_LIVE_MUSIC_VENUE: 2,
  WEAK_CANDIDATE: 1,
  EXCLUDED: 0,
});

function mergeGroup(members) {
  if (members.length === 1) return members[0];

  // Deterministic primary: earliest first_seen_at, tie-broken by
  // candidate_id — never arbitrary/insertion-order-dependent.
  const sorted = [...members].sort((x, y) => {
    if (x.first_seen_at !== y.first_seen_at) return x.first_seen_at < y.first_seen_at ? -1 : 1;
    return x.candidate_id < y.candidate_id ? -1 : 1;
  });
  const primary = sorted[0];
  const others = sorted.slice(1);

  const strongest = sorted.reduce((best, c) => (STATUS_RANK[c.discovery_status] > STATUS_RANK[best.discovery_status] ? c : best), primary);

  return {
    ...primary,
    discovery_status: strongest.discovery_status,
    discovery_status_reasons: [...new Set(sorted.flatMap((c) => c.discovery_status_reasons))],
    source_evidence: sorted.flatMap((c) => c.source_evidence),
    merged_candidate_ids: [...new Set([...primary.merged_candidate_ids, ...others.map((c) => c.candidate_id)])],
    first_seen_at: sorted.reduce((min, c) => (c.first_seen_at < min ? c.first_seen_at : min), primary.first_seen_at),
    last_seen_at: sorted.reduce((max, c) => (c.last_seen_at > max ? c.last_seen_at : max), primary.last_seen_at),
  };
}

/**
 * Deduplicate a list of discovery Candidates (any mix of sources).
 * O(n^2) pairwise comparison — fine at the scale one Area's discovery
 * run produces (hundreds, not millions, of candidates); revisit with
 * spatial bucketing only if that stops being true.
 *
 * Returns `{ candidates, uncertainPairs, mergedCount }`:
 *   - candidates    : one entry per real-world place, after merging.
 *   - uncertainPairs: `{ candidate_id_a, candidate_id_b, reason }[]`
 *                     diagnostics for pairs that looked suspicious but
 *                     were never auto-merged.
 *   - mergedCount   : how many input candidates were folded into
 *                     another (i.e. candidates.length + mergedCount ===
 *                     input.length).
 */
export function dedupeCandidates(candidates) {
  const list = candidates ?? [];
  const { find, union } = unionFind(list.length);
  const uncertainPairs = [];

  for (let i = 0; i < list.length; i += 1) {
    for (let j = i + 1; j < list.length; j += 1) {
      const result = evaluateCandidatePair(list[i], list[j]);
      if (result.match) {
        union(i, j);
      } else if (result.uncertain) {
        uncertainPairs.push({
          candidate_id_a: list[i].candidate_id,
          candidate_id_b: list[j].candidate_id,
          reason: result.reason,
        });
      }
    }
  }

  const groups = new Map();
  list.forEach((candidate, index) => {
    const root = find(index);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(candidate);
  });

  const merged = [...groups.values()].map(mergeGroup);
  const mergedCount = list.length - merged.length;

  return { candidates: merged, uncertainPairs, mergedCount };
}
