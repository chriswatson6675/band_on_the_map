import { fingerprintProgrammeSurface, routeCollectorCapability } from "../venue-discovery/programme-fingerprint.mjs";
import { extractProgrammeLinks, extractJsonLdEventLinks, proveJsonLdEvents } from "./discovery.mjs";
import { proveCanonicalDetailEvents } from "./offline-proof.mjs";
import { proofDateFromStartDate } from "./proof-date.mjs";
import { collectEmbeddedStateEvents, discoverEmbeddedStateDetailLinks } from "../embedded-state/collector.mjs";
import { collectStaticCardEvents } from "../static-cards/collector.mjs";

const RESIDUE_BY_MECHANISM = {
  ACCESS_BLOCKED: "ACCESS_BLOCKED",
  CLIENT_RENDERED_UNKNOWN: "BROWSER_REQUIRED",
  SOCIAL_FIRST_PROGRAMME: "SOCIAL_FIRST_PROGRAMME",
  IMAGE_OR_POSTER_PROGRAMME: "IMAGE_OR_POSTER_ONLY",
  NO_CURRENT_PROGRAMME_FOUND: "PROGRAMME_EMPTY",
};

function uniqueLinks(...lists) {
  return [...new Map(lists.flat().map((link) => [link.url, link])).values()];
}

/** Pure, hostname-free source routing from retained programme evidence. */
export function routeProgrammeSource(programme) {
  const fingerprint = fingerprintProgrammeSurface({
    body: programme?.body,
    url: programme?.url,
    content_type: programme?.content_type,
    status: programme?.status,
    links: programme?.links,
  });
  const routes = fingerprint.detected_mechanisms.map((mechanism) => ({ mechanism, collector_route: routeCollectorCapability(mechanism) }));
  const selected = routes.find((route) => ["EXISTING_COLLECTOR_ZERO_CODE", "CONFIGURATION_ONLY"].includes(route.collector_route)) ?? routes[0] ?? null;
  return { fingerprint, routes, selected, residue_state: selected ? (RESIDUE_BY_MECHANISM[selected.mechanism] ?? null) : "PROGRAMME_SOURCE_UNRESOLVED" };
}

/**
 * Run the existing family-dispatch chain (embedded state -> usable static
 * cards -> JSON-LD) exactly once, shared by collectAndProve() (which also
 * folds in already-fetched detail_documents, needed for link-discovery-style
 * sources whose own per-event JSON-LD lives only on the detail page) and
 * deriveProgrammeLevelEventRecords() (candidate discovery, called BEFORE any
 * detail document exists, so it only ever sees `documents: [programme]`).
 * One function, one dispatch order — collectAndProve's own proof/observation
 * computation is unchanged by this extraction; see BEATMAPPED-DETAIL-
 * CANDIDATE-SELECTION-COVERAGE-01's own FINAL REPORT.
 */
function deriveEventRecords(programme, documents, { source_id, venue_name } = {}) {
  const routing = routeProgrammeSource(programme);
  if (!routing.selected || routing.residue_state) return { routing, jsonLd: null, embedded: null, usableStaticCards: null };
  const embedded = /^EMBEDDED_|OTHER_EMBEDDED_APP_STATE$/.test(routing.selected.mechanism)
    ? collectEmbeddedStateEvents(programme, { sourceId: source_id, venueName: venue_name, cutoffDate: programme.at?.slice(0, 10) })
    : null;
  const staticCards = routing.selected.mechanism === "STATIC_HTML_CARDS"
    ? collectStaticCardEvents(programme, { sourceId: source_id, venueName: venue_name, cutoffDate: programme.at?.slice(0, 10) })
    : null;
  // BEATMAPPED-STATIC-CARD-EMPTY-FALLBACK-CORRECTION-01: "the collector
  // RAN" and "the collector produced usable records" are different facts.
  // collectStaticCardEvents() always returns a result object -- even when
  // it accepted nothing -- so coalescing on the object itself made an
  // EMPTY static-card result authoritative and left the pre-existing
  // deterministic detail-document/JSON-LD path unreachable for every
  // STATIC_HTML_CARDS surface. That silently regressed sources whose
  // events are only present on their detail documents (b-flat-berlin:
  // 59 card candidates inspected, 0 accepted, and no JSON-LD Event nodes
  // on the programme page at all). Only a static-card result that
  // actually carries records may win the chain.
  const usableStaticCards = staticCards?.records.length ? staticCards : null;
  const jsonLd = embedded ?? usableStaticCards ?? proveJsonLdEvents(documents, { sourceId: source_id, venueName: venue_name, retrievedAt: programme.at, cutoffDate: programme.at?.slice(0, 10) });
  return { routing, jsonLd, embedded, usableStaticCards };
}

