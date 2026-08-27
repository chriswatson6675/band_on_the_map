// Discovers Sagres Campo Pequeno's own individual event detail pages from
// its public agenda list page (https://www.sagrescampopequeno.pt/pt/agenda),
// and extracts each detail page's own directly-stated fields (title, full
// date+weekday, venue location, start/doors time free text, and a
// multi-tier admission price list) into a small factual record.
//
// Entirely based on the READY_FOR_ACTIVATION investigation retained at
// research/source-investigations/campo-pequeno-lisbon-01/ (investigation.json
// + evidence/). Mirrors ingestion/capitolio/discovery.mjs and
// ingestion/museu-do-fado/discovery.mjs's two-stage shape (list page ->
// detail-page URLs; detail page -> facts object). Every regex here is
// checked directly against the retained/derived evidence fixtures under
// fixtures/campo-pequeno/ (genuine excerpts of
// research/source-investigations/campo-pequeno-lisbon-01/evidence/), proven
// correct against evidence/offline-proof.mjs's own independently-derived
// values (evidence/offline-proof-output.txt).
//
// This module makes no network requests and never re-fetches the live
// site.
//
// source_record_id / event_url: the agenda page's own cards link via the
// agenda-relative form (/pt/agenda/{slug}), but investigation.json's
// field_assessment.source_record_id and .event_url both PROVE the short
// canonical form (https://www.sagrescampopequeno.pt/pt/{slug}, the site's
// own <link rel="canonical"> target, corroborated by its sitemap and an
// empirical cross-fetch) as the stable identifying path — so this module's
// discovery step deliberately normalises every agenda-card href into that
// canonical short form, never the agenda-relative one, and
// extractCampoPequenoEventFacts() reads event_url from each detail page's
// own <link rel="canonical"> tag directly.
//
// Dates: each detail page's own header block states an unambiguous
// Portuguese "D month YYYY , weekday" calendar date (e.g.
// "16 outubro 2026 , sexta-feira") in one single directly-stated string —
// field_assessment.start_date's basis is DIRECT_SOURCE, not
// DETERMINISTIC_CONTEXT, because this is one complete fact, not a
// combination of separate context pieces. This module mechanically
// reformats that exact shape into an ISO calendar date (date_iso) and the
// stated weekday text (weekday_text) — never guesses at a different shape.
// No timezone/UTC offset is stated anywhere in the retained evidence for
// any date/time field — these are floating-local values (see
// investigation.json field_assessment.start_date/time notes).
//
// Time: field_assessment.time.state is PARTIAL, not PROVEN — the retained
// evidence shows the "Sessões" tab's free-text start/doors time format is
// NOT consistent across events (2 distinct patterns observed in the
// 4-sampled-event bound). This module implements both retained patterns
// (mirroring evidence/offline-proof.mjs's patternA/patternB exactly) and
// leniently returns time_text = null (never throws, never guesses a third
// shape) when neither pattern matches.
//
// Cancellation: the source has no structured status/cancelled field — the
// ONLY signals observed in the retained evidence (collector_assessment
// blockers) are free text: "- cancelado" appended to the event's own <h1>
// title, and "Evento Cancelado" appearing inside the Sessões tab's own free
// text (both observed together on the one sampled cancelled event,
// brandi-carlile---cancelado). is_cancelled is derived honestly from
// EITHER signal being present — never silently dropped, never presented as
// an active/purchasable event.

const AGENDA_HREF_RE = /href="\/pt\/agenda\/([a-z0-9-]+)"/g;
const CANONICAL_BASE = "https://www.sagrescampopequeno.pt/pt/";

// Only the small, fixed set of named HTML entities actually observed in
// this source's retained evidence (accented Portuguese characters are
// encoded as named entities in some blocks, e.g. "Sess&otilde;es" tab
// content, but appear as literal UTF-8 characters elsewhere, e.g. the
// "date"/"location" divs) — mirrors the exact ENTITY_MAP
// research/source-investigations/campo-pequeno-lisbon-01/evidence/
// offline-proof.mjs already proved sufficient. Not a general-purpose HTML
// entity decoder.
const NAMED_ENTITIES = {
  iacute: "í", aacute: "á", atilde: "ã", oacute: "ó", ocirc: "ô",
  ecirc: "ê", eacute: "é", egrave: "è", ccedil: "ç", uacute: "ú",
  ucirc: "û", otilde: "õ", agrave: "à", acirc: "â", ntilde: "ñ",
  ograve: "ò", ordm: "º", ordf: "ª", nbsp: " ", amp: "&", quot: '"',
  apos: "'",
};

