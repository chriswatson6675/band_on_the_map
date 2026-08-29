import { fingerprintProgrammeSurface, routeCollectorCapability } from "../venue-discovery/programme-fingerprint.mjs";
import { extractProgrammeLinks, extractJsonLdEventLinks, proveJsonLdEvents } from "./discovery.mjs";
import { proveCanonicalDetailEvents } from "./offline-proof.mjs";

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
 * Execute existing generic structured collectors against already-retained
 * programme/detail documents, then automatically apply canonical-detail
 * offline proof. It never guesses a route or an event field.
 */
export function collectAndProve({ source_id, venue_name, programme, detail_documents = [] } = {}) {
  const routing = routeProgrammeSource(programme);
  if (!routing.selected || routing.residue_state) return { ...routing, state: routing.residue_state ?? "SOURCE_FINGERPRINT_UNSUPPORTED", observations: [], proofs: [], residue: true };
  const documents = [programme, ...detail_documents].filter((document) => typeof document?.body === "string");
  const jsonLd = proveJsonLdEvents(documents, { sourceId: source_id, venueName: venue_name, retrievedAt: programme.at, cutoffDate: programme.at?.slice(0, 10) });
  const proofs = proveCanonicalDetailEvents(detail_documents, { cutoffDate: programme.at?.slice(0, 10) });
  const proofIds = new Set(proofs.map((proof) => proof.source_record_id));
  const observations = jsonLd.observations.filter((observation) => proofIds.has(observation.source_record_id));
  const state = observations.length ? "ACQUISITION_PROVEN" : jsonLd.records.length ? "STABLE_IDENTITY_PROOF_FAILED" : "SUPPORTED_COLLECTOR_NO_VALID_EVENTS";
  return { ...routing, state, observations, records: jsonLd.records, proofs, residue: state !== "ACQUISITION_PROVEN" };
}

/** Derive bounded generic detail candidates from a retained programme document. */
export function discoverDetailCandidates(programme, { limit = 40 } = {}) {
  return uniqueLinks(
    extractProgrammeLinks(programme.body, { baseUrl: programme.url, limit }),
    extractJsonLdEventLinks(programme.body, { baseUrl: programme.url, limit }),
  ).slice(0, limit);
}
