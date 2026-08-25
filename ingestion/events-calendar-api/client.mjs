// Generic, source-agnostic parsing/URL-building for "The Events Calendar" /
// "Events Calendar Pro" WordPress plugin family's own bundled public REST
// API v1 (`/wp-json/tribe/events/v1/`) — proven live against Centro
// Cultural de Belém (CCB) under research/source-investigations/
// ccb-lisbon-01/ (decision: READY_FOR_ACTIVATION, acquisition_class
// PUBLIC_JSON_API).
//
// This module is deliberately generic: it never references Lisbon, Porto,
// CCB, a Portuguese venue name, or any specific event category. Every
// per-source fact (base URL, category filter, pagination bounds, date
// window) is supplied by a caller-provided config object — see
// ingestion/ccb/config.mjs for the one concrete example this family is
// proven against.
//
// Two responsibilities live here, and only here (matching this project's
// existing discovery.mjs convention): (1) building the initial request URL
// from a config, and (2) parsing already-fetched response bodies into a
// normalized shape. Live HTTP acquisition/pagination-following is a
// SEPARATE concern — see ./fetch-all.mjs — so this module can be, and is,
// unit-tested with zero network access.

const DEFAULT_REST_PATH = "/wp-json/tribe/events/v1/events/";

/**
 * Build the initial REST API request URL for one configured source. Never
 * consults the system clock or any other implicit "now" — a caller that
 * wants a bounded date window must supply `startDate`/`endDate` explicitly
 * (plain date/time strings, passed straight through as query parameters).
 * Omitting them is a deliberate, valid choice: the source's own server
 * applies its own "current and future events" default (evidenced live for
 * CCB — see ccb-lisbon-01/investigation.json's ev-api-musica-p1, whose own
 * `rest_url` field shows the server itself computed a `start_date` of "now"
 * with no such parameter in the request), never an unbounded historical
 * archive by default.
 *
 * `config`:
 *   - `baseUrl` (required) — e.g. "https://www.ccb.pt"
 *   - `restPath` (optional) — defaults to the plugin's own default events
 *     list path; only override for a genuinely non-default install.
 *   - `category` (optional) — the plugin's own category-taxonomy slug
 *     filter (`?categories=`), never a hard-coded value in this module.
 *   - `perPage` (optional) — the plugin's own `per_page` parameter.
 *   - `startDate` / `endDate` (optional) — plain date/time strings passed
 *     through verbatim as `start_date` / `end_date` query parameters.
 */
