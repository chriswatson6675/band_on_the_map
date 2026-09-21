// BEATMAPPED-FOOTBALL-EVENT-ADMISSION-PILOT-01 — pilot admission policy.
//
// THIS IS PILOT POLICY, NOT FOOTBALL POLICY.
//
// ingestion/event/admission.mjs deliberately decides nothing about
// whether evidence is good enough — that is the caller's governed
// decision. This module is one such caller, for one bounded pilot, and
// its rules are chosen to make a FIRST real admission reviewable rather
// than to settle how football should be admitted in general.
//
// In particular the >= 7 day buffer exists so a human can inspect these
// Events before any of them occurs. It is a review convenience. It is not
// a generic Event rule and must not become one.
//
// Nothing here decides the permanent questions: whether the 224
// same-publisher groups may ever be admitted, whether single-source
// fixtures may, or what threshold music uses. Those remain open.

/** The policy identifier recorded on every mapping this pilot creates. */
export const PILOT_POLICY = "FOOTBALL_CROSS_PUBLISHER_FINGERPRINT_PILOT_V1";

/** Hard ceilings for the pilot. */
export const PILOT_MAX_EVENTS = 10;
export const PILOT_PER_STRATUM = 5;
export const PILOT_FUTURE_BUFFER_DAYS = 7;

/** The two strata, chosen to prove venue-backed AND venueless Events. */
export const STRATUM_WITH_VENUE = "WITH_GOVERNED_VENUE";
export const STRATUM_WITHOUT_VENUE = "WITHOUT_GOVERNED_VENUE";

/**
 * Tokens in retained evidence that would say a fixture is not currently
 * scheduled.
 *
 * Deliberately NOT included: "TBC", "Unavailable" and "Behind Closed
 * Doors". All three appear in this corpus as venue_text placeholders —
 * the venue is unannounced or the fixture is closed to spectators — and
 * none of them says the fixture is off. Treating them as cancellation
 * would exclude perfectly good evidence on a misreading.
 */
export const NOT_SCHEDULED_TOKENS = /\b(cancel\w*|postpon\w*|abandon\w*|suspend\w*|rearrang\w*|called\s+off|void)\b/i;

const isNonEmptyString = (value) => typeof value === "string" && value.trim() !== "";

/** pilot_as_of + the buffer, as an ISO instant. */
export function admissionCutoff(asOf, { bufferDays = PILOT_FUTURE_BUFFER_DAYS } = {}) {
  const parsed = new Date(asOf);
  if (Number.isNaN(parsed.getTime())) throw new Error(`invalid pilot_as_of: ${asOf}`);
  return new Date(parsed.getTime() + bufferDays * 86_400_000).toISOString();
}

/** Every string in a fingerprint record that could carry a status word. */
function retainedText(record) {
  const detail = (record.member_detail ?? []).flatMap((member) => [
    member.home_team_raw,
    member.away_team_raw,
    member.competition_raw,
    member.source_venue_text_raw,
  ]);
  return [
    ...(record.home_team_variants ?? []),
    ...(record.away_team_variants ?? []),
    ...(record.competition_variants ?? []),
    ...(record.source_venue_text_variants ?? []),
    ...detail,
  ].filter(isNonEmptyString);
}

/**
 * Is retained evidence saying this fixture is not currently scheduled?
 *
 * The corpus carries no fixture-status field at all — every Observation
 * is `published: 1` with no cancellation signal — so in practice this
 * finds nothing. It is implemented anyway rather than assumed: if such
 * evidence ever appears, admission must exclude on it, and a check that
 * only exists in prose is not a check.
 */
export function notScheduledEvidence(record) {
  for (const text of retainedText(record)) {
    const match = NOT_SCHEDULED_TOKENS.exec(text);
    if (match) return { found: true, token: match[0], text };
  }
  return { found: false };
}

/** Which stratum a record belongs to. */
export function stratumOf(record) {
  return record.governed_venue_census_id ? STRATUM_WITH_VENUE : STRATUM_WITHOUT_VENUE;
}

/**
 * The ten pilot eligibility criteria, evaluated in order so the first
 * failure is the reported reason. Every criterion is a fact read from
 * retained evidence; none is a judgement about quality.
 */
export function eligibility(record, { asOf, cutoff = admissionCutoff(asOf) } = {}) {
  const no = (reason) => ({ eligible: false, reason });

  if (record?.fingerprint_state !== "OCCURRENCE_FINGERPRINT_ESTABLISHED") return no("FINGERPRINT_NOT_ESTABLISHED");
  if (record.evidence_class !== "CROSS_PUBLISHER_CORROBORATED") return no("NOT_CROSS_PUBLISHER_CORROBORATED");
  if (record.occurrence_type !== "FOOTBALL_FIXTURE") return no("NOT_A_FOOTBALL_FIXTURE");
  if (!isNonEmptyString(record.occurrence_fingerprint)) return no("MISSING_FINGERPRINT");

  if (!isNonEmptyString(record.occurrence_instant_utc)) return no("MISSING_OCCURRENCE_INSTANT");
  const instant = new Date(record.occurrence_instant_utc);
  if (Number.isNaN(instant.getTime())) return no("INVALID_OCCURRENCE_INSTANT");

  if ((record.source_observations ?? []).length < 2) return no("FEWER_THAN_TWO_OBSERVATIONS");
  if (!(record.publisher_domain_count > 1)) return no("SINGLE_PUBLISHER_DOMAIN");

  // Any upstream factual doubt disqualifies: this pilot does not resolve
  // conflicts, it declines them.
  if (record.reconciliation_state !== "RECONCILED_MULTI_SOURCE") return no("UPSTREAM_RECONCILIATION_NOT_CLEAN");
  if (record.venue_evidence_state === "CONFLICTING_RESOLVED_VENUES") return no("CONFLICTING_RESOLVED_VENUES");

  const notScheduled = notScheduledEvidence(record);
  if (notScheduled.found) return no(`EVIDENCE_SAYS_NOT_SCHEDULED:${notScheduled.token.toUpperCase()}`);

  if (record.occurrence_instant_utc < cutoff) return no("NOT_AT_LEAST_SEVEN_DAYS_FUTURE");

  return { eligible: true };
}

