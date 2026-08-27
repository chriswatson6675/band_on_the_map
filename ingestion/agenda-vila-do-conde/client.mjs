// Request-building and response-parsing helpers for Agenda Vila do Conde's
// real, live, public JSON POST API. Deliberately named after the discovered
// "repeater" mechanism (not the venue) at the top level, matching this
// repo's existing convention (see ingestion/coliseu-porto/client.mjs) of
// keeping generic request/parse plumbing free of source-specific framing
// where the mechanism itself is reusable — though, unlike Coliseu's GraphQL
// endpoint, this exact endpoint/payload shape is specific to the Bond
// Habits "repeater" this investigation reconstructed, so nothing here
// pretends to be a generic multi-source client.
//
// Built ENTIRELY from the already-retained, READY_FOR_ACTIVATION
// investigation at
// research/source-investigations/agenda-vila-do-conde-01/investigation.json
// (site_classification.acquisition_class: PUBLIC_JSON_API,
// collector_assessment.recommended_family: JSON_API). No live network
// request was made to build this module; every claim below is backed by
// that investigation's retained evidence, in particular:
//   - evidence/request-repeater-fetch.json / request-repeater-fetch-page2.json
//     (the exact POST body shape this investigation hand-reconstructed from
//     struct.js's repeater config and player.js's own payload-building
//     logic — the two requests are identical except `repeater.page`)
//   - evidence/body-repeater-fetch.json / body-repeater-fetch-page2.json
//     (the real, retained response bodies — 15 + 14 = 29 real, current,
//     future-window event records across 2 pages)
//   - evidence/headers-repeater-fetch.txt / headers-repeater-fetch-page2.txt
//     (200 OK, application/json, X-Server-Name: render — a separate
//     runtime backend from the static site's own bond-frontend)
//
// Two responsibilities live here, matching this project's existing
// client.mjs convention: (1) building the exact POST request body, and
// (2) parsing an already-fetched response body into a normalized shape,
// including the one deterministic, source-provided-taxonomy-based music
// filter this source needs. Live HTTP acquisition/pagination-following is
// a SEPARATE concern, left to a future collector loop that calls this
// module — so this module is fully unit-testable with zero network access.

// The discovered, public, unauthenticated JSON POST API
// (research/source-investigations/agenda-vila-do-conde-01/investigation.json
// data_paths[2], evidence/player-js-fetch-endpoint-excerpt.txt). A
// DIFFERENT host from the static calendar page itself
// (agenda.cm-viladoconde.pt): this is player.js's own runtime constant,
// reconstructed by reading the platform's publicly shipped source, not
// discovered by authentication bypass or private-API access.
export const FETCH_ENDPOINT = "https://repeater.bondlayer.com/fetch";

// The exact headers this investigation's own retained request used
// (evidence/body-repeater-fetch.json's method field: `curl ... -H
// "Content-Type: application/json" -X POST --data @request-repeater-fetch.json`).
// No API key, cookie, or auth header of any kind was needed or used.
export const FETCH_HEADERS = Object.freeze({ "Content-Type": "application/json" });

// The repeater/collection identifiers this investigation found in
// struct.js's own retained repeater config (evidence/struct-js-events-
// repeater-config-excerpt.txt) and the live page's own data-bl-* attributes
// (evidence/body-agenda-home.html) — reproduced here verbatim, not
// reconstructed differently than what was actually proven.
const REPEATER_ID = "cDUzN6R14bU0s0UB";
const COLLECTION_ID = "c8ks2f3U0auUJh8T";
const PROJECT_ID = "sflunz0ml8bmfk2l";
const HASH = "1778795441461";

/**
 * Build the exact POST request body for one page of this source's own
 * future-window, datetime_end_date-sorted events repeater query — the
 * same shape retained in evidence/request-repeater-fetch.json and
 * evidence/request-repeater-fetch-page2.json (which differ ONLY in
 * `repeater.page`). Every other field is reproduced verbatim from those
 * two retained, evidenced requests; nothing here is invented or guessed.
 *
 * `page` (optional, default 1) — a positive integer, this platform's own
 * documented pagination field (`repeater.page`, per struct.js's own
 * pagination config).
 *
 * Deliberately does NOT read the system clock: the source's own server-
 * side "future" date filter (`dateDirection: "_future"`, `dateStart:
 * "_today"`) does the date-window filtering, exactly as retained in
 * evidence — this function only ever reproduces that already-proven
 * filter shape, never computes its own "now".
 */
