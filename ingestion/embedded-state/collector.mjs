import { extractEmbeddedState } from "../browser-resolution/classify.mjs";
import { toObservations } from "../json-ld/observation-adapter.mjs";

/** Convert only structurally proven embedded event tuples into generic records. */
export function collectEmbeddedStateEvents(document, { sourceId, venueName, cutoffDate } = {}) {
  const cutoff = cutoffDate ?? new Date().toISOString().slice(0, 10);
  const tuples = extractEmbeddedState(document?.body, { sourcePageUrl: document?.url, maxEventTuples: 100 })
    .filter((state) => state.state === "EMBEDDED_PROGRAMME_STATE_PROVEN")
    .flatMap((state) => state.event_tuples ?? []);
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
  return { records: unique, observations: toObservations(unique, { source_id: sourceId }, { retrievedAt: document?.at, sourceUrl: document?.url, venueNameOverride: venueName }) };
}
