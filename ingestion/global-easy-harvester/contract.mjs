// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — shared vocabulary and pure
// mapping functions for the global Tier-1 acquisition controller.
//
// This module invents NO new acquisition mechanism. Its only job is to:
//   (a) define the candidate/state vocabulary the controller persists, and
//   (b) deterministically translate this repository's OWN existing
//       terminal-state vocabulary (source-execution.mjs's
//       SourceAcquisitionResult.state, ingestion/source-investigation's
//       ACQUISITION_CLASSES) into a Tier-1 PROVEN/DEFERRED verdict.
//
// No I/O. No network. No AI. No browser. Pure, dependency-free, testable
// in isolation — matching ingestion/observation/contract.mjs and
// sources/registry/validate.mjs's own convention for this repository.

// --- Candidate lifecycle state (Phase 6 vocabulary) ---
export const CANDIDATE_STATES = Object.freeze([
  "UNSEEN",
  "T1_CHECKING",
  "T1_PROVEN",
  "T1_ADMISSION_PENDING",
  "T1_ADMITTED",
  "T1_PUBLISHED",
  "T1_LIVE_VERIFIED",
  "T1_DEFER_SOURCE_DISCOVERY",
  "T1_DEFER_BROWSER_REQUIRED",
  "T1_DEFER_UNSUPPORTED_PATTERN",
  "T1_DEFER_NETWORK",
  "T1_DEFER_IDENTITY",
  "T1_DEFER_EVENTS_UNAVAILABLE",
  "T1_DEFER_NORMALIZATION",
  "T1_DEFER_REQUIRES_ADAPTATION",
  "REPAIR_REQUIRED",
  "REJECTED",
  "SKIP_ALREADY_LIVE",
]);

export const DEFER_STATES = new Set(
  CANDIDATE_STATES.filter((s) => s.startsWith("T1_DEFER_")),
);

export const TERMINAL_STATES = new Set([
  ...DEFER_STATES,
  "T1_LIVE_VERIFIED",
  "T1_PUBLISHED",
  "T1_ADMITTED",
  "REPAIR_REQUIRED",
  "REJECTED",
  "SKIP_ALREADY_LIVE",
]);

// Investigation acquisition_classes (ingestion/source-investigation/contract.mjs's
// ACQUISITION_CLASSES) that source-execution.mjs's acquireSource() can
// actually reach through its EXISTING auto-dispatch chain
// (routeProgrammeSource -> deriveEventRecords: embedded-state, static-cards,
// json-ld — see orchestrator.mjs). A candidate whose retained investigation
// already names a DIFFERENT class is deferred WITHOUT a network call —
// calling acquireSource() on it would only rediscover the same fact this
// repository's own retained research already established.
export const TIER1_AUTO_DISPATCHED_ACQUISITION_CLASSES = new Set([
  "JSON_LD_EVENT",
  "STATIC_HTML",
  "EMBEDDED_JSON",
]);

// Classes with a real, existing collector module elsewhere in this
// repository (events-calendar-api, ics, rss, microdata, per-event-ics,
// wp-evenement-cards, squarespace-eventlist, prismic-api) that is NOT
// wired into acquireSource()'s generic auto-dispatch chain — using them
// generically here would require adaptation work, which Phase 2 condition
// 8 of this package's brief puts out of scope for Tier 1.
export const TIER1_REQUIRES_ADAPTATION_ACQUISITION_CLASSES = new Set([
  "ICS",
  "RSS",
  "PUBLIC_JSON_API",
  "WORDPRESS",
  "KNOWN_CALENDAR_PLUGIN",
  "SPA_API_DISCOVERABLE",
]);

export const TIER1_BROWSER_ACQUISITION_CLASSES = new Set(["HEADLESS_REQUIRED", "CLIENT_RENDERED"]);

export const TIER1_UNSUPPORTED_ACQUISITION_CLASSES = new Set([
  "SOCIAL_ONLY",
  "TICKETING_ONLY",
  "AMBIGUOUS",
  "UNSUPPORTED",
  "UNKNOWN",
]);

