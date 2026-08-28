export const RESEARCH_SCHEMA_VERSION = "BEATMAPPED-VENUE-RESEARCH-v1";

export const VENUE_LIKELIHOODS = new Set([
  "PROVEN_CURRENT_MUSIC_VENUE",
  "LIKELY_CURRENT_MUSIC_VENUE",
  "PLAUSIBLE_MUSIC_VENUE",
  "CURRENT_PLACE_MUSIC_NOT_PROVEN",
  "LIKELY_NOT_MATERIAL_MUSIC",
  "LIKELY_CLOSED_OR_HISTORICAL",
  "UNKNOWN",
]);

export const ACQUISITION_READINESS = new Set([
  "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN",
  "FIRST_PARTY_PROGRAMME_FOUND_NO_FUTURE_EVENTS_PROVEN",
  "THIRD_PARTY_PROGRAMME_ONLY",
  "SOCIAL_FIRST_PROGRAMME",
  "PROGRAMME_TECHNICALLY_UNREADABLE",
  "NO_PROGRAMME_FOUND",
  "SOURCE_IDENTITY_UNRESOLVED",
  "UNKNOWN",
]);

export const EVIDENCE_STATES = new Set([
  "NO_MEANINGFUL_CURRENT_EVIDENCE_FOUND",
  "CURRENT_PLACE_PROVEN_MUSIC_ROLE_UNPROVEN",
  "LIKELY_CURRENT_MUSIC_VENUE_FIRST_PARTY_PROOF_WEAK",
  "CURRENT_MUSIC_VENUE_SOURCE_UNRESOLVED",
  "THIRD_PARTY_EVIDENCE_ONLY",
  "SOCIAL_FIRST_CURRENT_VENUE",
  "FIRST_PARTY_SITE_EXISTS_BUT_PROGRAMME_NOT_FOUND",
  "PROGRAMME_EXISTS_BUT_TECHNICALLY_UNREADABLE",
  "ACCESS_OR_DISCOVERY_LIMITATION",
  "LIKELY_CLOSED_OR_HISTORICAL",
  "LIKELY_IRRELEVANT_OR_NON_MATERIAL",
  "IDENTITY_PROBLEM_DISCOVERED",
  "INVESTIGATION_INCOMPLETE",
]);

export const EVIDENCE_PURPOSES = new Set([
  "IDENTITY",
  "CURRENT_PLACE",
  "MUSIC_RELEVANCE",
  "PROGRAMME_DISCOVERY",
  "ACQUISITION",
  "CLOSURE",
  "INVESTIGATION_LIMITATION",
]);

export const EVIDENCE_SOURCE_KINDS = new Set([
  "FIRST_PARTY_WEBSITE",
  "FIRST_PARTY_PROGRAMME",
  "OFFICIAL_SOCIAL",
  "RECOGNISED_EVENT_PLATFORM",
  "CREDIBLE_THIRD_PARTY",
  "MUNICIPAL_OR_OPEN_DATA",
  "DISCOVERY_PROVIDER",
  "HISTORICAL_RECORD",
  "CLOSURE_RECORD",
  "TECHNICAL_OBSERVATION",
]);

export const NEXT_ACTIONS = new Set([
  "DETERMINISTIC_CONTINUE",
  "AI_RESEARCH_REQUIRED",
  "HUMAN_REVIEW_REQUIRED",
  "RETRY_LATER",
  "NO_FURTHER_ACTION",
]);

export const DETERMINISTIC_SUB_ACTIONS = new Set([
  "IDENTITY_RECONCILIATION",
  "OFFICIAL_WEBSITE_RESOLUTION",
  "PROGRAMME_DISCOVERY",
  "SOURCE_FINGERPRINTING",
  "COLLECTOR_CONFIGURATION",
  "COLLECTOR_EXECUTION",
  "NONE",
]);

