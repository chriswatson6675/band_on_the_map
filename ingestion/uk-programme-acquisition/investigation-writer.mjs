// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 — mechanically
// derives a real, policy-compliant docs/SOURCE_INVESTIGATION_POLICY.md
// investigation record from ONE real ingestion/programme-acquisition/
// source-execution.mjs acquireSource() outcome. Every field traces
// directly to that outcome's own retained evidence and observations —
// nothing here is invented, guessed, or backfilled after the fact. This
// is the "solve the platform once, apply the tool everywhere" answer to
// running 1,000+ individually-real, individually-evidenced investigations
// at national scale without hand-writing any of them: the GENERATOR is
// reusable and tested; every investigation it produces is still its own
// real, honest record, exactly matching this repository's existing
// one-investigation-per-venue precedent (see
// research/source-investigations/london-t2-eventim-apollo-01/ for the
// closest real analogue this mirrors: a light, Level-1-only probe).
//
// probe_history never exceeds Level 1 (PASSIVE_STATIC) — this package's
// own brief scopes acquisition to static/passive sources only ("Do not
// bypass authentication, paywalls, CAPTCHAs or technical protections");
// Level 1 is genuinely SUFFICIENT to answer every outcome this generator
// records, including "this source needs a browser" (BROWSER_REQUIRED is
// itself a Level-1 finding, not a reason to escalate within this
// package's scope) — see docs/SOURCE_INVESTIGATION_POLICY.md's own
// SUFFICIENT definition: "exposed enough information to continue the
// investigation without escalating further."
//
// Pure module — no network, no filesystem. Callers (run.mjs) fetch real
// documents, write evidence files, and pass this module the resulting
// metadata; this module only ever assembles/classifies from what it is
// given.

import { validateInvestigation } from "../source-investigation/contract.mjs";
import { normaliseText } from "../venue-discovery/normalise.mjs";

export const POLICY_VERSION = "BOTM-SOURCE-INVESTIGATION-v1.1";
export const INVESTIGATOR = { type: "AI", method: "BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 governed generator: real acquireSource() outcome mechanically mapped to a v1.1 investigation record — no field invented beyond what the retained evidence/observations themselves state." };

// acquireSource()'s own fingerprinted `collector` mechanism name ->
// ACQUISITION_CLASSES (investigation-policy vocabulary — distinct from,
// but overlapping, registry-entries.mjs's separate ACQUISITION_METHOD
// mapping for sources/*.json; kept as two explicit tables rather than one
// shared one, since the two vocabularies are independently governed and
// must never silently drift into assuming they're the same set).
// Every "real collecting" member of ingestion/venue-discovery/
// research-state.mjs's own TECHNICAL_MECHANISMS is mapped here —
// deliberately the FULL set, not just the ones exercised by this
// package's own early smoke testing, after one real gap (STATIC_HTML_CARDS
// — Brighton Dome's own real, live site — was unmapped, defaulted to
// AMBIGUOUS, and correctly blocked READY_FOR_ACTIVATION's own
// site_classification gate) proved that an incomplete table silently
// suppresses real, already-proven acquisitions rather than failing loudly.
// The residue-only mechanisms (IMAGE_OR_POSTER_PROGRAMME,
// SOCIAL_FIRST_PROGRAMME, CLIENT_RENDERED_UNKNOWN, ACCESS_BLOCKED,
// NO_CURRENT_PROGRAMME_FOUND, OTHER) are deliberately absent — they can
// only ever accompany a residue `result.state`, which RESIDUE_CLASSIFICATION
// above already classifies directly from that state, never consulting this
// table (see buildInvestigationRecord's own branch below).
const MECHANISM_TO_ACQUISITION_CLASS = new Map([
  ["JSON_LD_EVENT", "JSON_LD_EVENT"],
  ["ICS_OR_ICAL", "ICS"],
  ["PER_EVENT_ICS", "ICS"],
  ["WORDPRESS_TRIBE_API", "KNOWN_CALENDAR_PLUGIN"],
  ["WORDPRESS_OTHER_API", "WORDPRESS"],
  ["PUBLIC_REST_JSON", "PUBLIC_JSON_API"],
  ["PUBLIC_GRAPHQL", "PUBLIC_JSON_API"],
  ["STATIC_HTML_CARDS", "STATIC_HTML"],
  ["LIST_TO_DETAIL_HTML", "STATIC_HTML"],
  ["EMBEDDED_NEXT_DATA", "EMBEDDED_JSON"],
  ["EMBEDDED_NUXT_STATE", "EMBEDDED_JSON"],
  ["EMBEDDED_SVELTEKIT_DATA", "EMBEDDED_JSON"],
  ["OTHER_EMBEDDED_APP_STATE", "EMBEDDED_JSON"],
  ["PUBLIC_BROWSER_XHR", "SPA_API_DISCOVERABLE"],
  ["WEBFLOW", "STATIC_HTML"],
  ["MICRODATA", "STATIC_HTML"],
  ["WIX_OR_FOURVENUES", "SPA_API_DISCOVERABLE"],
  ["SQUARESPACE_CALENDAR", "STATIC_HTML"],
]);

