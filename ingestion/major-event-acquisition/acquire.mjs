// BEATMAPPED-UK-MAJOR-EVENT-ACQUISITION-TIER1-01 — Phases 2-7.
//
// Acquires real events from the frozen census's READY_TIER1 calendar
// sources using ONLY the repository's existing deterministic collectors:
//
//   JSON_LD_EVENT       -> ingestion/json-ld/
//   WORDPRESS_TRIBE_API -> ingestion/events-calendar-api/
//
// No new collector is built here. Where an existing collector cannot
// produce a valid record, that is reported as a terminal state, never
// patched around — a lower event count is an honest result; a higher one
// obtained by weakening proof is not.
//
// What this module deliberately does NOT do:
//   - create canonical Event identity (Observations only)
//   - deduplicate across sources or records
//   - infer an event's domain from its venue's type
//   - invent performers, teams or organisers for non-music events
//   - fabricate a timezone or promote a floating local time to UTC

import { extractEventNodes, normaliseJsonLdEvent } from "../json-ld/parse.mjs";
import { toObservations as jsonLdToObservations } from "../json-ld/observation-adapter.mjs";
import { fetchAllEvents } from "../events-calendar-api/fetch-all.mjs";
import { toObservations as tribeToObservations } from "../events-calendar-api/observation-adapter.mjs";
import { fetchText } from "../http/fetch.mjs";

/**
 * The schema.org Event family, widened from the collector's music-oriented
 * default because this census is deliberately multi-domain: a racecourse
 * publishes SportsEvent, a conference centre BusinessEvent, a theatre
 * TheaterEvent. Widening the `types` set is a documented option of the
 * EXISTING collector — it is configuration, not a new collector.
 *
 * `filterMusicEventNodes()` is deliberately NOT used anywhere in this
 * package: it would discard sport, conferences and exhibitions, which are
 * precisely what this census exists to cover.
 */
export const EVENT_FAMILY_TYPES = new Set([
  "Event",
  "MusicEvent",
  "SportsEvent",
  "TheaterEvent",
  "ScreeningEvent",
  "ComedyEvent",
  "DanceEvent",
  "Festival",
  "MusicFestival",
  "FoodEvent",
  "BusinessEvent",
  "EducationEvent",
  "ExhibitionEvent",
  "SocialEvent",
  "ChildrensEvent",
  "LiteraryEvent",
  "VisualArtsEvent",
  "PublicationEvent",
  "SaleEvent",
  "DeliveryEvent",
  "CourseInstance",
]);

/** Canonical terminal states — the repository's existing vocabulary. */
export const TERMINAL_STATES = new Set([
  "ACQUISITION_PROVEN",
  "NETWORK_FAILURE",
  "ACCESS_BLOCKED",
  "PROGRAMME_EMPTY",
  "SUPPORTED_COLLECTOR_NO_VALID_EVENTS",
  "STABLE_IDENTITY_PROOF_FAILED",
  "SOURCE_FINGERPRINT_UNSUPPORTED",
]);

/**
 * Stable source-record identity for a JSON-LD node.
 *
 * Uses the source's OWN event URL, which is the identity derivation the
 * repository's existing governed collectors already use (see
 * ingestion/paris, ingestion/berlin, ingestion/astra-kulturhaus). A record
 * with no URL gets NO id — it is reported as STABLE_IDENTITY_PROOF_FAILED
 * rather than given a synthetic identity. Deriving identity from
 * title+date is deliberately refused: two different fixtures on one day,
 * or one event whose title is edited, would silently collide or split.
 */
export function deriveJsonLdRecordId(node, { pageUrl } = {}) {
  const url = typeof node?.url === "string" ? node.url.trim() : "";
  if (url === "") return null;
  try {
    return new URL(url, pageUrl ?? undefined).toString();
  } catch {
    return null;
  }
}

/**
 * Classify an observation's start against the run's reference instant.
 *
 * Honest about certainty (Phase 6): a DATE_ONLY event today is still a
 * real current event and must not be discarded for lacking a time, and a
 * FLOATING_LOCAL time is never promoted to UTC to make the comparison
 * easier. Anything without a usable date is DATE_UNKNOWN, never guessed
 * into the future to inflate the yield.
 */
