// Converts genuinely retrieved Coliseu Porto Ageas GraphQL `Event` nodes
// (ingestion/coliseu-porto/client.mjs's parseEventsResponse()) into the
// generic Observation contract (ingestion/observation/contract.mjs).
//
// Source: Coliseu Porto Ageas, EXISTING registry id "coliseu-do-porto"
// (sources/porto.json — this module only reads that id as a string
// constant; it never edits the registry file itself).
//
// Built ENTIRELY from the already-retained, READY_FOR_ACTIVATION
// investigation at
// research/source-investigations/coliseu-ageas-porto-01/investigation.json.
// Every mapping decision below cites that investigation's own
// field_assessment rather than inventing a stronger guarantee:
//
//   - start: `startDate` is a genuine UTC ISO instant (proven, ends in
//     "Z" — e.g. "2026-09-12T20:00:00.000Z"), so certainty is honestly
//     "UTC_INSTANT", not inferred.
//   - end: field_assessment.end.state is "PARTIAL", NOT "PROVEN" — the
//     source's own `estimatedDuration` field is explicitly named
//     "estimated", not an authoritative scheduled end. This adapter
//     deliberately does NOT derive an `end` datetime from it (that would
//     overstate the certainty the investigation actually found); the raw
//     seconds value is retained only as informational provenance in
//     `source_fields.estimatedDuration_seconds`, never promoted into the
//     `end` field.
//   - venue_location / location_text: the source has no separate venue
//     address field (Room type carries only id/name — see
//     evidence/body-graphql-roomtype.json); `room.name` names a space
//     within the already-identified single venue, so `location_text` is
//     set to it directly, while `venue_name` stays null (this source
//     covers exactly one physical venue; canonical Venue resolution by
//     source_id is a separate concern, not this adapter's job — matching
//     the existing Casa da Música/LAV "room is not a separate venue"
//     precedent).
//   - source_record_id: the GraphQL `id` field, proven empirically stable
//     (2/2 cross-query-path matches — see investigation.json
//     field_assessment.source_record_id).
//   - price_text: always null. field_assessment.price.state is
//     "NOT_PRESENT" — no price/cost field exists anywhere in the source's
//     full 179-type GraphQL schema, mechanically confirmed by
//     evidence/offline-proof-output.txt Step 5.
//   - event_url: deterministically constructed as
//     https://www.coliseu.pt/evento/{slug}, the exact route pattern found
//     verbatim in the retained main JS bundle and confirmed to resolve
//     200 OK (field_assessment.event_url, state "PROVEN").
//   - ticketsSeller/ticketsUrl/category/promoter/minimumAge are retained
//     verbatim in source_fields for provenance only — never promoted into
//     a stronger canonical field than the investigation proved (in
//     particular, ticketsUrl is NOT treated as a usable absolute URL: the
//     investigation's collector_assessment.blockers records it as
//     inconsistently relative/absolute across sampled events).

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "coliseu-do-porto";

const DEFAULT_CONTENT_TYPE = "application/json; charset=utf-8";
const EVENT_DETAIL_BASE_URL = "https://www.coliseu.pt/evento/";

const GRAPHQL_UTC_INSTANT_RE = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

/**
 * Parse this source's own GraphQL `DateTime` scalar text (proven to be a
 * genuine UTC ISO instant ending in "Z" on every sampled event) into
 * `{ date, iso }`, or null if the text does not match that exact,
 * confirmed-UTC shape — never guessed. Exported for direct unit testing.
 */
export function parseColiseuUtcInstant(isoText) {
  if (typeof isoText !== "string") return null;
  const match = GRAPHQL_UTC_INSTANT_RE.exec(isoText.trim());
  if (!match) return null;
  return { date: match[1], iso: isoText.trim() };
}

function deriveStart(isoText) {
  const dt = emptyDateTime();
  dt.raw = isoText ?? null;
  const parsed = parseColiseuUtcInstant(isoText);
  if (!parsed) {
    dt.certainty = dt.raw ? "TEXT_ONLY" : "UNKNOWN";
    return dt;
  }
  dt.date = parsed.date;
  dt.iso = parsed.iso;
  dt.is_utc = true;
  dt.certainty = "UTC_INSTANT";
  return dt;
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function nestedName(value) {
  return isPlainObjectWithName(value) ? nonEmptyString(value.name) : null;
}

function isPlainObjectWithName(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) && "name" in value;
}

/**
 * Convert one retrieved GraphQL `Event` node into an Observation.
 */
export function toObservation(node, { retrievedAt, sourceUrl, contentType, fixturePath } = {}) {
  if (!node?.id) {
    throw new Error("toObservation requires a node with a non-empty id");
  }

  const slug = nonEmptyString(node.slug);

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: String(node.id),
    retrieved_at: retrievedAt ?? null,

    source_url: sourceUrl ?? null,
    content_type: contentType ?? DEFAULT_CONTENT_TYPE,

    title: nonEmptyString(node.name),
    description: null, // not requested/proven by this collector's query — never fabricated

    start: deriveStart(node.startDate),
    // Deliberately NOT derived from estimatedDuration — see module doc
    // comment. field_assessment.end is PARTIAL, not PROVEN; estimatedDuration
    // is retained only as informational provenance in source_fields below.
    end: emptyDateTime(),

    venue_name: null, // single-venue source; canonical Venue resolved by source_id elsewhere, never fabricated per-record
    location_text: nestedName(node.room),

    price_text: null, // NOT_PRESENT — no price/cost field exists anywhere in this source's GraphQL schema

    event_url: slug ? `${EVENT_DETAIL_BASE_URL}${slug}` : null,

    source_fields: {
      slug,
      room: nestedName(node.room),
      category: nestedName(node.category),
      promoter: nestedName(node.promoter),
      ticketsSeller: nonEmptyString(node.ticketsSeller),
      ticketsUrl: nonEmptyString(node.ticketsUrl),
      minimumAge: nonEmptyString(node.minimumAge),
      estimatedDuration_seconds: typeof node.estimatedDuration === "number" ? node.estimatedDuration : null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: contentType ?? DEFAULT_CONTENT_TYPE,
      byte_faithful: false, // parsed from a shared, potentially-paginated GraphQL response, not a per-record raw response
    },
  });
}

/**
 * Convert every node already parsed from one events-query fetch
 * (ingestion/coliseu-porto/client.mjs's parseEventsResponse()) into
 * Observations, sharing one retrieval timestamp/source URL/fixture path.
 */
export function toObservations(nodes, options = {}) {
  return (nodes ?? []).map((node) => toObservation(node, options));
}