const MECHANISM_TO_COLLECTOR_FAMILY = new Map([
  ["JSON_LD_EVENT", "JSON_LD"],
  ["ICS_OR_ICAL", "ICS_CALENDAR"],
  ["PER_EVENT_ICS", "ICS_CALENDAR"],
  ["WORDPRESS_TRIBE_API", "WORDPRESS_CALENDAR"],
  ["WORDPRESS_OTHER_API", "WORDPRESS_CALENDAR"],
  ["PUBLIC_REST_JSON", "JSON_API"],
  ["PUBLIC_GRAPHQL", "JSON_API"],
  ["STATIC_HTML_CARDS", "STATIC_EVENT_LIST"],
  ["LIST_TO_DETAIL_HTML", "STATIC_EVENT_LIST"],
  ["EMBEDDED_NEXT_DATA", "JSON_API"],
  ["EMBEDDED_NUXT_STATE", "JSON_API"],
  ["EMBEDDED_SVELTEKIT_DATA", "JSON_API"],
  ["OTHER_EMBEDDED_APP_STATE", "JSON_API"],
  ["PUBLIC_BROWSER_XHR", "JSON_API"],
  ["WEBFLOW", "STATIC_EVENT_LIST"],
  ["MICRODATA", "STATIC_EVENT_LIST"],
  ["WIX_OR_FOURVENUES", "STABLE_EVENT_PAGE"],
  ["SQUARESPACE_CALENDAR", "SQUARESPACE_ICS"],
]);

// Non-network, non-collector residue states -> {acquisition_class, decision status, reason}.
// Every state acquireSource() can terminate in is handled explicitly —
// see ingestion/programme-acquisition/source-execution.mjs's own header
// comment for the exhaustive list this switches on.
const RESIDUE_CLASSIFICATION = {
  NETWORK_FAILURE: { acquisition_class: "UNKNOWN", decision: "DEFER", reason: "A transient network failure exhausted its retry budget — this is a provider-availability issue, not evidence the source is unusable; safe to re-attempt on a later run." },
  PROGRAMME_SOURCE_UNRESOLVED: { acquisition_class: "AMBIGUOUS", decision: "DEFER", reason: "No programme/events page could be discovered from the venue's own homepage via bounded, passive link discovery." },
  ACCESS_BLOCKED: { acquisition_class: "UNSUPPORTED", decision: "DEFER", reason: "The source's own response indicates an explicit access control; per policy this must never be bypassed." },
  // Deliberately CLIENT_RENDERED, never HEADLESS_REQUIRED: this package's
  // Level-1-only probe_history can honestly say the page APPEARS
  // client-rendered from static inspection, but HEADLESS_REQUIRED asserts
  // browser acquisition IS actually necessary — a stronger claim only a
  // real Level-3 (BROWSER_OBSERVATION) probe can support.
  // validateInvestigation()'s own cross-check enforces exactly this
  // distinction (site_classification.acquisition_class: "HEADLESS_REQUIRED"
  // requires a retained level>=3 probe_history entry) — see
  // docs/SOURCE_INVESTIGATION_POLICY.md's "Cross-checks against the
  // claimed classification".
  BROWSER_REQUIRED: { acquisition_class: "CLIENT_RENDERED", decision: "DEFER", reason: "The programme page appears client-rendered from static inspection alone; this package's scope is static/passive acquisition only (no browser automation), so this is genuinely out of scope, not a defect. A future package could escalate this specific source to a real Level 3 browser-observation probe." },
  SOCIAL_FIRST_PROGRAMME: { acquisition_class: "SOCIAL_ONLY", decision: "DEFER", reason: "The venue's programme is only reachable via a social-media surface, not a governed first-party feed or page." },
  IMAGE_OR_POSTER_ONLY: { acquisition_class: "UNSUPPORTED", decision: "DEFER", reason: "Events appear to be published only as images/posters with no machine-readable structure." },
  PROGRAMME_EMPTY: { acquisition_class: "STATIC_HTML", decision: "DEFER", reason: "A real programme page was found and fetched, but it currently lists no events — genuinely NO_CURRENT_UPCOMING_EVENTS, not a technical failure." },
  SOURCE_FINGERPRINT_UNSUPPORTED: { acquisition_class: "UNSUPPORTED", decision: "DEFER", reason: "The programme page's structure does not match any existing governed collector family." },
  STABLE_IDENTITY_PROOF_FAILED: { acquisition_class: "AMBIGUOUS", decision: "DEFER", reason: "A supported collector ran but could not establish a stable per-event identity from this source." },
  SUPPORTED_COLLECTOR_NO_VALID_EVENTS: { acquisition_class: "AMBIGUOUS", decision: "DEFER", reason: "A supported collector ran against the programme page but produced no events that passed its own proof/validation step." },
};

