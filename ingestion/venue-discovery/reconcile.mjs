import { normaliseCandidate, normaliseText, normaliseDomain } from "./normalise.mjs";

function distanceMetres(a, b) {
  if (![a.reported_latitude, a.reported_longitude, b.reported_latitude, b.reported_longitude].every(Number.isFinite)) return Infinity;
  const rad = Math.PI / 180;
  const x = (b.reported_longitude - a.reported_longitude) * rad * Math.cos(((a.reported_latitude + b.reported_latitude) / 2) * rad);
  const y = (b.reported_latitude - a.reported_latitude) * rad;
  return Math.sqrt(x * x + y * y) * 6371000;
}

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-02 — a real Manchester
// discovery run confirmed a genuine cross-city bug, in two distinct
// shapes, both sharing one root cause: sharing an official_domain_candidate
// is real, strong evidence for "the same physical venue reported twice"
// ONLY when it isn't contradicted by other evidence both sides report.
// Multi-venue operators are common (theatre groups, festival brands,
// Academy Music Group) and often run every venue's booking page off one
// shared domain:
//   1. Manchester Opera House (Quay Street) and Palace Theatre (Oxford
//      Street) are two genuinely distinct, ~800m-apart buildings sharing
//      manchestertheatres.com — both sides report real, distant
//      coordinates, so a distance guard alone catches this shape.
//   2. O2 Ritz Manchester (Whitworth Street West) and O2 Apollo Manchester
//      (Stockport Road, Ardwick — several km away) share
//      academymusicgroup.com but were BOTH sourced from a
//      coordinate-less provider (a curated directory), so distanceMetres()
//      is Infinity on both sides — a pure distance guard cannot see this
//      shape at all. Both sides DO independently report a real, differing
//      address, which is exactly the evidence a distance guard misses;
//      checking for that conflict closes this second shape without
//      requiring coordinates.
// A shared domain is treated as strong evidence unless one of these two
// independent conflict signals contradicts it. When coordinates are
// available and close, that is dispositive (formatting differences in
// address text from different providers must not block a real match).
// When coordinates are unavailable (Infinity), whether there is
// contradicting address evidence is decided by addressesConflict() below.
const SAME_DOMAIN_MAX_DISTANCE_METRES = 150;

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — the
// Correction-02 guard above compared full normalised address TEXT, which
// is too literal: the real Manchester retest found it still failed to
// merge "Islington Mill" (a free-text curated-directory address, "James
// Street, Salford M3 5HW") with "Islington Mill Arts Club" (OSM's own
// structured addr:housename/addr:street/addr:city/addr:postcode tags,
// which normalise.mjs assembles into different text) — genuinely the
// same real building, reported with differently *structured*, not
// differently *located*, address text. A POSTCODE comparison is far more
// robust to this: it is a short, standardised token both a free-text
// address and structured OSM tags reliably carry, so it survives street-
// order/abbreviation/punctuation differences that defeat literal text
// equality — normalise.mjs's extractPostcode() is now country-aware
// (was previously US-ZIP-only, silently null for every UK candidate).
// Postcode is preferred when BOTH sides have one. When only one side
// carries an extractable postcode (e.g. one provider's raw address text
// simply omits it — a real, confirmed shape: OSM's own addr:* tags for
// several real Manchester venues carry no addr:postcode at all), that is
// missing precision on one side, not disagreement — comparing full
// address TEXT in that situation is exactly the brittle formatting-
// sensitive comparison postcode matching exists to avoid, so it is
// treated as not comparable rather than a conflict. Full-address-text
// equality remains the fallback only when NEITHER side has an
// extractable postcode at all (e.g. a country/address format not yet
// covered by extractPostcode()'s pattern table).
function addressesConflict(a, b) {
  if (a.postcode && b.postcode) return a.postcode !== b.postcode;
  if (a.postcode || b.postcode) return false;
  if (a.normalised_address && b.normalised_address) return a.normalised_address !== b.normalised_address;
  return false; // nothing to compare on at least one side is not itself a conflict
}

function domainMatchIsStrong(a, b) {
  const distance = distanceMetres(a, b);
  if (distance <= SAME_DOMAIN_MAX_DISTANCE_METRES) return true;
  if (distance !== Infinity) return false;
  return !addressesConflict(a, b);
}

/**
 * A conservative, non-fuzzy "compatible name" check: exact match, or one
 * name is a substring of the other (e.g. "Islington Mill" / "Islington
 * Mill Arts Club") — the SAME convention possibleMatch() below already
 * uses for its own, weaker REVIEW tier; reused here (not loosened
 * further) for the one CONFIDENT-tier case that needs it: a shared
 * postcode plus a compatible name. Never edit-distance/fuzzy similarity.
 */
function namesCompatible(a, b) {
  if (!a.normalised_name || !b.normalised_name) return false;
  if (a.normalised_name === b.normalised_name) return true;
  return a.normalised_name.includes(b.normalised_name) || b.normalised_name.includes(a.normalised_name);
}

// An exact name match is applied the SAME "strong unless contradicted"
// treatment as a shared domain (domainMatchIsStrong, above) rather than
// requiring real, close coordinates unconditionally: a real Manchester
// case ("Aatma", "The Abbey") had one provider (a coordinate-less
// curated-directory record) report no coordinates at all, which
// previously made an otherwise-exact name match impossible to confirm no
// matter how likely it was. distance <= 40m remains dispositive on its
// own when both sides do report coordinates. When neither reports
// coordinates, an exact name match ALONE is deliberately still not
// enough — two candidates with nothing but an identical name and no
// other evidence at all (the pre-existing "ambiguous name-only matches"
// test) must stay a POSSIBLE_DUPLICATE_REVIEW, not a confident merge; at
// least one side reporting real, non-conflicting address evidence is
// required too.
function exactNameMatchIsStrong(a, b) {
  const distance = distanceMetres(a, b);
  if (distance <= 40) return true;
  if (distance !== Infinity) return false;
  const hasSomeAddressEvidence = Boolean(a.normalised_address || b.normalised_address);
  return hasSomeAddressEvidence && !addressesConflict(a, b);
}

