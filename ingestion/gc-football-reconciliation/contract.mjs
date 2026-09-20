// BEATMAPPED-UK-GC-FOOTBALL-MULTISOURCE-FIXTURE-RECONCILIATION-01 — contract.
//
// A bounded reconciliation layer for the gc football estate.
//
// WHAT THIS IS NOT.
//
// docs/ARCHITECTURE.md defines an Event as "a canonical live music
// occurrence, resolved from one or more observations", and rule 2 says
// multiple Observations may resolve to one Event. No such canonical Event
// identity exists anywhere in BeatMapped yet — the publication layer
// asserts it carries no `event_id`/`canonical_event_id`/`id` at all.
//
// This package does NOT create it. A reconciliation group is a derived,
// evidence-backed statement that several source Observations describe one
// underlying fixture. It is a precursor to canonical identity, not the
// thing itself, and `reconciliation_group_id` is deliberately not an
// event id: it is a deterministic function of the evidence, carries no
// authority, and is never published.

/**
 * Every reconciliation group ends at exactly one of these.
 *
 * `INSUFFICIENT_MEMBERS` is deliberately NOT in this set. The case it
 * would have named — a match id with two or more member records but
 * fewer than two distinct sources — is reported more precisely as
 * CONFLICT_OTHER_FACTUAL, because one calendar publishing the same match
 * id twice is an anomaly rather than a quantity problem. Keeping an
 * unreachable state would misrepresent what the engine can actually
 * conclude.
 */
export const RECONCILIATION_STATES = new Set([
  "RECONCILED_MULTI_SOURCE",
  "CONFLICT_MATCH_ID_KICKOFF",
  "CONFLICT_RESOLVED_VENUE",
  "CONFLICT_OTHER_FACTUAL",
  "SINGLE_SOURCE_NOT_IN_SCOPE",
]);

/** How a group's physical venue stands, given its members' attributions. */
export const VENUE_EVIDENCE_STATES = new Set([
  "AGREED_BY_ALL_RESOLVED_MEMBERS",
  "NO_MEMBER_RESOLVED",
  "CONFLICTING_RESOLVED_VENUES",
]);

/**
 * The reconciliation key.
 *
 *   platform_match_id + normalized kickoff instant
 *
 * and NOTHING else. Team names, competition text, source venue text, the
 * source calendar and any inferred club identity are deliberately not
 * part of the key: the predecessor measured all of them varying between
 * club feeds for the same fixture, so keying on them would split real
 * fixtures apart and, worse, could join unrelated ones.
 *
 * The match id alone is NOT sufficient. Kickoff is the factual control
 * that makes an id collision detectable instead of silently absorbed.
 */
export function normaliseKickoff(iso) {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

/** The compact, stable form used inside a group id. */
export function kickoffStamp(normalisedKickoff) {
  return normalisedKickoff.replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * Deterministic group id, derived purely from the two key inputs. The
 * same evidence always yields the same id, on any machine, in any run —
 * no counters, no hashes of ordering, no timestamps.
 */
export function reconciliationGroupId(platformMatchId, normalisedKickoff) {
  return `gcf-${platformMatchId}-${kickoffStamp(normalisedKickoff)}`;
}

/** A stable reference to one source Observation. */
export function observationRef(record) {
  return { source_id: record.source_id, source_record_id: record.source_record_id };
}

/** Stable ordering for members within a group, and groups within a file. */
export function compareRefs(a, b) {
  return a.source_id.localeCompare(b.source_id) || a.source_record_id.localeCompare(b.source_record_id);
}

/** Distinct values of one field across members, order-stable. */
export function variantsOf(members, pick) {
  const seen = new Map();
  for (const member of members) {
    const value = pick(member);
    if (value === undefined) continue;
    const key = JSON.stringify(value ?? null);
    if (!seen.has(key)) seen.set(key, value ?? null);
  }
  return [...seen.values()].sort((a, b) => String(a).localeCompare(String(b)));
}
