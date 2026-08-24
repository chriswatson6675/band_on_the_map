// VENUE-AUTO-ONBOARDING-01 — the evidence-ladder admission decision.
//
// Given one venue CANDIDATE (ingestion/venue-onboarding/candidates.mjs)
// and the bounded, retained research finding for it (an entry from
// venues/candidate-research.json), deterministically decide whether it
// may be automatically admitted, and if so, produce the exact canonical
// Venue fields (ingestion/venue/contract.mjs) and/or data-driven mapping
// entry (venues/source-venue-mappings.json shape) to add.
//
// This module makes NO network calls and performs NO research itself —
// research happened once, bounded, during this task, and is retained as
// data (see venues/candidate-research.json's own doc comment). A
// candidate with no research entry on record is never guessed at.
//
// Bounded status vocabulary (this task's brief, section 4):
//   AUTO_ADMIT | ADDRESS_ONLY_ADMIT | ALREADY_CANONICAL |
//   INSUFFICIENT_IDENTITY | INSUFFICIENT_ADDRESS_EVIDENCE | AMBIGUOUS |
//   OFFSITE_OR_NON_VENUE | SOURCE_DATA_INADEQUATE |
//   NO_RESEARCH_ON_RECORD (this module's own, clearly-documented
//   addition for the one case the task's list didn't name: a future
//   candidate nobody has researched yet).
//
// Dependency-free (no Node built-ins) except for
// ingestion/venue/contract.mjs, which is itself dependency-free.

import { createVenue, validateVenue } from "../venue/contract.mjs";

export const ADMISSION_STATUSES = new Set([
  "AUTO_ADMIT",
  "ADDRESS_ONLY_ADMIT",
  "ALREADY_CANONICAL",
  "INSUFFICIENT_IDENTITY",
  "INSUFFICIENT_ADDRESS_EVIDENCE",
  "AMBIGUOUS",
  "OFFSITE_OR_NON_VENUE",
  "SOURCE_DATA_INADEQUATE",
  "NO_RESEARCH_ON_RECORD",
]);

function findResearchEntry(research, candidate) {
  return (
    (research?.entries ?? []).find(
      (entry) =>
        entry?.source_id === candidate.source_id &&
        entry?.key_type === candidate.key_type &&
        entry?.key === candidate.key,
    ) ?? null
  );
}

function buildMappingEntry(candidate, venueId, research) {
  return {
    source_id: candidate.source_id,
    source_key_type: candidate.key_type,
    source_key: candidate.key,
    venue_id: venueId,
    method: `VENUE-AUTO-ONBOARDING-01: ${research.verdict} (${research.evidence_level ?? "existing venue"})`,
    evidence: research.evidence ?? [],
    created_at: research.retrieved_at,
    retrieved_at: research.retrieved_at,
  };
}

/**
 * Decide the admission outcome for one candidate.
 *
 * Returns:
 *   {
 *     status,               // one of ADMISSION_STATUSES
 *     reason,                // short human-readable explanation
 *     venue,                 // a NEW canonical Venue to add (createVenue() output), or null
 *     mapping,                // a NEW source-venue-mappings.json entry, or null
 *     venue_already_exists,   // true when `mapping.venue_id` already exists in the target registry
 *   }
 *
 * Never mutates `candidate` or `research`.
 */
export function decideAdmission(candidate, research) {
  if (candidate.existing_canonical_mapping) {
    return {
      status: "ALREADY_CANONICAL",
      reason: `already resolves via an existing mapping to ${candidate.existing_venue_id}`,
      venue: null,
      mapping: null,
    };
  }

  const entry = findResearchEntry(research, candidate);
  if (!entry) {
    return {
      status: "NO_RESEARCH_ON_RECORD",
      reason: "no retained research finding exists for this exact candidate key — never guessed",
      venue: null,
      mapping: null,
    };
  }

  if (entry.verdict === "REJECT") {
    if (!ADMISSION_STATUSES.has(entry.status)) {
      throw new Error(`candidate-research.json entry for ${candidate.candidate_id} has an unknown status "${entry.status}"`);
    }
    return { status: entry.status, reason: entry.reasoning ?? "rejected on research", venue: null, mapping: null };
  }

  if (entry.verdict === "ADMIT_EXISTING_VENUE_MAPPING") {
    if (!entry.venue_id) {
      throw new Error(`candidate-research.json entry for ${candidate.candidate_id} is ADMIT_EXISTING_VENUE_MAPPING but has no venue_id`);
    }
    return {
      status: "AUTO_ADMIT",
      reason: entry.reasoning ?? "mapped to an existing canonical venue via source-level structural evidence",
      venue: null,
      mapping: buildMappingEntry(candidate, entry.venue_id, entry),
    };
  }

  if (entry.verdict === "ADMIT_ADDRESS_ONLY" || entry.verdict === "ADMIT_CONFIRMED") {
    if (typeof entry.address !== "string" || entry.address.trim() === "") {
      throw new Error(`candidate-research.json entry for ${candidate.candidate_id} has no evidenced address`);
    }
    if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
      throw new Error(`candidate-research.json entry for ${candidate.candidate_id} has no retained evidence`);
    }

    const isConfirmed = entry.verdict === "ADMIT_CONFIRMED";
    if (isConfirmed && (typeof entry.latitude !== "number" || typeof entry.longitude !== "number")) {
      throw new Error(`candidate-research.json entry for ${candidate.candidate_id} is ADMIT_CONFIRMED but has no first-party coordinates`);
    }

    const venue = createVenue({
      canonical_name: entry.canonical_name,
      country_code: entry.country_code,
      city: entry.city,
      municipality: entry.municipality,
      address: entry.address,
      latitude: isConfirmed ? entry.latitude : null,
      longitude: isConfirmed ? entry.longitude : null,
      location_status: isConfirmed ? "CONFIRMED" : "ADDRESS_ONLY",
      evidence: entry.evidence,
      retrieved_at: entry.retrieved_at,
    });

    const errors = validateVenue(venue);
    if (errors.length > 0) {
      throw new Error(`admission would create an invalid Venue for ${candidate.candidate_id}: ${errors.join("; ")}`);
    }

    return {
      status: isConfirmed ? "AUTO_ADMIT" : "ADDRESS_ONLY_ADMIT",
      reason: entry.reasoning ?? `admitted via ${entry.evidence_level ?? "evidenced"} evidence`,
      venue,
      mapping: buildMappingEntry(candidate, venue.venue_id, entry),
    };
  }

  throw new Error(`candidate-research.json entry for ${candidate.candidate_id} has an unknown verdict "${entry.verdict}"`);
}
