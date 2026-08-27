import { normaliseCandidate, normaliseText, normaliseDomain } from "./normalise.mjs";

function distanceMetres(a, b) {
  if (![a.reported_latitude, a.reported_longitude, b.reported_latitude, b.reported_longitude].every(Number.isFinite)) return Infinity;
  const rad = Math.PI / 180;
  const x = (b.reported_longitude - a.reported_longitude) * rad * Math.cos(((a.reported_latitude + b.reported_latitude) / 2) * rad);
  const y = (b.reported_latitude - a.reported_latitude) * rad;
  return Math.sqrt(x * x + y * y) * 6371000;
}

function strongMatch(a, b) {
  if (a.country_code !== b.country_code || normaliseText(a.city) !== normaliseText(b.city)) return false;
  if (a.discovery_provider === b.discovery_provider && a.provider_record_id === b.provider_record_id) return true;
  if (a.official_domain_candidate && a.official_domain_candidate === b.official_domain_candidate) return true;
  if (a.normalised_address && a.normalised_address === b.normalised_address && a.normalised_name === b.normalised_name) return true;
  if (a.postcode && a.postcode === b.postcode && a.normalised_name === b.normalised_name) return true;
  return a.normalised_name === b.normalised_name && distanceMetres(a, b) <= 40;
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