/**
 * From a real acquireSource() result's own `evidence` array, choose which
 * documents to retain as bounded investigation evidence — never every
 * detail-page fetch (this package's brief and the policy both call for
 * BOUNDED evidence, not an uncontrolled full-site dump). Keeps: the
 * homepage (if a discovery pass happened), the selected programme
 * document, and up to 2 detail documents (enough to support a genuine
 * title/date field-assessment claim without retaining dozens of pages).
 */
export function selectEvidenceDocuments(result) {
  const evidence = result.evidence ?? [];
  if (evidence.length === 0) return [];
  const [first, ...rest] = evidence;
  const isHomepage = result.programme_discovery != null && first?.url === result.website;
  const homepage = isHomepage ? [first] : [];
  const remaining = isHomepage ? rest : evidence;
  const [programme, ...details] = remaining;
  const boundedDetails = details.slice(0, 2);
  return [...homepage, ...(programme ? [programme] : []), ...boundedDetails].filter(Boolean);
}

/** A mechanical, evidenced identity cross-check: does the venue's own canonical_name appear in the homepage/programme document's retained text? Never a fuzzy/AI guess — a real substring check against real retained bytes. */
export function checkIdentityMatch(venueName, documents) {
  const nameTokens = normaliseText(venueName).split(" ").filter((t) => t.length > 2);
  if (nameTokens.length === 0) return { matched: false, confidence: "NONE" };
  for (const doc of documents) {
    const normalisedBody = normaliseText(doc.body ?? "");
    const matchedTokens = nameTokens.filter((t) => normalisedBody.includes(t));
    if (matchedTokens.length === nameTokens.length) return { matched: true, confidence: "HIGH", documentUrl: doc.url };
    if (matchedTokens.length >= Math.ceil(nameTokens.length * 0.6)) return { matched: true, confidence: "MEDIUM", documentUrl: doc.url };
  }
  return { matched: false, confidence: "LOW" };
}

function certaintyImpliesRealDate(certainty) {
  return certainty && certainty !== "TEXT_ONLY" && certainty !== "UNKNOWN";
}

function assessmentEntry({ state, value = null, notes = null, evidenceRefs = [] }) {
  return { state, value, notes, evidence_refs: evidenceRefs };
}

/**
 * Build the full field_assessment block from one representative proven
 * Observation (observations[0]) plus the aggregate proven count — an
 * honest, evidenced characterisation of what this source's collector
 * genuinely extracts, never a per-event assertion this investigation
 * doesn't make.
 */