/**
 * Execute existing generic structured collectors against already-retained
 * programme/detail documents, then automatically apply canonical-detail
 * offline proof. It never guesses a route or an event field.
 */
export function collectAndProve({ source_id, venue_name, programme, detail_documents = [] } = {}) {
  const documents = [programme, ...detail_documents].filter((document) => typeof document?.body === "string");
  const { routing, jsonLd, embedded, usableStaticCards } = deriveEventRecords(programme, documents, { source_id, venue_name });
  if (!routing.selected || routing.residue_state) return { ...routing, state: routing.residue_state ?? "SOURCE_FINGERPRINT_UNSUPPORTED", observations: [], proofs: [], residue: true };
  const proofs = proveCanonicalDetailEvents(detail_documents, { cutoffDate: programme.at?.slice(0, 10) });
  const proofIds = new Set(proofs.map((proof) => proof.source_record_id));
  const provenRecordIds = new Set(jsonLd.records.filter((record) => proofIds.has(record.source_record_id) || proofs.some((proof) => proof.event_url === record.event_url)).map((record) => record.source_record_id));
  const observations = jsonLd.observations.filter((observation) => provenRecordIds.has(observation.source_record_id));
  const state = observations.length ? "ACQUISITION_PROVEN" : jsonLd.records.length ? "STABLE_IDENTITY_PROOF_FAILED" : "SUPPORTED_COLLECTOR_NO_VALID_EVENTS";
  return { ...routing, state, observations, records: jsonLd.records, proofs, collector_provenance: embedded?.routing_provenance ?? usableStaticCards?.routing_provenance ?? null, residue: state !== "ACQUISITION_PROVEN" };
}

// A fixed, internal-only placeholder — never persisted, never surfaced to
// any caller. deriveProgrammeLevelEventRecords() only ever reads back
// `.records` (event_url/title/start_raw), never `.observations`, so the
// sourceId/venueName threaded into the underlying collectors here has no
// effect on its return value; it exists only because proveJsonLdEvents()
// requires a truthy sourceId to run at all.
const CANDIDATE_DISCOVERY_PLACEHOLDER_SOURCE_ID = "BEATMAPPED-DETAIL-CANDIDATE-SELECTION-COVERAGE-01_CANDIDATE_DISCOVERY";

/**
 * Bounded, first-party event records the programme document's OWN
 * structured data (JSON-LD, embedded app state, or accepted static cards)
 * already yields — computed from the programme document ALONE, before any
 * detail document has been fetched. Returns `[]` for a source whose
 * programme page carries no such structure (e.g. a pure link-listing page
 * whose events only exist as per-event detail pages) — that is an honest,
 * expected empty result, not an error; discoverDetailCandidates() below
 * falls back entirely to the pre-existing link-based discovery in that case.
 */
export function deriveProgrammeLevelEventRecords(programme) {
  if (typeof programme?.body !== "string") return [];
  const { jsonLd } = deriveEventRecords(programme, [programme], { source_id: CANDIDATE_DISCOVERY_PLACEHOLDER_SOURCE_ID, venue_name: null });
  return jsonLd?.records ?? [];
}

/** Resolve one normalized record's own event_url to an absolute URL, the
 * same relative-to-document-url resolution discovery.mjs's own eventUrl()
 * already performs — never inventing/guessing a URL the record itself did
 * not carry. */
