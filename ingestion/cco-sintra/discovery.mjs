// Discovers Centro Cultural Olga Cadaval (Sintra)'s own individual event
// detail permalinks from its first-party paginated agenda list
// (https://ccolgacadaval.pt/agenda), and extracts each detail page's own
// bounded event-content block into a small factual record shape.
//
// Built entirely from the retained, READY_FOR_ACTIVATION investigation at
// research/source-investigations/cco-sintra-01/ (investigation.json +
// evidence/) — no live fetch was performed to write this module. See
// fixtures/cco-sintra/metadata.json for exactly which retained evidence
// each fixture file was derived from.
//
// Platform: Joomla running the "iCagenda" (com_icagenda) events-calendar
// extension. The list page is fully server-rendered, paginated HTML — no
// JSON-LD, no client-side rendering needed anywhere (investigation.json's
// site_classification).
//
// STABLE IDENTIFIER, IMPORTANT NUANCE (investigation.json
// field_assessment.source_record_id.notes, empirically demonstrated, not
// assumed): each event row's bare numeric content-item id (e.g.
// "ic-event-id-543") is NOT alone a per-occurrence-unique key — the SAME
// id 543 serves two different calendar dates of one multi-date production
// ("Evita"). The FULL permalink — {id}-{slug}/{date}-{time} — IS proven
// stable via each detail page's own self-declared <link rel="canonical">
// exactly matching the URL it was fetched from (4/4 in the investigation's
// retained sample). This module's extractCcoSintraEventFacts() therefore
// always returns the full canonical permalink, never a bare id, for a
// caller (ingestion/cco-sintra/observation-adapter.mjs) to derive
// source_record_id from — see that module's deriveSourceRecordId().

const AGENDA_ORIGIN = "https://ccolgacadaval.pt";

// Matches this source's own per-occurrence permalink path exactly as
// observed across every retained list-row and detail-page canonical link:
// /agenda/{numeric content-item id}-{slug}/{YYYY-MM-DD}-{HH}-{MM}
const EVENT_PERMALINK_RE = /\/agenda\/\d+-[a-z0-9-]+\/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}/g;

// The list page's own pagination "next page" pointer
// (<div class="ic-next"><a rel="next" href="...">), read only — never
// constructs a page-N URL itself. Mirrors
// ingestion/casa-da-musica/discovery.mjs's parseCasaDaMusicaNextPageUrl().
const NEXT_PAGE_RE = /<div class="ic-next"><a rel="next" href="([^"]+)"/;

function assertNonEmptyHtml(html, what) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error(`Expected non-empty CCO Sintra ${what} HTML`);
  }
}

function resolveUrl(path) {
  return path.startsWith("http") ? path : `${AGENDA_ORIGIN}${path}`;
}

/**
 * Parse one CCO Sintra /agenda (or /agenda?page=N) list-page HTML document
 * into a deduplicated array of this venue's own absolute event-detail
 * permalink URLs, in document order. Each row's permalink appears
 * multiple times in the source markup (thumbnail link, title link, "+
 * info" link); duplicates are collapsed to one entry per occurrence.
 * Returns an empty array (never throws) if no event rows are present — a
 * legitimate "nothing currently listed" result, not a parse failure.
 */
export function parseCcoSintraAgendaLinks(html) {
  assertNonEmptyHtml(html, "agenda list-page");
  const seen = new Set();
  const links = [];
  for (const match of html.matchAll(EVENT_PERMALINK_RE)) {
    const absolute = resolveUrl(match[0]);
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    links.push(absolute);
  }
  return links;
}

/**
 * Read the list page's own <div class="ic-next"><a rel="next" href="...">
 * pagination pointer, resolved to an absolute URL, or null if absent (the
 * last page carries none). Never constructs a page-N URL itself — only
 * reads what the page states.
 */
export function parseCcoSintraNextPageUrl(html) {
  if (typeof html !== "string") return null;
  const match = NEXT_PAGE_RE.exec(html);
  return match ? resolveUrl(match[1]) : null;
}