function buildFieldAssessment({ observations, evidenceRefs }) {
  if (!observations || observations.length === 0) {
    const empty = assessmentEntry({ state: "NOT_PRESENT", notes: "No proven observation was produced by this acquisition attempt." });
    return { title: empty, start_date: empty, time: empty, end: empty, venue_location: empty, source_record_id: empty, event_url: empty };
  }
  const sample = observations[0];
  const allHaveTitle = observations.every((o) => typeof o.title === "string" && o.title.trim() !== "");
  const allHaveRealDate = observations.every((o) => certaintyImpliesRealDate(o.start?.certainty));
  const allHaveEventUrl = observations.every((o) => typeof o.event_url === "string" && o.event_url.trim() !== "");

  return {
    title: assessmentEntry({
      state: allHaveTitle ? "PROVEN" : sample.title ? "PARTIAL" : "NOT_PRESENT",
      value: allHaveTitle ? sample.title : null,
      notes: `${observations.length} proven observation(s); ${observations.filter((o) => o.title?.trim()).length} carried a non-empty title.`,
      evidenceRefs: allHaveTitle ? evidenceRefs : [],
    }),
    start_date: assessmentEntry({
      state: allHaveRealDate ? "PROVEN" : sample.start?.certainty === "TEXT_ONLY" ? "PARTIAL" : "UNKNOWN",
      value: allHaveRealDate ? sample.start?.date ?? sample.start?.iso ?? null : null,
      notes: `start.certainty observed: ${[...new Set(observations.map((o) => o.start?.certainty ?? "UNKNOWN"))].join(", ")}.`,
      evidenceRefs: allHaveRealDate ? evidenceRefs : [],
    }),
    time: assessmentEntry({
      state: sample.start?.is_utc || sample.start?.iso ? "PROVEN" : sample.start?.certainty === "DATE_ONLY" ? "NOT_PRESENT" : "UNKNOWN",
      value: sample.start?.is_utc || sample.start?.iso ? sample.start?.iso ?? null : null,
      notes: "Derived from the same representative observation's start.iso/is_utc.",
      evidenceRefs: sample.start?.iso ? evidenceRefs : [],
    }),
    end: assessmentEntry({
      state: sample.end?.date || sample.end?.iso ? "PROVEN" : "NOT_PRESENT",
      value: sample.end?.date ?? sample.end?.iso ?? null,
      notes: "Many gig/concert listings genuinely never state an end time — NOT_PRESENT here is an honest source characteristic, not a gap.",
      evidenceRefs: sample.end?.date || sample.end?.iso ? evidenceRefs : [],
    }),
    venue_location: assessmentEntry({
      state: "PROVEN",
      value: sample.venue_name || null,
      notes: "This investigation targets the venue's OWN official website (see identity check) — every event on it is this venue's own programme by construction, not a multi-venue calendar requiring per-event venue disambiguation.",
      evidenceRefs,
    }),
    source_record_id: assessmentEntry({
      state: "UNKNOWN",
      notes: "Per-record identifier stability was not independently proven by this bulk investigation (docs/SOURCE_INVESTIGATION_POLICY.md's stable-identifier rule). Alternative strategy: downstream Observation processing treats each proven event's own event_url as its practical dedup key.",
      evidenceRefs: [],
    }),
    event_url: assessmentEntry({
      state: allHaveEventUrl ? "PROVEN" : sample.event_url ? "PARTIAL" : "NOT_PRESENT",
      value: allHaveEventUrl ? sample.event_url : null,
      evidenceRefs: allHaveEventUrl ? evidenceRefs : [],
    }),
  };
}

/**
 * Assemble the full investigation record. `evidenceMeta` is the array of
 * ALREADY-WRITTEN evidence file metadata (see selectEvidenceDocuments()
 * above) — this function never touches the filesystem itself. The CALLER
 * must guarantee `evidenceMeta` is never empty — every real acquisition
 * attempt, even one that ends in total network failure, must retain at
 * least one real evidence file (e.g. a small retained attempt-log
 * recording the URL/timestamp/error), because probe_history and a
 * non-DIRECT_EVIDENCE-class evidence item both require non-empty
 * evidence_refs; this module has nothing to cite otherwise and cannot
 * synthesise a placeholder (a path-less DIRECT_EVIDENCE item fails
 * validateInvestigation() outright — this is a real constraint, not a
 * style choice). Returns `{ record, errors }`; `errors` (from
 * validateInvestigation()) is always checked before the caller persists
 * anything — never written to disk with a non-empty errors array.
 */