function resolveRecordCandidateUrl(record) {
  if (typeof record?.event_url !== "string" || !record.event_url.trim()) return null;
  try {
    const url = new URL(record.event_url, record.source_document_url ?? record.event_url);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

/**
 * BEATMAPPED-DETAIL-CANDIDATE-SELECTION-COVERAGE-01 — bounded, first-party,
 * deterministically-ordered detail candidates derived from already-
 * normalized event records, rather than raw page links. Reuses the exact
 * same first-party restriction discovery.mjs's extractJsonLdEventLinks()
 * already applies (same-origin, http(s) only) and excludes the degenerate
 * "record published no url at all" fallback case (whose resolved value
 * would just be the programme page itself). Never constructs a URL a
 * record did not already carry — see docs/SOURCE_INVESTIGATION_POLICY.md's
 * "must never invent a missing fact" principle, which this measurement-
 * driven package treats as governing even though it is engineering work on
 * an already-active source, not a new-source investigation.
 *
 * Ordering is deterministic and clock-independent: ascending by the
 * record's own proven cutoff-date (soonest first — the same
 * `proofDateFromStartDate` the proof layer already uses, not a new date
 * reading), tie-broken by the record's original discovery order. Never
 * depends on runtime randomness, network timing, or the wall clock beyond
 * the existing event cutoff already baked into `records` themselves.
 *
 * Measured on the Berlin cohort (see this package's own evidence under
 * research/source-investigations/beatmapped-detail-candidate-selection-
 * coverage-01/evidence/): this is what lets already-normalized events that
 * were simply never among the first 12 raw links discovered (Tempodrom,
 * A-Trane) — or events whose only "candidates" under the old scan were
 * pagination/search/editor links entirely disjoint from any real event
 * page (Konzerthaus) — become reachable within the SAME 12-fetch budget.
 */
function deterministicRecordCandidates(records, programmeUrl) {
  let origin;
  try {
    origin = new URL(programmeUrl).origin;
  } catch {
    return [];
  }
  const eligible = [];
  records.forEach((record, index) => {
    const abs = resolveRecordCandidateUrl(record);
    if (!abs) return;
    let parsed;
    try {
      parsed = new URL(abs);
    } catch {
      return;
    }
    if (!/^https?:$/.test(parsed.protocol) || parsed.origin !== origin || abs === programmeUrl) return;
    eligible.push({ url: abs, text: record.title ?? "", role: "NORMALIZED_RECORD_EVENT_URL_CANDIDATE", date: proofDateFromStartDate(record.start_raw), index });
  });
  eligible.sort((a, b) => {
    if (a.date !== b.date) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? -1 : 1;
    }
    return a.index - b.index;
  });
  return eligible.map(({ url, text, role }) => ({ url, text, role }));
}

/**
 * Derive bounded generic detail candidates from a retained programme
 * document. Prefers candidates already anchored to a normalized event
 * record (deterministic date order — see deterministicRecordCandidates()),
 * then fills any remaining budget with the pre-existing raw-link discovery
 * (anchor scan, JSON-LD-declared links, embedded-state links) — unchanged
 * dedupe (uniqueLinks(), first-occurrence-wins) and unchanged final
 * `limit`. A source whose programme page yields no normalized records at
 * all (e.g. b-flat-berlin, whose events live only on per-event detail
 * pages the programme page never embeds JSON-LD or accepted static cards
 * for) falls back to EXACTLY the prior link-only behaviour — this never
 * removes a candidate the old algorithm would have found, and never
 * increases the total candidate count beyond `limit`.
 */
export function discoverDetailCandidates(programme, { limit = 40 } = {}) {
  const linkCandidates = uniqueLinks(
    extractProgrammeLinks(programme.body, { baseUrl: programme.url, limit }),
    extractJsonLdEventLinks(programme.body, { baseUrl: programme.url, limit }),
    discoverEmbeddedStateDetailLinks(programme, { limit }),
  );
  const recordCandidates = deterministicRecordCandidates(deriveProgrammeLevelEventRecords(programme), programme.url);
  return uniqueLinks(recordCandidates, linkCandidates).slice(0, limit);
}
