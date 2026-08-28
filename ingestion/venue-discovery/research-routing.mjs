import { createCandidateResearch } from "./research-state.mjs";

export const RESEARCH_ESCALATION_STAGES = Object.freeze([
  { order: 1, stage: "IDENTITY_RECONCILIATION", evidence_role: "IDENTITY", execution: "DETERMINISTIC" },
  { order: 2, stage: "OFFICIAL_WEBSITE_RESOLUTION", evidence_role: "IDENTITY", execution: "DETERMINISTIC_THEN_AI" },
  { order: 3, stage: "OFFICIAL_PROGRAMME_DISCOVERY", evidence_role: "PROGRAMME_DISCOVERY", execution: "DETERMINISTIC" },
  { order: 4, stage: "STRUCTURED_SOURCE_FINGERPRINTING", evidence_role: "ACQUISITION", execution: "DETERMINISTIC" },
  { order: 5, stage: "OFFICIAL_SOCIAL_REVIEW", evidence_role: "MUSIC_RELEVANCE", execution: "AI_ASSISTED" },
  { order: 6, stage: "RECOGNISED_EVENT_PLATFORM_CORROBORATION", evidence_role: "MUSIC_RELEVANCE", execution: "AI_ASSISTED" },
  { order: 7, stage: "CREDIBLE_THIRD_PARTY_CORROBORATION", evidence_role: "MUSIC_RELEVANCE", execution: "AI_ASSISTED" },
  { order: 8, stage: "DEEPER_RESEARCH", evidence_role: "MULTIPLE", execution: "AI_ASSISTED" },
  { order: 9, stage: "HUMAN_JUDGEMENT", evidence_role: "IDENTITY", execution: "HUMAN" },
  { order: 10, stage: "DEFER_OR_RETRY", evidence_role: "INVESTIGATION_LIMITATION", execution: "QUEUE" },
]);

export function nextResearchStage(completedStages = []) {
  const completed = new Set(completedStages);
  return RESEARCH_ESCALATION_STAGES.find((item) => !completed.has(item.stage)) ?? null;
}

export function routeCandidateResearch(record) {
  const identityConflict = record.evidence_state === "IDENTITY_PROBLEM_DISCOVERED" || record.identity.status === "AMBIGUOUS";
  if (identityConflict) return {
    next_action: "HUMAN_REVIEW_REQUIRED",
    deterministic_sub_action: "IDENTITY_RECONCILIATION",
    reason: "Canonical identity, rebrand, room, or duplicate status cannot be resolved safely by routine acquisition logic.",
  };

  if (record.evidence_state === "ACCESS_OR_DISCOVERY_LIMITATION") return {
    next_action: "RETRY_LATER",
    deterministic_sub_action: "NONE",
    reason: "The investigation was limited; the limitation is not negative evidence about the venue.",
  };

  if (["LIKELY_CLOSED_OR_HISTORICAL", "LIKELY_NOT_MATERIAL_MUSIC", "CURRENT_PLACE_MUSIC_NOT_PROVEN"].includes(record.venue_likelihood)) return {
    next_action: "NO_FURTHER_ACTION",
    deterministic_sub_action: "NONE",
    reason: "Available evidence does not justify programme acquisition work; retain the evidence for periodic re-verification.",
  };

  if (record.venue_likelihood === "UNKNOWN" && record.evidence_state === "NO_MEANINGFUL_CURRENT_EVIDENCE_FOUND") return {
    next_action: "NO_FURTHER_ACTION",
    deterministic_sub_action: "NONE",
    reason: "The bounded progression completed without meaningful current evidence; retain rather than repeatedly rediscover the same lead.",
  };

  if (record.venue_likelihood === "PLAUSIBLE_MUSIC_VENUE") return {
    next_action: "AI_RESEARCH_REQUIRED",
    deterministic_sub_action: "PROGRAMME_DISCOVERY",
    reason: "Contemporary music relevance is plausible but requires deeper identity or programme corroboration.",
  };

  if (["PROVEN_CURRENT_MUSIC_VENUE", "LIKELY_CURRENT_MUSIC_VENUE"].includes(record.venue_likelihood)) {
    if (record.acquisition_readiness === "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN") return {
      next_action: "DETERMINISTIC_CONTINUE",
      deterministic_sub_action: "SOURCE_FINGERPRINTING",
      reason: "Venue status and a first-party future programme are established; fingerprint the source before collector routing.",
    };
    if (record.acquisition_readiness === "FIRST_PARTY_PROGRAMME_FOUND_NO_FUTURE_EVENTS_PROVEN") return {
      next_action: "RETRY_LATER",
      deterministic_sub_action: "PROGRAMME_DISCOVERY",
      reason: "The first-party programme exists but future coverage should be rechecked later.",
    };
    return {
      next_action: "AI_RESEARCH_REQUIRED",
      deterministic_sub_action: "PROGRAMME_DISCOVERY",
      reason: "Venue status is independent and retained; the authoritative acquisition source still needs resolution.",
    };
  }

  return {
    next_action: "DETERMINISTIC_CONTINUE",
    deterministic_sub_action: record.identity.official_website ? "PROGRAMME_DISCOVERY" : "OFFICIAL_WEBSITE_RESOLUTION",
    reason: "Continue the generic research progression from the last durable state.",
  };
}

export function withRoutedResolution(record) {
  return createCandidateResearch({ ...record, resolution: routeCandidateResearch(record) });
}

export function createResearchQueueItem(record) {
  const resolution = routeCandidateResearch(record);
  return {
    candidate_id: record.candidate_id,
    city: record.city,
    country_code: record.country_code,
    venue_likelihood: record.venue_likelihood,
    acquisition_readiness: record.acquisition_readiness,
    evidence_state: record.evidence_state,
    ...resolution,
    last_verified_at: record.memory.last_verified_at,
    reverify_after: record.memory.reverify_after,
  };
}