function extractBetween(html, startRe, endMarker, fieldName, { required = true } = {}) {
  const startMatch = startRe.exec(html);
  if (!startMatch) {
    if (required) throw new Error(`Expected ${fieldName} on a CCO Sintra event-detail page`);
    return null;
  }
  const from = startMatch.index + startMatch[0].length;
  const to = endMarker ? html.indexOf(endMarker, from) : html.length;
  return (to === -1 ? html.slice(from) : html.slice(from, to)).trim();
}

function stripTags(text) {
  return text
    .replace(/<[^>]+>/g, " ")
    .replace(/&euro;/g, "€")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extract one CCO Sintra event-detail page's own bounded event-content
 * facts. Throws if a required, always-directly-stated element is missing
 * or malformed (title, canonical permalink, date, venue — every sampled
 * row in the investigation carried all four directly). time_text and
 * price_text are genuinely optional per investigation.json's field_assessment
 * (PARTIAL, not PROVEN) and are null, never guessed, when absent.
 */
export function extractCcoSintraEventFacts(detailHtml) {
  assertNonEmptyHtml(detailHtml, "event-detail page");

  const canonicalMatch = /<link rel="canonical" href="([^"]+)">/.exec(detailHtml);
  if (!canonicalMatch) {
    throw new Error("Expected a <link rel=\"canonical\"> on a CCO Sintra event-detail page");
  }
  const permalink = canonicalMatch[1];
  if (!EVENT_PERMALINK_RE.test(permalink)) {
    // reset lastIndex since EVENT_PERMALINK_RE is a global regex reused above
    EVENT_PERMALINK_RE.lastIndex = 0;
    throw new Error(`Malformed CCO Sintra canonical permalink: ${permalink}`);
  }
  EVENT_PERMALINK_RE.lastIndex = 0;

  const titleMatch = /<h1>\s*([\s\S]*?)\s*<\/h1>/.exec(detailHtml);
  if (!titleMatch || titleMatch[1].trim() === "") {
    throw new Error("Expected a non-empty <h1> event title on a CCO Sintra event-detail page");
  }
  const title = titleMatch[1].trim();

  const dateBlockMatch = /<div class="ic-event-date">[\s\S]*?<\/div>/.exec(detailHtml);
  if (!dateBlockMatch) {
    throw new Error("Expected an ic-event-date block on a CCO Sintra event-detail page");
  }
  const dateBlock = dateBlockMatch[0];

  const dateMatch = /<span class="ic-single-next">([^<]+)<\/span>/.exec(dateBlock);
  if (!dateMatch) {
    throw new Error("Expected an ic-single-next date on a CCO Sintra event-detail page");
  }
  const date_iso = dateMatch[1].trim();

  const timeMatch = /<span class="ic-single-starttime">([^<]+)<\/span>/.exec(dateBlock);
  const time_text = timeMatch ? timeMatch[1].trim() : null;

  const venueText = extractBetween(
    detailHtml,
    /<span class="iCicon iCicon-location"[^>]*><\/span>&nbsp;\s*/,
    "</p>",
    "a venue (iCicon-location) line",
  );
  const venue_text = venueText.replace(/\s+/g, " ").trim();
  if (venue_text === "") {
    throw new Error("Expected non-empty venue text on a CCO Sintra event-detail page");
  }

  // Price is free text embedded in the prose description, inconsistently
  // present (investigation.json field_assessment.price: PARTIAL). Best
  // effort only: collect the paragraph(s) immediately following a
  // "Preço:" label, stopping at the first blank paragraph or a
  // "Bilhetes" (ticketing) paragraph — never treated as a reliable,
  // structured field.
  let price_text = null;
  const precoLabelMatch = /<strong>\s*Pre[cç]o:?\s*<\/strong>\s*<\/p>/i.exec(detailHtml);
  if (precoLabelMatch) {
    const after = detailHtml.slice(precoLabelMatch.index + precoLabelMatch[0].length);
    const paraRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
    const parts = [];
    let match;
    while ((match = paraRe.exec(after))) {
      const text = stripTags(match[1]);
      if (text === "" || /Bilhetes/i.test(text)) break;
      parts.push(text);
    }
    price_text = parts.length > 0 ? parts.join(" | ") : null;
  }

  return {
    title,
    date_iso,
    time_text,
    venue_text,
    price_text,
    permalink,
  };
}