function decodeEntities(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/&#0*39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&([a-zA-Z]+);/g, (full, name) =>
      Object.prototype.hasOwnProperty.call(NAMED_ENTITIES, name) ? NAMED_ENTITIES[name] : full,
    );
}

const PT_MONTHS = {
  janeiro: "01",
  fevereiro: "02",
  "março": "03",
  marco: "03",
  abril: "04",
  maio: "05",
  junho: "06",
  julho: "07",
  agosto: "08",
  setembro: "09",
  outubro: "10",
  novembro: "11",
  dezembro: "12",
};

/**
 * Parse the agenda list page's HTML into a deduplicated list of this
 * source's own individual event detail-page URLs, normalised to the
 * PROVEN-stable short canonical form (https://www.sagrescampopequeno.pt/pt/
 * {slug}) — never the agenda-relative form the raw markup itself links
 * with. Order follows first appearance in the document. Throws on empty
 * input; returns an empty array (never throws) if genuinely no agenda-card
 * links are present in otherwise-valid HTML.
 */
export function parseCampoPequenoAgendaLinks(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Sagres Campo Pequeno agenda-list HTML");
  }
  const slugs = [...new Set([...html.matchAll(AGENDA_HREF_RE)].map((m) => m[1]))];
  return slugs.map((slug) => `${CANONICAL_BASE}${slug}`);
}

/**
 * Mechanically parse a single "D month YYYY , weekday" date (e.g.
 * "16 outubro 2026 , sexta-feira") into { date_iso, weekday_text }.
 * Returns { date_iso: null, weekday_text: null } for anything that is not
 * exactly this shape — deliberately never guesses.
 */
export function parseCampoPequenoDate(dateText) {
  if (typeof dateText !== "string") return { date_iso: null, weekday_text: null };
  const match = /^([0-9]{1,2})\s+(\p{L}+)\s+(20[0-9]{2})\s*,\s*(\p{L}[\p{L}-]*)$/u.exec(dateText.trim());
  if (!match) return { date_iso: null, weekday_text: null };
  const month = PT_MONTHS[match[2].toLowerCase()];
  if (!month) return { date_iso: null, weekday_text: null };
  const day = match[1].padStart(2, "0");
  const year = match[3];
  return { date_iso: `${year}-${month}-${day}`, weekday_text: match[4].trim() };
}

// Bounds the header-info block the same way evidence/offline-proof.mjs
// does: from the "event-header-info" marker to the first pair of adjacent
// closing </div> tags (empirically confirmed to bound exactly the date,
// location, and buy-ticket link — never a neighbouring block).
function extractHeaderBlock(html) {
  const match = /event-header-info[\s\S]*?<\/div>\s*<\/div>/.exec(html);
  return match ? match[0] : null;
}

// Bounds the "Sessões" tab-pane the same way evidence/offline-proof.mjs's
// two time patterns are anchored: relative to the id="sessions" marker.
function extractSessionsBlock(html) {
  const startIndex = html.indexOf('id="sessions"');
  if (startIndex === -1) return null;
  const endIndex = html.indexOf("</div>", startIndex);
  return endIndex === -1 ? html.slice(startIndex) : html.slice(startIndex, endIndex + "</div>".length);
}

// Two retained free-text time formats (see module doc comment and
// investigation.json field_assessment.time.notes) — never merged into one
// over-permissive regex, since the inconsistency itself is a real,
// material finding.
const PATTERN_A = /In[íi]cio de espet[áa]culo:\s*([0-9]{1,2}[Hh][0-9]{2})[\s\S]*?Abertura de portas:\s*([0-9]{1,2}[Hh][0-9]{2})/;
const PATTERN_B = /Abertura de [Pp]ortas\s+([0-9]{1,2}[Hh][0-9]{2})[\s\S]*?Inicio do Espet[áa]culo\s+([0-9]{1,2}[Hh][0-9]{2})/;

