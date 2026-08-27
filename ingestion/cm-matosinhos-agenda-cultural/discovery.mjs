// Discovers Câmara Municipal de Matosinhos' (CM Matosinhos) own, native
// music-category events from its public, plain-GET, paginated,
// already-category-filtered "Eventos | Música" listing
// (https://www.cm-matosinhos.pt/servicos/comunicacao-e-imagem/eventos/musica,
// category_id 34), and extracts each event's own individual detail page
// (/evento/{slug}) — a structured add-to-calendar microformat plus a small
// number of labelled free-text fields — into a small factual record.
//
// Entirely based on the READY_FOR_ACTIVATION investigation retained at
// research/source-investigations/cm-matosinhos-agenda-cultural-amp-01/
// (investigation.json + evidence/). Mirrors ingestion/campo-pequeno/
// discovery.mjs's two-stage shape (list page -> detail-page URLs; detail
// page -> facts object), and ingestion/cm-gaia-eventos/discovery.mjs's
// same-platform-family pagination-link-reading convention. Every regex
// here is checked directly against the retained/derived evidence fixtures
// under fixtures/cm-matosinhos-agenda-cultural/ (genuine, byte-derived
// excerpts of research/source-investigations/
// cm-matosinhos-agenda-cultural-amp-01/evidence/), and reproduces the
// values already independently proven by that investigation's own
// evidence/offline-proof.mjs (evidence/offline-proof-output.txt).
//
// This module makes no network requests and never re-fetches the live
// site.
//
// Two-stage acquisition, matching collector_assessment.recommended_family
// (STATIC_EVENT_LIST):
//   1. parseMatosinhosMusicaListing() reads the category-filtered listing
//      page's own event cards for their permalink + title (the minimum
//      needed to reach each detail page), plus the listing's own directly-
//      stated date/location/category text, retained honestly for
//      provenance/cross-check only — never used as an Observation's own
//      authoritative fields (see observation-adapter.mjs's doc comment for
//      why detail-page facts, not listing facts, are authoritative here).
//   2. extractMatosinhosEventDetailFacts() reads one event's own detail
//      page for the fields that page alone states directly: the add-to-
//      calendar microformat (atc_date_start/atc_date_end/atc_timezone/
//      atc_location/atc_title/atc_description/atc_organizer), the
//      'Horário:'-labelled schedule field (present on some events, absent
//      on others — never guessed when absent), the 'Local:'-labelled
//      venue field, the category tags, and — only when the source's own
//      free-text 'Preços' heading is present in the 'text' widget_field —
//      a bounded, mechanical, deterministic split of that literal text
//      into individual price lines (field_assessment.price is PARTIAL, no
//      dedicated structured field exists; this module never invents one).
//
// No 'Organização:'-labelled field exists anywhere in the retained
// evidence (searched directly, absent from both sampled detail pages) —
// this module does not extract one. atc_organizer is present in the
// microformat but genuinely empty on every sampled event; it is retained
// honestly as null, never fabricated.
//
// wm:page_id (an internal numeric CMS id) is retained, for provenance
// ONLY, in the returned facts object's page_id field. It is never used as
// an identifier anywhere in this module or observation-adapter.mjs — the
// two retained detail-page fixtures mechanically prove it is NOT unique
// across distinct events (both literally carry wm:page_id 2805), exactly
// matching investigation.json's own warning.

const NAMED_ENTITIES = {
  aacute: "á", agrave: "à", atilde: "ã", ccedil: "ç", eacute: "é",
  ecirc: "ê", euro: "€", gt: ">", iacute: "í", ldquo: "“",
  nbsp: " ", ndash: "–", oacute: "ó", otilde: "õ", quot: '"',
  rdquo: "”", uacute: "ú", amp: "&", lt: "<", apos: "'",
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

const DEFAULT_BASE_URL = "https://www.cm-matosinhos.pt";

const LISTING_ITEM_RE = /<li class="cell[^"]*">[\s\S]*?<\/li>/g;
const LISTING_HREF_RE = /href="(\/evento\/[a-z0-9-]+)"/;
const LISTING_TITLE_RE = /<h2>([^<]*)<\/h2>/;
const LISTING_FULL_DATE_RE = /\d{4}\/\d{2}\/\d{2}/;
const LISTING_LOCATION_RE =
  /<div class="location widget_field "><div class="widget_label">Local:<\/div><div class="widget_value"><div class="writer_text">([^<]*)<div class="writer_text_clear">/;
const LISTING_CATEGORIES_RE =
  /<div class="categories widget_field "><div class="widget_value"><div>([\s\S]*?)<\/div><\/div><\/div>/;
const CATEGORY_SPAN_RE = /<span>([^<]*)<\/span>/g;

