// BARCELONA-30-VENUE-POPULATION-01 — network acquisition for the
// Fourvenues client (./client.mjs). This is the ONLY module in this
// family that performs network I/O — client.mjs stays pure/offline
// -testable, matching ingestion/events-calendar-api/'s own
// fetch-all.mjs/client.mjs split.
//
// Failure isolation: a fetch or parse failure is thrown, never converted
// into a silently empty, falsely-successful result — the caller (a
// per-venue collector in ingestion/barcelona/run.mjs) decides how to
// report that.

import { fetchText } from "../http/fetch.mjs";
import { buildEventsUrl, parseEventsResponse, normalizeEventRecord } from "./client.mjs";

/**
 * Fetch and normalize every event Fourvenues returns for one configured
 * organizer within `config`'s optional start/end window (see
 * client.mjs's buildEventsUrl() — pass a wide window to reach the
 * source's full future horizon in this one request; the platform has no
 * documented pagination pointer in real retained samples).
 *
 * `fetchImpl(url, { timeoutMs })` — injectable, defaulting to the shared
 * fetchText() helper; tests always supply a fixture-backed fake here.
 *
 * Returns `{ records, retrievedAt, sourceUrl }`. Throws on a non-2xx HTTP
 * response or a malformed body — never silently returns an empty list
 * for those cases.
 */
export async function fetchFourvenuesEvents(config, { fetchImpl = fetchText, timeoutMs } = {}) {
  const url = buildEventsUrl(config);
  const response = await fetchImpl(url, { timeoutMs, headers: { Accept: "application/json" } });
  if (!response.ok) {
    throw new Error(`Fourvenues request failed with HTTP ${response.status} from ${url}`);
  }
  const rawEvents = parseEventsResponse(response.text);
  return {
    records: rawEvents.map(normalizeEventRecord),
    retrievedAt: response.retrievedAt,
    sourceUrl: url,
  };
}
