// BARCELONA-30-VENUE-POPULATION-02 — the Anella Olímpica complex
// (Montjuïc, Barcelona)'s shared events-listing page, generalised beyond
// ingestion/sant-jordi-club/discovery.mjs (BARCELONA-30-VENUE-POPULATION-01,
// left byte-for-byte unchanged — this is a NEW, parallel module, not an
// edit to it) to discriminate EVERY hall in the complex, not just Sant
// Jordi Club: the main Palau Sant Jordi arena and Estadi Olímpic Lluís
// Companys (an open-air stadium in the same complex) both host genuine,
// major touring concerts under this same shared listing/per-event-page
// mechanism. Proven live in
// research/source-investigations/palau-sant-jordi-barcelona-01/ and
// research/source-investigations/estadi-olimpic-lluis-companys-barcelona-01/.
//
// Each individual event page states its own exact hall as a literal
// JavaScript variable assignment (`let address = "..."`) in otherwise
// -static HTML — no JS execution needed to read it. Unlike
// ingestion/sant-jordi-club/discovery.mjs's parseSantJordiEventPage()
// (which only ever retains one specific hall), parseAnellaOlimpicaEventPage()
// below is genuinely hall-agnostic: it returns a record for ANY hall the
// page states, letting a caller bucket by hall name itself. This is
// deliberately NOT a fork of the Sant Jordi Club module's business logic
// — it is a small superset used by two ADDITIONAL, independently
// -registered sources (Palau Sant Jordi, Estadi Olímpic Lluís Companys),
// each crawling the same public listing independently and bounded
// (11-13 links at proof time) — never an unbounded crawl.

// See ingestion/sant-jordi-club/discovery.mjs's own identical constant for
// the shared provenance of this exclusion list.
const KNOWN_NON_EVENT_SLUGS = new Set([
  "accessibility",
  "events",
  "getting-to-palausantjordi-barcelona",
  "history",
  "how-arrive",
  "music-bank-barcelona",
  "news",
  "our-values",
  "sant-jordi-club",
  "secure",
  "space-rental",
  "sustainable",
]);

const LISTING_LINK_RE = /href="\/en\/([a-z0-9-]+)"/g;

export function parseAnellaOlimpicaListingLinks(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Anella Olímpica events-listing HTML");
  }

  const seen = new Set();
  const urls = [];
  let match;
  LISTING_LINK_RE.lastIndex = 0;
  while ((match = LISTING_LINK_RE.exec(html)) !== null) {
    const slug = match[1];
    if (seen.has(slug) || KNOWN_NON_EVENT_SLUGS.has(slug)) continue;
    seen.add(slug);
    urls.push({ slug, url: `https://palausantjordi.barcelona/en/${slug}` });
  }
  return urls;
}

const ADDRESS_RE = /\baddress\s*=\s*"([^"]*)"/;
const START_DATE_RE = /\bstartDate\s*=\s*"([^"]*)"/;
const END_DATE_RE = /\bendDate\s*=\s*"([^"]*)"/;
const TITLE_TAG_RE = /<title>([^<|]*)\s*\|/;

// Real, retained evidence: this site's own literal JS variable assignment
// sometimes escapes a non-ASCII character as a JS string \uXXXX escape
// (e.g. `address = "Estadi Olímpic"`), not the literal UTF-8 byte —
// see research/source-investigations/estadi-olimpic-lluis-companys-barcelona-01/.
// Decoding a \uXXXX escape to its exact codepoint is mechanical/lossless,
// never a guess (unlike ingestion/json-ld/observation-adapter.mjs's named
// CEST/CET-offset case, this needs no lookup table at all).
function decodeJsUnicodeEscapes(value) {
  return value.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/**
 * Parse one event detail page's HTML into a hall-agnostic record. Returns
 * `null` (never throws) if this page does not carry the expected
 * `address`/`startDate` JavaScript variables at all — a non-event nav
 * page that slipped past the known-slugs exclusion list. Unlike
 * ingestion/sant-jordi-club/discovery.mjs's equivalent function, this
 * NEVER filters by a specific hall name — the caller (a per-venue
 * collector config) decides which `hall` value(s) it wants.
 */
export function parseAnellaOlimpicaEventPage(html, { slug, url } = {}) {
  if (typeof html !== "string" || html.trim() === "") return null;

  const addressMatch = ADDRESS_RE.exec(html);
  if (!addressMatch || addressMatch[1].trim() === "") return null;

  const startMatch = START_DATE_RE.exec(html);
  if (!startMatch) return null;

  const endMatch = END_DATE_RE.exec(html);
  const titleMatch = TITLE_TAG_RE.exec(html);

  return {
    source_record_id: slug ?? null,
    title: titleMatch ? decodeJsUnicodeEscapes(titleMatch[1].trim()) : null,
    event_url: url ?? null,
    start_local: startMatch[1],
    end_local: endMatch ? endMatch[1] : null,
    hall: decodeJsUnicodeEscapes(addressMatch[1].trim()),
  };
}