function strongMatch(a, b) {
  if (a.country_code !== b.country_code || normaliseText(a.city) !== normaliseText(b.city)) return false;
  if (a.discovery_provider === b.discovery_provider && a.provider_record_id === b.provider_record_id) return true;
  if (a.official_domain_candidate && a.official_domain_candidate === b.official_domain_candidate && domainMatchIsStrong(a, b)) return true;
  if (a.normalised_address && a.normalised_address === b.normalised_address && a.normalised_name === b.normalised_name) return true;
  if (a.postcode && a.postcode === b.postcode && namesCompatible(a, b)) return true;
  return Boolean(a.normalised_name) && a.normalised_name === b.normalised_name && exactNameMatchIsStrong(a, b);
}

function possibleMatch(a, b) {
  if (a.country_code !== b.country_code || normaliseText(a.city) !== normaliseText(b.city)) return false;
  if (a.normalised_name && a.normalised_name === b.normalised_name) return true;
  const aTokens = new Set(a.normalised_name.split(" ").filter((token) => token.length > 2));
  const bTokens = new Set(b.normalised_name.split(" ").filter((token) => token.length > 2));
  const shared = [...aTokens].filter((token) => bTokens.has(token)).length;
  const union = new Set([...aTokens, ...bTokens]).size;
  const nameSimilar = Boolean(
    a.normalised_name.length > 4 && b.normalised_name.length > 4 &&
    (a.normalised_name.includes(b.normalised_name) || b.normalised_name.includes(a.normalised_name) || (union && shared / union >= 0.6)),
  );
  return nameSimilar && Boolean((a.postcode && a.postcode === b.postcode) || distanceMetres(a, b) <= 150);
}

function stableGroupId(observations) {
  const first = [...observations].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id))[0];
  return `reconciled-${first.candidate_id}`;
}

function buildGroup(observations) {
  const providers = [...new Set(observations.map((item) => item.discovery_provider))].sort();
  const values = (field) => [...new Set(observations.map((item) => item[field]).filter(Boolean))].sort();
  const domains = values("reported_website").map(normaliseDomain).filter(Boolean);
  const conflicts = [];
  if (new Set(domains).size > 1) conflicts.push("WEBSITE_CONFLICT");
  if (values("reported_address").map(normaliseText).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).length > 1) conflicts.push("ADDRESS_CONFLICT");
  return {
    reconciled_candidate_id: stableGroupId(observations),
    reconciliation_status: observations.length > 1 ? "SAME_CANDIDATE_CONFIDENT" : "DISTINCT",
    city: observations[0].city,
    country_code: observations[0].country_code,
    observations,
    provider_count: providers.length,
    providers,
    reported_names: values("reported_name"),
    reported_addresses: values("reported_address"),
    reported_websites: values("reported_website"),
    checked_at: values("retrieved_at"),
    coverage: {
      provider_count: providers.length,
      has_official_website_candidate: values("reported_website").length > 0,
      has_address: values("reported_address").length > 0,
      already_known_to_beatmapped: false,
      provider_agreement: conflicts.length ? "CONFLICT" : providers.length > 1 ? "AGREEMENT" : "SINGLE_PROVIDER",
      conflicts,
      confidence: providers.length > 1 && conflicts.length === 0 ? "HIGH" : values("reported_website").length || values("reported_address").length ? "MEDIUM" : "LOW",
    },
    possible_duplicate_refs: [],
  };
}

export function reconcileCandidates(candidates) {
  const normalised = candidates.map(normaliseCandidate).sort((a, b) => a.candidate_id.localeCompare(b.candidate_id));
  const parent = normalised.map((_, index) => index);
  const root = (i) => parent[i] === i ? i : (parent[i] = root(parent[i]));
  const union = (a, b) => { const ra = root(a); const rb = root(b); if (ra !== rb) parent[rb] = ra; };
  for (let i = 0; i < normalised.length; i += 1) for (let j = i + 1; j < normalised.length; j += 1) {
    if (strongMatch(normalised[i], normalised[j])) union(i, j);
  }
  const grouped = new Map();
  normalised.forEach((candidate, index) => {
    const key = root(index);
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(candidate);
  });
  const groups = [...grouped.values()].map(buildGroup).sort((a, b) => a.reconciled_candidate_id.localeCompare(b.reconciled_candidate_id));
  for (let i = 0; i < groups.length; i += 1) for (let j = i + 1; j < groups.length; j += 1) {
    if (groups[i].observations.some((a) => groups[j].observations.some((b) => possibleMatch(a, b)))) {
      groups[i].possible_duplicate_refs.push(groups[j].reconciled_candidate_id);
      groups[j].possible_duplicate_refs.push(groups[i].reconciled_candidate_id);
      if (groups[i].reconciliation_status === "DISTINCT") groups[i].reconciliation_status = "POSSIBLE_DUPLICATE_REVIEW";
      if (groups[j].reconciliation_status === "DISTINCT") groups[j].reconciliation_status = "POSSIBLE_DUPLICATE_REVIEW";
    }
  }
  return groups;
}