/**
 * Deterministic candidate order: occurrence instant ascending, then
 * fingerprint ascending. No hand-picking, no club preference, no
 * geography, and nothing derived from a team name.
 */
export function compareCandidates(a, b) {
  return (
    a.occurrence_instant_utc.localeCompare(b.occurrence_instant_utc) ||
    a.occurrence_fingerprint.localeCompare(b.occurrence_fingerprint)
  );
}

/**
 * Census the corpus and select primaries plus ordered reserves, per
 * stratum. Pure: reads records, returns a plan, writes nothing.
 */
export function selectPilotCandidates(records, { asOf }) {
  const cutoff = admissionCutoff(asOf);

  const eligible = [];
  const excluded = [];
  for (const record of records) {
    const verdict = eligibility(record, { asOf, cutoff });
    if (verdict.eligible) eligible.push(record);
    else excluded.push({ occurrence_fingerprint: record.occurrence_fingerprint ?? null, reason: verdict.reason });
  }

  const strata = {};
  for (const name of [STRATUM_WITH_VENUE, STRATUM_WITHOUT_VENUE]) {
    const inStratum = eligible.filter((record) => stratumOf(record) === name).sort(compareCandidates);
    strata[name] = {
      eligible_count: inStratum.length,
      primary: inStratum.slice(0, PILOT_PER_STRATUM),
      reserves: inStratum.slice(PILOT_PER_STRATUM, PILOT_PER_STRATUM * 2),
      shortfall: Math.max(0, PILOT_PER_STRATUM - inStratum.length),
    };
  }

  return { cutoff, eligible_count: eligible.length, excluded, strata };
}

/** Tally exclusion reasons, most frequent first. */
export function tallyExclusions(excluded) {
  const counts = {};
  for (const entry of excluded) counts[entry.reason] = (counts[entry.reason] ?? 0) + 1;
  return Object.fromEntries(
    Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
  );
}

/**
 * Convert one fingerprint record into a generic Event admission request.
 *
 * WHAT IS DELIBERATELY NOT INVENTED HERE.
 *
 *   start.raw   - null. The provider published a structured instant, not
 *                 a piece of display text; putting a manufactured string
 *                 here would misrepresent it as the source's own wording.
 *   end         - left unset, so the Event contract supplies its honest
 *                 UNKNOWN placeholder. No match duration is assumed: 90
 *                 minutes is a convention, not retained evidence.
 *   display_title - null. Composing "X v Y" would elect one spelling of
 *                 each club as canonical, which this repository has not
 *                 decided and this package must not pre-empt.
 *   venue_id    - the governed census venue when the evidence resolved
 *                 one, otherwise null. Never guessed from venue text.
 */
export function toAdmissionRequest(record, { admittedAt, runId, planPath, fingerprintArtifactPath }) {
  if (!isNonEmptyString(admittedAt)) throw new Error("toAdmissionRequest requires admittedAt");

  const instant = new Date(record.occurrence_instant_utc);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`toAdmissionRequest: invalid instant ${record.occurrence_instant_utc}`);
  }
  const iso = instant.toISOString();

  return {
    event: {
      event_category: "SPORT",
      event_type: "FOOTBALL_FIXTURE",
      display_title: null,
      occurrence_shape: "POINT_IN_TIME",
      start: {
        raw: null,
        date: iso.slice(0, 10),
        iso,
        is_utc: true,
        tzid: null,
        certainty: "UTC_INSTANT",
      },
      status: "SCHEDULED",
      venue_id: record.governed_venue_census_id ?? null,
      parent_event_id: null,
    },
    basis: {
      basis_kind: "PROVIDER_FINGERPRINT",
      fingerprint: record.occurrence_fingerprint,
      observations: record.source_observations.map((ref) => ({
        source_id: ref.source_id,
        source_record_id: ref.source_record_id,
      })),
      method: PILOT_POLICY,
      // Provenance references only — enough to retrace the decision.
      // Raw source bodies stay in the acquisition evidence where they
      // belong and are never copied into Event state.
      evidence: [
        {
          kind: "PILOT_RUN",
          run_id: runId,
          policy: PILOT_POLICY,
          plan: planPath,
        },
        {
          kind: "OCCURRENCE_FINGERPRINT",
          artifact: fingerprintArtifactPath,
          occurrence_fingerprint: record.occurrence_fingerprint,
          reconciliation_group_id: record.reconciliation_group_id,
          evidence_class: record.evidence_class,
          publisher_domains: [...record.publisher_domains],
          publisher_domain_count: record.publisher_domain_count,
          venue_evidence_state: record.venue_evidence_state,
        },
      ],
      decided_at: admittedAt,
    },
    admitted_at: admittedAt,
  };
}