function extractTimeText(sessionsBlock) {
  if (!sessionsBlock) return null;
  const patternA = PATTERN_A.exec(sessionsBlock);
  if (patternA) {
    return `Início de espetáculo: ${patternA[1]} · Abertura de portas: ${patternA[2]}`;
  }
  const patternB = PATTERN_B.exec(sessionsBlock);
  if (patternB) {
    return `Início de espetáculo: ${patternB[2]} · Abertura de portas: ${patternB[1]}`;
  }
  return null;
}

const PRICE_TIER_RE = /data-areaname="([^"]*)"\s*data-price="([^"]*)"/g;

function extractPriceTiers(html) {
  return [...html.matchAll(PRICE_TIER_RE)].map((m) => ({ area: m[1], price: m[2] }));
}

/**
 * Extract one Sagres Campo Pequeno event detail page's own directly-stated
 * fields from that page's raw HTML. Throws on missing/malformed required
 * elements — title, canonical event_url, the header-info block and its
 * date+location, and at least one priced admission tier — all of which
 * field_assessment.* records as PROVEN/DIRECT_SOURCE and which were present
 * on 4/4 sampled detail pages in the retained evidence. time_text is read
 * leniently (null, not a thrown error, when neither retained free-text
 * pattern matches) since field_assessment.time.state is PARTIAL, not
 * PROVEN.
 */
export function extractCampoPequenoEventFacts(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Sagres Campo Pequeno event-detail HTML");
  }

  const decodedHtml = decodeEntities(html);

  const h1Match = /<h1 class="font-bold">([^<]*)<\/h1>/.exec(decodedHtml);
  const title = h1Match ? h1Match[1].trim() : null;
  if (!title) {
    throw new Error("Expected an <h1 class=\"font-bold\"> event title on a Sagres Campo Pequeno event detail page");
  }

  const canonicalMatch = /<link rel="canonical" href="([^"]*)">/.exec(decodedHtml);
  const eventUrl = canonicalMatch ? canonicalMatch[1].trim() : null;
  if (!eventUrl) {
    throw new Error('Expected a <link rel="canonical"> tag on a Sagres Campo Pequeno event detail page');
  }

  const headerBlock = extractHeaderBlock(decodedHtml);
  if (!headerBlock) {
    throw new Error('Expected an "event-header-info" block on a Sagres Campo Pequeno event detail page');
  }

  const dateMatch = /<div class="date">\s*([^<]*?)\s*<\/div>/.exec(headerBlock);
  const dateText = dateMatch ? dateMatch[1].trim() : null;
  if (!dateText) {
    throw new Error('Expected a "date" field within the event-header-info block');
  }

  const locationMatch = /<div class="location">([^<]*)<\/div>/.exec(headerBlock);
  const venueText = locationMatch ? locationMatch[1].trim() : null;
  if (!venueText) {
    throw new Error('Expected a "location" field within the event-header-info block');
  }

  const { date_iso: dateIso, weekday_text: weekdayText } = parseCampoPequenoDate(dateText);

  const priceTiers = extractPriceTiers(decodedHtml);
  if (priceTiers.length === 0) {
    throw new Error("Expected at least one priced admission tier (data-areaname/data-price) on a Sagres Campo Pequeno event detail page");
  }

  const sessionsBlock = extractSessionsBlock(decodedHtml);
  const timeText = extractTimeText(sessionsBlock);

  // The ONLY two cancellation signals observed anywhere in the retained
  // evidence (no structured status field exists) — see module doc comment.
  const isCancelled =
    /cancelado/i.test(title) || (sessionsBlock != null && /evento cancelado/i.test(sessionsBlock));

  return {
    title,
    date_text: dateText,
    date_iso: dateIso,
    weekday_text: weekdayText,
    time_text: timeText,
    venue_text: venueText,
    price_tiers: priceTiers,
    event_url: eventUrl,
    is_cancelled: isCancelled,
  };
}
