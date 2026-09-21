// BEATMAPPED-FOOTBALL-FULL-FUTURE-EVENT-ADMISSION-01 — the first normal
// football admission policy.
//
// WHAT CHANGED, AND WHY.
//
// The pilot (FOOTBALL_CROSS_PUBLISHER_FINGERPRINT_PILOT_V1) required
// cross-publisher corroboration and a seven-day buffer. Both were review
// conveniences for a first run of ten, and neither was ever a statement
// about when a fixture EXISTS.
//
// This policy separates two questions the pilot deliberately left fused:
//
//   Does this occurrence exist?      <- evidence sufficiency
//   How well is it corroborated?     <- evidence strength
//
// A credible retained source assertion of a uniquely identifiable
// scheduled future fixture is sufficient for canonical Event EXISTENCE,
// unless contradicted by stronger retained evidence. A club publishing
// its own fixture list is asserting a fact about its own fixtures; that
// one publisher is the only one we retained does not make the fixture
// hypothetical.
//
// Evidence strength is NOT discarded — it is recorded separately on every
// mapping, so nothing here lets a single-source Event be mistaken for a
// cross-publisher one. They establish existence through different
// evidence strengths, and the distinction stays legible forever.
//
// STILL NOT REQUIRED: a governed venue, canonical club identity,
// canonical competition identity, a display title, or a fingerprint.

import { NOT_SCHEDULED_TOKENS } from "./policy.mjs";

/** The policy recorded on every mapping this package creates. */
export const BULK_POLICY = "FOOTBALL_SCHEDULED_FIXTURE_ADMISSION_V1";

/**
 * Evidence STRENGTH, recorded alongside every admission. Existence does
 * not depend on it; honesty about corroboration does.
 */
export const EVIDENCE_STRENGTHS = new Set([
  "CROSS_PUBLISHER_CORROBORATED",
  "SAME_PUBLISHER_MULTI_SOURCE",
  "SINGLE_SOURCE_ASSERTION",
]);

/**
 * Every distinct occurrence ends at exactly one of these. The set is
 * exhaustive by construction: the census asserts that the counts sum to
 * the corpus, so an occurrence cannot be silently dropped.
 */
export const CENSUS_STATES = new Set([
  "FUTURE_ELIGIBLE_MULTI_SOURCE",
  "FUTURE_ELIGIBLE_SINGLE_SOURCE",
  "ALREADY_ADMITTED",
  "PAST_OR_STARTED",
  "INVALID_KICKOFF",
  "FACTUAL_CONFLICT",
  "EXPLICITLY_CANCELLED_OR_VOID",
  "UNRESOLVED_IDENTITY",
  "OTHER_EXCLUDED",
]);

/** What the plan intends to do about an occurrence. */
export const PLAN_ACTIONS = new Set(["ADMIT", "ALREADY_ADMITTED", "ATTACH_EVIDENCE"]);

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