export function classifyTemporal(observation, referenceIso) {
  const start = observation?.start ?? {};
  const reference = referenceIso.slice(0, 10);

  if (start.certainty === "UTC_INSTANT" && typeof start.iso === "string") {
    return start.iso >= referenceIso ? "FUTURE_EVENT" : "PAST_EVENT";
  }
  // For every weaker certainty the calendar DATE is the honest granularity:
  // an event dated today has not demonstrably passed.
  if (typeof start.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(start.date)) {
    return start.date >= reference ? "FUTURE_EVENT" : "PAST_EVENT";
  }
  return "DATE_UNKNOWN";
}

/**
 * Attach census provenance to an Observation's `source_fields`.
 *
 * Done here rather than inside the shared adapters so those adapters stay
 * source-agnostic and their existing consumers are untouched. Phase 3
 * prefers source_fields over extending the Observation contract, and no
 * extension proved necessary.
 */
function withCensusProvenance(observation, entry, temporal) {
  return {
    ...observation,
    source_fields: {
      ...observation.source_fields,
      event_domain: entry.event_domain,
      census_calendar_class: entry.census_calendar_class,
      calendar_source_id: entry.calendar_source_id,
      venue_census_id: entry.venue_census_id,
      census_venue_name: entry.venue_name,
      census_city: entry.city,
      census_nation: entry.nation,
      census_venue_type: entry.venue_type,
      census_sport: entry.sport ?? null,
      source_family: entry.source_family,
      temporal_class: temporal,
      venue_attribution: classifyVenueAttribution(observation.venue_name, entry.venue_name),
    },
  };
}

const defaultFetchPage = async (url, { timeoutMs } = {}) => {
  const response = await fetchText(url, timeoutMs ? { timeoutMs } : {});
  return { ok: response.ok, status: response.status, text: response.text, contentType: response.contentType, url: response.url };
};

/** Acquire one JSON_LD_EVENT source using the existing json-ld collector. */
async function acquireJsonLd(entry, { fetchPage, retrievedAt, timeoutMs }) {
  let page;
  try {
    page = await fetchPage(entry.calendar_url, { timeoutMs });
  } catch (error) {
    const cause = error?.cause?.message ?? error?.cause?.code ?? null;
    return { state: "NETWORK_FAILURE", reason: cause ? `${error.message}: ${cause}` : String(error?.message ?? error), evidence: null, observations: [], rawRecordCount: 0 };
  }

  const evidence = {
    requested_url: entry.calendar_url,
    final_url: page.url ?? entry.calendar_url,
    retrieved_at: retrievedAt,
    http_status: page.status ?? null,
    content_type: page.contentType ?? null,
    body_bytes: typeof page.text === "string" ? page.text.length : 0,
    source_family: entry.source_family,
    collector_route: entry.collector_route,
    collector_module: "ingestion/json-ld",
  };

  if (!page.ok) {
    const blocked = page.status === 401 || page.status === 403 || page.status === 429;
    return { state: blocked ? "ACCESS_BLOCKED" : "NETWORK_FAILURE", reason: `HTTP ${page.status}`, evidence, observations: [], rawRecordCount: 0 };
  }

  const nodes = extractEventNodes(page.text, { types: EVENT_FAMILY_TYPES });
  if (nodes.length === 0) {
    return { state: "PROGRAMME_EMPTY", reason: "no schema.org Event-family JSON-LD nodes on the page", evidence, observations: [], rawRecordCount: 0 };
  }

  const records = nodes.map((node) => normaliseJsonLdEvent(node, { deriveId: (n) => deriveJsonLdRecordId(n, { pageUrl: evidence.final_url }) }));
  const withId = records.filter((record) => record.source_record_id);

  // An id that is not UNIQUE within its source is not a stable identity.
  // Some listing pages publish every event with the same `url` (the
  // listing itself) rather than a per-event permalink, which would emit
  // several genuinely different events under one identity and silently
  // collapse or corrupt them downstream.
  //
  // Those records are dropped, not rescued with a synthetic id: Phase 7
  // forbids deriving identity from title+date, and a smaller honest yield
  // is worth more than a larger one built on colliding identities.
  const idCounts = new Map();
  for (const record of withId) idCounts.set(record.source_record_id, (idCounts.get(record.source_record_id) ?? 0) + 1);
  const identified = withId.filter((record) => idCounts.get(record.source_record_id) === 1);
  const collided = withId.length - identified.length;

  if (identified.length === 0) {
    const detail = collided > 0
      ? `${collided} Event node(s) shared a non-unique event URL, so no stable per-event identity could be derived`
      : `${records.length} Event node(s) carried no usable event URL, so no stable source identity could be derived`;
    return { state: "STABLE_IDENTITY_PROOF_FAILED", reason: detail, evidence, observations: [], rawRecordCount: nodes.length, identityDropped: records.length };
  }

  const observations = jsonLdToObservations(identified, { source_id: entry.calendar_source_id }, {
    retrievedAt,
    sourceUrl: evidence.final_url,
    contentType: evidence.content_type,
    venueNameOverride: entry.venue_name,
  });

  return {
    state: observations.length ? "ACQUISITION_PROVEN" : "SUPPORTED_COLLECTOR_NO_VALID_EVENTS",
    reason: null,
    evidence,
    observations,
    rawRecordCount: nodes.length,
    identityDropped: records.length - identified.length,
  };
}