/**
 * Parse the "Eventos | Música" category listing page's HTML into a
 * deduplicated list of discovery records, one per distinct permalink
 * (first-occurrence order kept). Each record: `{ event_url, title,
 * date_text, location_text, category_tags, has_music_tag }` — everything
 * beyond `event_url`/`title` is the listing's own directly-stated text,
 * retained for provenance/cross-check only (see this module's own doc
 * comment for why observation-adapter.mjs never uses these listing-level
 * fields as an Observation's own authoritative fields).
 *
 * Throws on empty/non-string input; returns an empty array (never throws)
 * if genuinely no event cards are present in otherwise-valid HTML — a
 * legitimate "nothing on this page" result, never guessed at.
 */
export function parseMatosinhosMusicaListing(html, { baseUrl = DEFAULT_BASE_URL } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty CM Matosinhos 'Eventos | Música' listing HTML");
  }

  const seen = new Set();
  const records = [];

  for (const match of html.matchAll(LISTING_ITEM_RE)) {
    const block = match[0];
    const hrefMatch = LISTING_HREF_RE.exec(block);
    if (!hrefMatch) continue;
    const path = hrefMatch[1];
    if (seen.has(path)) continue;

    const titleMatch = LISTING_TITLE_RE.exec(block);
    if (!titleMatch) continue; // no title found for this permalink — skip, don't guess
    seen.add(path);

    const dateMatch = LISTING_FULL_DATE_RE.exec(block);
    const locationMatch = LISTING_LOCATION_RE.exec(block);
    const categoriesMatch = LISTING_CATEGORIES_RE.exec(block);
    const categoryTags = categoriesMatch
      ? [...categoriesMatch[1].matchAll(CATEGORY_SPAN_RE)].map((m) => decodeEntities(m[1]).trim())
      : [];

    records.push({
      event_url: `${baseUrl}${path}`,
      title: decodeEntities(titleMatch[1]).trim(),
      date_text: dateMatch ? dateMatch[0] : null,
      location_text: locationMatch ? decodeEntities(locationMatch[1]).trim() : null,
      category_tags: categoryTags,
      has_music_tag: categoryTags.includes("Eventos | Música"),
    });
  }

  return records;
}

const NEXT_PAGE_RE = /<div class="next_page">\s*<a[^>]*href="([^"]+)"/;

/**
 * Read the listing page's own "next page" pagination link
 * (`<div class="next_page"><a rel="next" href="...">`), or null if genuinely
 * absent (the terminal page carries none). Never constructs a
 * ?events_list_64_page=N URL itself — only reads what the page states, the
 * same convention as ingestion/cm-gaia-eventos/discovery.mjs's
 * parseCmGaiaEventosNextPageUrl().
 */
export function parseMatosinhosMusicaNextPageUrl(html, { baseUrl = DEFAULT_BASE_URL } = {}) {
  if (typeof html !== "string") return null;
  const match = NEXT_PAGE_RE.exec(html);
  if (!match) return null;
  const href = match[1];
  return href.startsWith("http") ? href : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
}

const CANONICAL_META_RE = /<meta name="canonical" content="([^"]*)"/;
const PAGE_TITLE_RE = /<h1 class="pageTitle">([^<]*)<\/h1>/;
const PAGE_ID_RE = /<meta name="wm:page_id" content="([^"]*)"/;
const ATC_VAR_RE = (name) => new RegExp(`<var class="${name}">([^<]*)<\\/var>`);
const DETAIL_LOCATION_RE =
  /<div class="location widget_field "><div class="widget_label">Local:<\/div><div class="widget_value"><div class="writer_text">([^<]*)<div class="writer_text_clear">/;
const DETAIL_SCHEDULE_RE =
  /<div class="schedule widget_field "><div class="widget_label">Hor[áa]rio:<\/div><div class="widget_value">([\s\S]*?)<\/div><\/div><\/div>/;
const DETAIL_CATEGORIES_RE =
  /<div class="categories widget_field "><div class="widget_value"><div>([\s\S]*?)<\/div><\/div><\/div>/;
const TEXT_FIELD_RE =
  /<div class="text widget_field "><div class="widget_value">([\s\S]*?)<\/div><\/div><\/div>/;
// "Preços" is entity-encoded as "Pre&ccedil;os" in the retained markup
// (never a literal "ç") — matched directly against the raw, undecoded
// HTML, so this pattern must match the entity form, not the decoded one.
const PRICE_SECTION_RE = /<strong>Pre(?:&ccedil;|[çc])os\s*(?:<br\s*\/?>)?\s*<\/strong>([\s\S]*?)<\/p>/i;

function stripTags(html) {
  return typeof html === "string" ? html.replace(/<[^>]*>/g, "") : html;
}

/**
 * Bounded, mechanical, deterministic extraction of the source's own
 * "Preços" free-text section within the 'text' widget_field block (see
 * this module's own doc comment — field_assessment.price is PARTIAL, no
 * dedicated structured field exists). Splits the literal text following
 * the "Preços" heading on its own `<br />` line breaks, decodes entities,
 * and trims each line. Returns an empty array (never null, never guessed)
 * when the source states no "Preços" heading at all — a real, honest
 * absence (see fixtures/cm-matosinhos-agenda-cultural/pages/
 * detail-hospitalarios.html, which has no price text anywhere).
 */