/** Normalise a kickoff to one canonical UTC instant, or null. */
export function normaliseKickoff(value) {
  if (!isNonEmptyString(value)) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/**
 * Does retained evidence positively say this fixture is not scheduled?
 *
 * Deliberately narrow. "TBC", "Unavailable" and "Behind Closed Doors" all
 * appear in this corpus as VENUE placeholders — the venue is unannounced,
 * or the fixture is closed to spectators — and none says the fixture is
 * off. Only a positive status word excludes, and only where the source
 * actually expresses status.
 *
 * This corpus carries no fixture-status field at all (every Observation
 * is `published: 1`), so in practice nothing is excluded here. The check
 * exists so that if such evidence ever appears it is honoured, rather
 * than being a claim made only in prose.
 */
export function cancellationEvidence(texts) {
  for (const text of texts) {
    if (!isNonEmptyString(text)) continue;
    const match = NOT_SCHEDULED_TOKENS.exec(text);
    if (match) return { found: true, token: match[0], text };
  }
  return { found: false };
}

/**
 * Classify one distinct occurrence. `candidate` is the normalised shape
 * the census builds; this function is the single place a state is
 * decided, so the accounting cannot disagree with the policy.
 */
export function classify(candidate, { asOf, activeFingerprints, activeObservationKeys }) {
  const at = (state, reason = null) => ({ state, reason });

  if (!isNonEmptyString(candidate.platform_match_id)) return at("UNRESOLVED_IDENTITY", "MISSING_PLATFORM_MATCH_ID");
  if ((candidate.observations ?? []).length === 0) return at("UNRESOLVED_IDENTITY", "NO_RETAINED_OBSERVATION");

  if (candidate.factual_conflict) return at("FACTUAL_CONFLICT", candidate.factual_conflict);

  const kickoff = normaliseKickoff(candidate.kickoff_utc);
  if (kickoff === null) return at("INVALID_KICKOFF", "KICKOFF_MISSING_OR_UNPARSEABLE");

  const cancelled = cancellationEvidence(candidate.status_texts ?? []);
  if (cancelled.found) return at("EXPLICITLY_CANCELLED_OR_VOID", `TOKEN:${cancelled.token.toUpperCase()}`);

  // Already canonical? Checked BEFORE the future test, so a past fixture
  // admitted earlier is still reported as admitted rather than silently
  // reclassified as PAST_OR_STARTED.
  if (candidate.occurrence_fingerprint && activeFingerprints.has(candidate.occurrence_fingerprint)) {
    return at("ALREADY_ADMITTED", "FINGERPRINT_ALREADY_ACTIVE");
  }
  for (const ref of candidate.observations) {
    if (activeObservationKeys.has(`${ref.source_id}||${ref.source_record_id}`)) {
      return at("ALREADY_ADMITTED", "OBSERVATION_ALREADY_MAPPED");
    }
  }

  if (!(kickoff > asOf)) return at("PAST_OR_STARTED", "KICKOFF_NOT_IN_FUTURE");

  return at(
    candidate.evidence_strength === "SINGLE_SOURCE_ASSERTION"
      ? "FUTURE_ELIGIBLE_SINGLE_SOURCE"
      : "FUTURE_ELIGIBLE_MULTI_SOURCE",
  );
}

/**
 * Deterministic plan order: occurrence instant, then provider match id,
 * then the evidence identity as a final tie-break. The same corpus and
 * the same bulk_as_of always produce the same plan.
 */
export function comparePlanRows(a, b) {
  return (
    String(a.kickoff_utc).localeCompare(String(b.kickoff_utc)) ||
    String(a.platform_match_id).localeCompare(String(b.platform_match_id)) ||
    String(a.occurrence_fingerprint ?? a.evidence_key).localeCompare(String(b.occurrence_fingerprint ?? b.evidence_key))
  );
}

/**
 * Build the generic Event admission request for one planned occurrence.
 *
 * Nothing is invented: no duration, no display title composed from team
 * names, no venue guessed from venue text, and no tzid asserted without
 * retained evidence for one.
 */
export function toBulkAdmissionRequest(row, { admittedAt, runId, planPath }) {
  if (!isNonEmptyString(admittedAt)) throw new Error("toBulkAdmissionRequest requires admittedAt");

  const iso = normaliseKickoff(row.kickoff_utc);
  if (iso === null) throw new Error(`toBulkAdmissionRequest: invalid kickoff ${row.kickoff_utc}`);

  const evidence = [
    {
      kind: "BULK_ADMISSION_RUN",
      run_id: runId,
      policy: BULK_POLICY,
      plan: planPath,
    },
    {
      kind: "OCCURRENCE_EVIDENCE",
      platform_match_id: row.platform_match_id,
      reconciliation_group_id: row.reconciliation_group_id ?? null,
      // Evidence STRENGTH, recorded so a single-source Event can never be
      // read as cross-publisher corroborated.
      evidence_strength: row.evidence_strength,
      publisher_domains: row.publisher_domains ?? [],
      publisher_domain_count: row.publisher_domain_count ?? null,
      venue_evidence_state: row.venue_evidence_state ?? null,
      source_artifact: row.source_artifact,
    },
  ];

  if (row.occurrence_fingerprint) {
    evidence[1].occurrence_fingerprint = row.occurrence_fingerprint;
  }

  return {
    event: {
      event_category: "SPORT",
      event_type: "FOOTBALL_FIXTURE",
      display_title: null,
      occurrence_shape: "POINT_IN_TIME",
      start: {
        // The provider published a structured instant, not display text.
        raw: null,
        date: iso.slice(0, 10),
        iso,
        is_utc: true,
        tzid: null,
        certainty: "UTC_INSTANT",
      },
      status: "SCHEDULED",
      venue_id: row.governed_venue_census_id ?? null,
      parent_event_id: null,
    },
    basis: {
      basis_kind: row.occurrence_fingerprint ? "PROVIDER_FINGERPRINT" : "SINGLE_OBSERVATION",
      fingerprint: row.occurrence_fingerprint ?? null,
      observations: row.observations.map((ref) => ({
        source_id: ref.source_id,
        source_record_id: ref.source_record_id,
      })),
      method: BULK_POLICY,
      evidence,
      decided_at: admittedAt,
    },
    admitted_at: admittedAt,
  };
}