export const IDENTITY_STATES = new Set(["PROVEN", "PARTIAL", "AMBIGUOUS", "UNKNOWN"]);
export const CONFIDENCE_LEVELS = new Set(["HIGH", "MEDIUM", "LOW", "NONE"]);
export const VERIFICATION_STATES = new Set(["UNVERIFIED", "CURRENT", "STALE", "REVERIFY_BLOCKED"]);
export const TECHNICAL_MECHANISMS = new Set([
  "JSON_LD_EVENT", "MICRODATA", "ICS_OR_ICAL", "PER_EVENT_ICS", "WORDPRESS_TRIBE_API",
  "WORDPRESS_OTHER_API", "PUBLIC_REST_JSON", "PUBLIC_GRAPHQL", "STATIC_HTML_CARDS",
  "LIST_TO_DETAIL_HTML", "EMBEDDED_NEXT_DATA", "EMBEDDED_NUXT_STATE", "EMBEDDED_SVELTEKIT_DATA",
  "OTHER_EMBEDDED_APP_STATE", "PUBLIC_BROWSER_XHR", "WEBFLOW", "WIX_OR_FOURVENUES",
  "SQUARESPACE_CALENDAR", "IMAGE_OR_POSTER_PROGRAMME", "SOCIAL_FIRST_PROGRAMME",
  "CLIENT_RENDERED_UNKNOWN", "ACCESS_BLOCKED", "NO_CURRENT_PROGRAMME_FOUND", "OTHER",
]);
export const COLLECTOR_CAPABILITY_ROUTES = new Set([
  "EXISTING_COLLECTOR_ZERO_CODE", "CONFIGURATION_ONLY", "GENERIC_CAPABILITY_WIDENING",
  "NEW_REUSABLE_COLLECTOR_FAMILY", "LIKELY_BESPOKE", "CURRENTLY_BLOCKED", "NEEDS_DEEPER_INVESTIGATION",
]);

const text = (value) => typeof value === "string" && value.trim() !== "";
const nullableText = (value) => value === null || text(value);
const stringArray = (value) => Array.isArray(value) && value.every(text);
const timestamp = (value) => value === null || (text(value) && !Number.isNaN(Date.parse(value)));