export function extractPriceLines(textFieldHtml) {
  if (typeof textFieldHtml !== "string") return [];
  const match = PRICE_SECTION_RE.exec(textFieldHtml);
  if (!match) return [];
  return match[1]
    .split(/<br\s*\/?>/i)
    .map((line) => decodeEntities(stripTags(line)).trim())
    .filter((line) => line !== "");
}

/**
 * Extract one CM Matosinhos event detail page's own directly-stated
 * fields from that page's raw HTML. Throws on missing/malformed required
 * elements — title, canonical event_url, the add-to-calendar microformat's
 * atc_date_start/atc_date_end/atc_timezone, and the 'Local:' venue field —
 * all of which field_assessment.* records as PROVEN/DIRECT_SOURCE and
 * which were present on both sampled detail pages in the retained
 * evidence. schedule_text and price_lines are read leniently (null / an
 * empty array, never a thrown error) since neither has a dedicated
 * structured field on every event (see this module's own doc comment).
 */
export function extractMatosinhosEventDetailFacts(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty CM Matosinhos event-detail HTML");
  }

  const canonicalMatch = CANONICAL_META_RE.exec(html);
  const eventUrl = canonicalMatch ? canonicalMatch[1].trim() : null;
  if (!eventUrl) {
    throw new Error('Expected a <meta name="canonical"> tag on a CM Matosinhos event detail page');
  }

  const titleMatch = ATC_VAR_RE("atc_title").exec(html) ?? PAGE_TITLE_RE.exec(html);
  const title = titleMatch ? decodeEntities(titleMatch[1]).trim() : null;
  if (!title) {
    throw new Error("Expected an atc_title (or <h1 class=\"pageTitle\">) on a CM Matosinhos event detail page");
  }

  const dateStartMatch = ATC_VAR_RE("atc_date_start").exec(html);
  const dateEndMatch = ATC_VAR_RE("atc_date_end").exec(html);
  const timezoneMatch = ATC_VAR_RE("atc_timezone").exec(html);
  if (!dateStartMatch || !dateEndMatch || !timezoneMatch) {
    throw new Error(
      "Expected a complete add-to-calendar microformat (atc_date_start/atc_date_end/atc_timezone) on a CM Matosinhos event detail page",
    );
  }

  const locationMatch = DETAIL_LOCATION_RE.exec(html);
  const locationText = locationMatch ? decodeEntities(locationMatch[1]).trim() : null;
  if (!locationText) {
    throw new Error('Expected a "Local:" location field on a CM Matosinhos event detail page');
  }

  const atcLocationMatch = ATC_VAR_RE("atc_location").exec(html);
  const atcDescriptionMatch = ATC_VAR_RE("atc_description").exec(html);
  const atcOrganizerMatch = ATC_VAR_RE("atc_organizer").exec(html);
  const organizerText =
    atcOrganizerMatch && atcOrganizerMatch[1].trim() !== "" ? decodeEntities(atcOrganizerMatch[1]).trim() : null;

  const scheduleMatch = DETAIL_SCHEDULE_RE.exec(html);
  const scheduleText = scheduleMatch ? decodeEntities(stripTags(scheduleMatch[1])).trim() || null : null;

  const categoriesMatch = DETAIL_CATEGORIES_RE.exec(html);
  const categoryTags = categoriesMatch
    ? [...categoriesMatch[1].matchAll(CATEGORY_SPAN_RE)].map((m) => decodeEntities(m[1]).trim())
    : [];

  const textFieldMatch = TEXT_FIELD_RE.exec(html);
  const priceLines = textFieldMatch ? extractPriceLines(textFieldMatch[1]) : [];

  const pageIdMatch = PAGE_ID_RE.exec(html);

  return {
    title,
    event_url: eventUrl,
    date_start_text: dateStartMatch[1].trim(),
    date_end_text: dateEndMatch[1].trim(),
    timezone: timezoneMatch[1].trim(),
    location_text: locationText,
    atc_location: atcLocationMatch ? decodeEntities(atcLocationMatch[1]).trim() : null,
    description_text: atcDescriptionMatch && atcDescriptionMatch[1].trim() !== "" ? decodeEntities(atcDescriptionMatch[1]).trim() : null,
    organizer_text: organizerText,
    schedule_text: scheduleText,
    category_tags: categoryTags,
    price_lines: priceLines,
    page_id: pageIdMatch ? pageIdMatch[1].trim() : null, // provenance ONLY — never a stable identifier, see module doc comment
  };
}

/**
 * true only when `category_tags` contains the source's own literal
 * "Eventos | Música" tag — a defensive, honest assertion helper (every
 * event reached via the /musica category-filtered listing already carries
 * this tag server-side; this module does not filter on it, matching
 * investigation.json's own recommended acquisition path).
 */
export function hasMusicCategoryTag(categoryTags) {
  return Array.isArray(categoryTags) && categoryTags.includes("Eventos | Música");
}
