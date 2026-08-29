import { extractEmbeddedState } from "../browser-resolution/classify.mjs";
import { toObservations } from "../json-ld/observation-adapter.mjs";

function embeddedProgrammeStates(document) {
  return extractEmbeddedState(document?.body, { sourcePageUrl: document?.url, maxEventTuples: 100 })
    .filter((state) => state.state === "EMBEDDED_PROGRAMME_STATE_PROVEN");
}

/** Convert only structurally proven embedded event tuples into generic records. */
export function collectEmbeddedStateEvents(document, { sourceId, venueName, cutoffDate } = {}) {
  const cutoff = cutoffDate ?? new Date().toISOString().slice(0, 10);
  const states = embeddedProgrammeStates(document);
  const tuples = states.flatMap((state) => state.event_tuples ?? []);
  const records = tuples.map((tuple) => ({
    source_record_id: tuple.source_record_id ?? tuple.event_url,
    title: tuple.title,
    start_raw: tuple.start_raw,
    end_raw: tuple.end_raw ?? null,
    event_url: tuple.event_url ?? null,
    ticket_url: tuple.ticket_url ?? null,
    types: tuple.types ?? [],
    raw: tuple,
  })).filter((record) => record.source_record_id && record.title && /^\d{4}-\d{2}-\d{2}/.test(record.start_raw ?? "") && record.start_raw.slice(0, 10) >= cutoff);
  const unique = [...new Map(records.map((record) => [record.source_record_id, record])).values()];
  return {
    records: unique,
    observations: toObservations(unique, { source_id: sourceId }, { retrievedAt: document?.at, sourceUrl: document?.url, venueNameOverride: venueName }),
    routing_provenance: {
      detected_state_mechanisms: [...new Set(states.map((state) => state.mechanism))],
      event_like_record_count: states.reduce((total, state) => total + (state.event_like_record_count ?? 0), 0),
      inspected_embedded_record_count: tuples.length,
      event_record_requirement_count: records.length,
    },
  };
}

/** Return same-origin event URLs actually declared by structurally proven embedded records. */
export function discoverEmbeddedStateDetailLinks(document, { limit = 40 } = {}) {
  if (!document?.url) return [];
  const origin = new URL(document.url).origin;
  const links = embeddedProgrammeStates(document).flatMap((state) => state.event_tuples ?? []).flatMap((tuple) => {
    if (!tuple.event_url) return [];
    try {
      const url = new URL(tuple.event_url, document.url);
      url.hash = "";
      return url.origin === origin ? [{ url: url.href, text: tuple.title ?? "", role: "EMBEDDED_STATE_EVENT_DETAIL_CANDIDATE" }] : [];
    } catch { return []; }
  });
  return [...new Map(links.map((link) => [link.url, link])).values()].slice(0, limit);
}
