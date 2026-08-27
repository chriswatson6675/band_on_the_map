// Generic, dependency-free GraphQL-events request/response helpers for the
// "GRAPHQL_API" collector family. This module is deliberately written to
// be genuinely reusable by a future source that also exposes a public,
// read-only, GET-based GraphQL events API — it never references Coliseu,
// Porto, or any other venue name in its exported function/constant names.
// Only the query string built by buildEventsQueryUrl() (and the endpoint
// constant) are specific to this one proven source; a second consumer of
// this collector family would supply its own endpoint/query shape rather
// than reusing this file's internals directly.
//
// Proven against, and built ENTIRELY from, the already-retained,
// READY_FOR_ACTIVATION investigation at
// research/source-investigations/coliseu-ageas-porto-01/investigation.json
// (site_classification.acquisition_class: PUBLIC_JSON_API,
// collector_assessment.recommended_family: JSON_API — a public, CORS-open
// GraphQL API discovered via the site's own public /env-config.js). No
// live network request was made to build this module; every claim below
// is backed by that investigation's retained evidence, in particular:
//   - evidence/body-graphql-eventsfield.json (the `events` query's own
//     `paging`/`filter`/`sorting` argument shape — OffsetPaging with
//     limit/offset, EventFilter, a sorting list)
//   - evidence/body-graphql-events-sample.json (a real, retained 5-event
//     response in the exact `{data:{events:{totalCount,nodes}}}` shape
//     parsed below)
//   - evidence/headers-graphql-events-sample.txt (the real response's own
//     headers: 200 OK, application/json, Access-Control-Allow-Origin: *)
//   - evidence/body-graphql-eventtype.json (the Event type's full field
//     list — informs exactly which fields are requested below)
//
// Two responsibilities live here, and only here (matching this project's
// existing client.mjs convention — see
// ingestion/events-calendar-api/client.mjs): (1) building the request URL
// from paging arguments, and (2) parsing an already-fetched response body
// into a normalized `{ totalCount, nodes }` shape. Live HTTP
// acquisition/pagination-following is a SEPARATE concern, left to a future
// collector loop that calls this module — so this module is fully
// unit-testable with zero network access.

// The discovered, public, CORS-open GraphQL endpoint
// (research/source-investigations/coliseu-ageas-porto-01/investigation.json
// data_paths[1], evidence/body-env-config.js). Read-only GraphQL queries
// are sent as plain GETs with a `query` query-string parameter — proven by
// evidence/body-graphql-events-sample.txt's own retained request shape
// (curl -G --data-urlencode "query=...").
export const EVENTS_ENDPOINT = "https://nest.coliseu.pt/graph/";

// The exact field selection this collector requests on the `Event` type,
// taken directly from the investigation's field_assessment: id/name/slug/
// startDate are PROVEN; estimatedDuration/ticketsSeller/ticketsUrl/
// minimumAge/category/room/promoter are retained for provenance (see
// ingestion/coliseu-porto/observation-adapter.mjs for how each is used).
// No price/cost field is requested because none exists anywhere in the
// source's own 179-type schema (evidence/body-graphql-schema-types.json).
const EVENTS_FIELD_SELECTION =
  "totalCount nodes{id name slug startDate estimatedDuration ticketsSeller ticketsUrl minimumAge category{name} room{name} promoter{name}}";

/**
 * Build the exact GET request URL for one bounded page of upcoming,
 * visible, non-archived events, sorted by startDate ascending — the same
 * paging/sorting/filter argument shape retained in
 * evidence/body-graphql-events-sample.json's own `method` field. Never
 * consults the system clock or applies any implicit "now" — the source's
 * own `isVisible`/`isArchived` filter (not a date-window filter) is what
 * bounds the result to current/future programme, matching what the
 * investigation actually proved, not a broader assumption.
 *
 * `limit` (required) — a positive integer, the page size (OffsetPaging.limit).
 * `offset` (optional, default 0) — a non-negative integer (OffsetPaging.offset).
 */
export function buildEventsQueryUrl({ limit, offset = 0 } = {}) {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("buildEventsQueryUrl requires a positive integer limit");
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new Error("buildEventsQueryUrl requires a non-negative integer offset");
  }

  const query =
    `query{events(paging:{limit:${limit},offset:${offset}},` +
    `sorting:[{field:startDate,direction:ASC}],` +
    `filter:{isVisible:{is:true},isArchived:{is:false}}){${EVENTS_FIELD_SELECTION}}}`;

  const url = new URL(EVENTS_ENDPOINT);
  url.searchParams.set("query", query);
  return url.toString();
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse one already-fetched GraphQL response body (a JSON string) into
 * `{ totalCount, nodes }`. `nodes` is the RAW array of event objects
 * exactly as the API returned them — per-record normalization into an
 * Observation is a separate step (see
 * ingestion/coliseu-porto/observation-adapter.mjs), so a caller inspecting
 * a parsing failure always sees the source's own original shape.
 *
 * Throws (never silently returns an empty page, never guesses a shape)
 * on: invalid JSON, a top-level value that isn't an object, a GraphQL
 * `errors` array reported by the server, or a well-formed JSON body that
 * does not carry a `data.events.{totalCount,nodes}` shape at all. A
 * genuinely empty `nodes: []` array with a valid `totalCount` is a
 * legitimate, different, non-throwing case (the last page), never
 * conflated with a malformed response.
 */
export function parseEventsResponse(jsonText) {
  if (typeof jsonText !== "string" || jsonText.trim() === "") {
    throw new Error("parseEventsResponse requires a non-empty response body string");
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Coliseu events GraphQL response body is not valid JSON: ${error.message}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error("Coliseu events GraphQL response body did not parse to a JSON object");
  }

  if (Array.isArray(parsed.errors) && parsed.errors.length > 0) {
    const messages = parsed.errors
      .map((e) => (isPlainObject(e) && typeof e.message === "string" ? e.message : JSON.stringify(e)))
      .join("; ");
    throw new Error(`Coliseu events GraphQL response reported errors: ${messages}`);
  }

  const events = parsed?.data?.events;
  if (!isPlainObject(events) || !Array.isArray(events.nodes) || typeof events.totalCount !== "number") {
    throw new Error('Coliseu events GraphQL response body has no well-formed "data.events.{totalCount,nodes}" shape');
  }

  return { totalCount: events.totalCount, nodes: events.nodes };
}