export function validateCandidateResearch(record) {
  const errors = [];
  if (!record || typeof record !== "object" || Array.isArray(record)) return ["record must be an object"];
  if (record.schema_version !== RESEARCH_SCHEMA_VERSION) errors.push(`schema_version must be ${RESEARCH_SCHEMA_VERSION}`);
  if (!text(record.candidate_id)) errors.push("candidate_id must be a non-empty string");
  if (!text(record.city)) errors.push("city must be a non-empty string");
  if (!/^[A-Z]{2}$/.test(record.country_code ?? "")) errors.push("country_code must be ISO 3166-1 alpha-2 uppercase");
  if (!VENUE_LIKELIHOODS.has(record.venue_likelihood)) errors.push("venue_likelihood is invalid");
  if (!ACQUISITION_READINESS.has(record.acquisition_readiness)) errors.push("acquisition_readiness is invalid");
  if (!EVIDENCE_STATES.has(record.evidence_state)) errors.push("evidence_state is invalid");

  const identity = record.identity;
  if (!identity || typeof identity !== "object" || Array.isArray(identity)) errors.push("identity must be an object");
  else {
    if (!IDENTITY_STATES.has(identity.status)) errors.push("identity.status is invalid");
    if (!nullableText(identity.canonical_name)) errors.push("identity.canonical_name must be a string or null");
    if (!stringArray(identity.aliases)) errors.push("identity.aliases must be an array of strings");
    if (!nullableText(identity.official_website)) errors.push("identity.official_website must be a string or null");
    if (!CONFIDENCE_LEVELS.has(identity.confidence)) errors.push("identity.confidence is invalid");
  }

  const programme = record.programme;
  if (!programme || typeof programme !== "object" || Array.isArray(programme)) errors.push("programme must be an object");
  else {
    if (!nullableText(programme.first_party_url)) errors.push("programme.first_party_url must be a string or null");
    if (!stringArray(programme.official_social_urls)) errors.push("programme.official_social_urls must be an array of strings");
    if (!stringArray(programme.third_party_urls)) errors.push("programme.third_party_urls must be an array of strings");
    for (const field of ["future_events_visible", "recent_past_events_visible"]) {
      if (![true, false, null].includes(programme[field])) errors.push(`programme.${field} must be boolean or null`);
    }
  }

  const evidenceIds = new Set();
  if (!Array.isArray(record.evidence)) errors.push("evidence must be an array");
  else record.evidence.forEach((item, index) => {
    const at = (field) => `evidence[${index}].${field}`;
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      errors.push(`evidence[${index}] must be an object`);
      return;
    }
    if (!text(item.evidence_id)) errors.push(`${at("evidence_id")} is required`);
    else if (evidenceIds.has(item.evidence_id)) errors.push(`${at("evidence_id")} is duplicated`);
    else evidenceIds.add(item.evidence_id);
    if (!EVIDENCE_PURPOSES.has(item.purpose)) errors.push(`${at("purpose")} is invalid`);
    if (!EVIDENCE_SOURCE_KINDS.has(item.source_kind)) errors.push(`${at("source_kind")} is invalid`);
    if (!CONFIDENCE_LEVELS.has(item.confidence)) errors.push(`${at("confidence")} is invalid`);
    if (!text(item.reference)) errors.push(`${at("reference")} is required`);
    if (!timestamp(item.observed_at)) errors.push(`${at("observed_at")} must be a timestamp or null`);
    if (!text(item.summary)) errors.push(`${at("summary")} is required`);
  });

  if (!Array.isArray(record.limitations)) errors.push("limitations must be an array");
  else record.limitations.forEach((item, index) => {
    if (!item || typeof item !== "object" || !text(item.kind) || !text(item.summary) || !stringArray(item.evidence_refs ?? [])) {
      errors.push(`limitations[${index}] requires kind, summary, and evidence_refs`);
    }
  });
  if (!stringArray(record.known)) errors.push("known must be an array of strings");
  if (!stringArray(record.unknown)) errors.push("unknown must be an array of strings");
  if (!record.technical || typeof record.technical !== "object" || Array.isArray(record.technical)) errors.push("technical must be an object");
  else {
    if (!TECHNICAL_MECHANISMS.has(record.technical.mechanism)) errors.push("technical.mechanism is invalid");
    if (!COLLECTOR_CAPABILITY_ROUTES.has(record.technical.collector_route)) errors.push("technical.collector_route is invalid");
  }

  const resolution = record.resolution;
  if (!resolution || typeof resolution !== "object" || Array.isArray(resolution)) errors.push("resolution must be an object");
  else {
    if (!NEXT_ACTIONS.has(resolution.next_action)) errors.push("resolution.next_action is invalid");
    if (!DETERMINISTIC_SUB_ACTIONS.has(resolution.deterministic_sub_action)) errors.push("resolution.deterministic_sub_action is invalid");
    if (!text(resolution.reason)) errors.push("resolution.reason is required");
  }

  const memory = record.memory;
  if (!memory || typeof memory !== "object" || Array.isArray(memory)) errors.push("memory must be an object");
  else {
    if (!VERIFICATION_STATES.has(memory.verification_state)) errors.push("memory.verification_state is invalid");
    if (!timestamp(memory.last_verified_at)) errors.push("memory.last_verified_at must be a timestamp or null");
    if (!timestamp(memory.reverify_after)) errors.push("memory.reverify_after must be a timestamp or null");
  }

  if (record.evidence_state === "ACCESS_OR_DISCOVERY_LIMITATION" && record.limitations?.length === 0) {
    errors.push("ACCESS_OR_DISCOVERY_LIMITATION requires at least one investigation limitation");
  }
  if (record.venue_likelihood === "LIKELY_CLOSED_OR_HISTORICAL" && !record.evidence?.some((item) => item.purpose === "CLOSURE")) {
    errors.push("LIKELY_CLOSED_OR_HISTORICAL requires closure-purpose evidence; a tooling limitation is not closure evidence");
  }
  if (record.acquisition_readiness === "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN" && !(programme?.first_party_url && programme.future_events_visible === true)) {
    errors.push("FIRST_PARTY_FUTURE_PROGRAMME_PROVEN requires a first-party programme URL and visible future events");
  }
  if (record.acquisition_readiness === "SOCIAL_FIRST_PROGRAMME" && programme?.official_social_urls?.length === 0) {
    errors.push("SOCIAL_FIRST_PROGRAMME requires at least one official social URL");
  }
  if (record.acquisition_readiness === "THIRD_PARTY_PROGRAMME_ONLY" && programme?.third_party_urls?.length === 0) {
    errors.push("THIRD_PARTY_PROGRAMME_ONLY requires at least one third-party programme URL");
  }
  return errors;
}