export function buildEventsUrl(config) {
  if (!config || typeof config.baseUrl !== "string" || config.baseUrl.trim() === "") {
    throw new Error("buildEventsUrl requires config.baseUrl (a non-empty string)");
  }

  const url = new URL(config.restPath ?? DEFAULT_REST_PATH, config.baseUrl);

  if (config.category) url.searchParams.set("categories", config.category);
  if (config.perPage != null) url.searchParams.set("per_page", String(config.perPage));
  if (config.startDate) url.searchParams.set("start_date", config.startDate);
  if (config.endDate) url.searchParams.set("end_date", config.endDate);

  return url.toString();
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse one already-fetched REST API response body (a JSON string) into
 * `{ events, total, totalPages, restUrl, nextRestUrl }`. `events` is the
 * RAW array of event objects exactly as the API returned them — per-record
 * normalization is a separate step (normalizeEventRecord below), so a
 * caller inspecting a parsing failure always sees the source's own
 * original shape.
 *
 * Throws (never silently returns an empty page) on: invalid JSON, a
 * top-level value that isn't an object, or a body that is well-formed JSON
 * but does not carry an `events` array at all (e.g. the plugin's own error
 * shape, `{ "error": "...", "code": "..." }`, returned for a bad request
 * such as an unknown category) — an empty owning `events: []` array is a
 * legitimate, different, non-throwing case (a genuinely empty page), never
 * conflated with a malformed response.
 */
export function parseEventsPage(body) {
  if (typeof body !== "string" || body.trim() === "") {
    throw new Error("parseEventsPage requires a non-empty response body string");
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`Events Calendar API response body is not valid JSON: ${error.message}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error("Events Calendar API response body did not parse to a JSON object");
  }

  if (!Array.isArray(parsed.events)) {
    const hint = typeof parsed.error === "string" ? ` (source reported: "${parsed.error}")` : "";
    throw new Error(`Events Calendar API response body has no "events" array${hint}`);
  }

  return {
    events: parsed.events,
    total: typeof parsed.total === "number" ? parsed.total : null,
    totalPages: typeof parsed.total_pages === "number" ? parsed.total_pages : null,
    restUrl: typeof parsed.rest_url === "string" ? parsed.rest_url : null,
    nextRestUrl: typeof parsed.next_rest_url === "string" && parsed.next_rest_url.trim() !== "" ? parsed.next_rest_url : null,
  };
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Normalize the source's own `venue` field into a plain, generic shape, or
 * `null` if genuinely absent. The plugin's own REST API represents "no
 * venue" as an empty array (`[]`) rather than `null`/`{}` on some installs
 * (observed on a genuinely sparse compatible-site fixture) — handled
 * explicitly here rather than left to silently coerce into a truthy empty
 * object elsewhere.
 */
function normalizeVenue(venue) {
  if (!isPlainObject(venue)) return null;
  const name = nonEmptyString(venue.venue);
  if (!name && !nonEmptyString(venue.address) && !nonEmptyString(venue.city)) return null;

  return {
    id: venue.id ?? null,
    name,
    address: nonEmptyString(venue.address),
    city: nonEmptyString(venue.city),
    province: nonEmptyString(venue.province) ?? nonEmptyString(venue.stateprovince),
    zip: nonEmptyString(venue.zip),
    country: nonEmptyString(venue.country),
    phone: nonEmptyString(venue.phone),
    url: nonEmptyString(venue.url),
  };
}

/**
 * Normalize one RAW Tribe Events API event object (as found inside a
 * parsed page's `events` array, or returned directly by the single-event
 * endpoint `/events/{id}`) into a small, generic, per-record shape. Pure
 * mapping/renaming only — never fabricates a value the source did not
 * supply, and never applies source-specific judgement (category
 * filtering, venue-name resolution, price interpretation beyond verbatim
 * extraction) — all of that belongs to a per-source config or a later
 * pipeline stage, never here.
 *
 * Every field the raw record does not genuinely supply is normalized to
 * `null` (or `[]` for list-shaped fields), matching this project's
 * existing "absence preserved explicitly, never guessed" convention
 * (ingestion/observation/contract.mjs).
 */
export function normalizeEventRecord(raw) {
  if (!isPlainObject(raw) || raw.id == null) {
    throw new Error("normalizeEventRecord requires an object with a non-null id");
  }

  const categories = Array.isArray(raw.categories)
    ? raw.categories.map((c) => (isPlainObject(c) ? nonEmptyString(c.slug) : null)).filter(Boolean)
    : [];
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((t) => (isPlainObject(t) ? nonEmptyString(t.name ?? t.slug) : nonEmptyString(t))).filter(Boolean)
    : [];

  return {
    source_record_id: String(raw.id),

    title: nonEmptyString(raw.title),
    description: nonEmptyString(raw.description),
    slug: nonEmptyString(raw.slug),

    start_local: nonEmptyString(raw.start_date),
    start_utc: nonEmptyString(raw.utc_start_date),
    end_local: nonEmptyString(raw.end_date),
    end_utc: nonEmptyString(raw.utc_end_date),
    timezone: nonEmptyString(raw.timezone),
    all_day: typeof raw.all_day === "boolean" ? raw.all_day : null,

    venue: normalizeVenue(raw.venue),

    cost_text: nonEmptyString(raw.cost),

    event_url: nonEmptyString(raw.url),
    rest_url: nonEmptyString(raw.rest_url),

    categories,
    tags,

    global_id: nonEmptyString(raw.global_id),
  };
}