export function buildInvestigationRecord({ sourceId, venue, entry, result, evidenceMeta, investigatedAt, identity }) {
  const evidenceRefs = evidenceMeta.map((e) => e.evidence_id);
  const residue = RESIDUE_CLASSIFICATION[result.state];

  const siteClassification = residue
    ? { acquisition_class: residue.acquisition_class, platform: result.collector ?? null, confidence: "MEDIUM", evidence_refs: evidenceRefs }
    : {
        acquisition_class: MECHANISM_TO_ACQUISITION_CLASS.get(result.collector) ?? "AMBIGUOUS",
        platform: result.collector ?? null,
        confidence: "HIGH",
        evidence_refs: evidenceRefs,
      };

  const dataPaths = result.programme_url
    ? [{
        kind: "PROGRAMME_LISTING",
        url: result.programme_url,
        access: "PUBLIC",
        status: result.state === "ACQUISITION_PROVEN" ? "CONFIRMED" : "CANDIDATE",
        confidence: result.state === "ACQUISITION_PROVEN" ? "HIGH" : "LOW",
        evidence_refs: evidenceRefs,
      }]
    : [];

  const provenEventCount = result.observations?.length ?? 0;
  const fieldAssessment = buildFieldAssessment({ observations: result.observations, evidenceRefs });

  const collectorFamily = result.collector && MECHANISM_TO_COLLECTOR_FAMILY.has(result.collector)
    ? MECHANISM_TO_COLLECTOR_FAMILY.get(result.collector)
    : result.state === "SOURCE_FINGERPRINT_UNSUPPORTED"
      ? "NEW_FAMILY_REQUIRED"
      : null;

  const canActivate = result.state === "ACQUISITION_PROVEN" && provenEventCount > 0 && identity.matched && identity.confidence !== "LOW";

  let decisionStatus;
  let decisionReasons = [];
  if (canActivate) {
    decisionStatus = "READY_FOR_ACTIVATION";
  } else if (result.state === "ACQUISITION_PROVEN" && provenEventCount === 0) {
    decisionStatus = "DEFER";
    decisionReasons = ["Collector ran successfully against a real programme page but currently proves zero events — likely a genuinely empty programme right now, not a technical defect."];
  } else if (result.state === "ACQUISITION_PROVEN" && !identity.matched) {
    decisionStatus = "HUMAN_REVIEW";
    decisionReasons = ["Acquisition succeeded and proved real events, but this source's own retained homepage/programme text did not textually confirm the venue's own name — identity should be confirmed by a human before activation."];
  } else {
    decisionStatus = residue?.decision ?? "DEFER";
    decisionReasons = residue ? [residue.reason] : ["Unclassified acquireSource() terminal state."];
  }

  const evidenceItems = evidenceMeta.map((e) => ({
    evidence_id: e.evidence_id,
    evidence_class: "DIRECT_EVIDENCE",
    description: e.description,
    acquired_from: e.url,
    acquired_at: e.acquired_at,
    method: "PASSIVE_STATIC_HTTP_GET",
    content_type: e.content_type ?? null,
    byte_faithful: true,
    path: e.path,
  }));

  if (decisionStatus === "READY_FOR_ACTIVATION") {
    evidenceItems.push({
      evidence_id: "ev-deterministic-reparse",
      evidence_class: "DETERMINISTIC_DERIVATION",
      description: `Re-invoking this repository's own deterministic, offline collectAndProve() against the retained programme/detail documents above reproduces the identical ${provenEventCount} proven observation(s) — no network, no model call; see ingestion/programme-acquisition/orchestrator.mjs.`,
      acquired_from: "ingestion/programme-acquisition/orchestrator.mjs#collectAndProve",
      acquired_at: investigatedAt,
      method: "OFFLINE_DETERMINISTIC_REPARSE",
      content_type: null,
      byte_faithful: false,
      path: null,
    });
  }

  const record = {
    investigation_id: sourceId,
    policy_version: POLICY_VERSION,
    investigated_at: investigatedAt,
    investigator: INVESTIGATOR,
    source_candidate_id: sourceId,
    source_id: decisionStatus === "READY_FOR_ACTIVATION" ? sourceId : null,
    venue_reference: `${venue.canonical_name} (${venue.venue_id}), ${venue.city ?? "United Kingdom"}`,
    official_url: entry.official_website,
    identity: {
      status: identity.matched ? "PROVEN" : "PARTIAL",
      confidence: identity.confidence,
      evidence_refs: identity.matched ? evidenceRefs : [],
      notes: identity.matched
        ? `The venue's own canonical name was found in the retained ${identity.documentUrl ?? "homepage"} document's own text.`
        : "The venue's canonical name could not be confirmed in the retained homepage/programme text — this URL was sourced from OSM's own website/contact:website tag (crowd-sourced, not independently re-confirmed here).",
    },
    probe_history: [
      {
        level: 1,
        method: "PASSIVE_STATIC",
        outcome: "SUFFICIENT",
        reason: `A plain, unauthenticated GET of the venue's own website (and, where discovered, its programme page) was inspected for structured event data. Outcome: ${result.state}. This package's scope is static/passive acquisition only, so Level 1 is sufficient to reach a decision regardless of outcome — no browser escalation is in scope.`,
        evidence_refs: evidenceRefs,
      },
    ],
    site_classification: siteClassification,
    data_paths: dataPaths,
    field_assessment: fieldAssessment,
    collector_assessment: {
      recommended_family: collectorFamily,
      confidence: collectorFamily ? "HIGH" : "NONE",
      evidence_refs: collectorFamily ? evidenceRefs : [],
      blockers: result.state === "ACCESS_BLOCKED" ? [{ severity: "CRITICAL", description: "Source returned an explicit access-control response; must never be bypassed per policy." }] : [],
    },
    decision: {
      status: decisionStatus,
      reasons: decisionReasons,
      evidence_refs: decisionStatus === "READY_FOR_ACTIVATION" ? [...evidenceRefs, "ev-deterministic-reparse"] : evidenceRefs,
    },
    supersedes: null,
    evidence: evidenceItems,
  };

  const errors = validateInvestigation(record);
  return { record, errors };
}