export function createCandidateResearch(input) {
  const record = {
    schema_version: RESEARCH_SCHEMA_VERSION,
    candidate_id: input.candidate_id,
    city: input.city,
    country_code: input.country_code,
    identity: {
      status: input.identity?.status ?? "UNKNOWN",
      canonical_name: input.identity?.canonical_name ?? null,
      aliases: [...new Set(input.identity?.aliases ?? [])].sort(),
      official_website: input.identity?.official_website ?? null,
      confidence: input.identity?.confidence ?? "NONE",
    },
    venue_likelihood: input.venue_likelihood ?? "UNKNOWN",
    acquisition_readiness: input.acquisition_readiness ?? "UNKNOWN",
    evidence_state: input.evidence_state ?? "INVESTIGATION_INCOMPLETE",
    programme: {
      first_party_url: input.programme?.first_party_url ?? null,
      official_social_urls: [...new Set(input.programme?.official_social_urls ?? [])].sort(),
      third_party_urls: [...new Set(input.programme?.third_party_urls ?? [])].sort(),
      future_events_visible: input.programme?.future_events_visible ?? null,
      recent_past_events_visible: input.programme?.recent_past_events_visible ?? null,
    },
    technical: {
      mechanism: input.technical?.mechanism ?? "OTHER",
      collector_route: input.technical?.collector_route ?? "NEEDS_DEEPER_INVESTIGATION",
    },
    evidence: [...(input.evidence ?? [])].sort((a, b) => a.evidence_id.localeCompare(b.evidence_id)),
    limitations: [...(input.limitations ?? [])],
    known: [...(input.known ?? [])],
    unknown: [...(input.unknown ?? [])],
    resolution: {
      next_action: input.resolution?.next_action ?? "DETERMINISTIC_CONTINUE",
      deterministic_sub_action: input.resolution?.deterministic_sub_action ?? "OFFICIAL_WEBSITE_RESOLUTION",
      reason: input.resolution?.reason ?? "The discovery lead has not yet completed generic venue research.",
    },
    memory: {
      verification_state: input.memory?.verification_state ?? "UNVERIFIED",
      last_verified_at: input.memory?.last_verified_at ?? null,
      reverify_after: input.memory?.reverify_after ?? null,
    },
  };
  const errors = validateCandidateResearch(record);
  if (errors.length) throw new Error(`invalid candidate research record: ${errors.join("; ")}`);
  return record;
}

export function createInitialCandidateResearch(group) {
  const observation = [...group.observations].sort((a, b) => a.candidate_id.localeCompare(b.candidate_id))[0];
  const possibleIdentity = group.reconciliation_status === "POSSIBLE_DUPLICATE_REVIEW" || group.existing_registry_reconciliation?.status === "POSSIBLE_EXISTING_MATCH_REVIEW";
  return createCandidateResearch({
    candidate_id: group.reconciled_candidate_id,
    city: group.city,
    country_code: group.country_code,
    identity: {
      status: possibleIdentity ? "AMBIGUOUS" : "UNKNOWN",
      aliases: group.reported_names,
      official_website: group.reported_websites[0] ?? null,
      confidence: possibleIdentity ? "LOW" : "NONE",
    },
    evidence_state: possibleIdentity ? "IDENTITY_PROBLEM_DISCOVERED" : "INVESTIGATION_INCOMPLETE",
    evidence: [{
      evidence_id: `discovery:${observation.candidate_id}`,
      purpose: "IDENTITY",
      source_kind: "DISCOVERY_PROVIDER",
      confidence: group.coverage.confidence,
      reference: observation.provider_url,
      observed_at: observation.retrieved_at,
      summary: `Discovery lead reported by ${observation.discovery_provider}; it is not canonical venue or acquisition evidence.`,
    }],
    known: ["A discovery provider reported this candidate."],
    unknown: ["Canonical identity, current-place status, material music role, and programme acquisition remain unresolved."],
    resolution: possibleIdentity ? {
      next_action: "HUMAN_REVIEW_REQUIRED",
      deterministic_sub_action: "IDENTITY_RECONCILIATION",
      reason: "Deterministic reconciliation found an identity or duplicate conflict.",
    } : {
      next_action: "DETERMINISTIC_CONTINUE",
      deterministic_sub_action: group.reported_websites.length ? "PROGRAMME_DISCOVERY" : "OFFICIAL_WEBSITE_RESOLUTION",
      reason: "Continue the generic research progression without interpreting missing acquisition evidence as negative venue evidence.",
    },
  });
}