/**
 * Whether the SOURCE's own venue name agrees with the census venue the
 * source was recorded against.
 *
 * This matters because a shared operator platform can publish events for
 * its WHOLE estate on one venue's page: the Jockey Club's
 * `/<course>/events-tickets/` pages carry JSON-LD for other courses, so a
 * Carlisle census source legitimately yields Kempton and Haydock events.
 * The Observation is honest either way — `venue_name` is the source's own
 * value and `census_venue_name` is separate provenance — but a consumer
 * keyed on venue_census_id would mis-attribute them, so the disagreement
 * is made explicit and machine-readable rather than left to be noticed.
 */
export function classifyVenueAttribution(observationVenueName, censusVenueName) {
  const fold = (value) => String(value ?? "").toLowerCase().normalize("NFKD").replace(/\p{Diacritic}/gu, "").replace(/[^a-z0-9]+/g, " ").trim();
  const source = fold(observationVenueName);
  const census = fold(censusVenueName);
  if (source === "" ) return "SOURCE_VENUE_NOT_STATED";
  if (census === "") return "CENSUS_VENUE_NOT_STATED";

  const stop = new Set(["the", "racecourse", "racecourses", "stadium", "ground", "arena", "centre", "center", "park", "circuit", "club", "sponsored", "by", "at", "and"]);
  const tokens = (value) => new Set(value.split(" ").filter((token) => token.length > 2 && !stop.has(token)));
  const sourceTokens = tokens(source);
  const censusTokens = tokens(census);
  if (sourceTokens.size === 0 || censusTokens.size === 0) return "VENUE_ATTRIBUTION_UNVERIFIABLE";

  for (const token of sourceTokens) if (censusTokens.has(token)) return "SOURCE_VENUE_MATCHES_CENSUS";
  return "SOURCE_VENUE_DIFFERS_FROM_CENSUS";
}

/**
 * Derive the Tribe REST base from a census calendar URL. The census
 * records the human-facing events page; The Events Calendar's REST API
 * lives at /wp-json/tribe/events/v1/events on the same origin.
 */
export function tribeBaseUrlFrom(calendarUrl) {
  try {
    return new URL(calendarUrl).origin;
  } catch {
    return null;
  }
}

/** Acquire one WORDPRESS_TRIBE_API source using the existing collector. */
async function acquireTribe(entry, { fetchPage, retrievedAt, timeoutMs, maxPages }) {
  const baseUrl = tribeBaseUrlFrom(entry.calendar_url);
  if (!baseUrl) {
    return { state: "SOURCE_FINGERPRINT_UNSUPPORTED", reason: `calendar URL is not a usable absolute URL: ${entry.calendar_url}`, evidence: null, observations: [], rawRecordCount: 0 };
  }

  let result;
  try {
    result = await fetchAllEvents({ baseUrl, maxPages }, { fetchPage, timeoutMs });
  } catch (error) {
    return { state: "NETWORK_FAILURE", reason: String(error?.message ?? error), evidence: null, observations: [], rawRecordCount: 0 };
  }

  const evidence = {
    requested_url: entry.calendar_url,
    final_url: `${baseUrl}/wp-json/tribe/events/v1/events`,
    retrieved_at: retrievedAt,
    http_status: result.ok ? 200 : null,
    content_type: "application/json",
    pages_fetched: result.pagesFetched,
    truncated: result.truncated,
    total_declared: result.totalDeclared,
    source_family: entry.source_family,
    collector_route: entry.collector_route,
    collector_module: "ingestion/events-calendar-api",
    errors: result.errors ?? [],
  };

  if (!result.ok && result.records.length === 0) {
    const message = result.errors?.[0]?.message ?? "REST API request failed";
    const blocked = /\b(401|403|429)\b/.test(message);
    return { state: blocked ? "ACCESS_BLOCKED" : "NETWORK_FAILURE", reason: message, evidence, observations: [], rawRecordCount: 0 };
  }

  if (result.records.length === 0) {
    return { state: "PROGRAMME_EMPTY", reason: "the Tribe REST API returned no events", evidence, observations: [], rawRecordCount: 0 };
  }

  const observations = tribeToObservations(result.records, { source_id: entry.calendar_source_id }, {
    retrievedAt,
    sourceUrl: evidence.final_url,
    contentType: evidence.content_type,
  });

  return {
    state: observations.length ? "ACQUISITION_PROVEN" : "SUPPORTED_COLLECTOR_NO_VALID_EVENTS",
    reason: null,
    evidence,
    observations,
    rawRecordCount: result.records.length,
    identityDropped: 0,
  };
}