/**
 * Pre-gate a candidate's ALREADY-KNOWN (retained-evidence) acquisition_class
 * before spending a network call. Returns a T1_DEFER_* state string, or
 * null when the class is one acquireSource()'s existing auto-dispatch
 * chain can actually attempt (proceed to acquireSource()).
 */
export function preGateAcquisitionClass(acquisitionClass) {
  if (TIER1_AUTO_DISPATCHED_ACQUISITION_CLASSES.has(acquisitionClass)) return null;
  if (TIER1_BROWSER_ACQUISITION_CLASSES.has(acquisitionClass)) return "T1_DEFER_BROWSER_REQUIRED";
  if (TIER1_REQUIRES_ADAPTATION_ACQUISITION_CLASSES.has(acquisitionClass)) return "T1_DEFER_REQUIRES_ADAPTATION";
  // TIER1_UNSUPPORTED_ACQUISITION_CLASSES and anything unrecognised.
  return "T1_DEFER_UNSUPPORTED_PATTERN";
}

// source-execution.mjs's own terminal `state` values (see that file's
// header comment) mapped to this package's Tier-1 defer vocabulary.
// ACQUISITION_PROVEN maps to `null` (proceed to admission), never to a
// defer state.
const DEFER_STATE_BY_ACQUISITION_STATE = {
  PROGRAMME_SOURCE_UNRESOLVED: "T1_DEFER_SOURCE_DISCOVERY",
  BROWSER_REQUIRED: "T1_DEFER_BROWSER_REQUIRED",
  ACCESS_BLOCKED: "T1_DEFER_UNSUPPORTED_PATTERN",
  SOCIAL_FIRST_PROGRAMME: "T1_DEFER_UNSUPPORTED_PATTERN",
  IMAGE_OR_POSTER_ONLY: "T1_DEFER_UNSUPPORTED_PATTERN",
  SOURCE_FINGERPRINT_UNSUPPORTED: "T1_DEFER_UNSUPPORTED_PATTERN",
  NETWORK_FAILURE: "T1_DEFER_NETWORK",
  PROGRAMME_EMPTY: "T1_DEFER_EVENTS_UNAVAILABLE",
  SUPPORTED_COLLECTOR_NO_VALID_EVENTS: "T1_DEFER_EVENTS_UNAVAILABLE",
  STABLE_IDENTITY_PROOF_FAILED: "T1_DEFER_NORMALIZATION",
};

/**
 * Map one source-execution.mjs SourceAcquisitionResult to a Tier-1 verdict.
 * Returns { proven: true } for ACQUISITION_PROVEN, or
 * { proven: false, defer_state, defer_reason } otherwise. Never throws for
 * a recognised state; an unrecognised state (this repository's terminal
 * vocabulary changed) throws loudly rather than silently misclassifying.
 */
export function mapAcquisitionResultToTier1Verdict(result) {
  if (!result?.state) throw new Error("mapAcquisitionResultToTier1Verdict: result.state is required");
  if (result.state === "ACQUISITION_PROVEN") return { proven: true };

  const deferState = DEFER_STATE_BY_ACQUISITION_STATE[result.state];
  if (!deferState) {
    throw new Error(
      `mapAcquisitionResultToTier1Verdict: unrecognised acquisition state "${result.state}" — this repository's terminal-state vocabulary changed; this mapping needs a matching update`,
    );
  }
  return { proven: false, defer_state: deferState, defer_reason: result.state };
}

/** Kebab-case slug matching sources/registry/validate.mjs's ID_PATTERN and ingestion/venue/contract.mjs's own slug() rules (NFD, strip diacritics, lowercase, collapse non [a-z0-9] runs to "-"). */
export function slugify(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Deterministic source id for a candidate this controller may admit — same {city, name} inputs always produce the same id, matching createVenueId()'s own determinism guarantee. */
export function deriveSourceId(city, canonicalName) {
  return `${slugify(city)}-${slugify(canonicalName)}`;
}
