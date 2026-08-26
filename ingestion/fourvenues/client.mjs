// BARCELONA-30-VENUE-POPULATION-01 — generic, source-agnostic client for
// the Fourvenues (fourvenues.com) public ticketing platform's own
// unauthenticated events API (`https://api.fourvenues.com/no-auth/events`),
// used by several independently-operated Barcelona clubs as their
// authoritative event inventory (confirmed live for Opium Barcelona and
// KU Barcelona — see research/source-investigations/opium-barcelona-01/
// and .../ku-barcelona-01/).
//
// This module is deliberately generic: it never references a specific
// venue name. Every per-venue fact (the venue's own `organizer_slug` on
// the platform) is supplied by a caller config object, matching this
// project's existing ingestion/events-calendar-api/ family convention.
//
// The endpoint returns every event within an optional `[start, end]` Unix
// -second window in ONE response (no `next`/pagination pointer was found
// in real retained samples — see the investigation evidence) — passing an
// explicit, generously wide window is how this module reaches a source's
// full future horizon in a single request, rather than following
// pagination.

const BASE_URL = "https://api.fourvenues.com/no-auth/events";

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

/**
 * Build the request URL for one configured Fourvenues organizer.
 *
 * `config.slug` (required) — the platform's own `organizer_slug`.
 * `config.startUnix`/`config.endUnix` (optional) — Unix-SECOND window
 * bounds, passed straight through as `start`/`end` query params. Omitting
 * both lets the platform apply its own default (empirically a narrower
 * forward window than passing an explicit wide one — see the
 * investigation evidence) — a caller wanting the FULL future horizon
 * should supply both explicitly.
 */
export function buildEventsUrl(config) {
  if (!config || typeof config.slug !== "string" || config.slug.trim() === "") {
    throw new Error("buildEventsUrl requires config.slug (a non-empty string)");
  }
  const url = new URL(BASE_URL);
  url.searchParams.set("slug", config.slug);
  if (config.startUnix != null) url.searchParams.set("start", String(config.startUnix));
  if (config.endUnix != null) url.searchParams.set("end", String(config.endUnix));
  return url.toString();
}

/**
 * Parse one already-fetched response body (a JSON string) into the raw
 * `data` array exactly as the API returned it — per-record normalization
 * is a separate step (normalizeEventRecord below). Throws on invalid
 * JSON, a non-object top level, or a body with no `data` array — an
 * empty `data: []` array is a legitimate, different, non-throwing case
 * (a genuinely event-less organizer), never conflated with a malformed
 * response.
 */
export function parseEventsResponse(body) {
  if (typeof body !== "string" || body.trim() === "") {
    throw new Error("parseEventsResponse requires a non-empty response body string");
  }
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch (error) {
    throw new Error(`Fourvenues response body is not valid JSON: ${error.message}`);
  }
  if (!isPlainObject(parsed) || !Array.isArray(parsed.data)) {
    throw new Error('Fourvenues response body has no "data" array');
  }
  return parsed.data;
}

function artistNames(artists) {
  if (!Array.isArray(artists)) return [];
  return artists
    .map((a) => (typeof a === "string" ? a : nonEmptyString(a?.name)))
    .filter((name) => typeof name === "string" && name.trim() !== "");
}

/**
 * Normalize one raw Fourvenues event object into a small, generic,
 * per-record shape. Pure mapping only — never fabricates a value the
 * source did not supply. `start_unix`/`end_unix` are the source's own
 * Unix-SECOND timestamps, converted to milliseconds-ready integers but
 * NOT yet converted to an ISO string (see observation-adapter.mjs for
 * that mechanical, deterministic conversion).
 */
export function normalizeEventRecord(raw) {
  if (!isPlainObject(raw) || !nonEmptyString(raw._id)) {
    throw new Error("normalizeEventRecord requires an object with a non-empty _id");
  }
  return {
    source_record_id: raw._id,
    title: nonEmptyString(raw.name),
    slug: nonEmptyString(raw.slug),
    event_url: nonEmptyString(raw.url),
    start_unix: typeof raw.start === "number" ? raw.start : null,
    end_unix: typeof raw.end === "number" ? raw.end : null,
    genres: Array.isArray(raw.genres) ? raw.genres.filter((g) => typeof g === "string") : [],
    artists: artistNames(raw.artists),
    age_restriction: typeof raw.age === "number" ? raw.age : null,
    is_private: typeof raw.is_private === "boolean" ? raw.is_private : null,
  };
}