export function buildFetchRequestBody({ page = 1 } = {}) {
  if (!Number.isInteger(page) || page <= 0) {
    throw new Error("buildFetchRequestBody requires a positive integer page");
  }

  return {
    hash: HASH,
    target: "production",
    geoData: {},
    searchQuery: "",
    favorites: {},
    repeater: {
      realtime: true,
      liveFetch: true,
      detail: false,
      sorts: [{ attr: "datetime_end_date", direction: "asc" }],
      version: 1,
      pagination: { enabled: true, marginPagesDisplayed: 0, pageRangeDisplayed: 6, perPage: "15" },
      id: REPEATER_ID,
      limit: { enabled: false, start: 0, end: "500" },
      filters: [
        {
          activeIndex: 0,
          dateRange: "_day",
          value: "",
          attr: "datetime_end_date",
          dateDirection: "_future",
          dateStart: "_today",
          dateExcludeToday: false,
          action: "edit",
          isReferenceFilter: false,
          condition: "datetime-isSameOrAfter",
          remoteFilter: false,
          dateTarget: "2025-02-25T14:52:37.221Z",
        },
      ],
      collection: COLLECTION_ID,
      page,
    },
    locale: "en",
    contentId: "0",
    projectId: PROJECT_ID,
  };
}

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Parse one already-fetched repeater-fetch response body (a JSON string)
 * into `{ total, totalPages, page, items, related }`. `items` is the RAW
 * array of event records exactly as the API returned them (unfiltered —
 * use filterConcertoRecords() below to apply this source's one
 * deterministic music-relevance filter); `related` is this same
 * response's own embedded lookup map of referenced ids (tags, admission
 * types, sections, ...) to their `_title`/`_slug` — the exact,
 * self-describing structure resolveTagTitle()/filterConcertoRecords()
 * below read from, never a separately-fetched taxonomy file.
 *
 * Throws (never silently returns an empty page, never guesses a shape)
 * on: invalid JSON, a top-level value that isn't an object, or a
 * well-formed JSON body that does not carry this response's own proven
 * `{items:[...], related:{...}, total, totalPages, page}` shape. A
 * genuinely empty `items: []` array with a valid `total`/`totalPages` is a
 * legitimate, different, non-throwing case (a past-the-end page), never
 * conflated with a malformed response.
 */
export function parseFetchResponse(jsonText) {
  if (typeof jsonText !== "string" || jsonText.trim() === "") {
    throw new Error("parseFetchResponse requires a non-empty response body string");
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch (error) {
    throw new Error(`Agenda Vila do Conde repeater-fetch response body is not valid JSON: ${error.message}`);
  }

  if (!isPlainObject(parsed)) {
    throw new Error("Agenda Vila do Conde repeater-fetch response body did not parse to a JSON object");
  }

  if (!Array.isArray(parsed.items)) {
    throw new Error('Agenda Vila do Conde repeater-fetch response body has no well-formed "items" array');
  }
  if (!isPlainObject(parsed.related)) {
    throw new Error('Agenda Vila do Conde repeater-fetch response body has no well-formed "related" object');
  }
  if (typeof parsed.total !== "number" || typeof parsed.totalPages !== "number" || typeof parsed.page !== "number") {
    throw new Error(
      'Agenda Vila do Conde repeater-fetch response body has no well-formed numeric "total"/"totalPages"/"page" fields',
    );
  }

  return {
    total: parsed.total,
    totalPages: parsed.totalPages,
    page: parsed.page,
    items: parsed.items,
    related: parsed.related,
  };
}

// The literal, source-provided taxonomy label this investigation
// mechanically confirmed as the ONE in-scope music tag (16-item
// ref_tags_1o_nivel controlled vocabulary; see investigation.json
// site_classification and field_assessment). Matched by TITLE against
// each response's own embedded `related` lookup map, not by a bare id
// disconnected from meaning — a response's own `related[tagId]._title.all`
// is the same self-describing data this investigation itself used to
// confirm the tag id (evidence/offline-proof.mjs step 2/3), so resolving
// it this way stays mechanical and never trusts an opaque id in isolation.
export const CONCERTO_TAG_TITLE = "Concerto";

// The second, independent, source-provided admission-type taxonomy label
// this investigation found (`ref_tags_2o_nivel`, a 2-value
// Bilheteira/Entrada Gratuita vocabulary) — used by the observation
// adapter to derive price_text honestly from a real field, never inferred
// from an empty text_price (see investigation.json field_assessment.price).
export const FREE_ADMISSION_TAG_TITLE = "Entrada Gratuita";

/**
 * Resolve a record's own tag-reference id (e.g. `ref_tags_1o_nivel`,
 * `ref_tags_2o_nivel`) against this SAME response's own `related` lookup
 * map, returning the referenced item's `_title.all` text, or null if the
 * id is absent/null or genuinely not present in `related` (never guessed).
 */
export function resolveTagTitle(tagId, related) {
  if (typeof tagId !== "string" || tagId === "" || !isPlainObject(related)) return null;
  const entry = related[tagId];
  if (!isPlainObject(entry) || !isPlainObject(entry._title)) return null;
  const title = entry._title.all;
  return typeof title === "string" && title.trim() !== "" ? title : null;
}

/**
 * Keep only records whose own source-provided `ref_tags_1o_nivel`
 * resolves (via this same response's own `related` map) to the literal
 * "Concerto" title — the ONE deterministic, mechanical music-relevance
 * filter this source needs (mirroring the existing precedent already
 * established for ingestion/cm-gaia-eventos/discovery.mjs's own "música"
 * tag filter). A record with no tag, or a tag that resolves to anything
 * else (Cinema/Circo/Comunidade/Dança/Espetáculo/Exposição/Festa/
 * Oficina/Performance/Provas/Stand Up Comedy/Teatro/Visita/Workshop, or
 * an unresolved id), is never included — never inferred from title text,
 * only from this real, controlled-vocabulary field.
 */
export function filterConcertoRecords(items, related) {
  return (items ?? []).filter((record) => resolveTagTitle(record?.ref_tags_1o_nivel, related) === CONCERTO_TAG_TITLE);
}