/**
 * Acquire one census calendar source. Always resolves — a failure is a
 * reported terminal state, never a thrown error, so one bad source can
 * never abort the national run.
 */
export async function acquireSourceEntry(entry, {
  fetchPage = defaultFetchPage,
  retrievedAt = new Date().toISOString(),
  timeoutMs = 20000,
  maxPages = 5,
} = {}) {
  const started = retrievedAt;
  let outcome;

  try {
    if (entry.source_family === "JSON_LD_EVENT") {
      outcome = await acquireJsonLd(entry, { fetchPage, retrievedAt: started, timeoutMs });
    } else if (entry.source_family === "WORDPRESS_TRIBE_API") {
      outcome = await acquireTribe(entry, { fetchPage, retrievedAt: started, timeoutMs, maxPages });
    } else {
      outcome = { state: "SOURCE_FINGERPRINT_UNSUPPORTED", reason: `no existing collector for family ${entry.source_family}`, evidence: null, observations: [], rawRecordCount: 0 };
    }
  } catch (error) {
    // A collector bug must not be reported as a source failure, but it
    // must not abort the run either.
    outcome = { state: "SUPPORTED_COLLECTOR_NO_VALID_EVENTS", reason: `collector raised: ${String(error?.message ?? error)}`, evidence: null, observations: [], rawRecordCount: 0 };
  }

  const observations = outcome.observations.map((observation) => {
    const temporal = classifyTemporal(observation, started);
    return withCensusProvenance(observation, entry, temporal);
  });

  const temporalCounts = { FUTURE_EVENT: 0, PAST_EVENT: 0, DATE_UNKNOWN: 0 };
  for (const observation of observations) temporalCounts[observation.source_fields.temporal_class] += 1;

  const attributionCounts = {};
  for (const observation of observations) {
    const key = observation.source_fields.venue_attribution;
    attributionCounts[key] = (attributionCounts[key] ?? 0) + 1;
  }

  const futureDates = observations
    .filter((observation) => observation.source_fields.temporal_class === "FUTURE_EVENT")
    .map((observation) => observation.start?.date)
    .filter((date) => typeof date === "string")
    .sort();

  return {
    calendar_source_id: entry.calendar_source_id,
    venue_census_id: entry.venue_census_id,
    venue_name: entry.venue_name,
    city: entry.city,
    nation: entry.nation,
    venue_type: entry.venue_type,
    calendar_url: entry.calendar_url,
    source_family: entry.source_family,
    event_domain: entry.event_domain,
    state: outcome.state,
    reason: outcome.reason ?? null,
    raw_record_count: outcome.rawRecordCount ?? 0,
    identity_dropped: outcome.identityDropped ?? 0,
    observation_count: observations.length,
    temporal: temporalCounts,
    venue_attribution: attributionCounts,
    earliest_future_date: futureDates[0] ?? null,
    latest_future_date: futureDates[futureDates.length - 1] ?? null,
    evidence: outcome.evidence,
    observations,
  };
}

/**
 * Acquire the whole population, bounded by concurrency. Each source is
 * isolated: one failure never affects another's result.
 */
export async function acquirePopulation(population, {
  concurrency = 4,
  onProgress = () => {},
  ...options
} = {}) {
  const results = new Array(population.length);
  let cursor = 0;
  let done = 0;

  const worker = async () => {
    while (cursor < population.length) {
      const index = cursor++;
      results[index] = await acquireSourceEntry(population[index], options);
      onProgress(++done, population.length, results[index]);
    }
  };

  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, population.length)) }, worker));
  return results;
}
