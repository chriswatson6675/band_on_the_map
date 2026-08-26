// BARCELONA-30-VENUE-POPULATION-02 — Sala Upload (Poble Espanyol,
// Barcelona). WordPress's own core REST API exposes a custom post type
// ('eventos') for link discovery — every sampled record's own class_list
// carries 'tipo-de-evento-concierto' (this venue's REST feed is, at
// proof time, exclusively concerts; this module still filters
// explicitly rather than assuming). The actual event DATE is NOT exposed
// via REST at all (only the CMS post-publish 'date'/'date_gmt', the same
// documented limitation already found for Marula Café — see
// docs/BARCELONA_VENUE_POPULATION.md) — it lives only in each event
// page's own rendered HTML, in a JetEngine "dynamic field" widget under a
// "FECHA" heading (a full day + Spanish month name + year, stated
// directly — e.g. "26 septiembre  2026"), extracted here via a small,
// bounded, deterministic regex + a fixed Spanish month-name table (never
// a guess). Proven live in
// research/source-investigations/sala-upload-barcelona-01/.

import { fetchText } from "../http/fetch.mjs";

const REST_BASE = "https://sala-upload.com/wp-json/wp/v2/eventos";
const MAX_PAGES = 10; // generous bound well above the ~3 pages observed at proof time (114 records @ 50/page)

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Fetch every 'eventos' record from Sala Upload's own WP REST API,
 * following standard WP page-number pagination and stopping on the
 * first empty/error page — bounded by MAX_PAGES.
 */
export async function fetchSalaUploadEventLinks({ fetchImpl = fetchText } = {}) {
  const all = [];
  let retrievedAt = null;
  let sourceUrl = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${REST_BASE}?per_page=50&page=${page}`;
    const res = await fetchImpl(url, {});
    if (res.status === 400) break; // WP's own "rest_post_invalid_page_number" once past the last page
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${res.url}`);
    retrievedAt = res.retrievedAt;
    sourceUrl = res.url;
    const parsed = JSON.parse(res.text);
    if (!Array.isArray(parsed)) throw new Error("Sala Upload eventos endpoint did not return a JSON array");
    if (parsed.length === 0) break;
    all.push(...parsed);
    if (parsed.length < 50) break;
  }

  const concertRecords = all.filter((raw) => Array.isArray(raw.class_list) && raw.class_list.includes("tipo-de-evento-concierto"));

  return {
    records: concertRecords.map((raw) => ({
      source_record_id: raw.id != null ? String(raw.id) : null,
      title: nonEmptyString(raw?.title?.rendered),
      event_url: nonEmptyString(raw?.link),
    })),
    retrievedAt,
    sourceUrl,
  };
}

const SPANISH_MONTHS = Object.freeze({
  enero: "01",
  febrero: "02",
  marzo: "03",
  abril: "04",
  mayo: "05",
  junio: "06",
  julio: "07",
  agosto: "08",
  septiembre: "09",
  octubre: "10",
  noviembre: "11",
  diciembre: "12",
});

// Matches "26 septiembre  2026" (variable inner whitespace, real
// retained evidence) — day, a fixed Spanish month name, year, nothing
// else. Never matches a partial/ambiguous shape.
const SPANISH_DATE_RE = /^(\d{1,2})\s+([a-zé]+)\s+(\d{4})$/i;

/**
 * Parse this source's own Spanish "D de mes  YYYY"-family date TEXT
 * (already extracted verbatim from the page — see
 * extractFechaFieldText()) into "YYYY-MM-DD". A fixed month-name table
 * lookup is mechanical, not a guess — returns null for anything that
 * doesn't match this exact shape, never a partial/best-effort parse.
 */
export function parseSpanishDate(dateText) {
  const match = SPANISH_DATE_RE.exec((dateText ?? "").trim());
  if (!match) return null;
  const [, day, monthName, year] = match;
  const month = SPANISH_MONTHS[monthName.toLowerCase()];
  if (!month) return null;
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

const FECHA_HEADING_RE = /<h2[^>]*>\s*FECHA\s*<\/h2>/i;
const HORARIO_HEADING_RE = /<h2[^>]*>\s*HORARIO\s*<\/h2>/i;
const DYNAMIC_FIELD_CONTENT_RE = /jet-listing-dynamic-field__content"[^>]*>([^<]*)</;

/**
 * Extract the exact text of the JetEngine "dynamic field" content
 * immediately following a given heading label ("FECHA"/"HORARIO") on one
 * event page's raw HTML. Returns null (never throws) if the heading or
 * its following field is genuinely absent — a page whose own layout has
 * changed, or a non-event page, is honestly "not found", never guessed.
 */
function extractFieldAfterHeading(html, headingRe) {
  const headingMatch = headingRe.exec(html);
  if (!headingMatch) return null;
  const rest = html.slice(headingMatch.index + headingMatch[0].length);
  const fieldMatch = DYNAMIC_FIELD_CONTENT_RE.exec(rest);
  if (!fieldMatch) return null;
  const text = fieldMatch[1].replace(/\s+/g, " ").trim();
  return text === "" ? null : text;
}

/**
 * Parse one event page's raw HTML into the small set of fields this
 * source's own page template exposes beyond the REST list (FECHA/HORARIO
 * — the real event date/time, absent from the REST API entirely).
 */
export function parseSalaUploadEventPage(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("parseSalaUploadEventPage requires non-empty HTML");
  }
  const dateText = extractFieldAfterHeading(html, FECHA_HEADING_RE);
  const timeText = extractFieldAfterHeading(html, HORARIO_HEADING_RE);
  return {
    date_text: dateText,
    date_iso: parseSpanishDate(dateText),
    time_text: timeText,
  };
}
