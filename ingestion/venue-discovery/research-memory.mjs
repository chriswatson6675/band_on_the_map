import { createCandidateResearch } from "./research-state.mjs";

const STRENGTH = new Map([
  ["UNKNOWN", 0],
  ["CURRENT_PLACE_MUSIC_NOT_PROVEN", 1],
  ["PLAUSIBLE_MUSIC_VENUE", 2],
  ["LIKELY_CURRENT_MUSIC_VENUE", 3],
  ["PROVEN_CURRENT_MUSIC_VENUE", 4],
]);

function uniqueBy(items, key) {
  return [...new Map(items.map((item) => [item[key], item])).values()];
}

function sortObject(value) {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortObject(value[key])]));
}

export function serializeResearchMemory(record) {
  return `${JSON.stringify(sortObject(record), null, 2)}\n`;
}

export function isReverificationDue(record, now = new Date()) {
  if (!record.memory.reverify_after) return false;
  return Date.parse(record.memory.reverify_after) <= now.getTime();
}

export function mergeResearchMemory(previous, update, { verified_at, reverify_after = null } = {}) {
  if (previous.candidate_id !== update.candidate_id) throw new Error("cannot merge research memory for different candidate IDs");
  const limitationOnly = update.evidence_state === "ACCESS_OR_DISCOVERY_LIMITATION" &&
    update.evidence.every((item) => item.purpose === "INVESTIGATION_LIMITATION" || item.purpose === "IDENTITY");
  const previousStrength = STRENGTH.get(previous.venue_likelihood) ?? -1;
  const updateStrength = STRENGTH.get(update.venue_likelihood) ?? -1;
  const preserveVenueStatus = limitationOnly || updateStrength < previousStrength;

  return createCandidateResearch({
    ...previous,
    ...update,
    identity: {
      ...previous.identity,
      ...update.identity,
      aliases: [...new Set([...previous.identity.aliases, ...update.identity.aliases])],
      official_website: update.identity.official_website ?? previous.identity.official_website,
    },
    venue_likelihood: preserveVenueStatus ? previous.venue_likelihood : update.venue_likelihood,
    programme: {
      ...previous.programme,
      ...update.programme,
      first_party_url: update.programme.first_party_url ?? previous.programme.first_party_url,
      official_social_urls: [...new Set([...previous.programme.official_social_urls, ...update.programme.official_social_urls])],
      third_party_urls: [...new Set([...previous.programme.third_party_urls, ...update.programme.third_party_urls])],
    },
    evidence: uniqueBy([...previous.evidence, ...update.evidence], "evidence_id"),
    limitations: uniqueBy([...previous.limitations, ...update.limitations], "summary"),
    known: [...new Set([...previous.known, ...update.known])],
    unknown: update.unknown,
    memory: {
      verification_state: limitationOnly ? "REVERIFY_BLOCKED" : "CURRENT",
      last_verified_at: verified_at ?? update.memory.last_verified_at ?? previous.memory.last_verified_at,
      reverify_after,
    },
  });
}
