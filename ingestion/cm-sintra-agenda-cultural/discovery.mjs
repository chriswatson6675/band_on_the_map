// Discovers Câmara Municipal de Sintra — Agenda Cultural's own Música
// ("Music") occurrences from its first-party, server-side category+date
// filtered agenda list (https://cm-sintra.pt/agenda?filter_from=<today>&
// filter_category=3), and extracts each detail permalink's own bounded
// event-content block for the one field the list rows do not carry
// (price).
//
// Built entirely from the retained, READY_FOR_ACTIVATION investigation at
// research/source-investigations/cm-sintra-agenda-cultural-01/
// (investigation.json + evidence/) — no live fetch was performed to write
// this module. See fixtures/cm-sintra-agenda-cultural/metadata.json for
// exactly which retained evidence each fixture file was derived from.
//
// Platform: Joomla running the "iCagenda" (com_icagenda) events-calendar
// extension — the SAME platform family as the sibling cco-sintra-01
// investigation, but a genuinely distinct install/domain
// (investigation.json site_classification). The list page is fully
// server-rendered HTML — no JSON-LD Event/MusicEvent data, no
// client-side rendering needed anywhere.
//
// UNLIKE cco-sintra: this instance exposes a genuine, first-party,
// server-side category filter (?filter_category=3 for "Música") combined
// with a date lower-bound (?filter_from=<today>), independently proven
// functional (not decorative) by cross-checking it record-for-record
// against the raw unfiltered listing's own category tally (investigation.json
// collector_assessment / decision.reasons). This means the filtered list
// page itself already states every sampled Música row's own full title,
// full ISO date, start time, venue, and permalink directly — no
// DETERMINISTIC_CONTEXT combination or detail-page round-trip is needed
// for those fields (field_assessment: DIRECT_SOURCE throughout). This
// module's parseCmSintraAgendaMusicRecords() is therefore the PRIMARY raw-
// record source; extractCmSintraEventFacts() (detail-page extraction) is
// only needed to add price_text, the one field genuinely absent from the
// list rows.
//
// STABLE IDENTIFIER, IMPORTANT NUANCE (investigation.json
// field_assessment.source_record_id.notes, empirically demonstrated, not
// assumed): each row's own internal numeric event id (visible only in an
// HTML class attribute, e.g. "ic-event-id-148", never in any URL) is NOT
// alone a per-occurrence-unique key — the SAME id 148 serves two different
// calendar dates of one multi-date production ("Evita", 2026-09-03 and
// 2026-09-04). This source's public permalink URLs carry no numeric id at
// all — the shape is /agenda/{slug}/{date}-{time} — and ARE proven stable
// per occurrence: this platform emits no <link rel="canonical"> at all
// (confirmed absent), but each retained detail page's own
// <meta property="og:url"> exactly self-matches the URL it was fetched
// from (2/2). A caller (ingestion/cm-sintra-agenda-cultural/
// observation-adapter.mjs) must always derive source_record_id from the
// full permalink path, never the internal numeric id — see that module's
// deriveSourceRecordId().

const AGENDA_ORIGIN = "https://cm-sintra.pt";

// Matches this source's own per-occurrence permalink path exactly as
// observed on every retained list-row and detail-page's own og:url:
// /agenda/{slug}/{YYYY-MM-DD}-{HH}-{MM} — no numeric id prefix (unlike
// the sibling cco-sintra source).
const EVENT_PERMALINK_RE = /\/agenda\/[a-z0-9-]+\/\d{4}-\d{2}-\d{2}-\d{2}-\d{2}/;

// Each list row begins with this exact wrapper (the row's own internal,
// NOT-per-occurrence-unique numeric id lives here — see the stable
// identifier nuance above). Splitting on this marker isolates one row's
// own markup from the next row's, so field regexes below never
// accidentally cross into a different occurrence.
const ROW_START_RE = /<div class="ic-list-event ic-clearfix ic-event-id-\d+">/g;

// The list page's own pagination "next page" pointer
// (<div class="ic-next"><a rel="next" href="...">), read only — never
// constructs a page-N URL itself. This exact markup is confirmed present
// on this source's unfiltered listing (evidence/body-agenda.html); no
// retained filtered-category result was ever large enough to paginate,
// so this function is honest, generic markup-reading, not a claim that a
// filtered result has ever been observed to paginate.
const NEXT_PAGE_RE = /<div class="ic-next"><a rel="next" href="([^"]+)"/;

function assertNonEmptyHtml(html, what) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error(`Expected non-empty CM Sintra Agenda Cultural ${what} HTML`);
  }
}

function resolveUrl(path) {
  return path.startsWith("http") ? path : `${AGENDA_ORIGIN}${path}`;
}

function collapseWhitespace(text) {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Read the list page's own <div class="ic-next"><a rel="next" href="...">
 * pagination pointer, resolved to an absolute URL, or null if absent (the
 * retained combined filter_from+filter_category=3 result never carried
 * one — see this module's doc comment). Never constructs a page-N URL
 * itself — only reads what the page states.
 */
export function parseCmSintraNextPageUrl(html) {
  if (typeof html !== "string") return null;
  const match = NEXT_PAGE_RE.exec(html);
  return match ? resolveUrl(match[1]) : null;
}

/**
 * Parse one CM Sintra Agenda Cultural filtered agenda list-page HTML
 * document (e.g. ?filter_from=<date>&filter_category=3) into an array of
 * raw event records, one per list row, in document order. Unlike the
 * sibling cco-sintra source, every field here except price is already
 * directly stated on the list row itself (investigation.json
 * field_assessment: DIRECT_SOURCE throughout), so this is the primary
 * record source a caller should use — see this module's doc comment.
 *
 * Each record: { title, date_iso, time_text, venue_text, category_text,
 * price_text: null, permalink }. price_text is always null here (never
 * present on a list row); extractCmSintraEventFacts() below adds it from
 * a fetched detail page when available. Returns an empty array (never
 * throws) if no event rows are present — a legitimate "nothing currently
 * listed" result, not a parse failure.
 */
export function parseCmSintraAgendaMusicRecords(html) {
  assertNonEmptyHtml(html, "agenda list-page");

  const rows = html.split(ROW_START_RE).slice(1);
  const records = [];

  for (const row of rows) {
    const permalinkMatch = EVENT_PERMALINK_RE.exec(row);
    if (!permalinkMatch) {
      throw new Error("Expected a per-occurrence permalink on a CM Sintra Agenda Cultural list row");
    }
    const permalink = resolveUrl(permalinkMatch[0]);

    const titleMatch = /<h3>\s*<a[^>]*>\s*([\s\S]*?)\s*<\/a>\s*<\/h3>/.exec(row);
    if (!titleMatch || titleMatch[1].trim() === "") {
      throw new Error("Expected a non-empty <h3> event title on a CM Sintra Agenda Cultural list row");
    }
    const title = collapseWhitespace(titleMatch[1]);

    const categoryMatch = /ic-title-cat-btn[^>]*>\s*([^<]+?)\s*<\/a>/.exec(row);
    const category_text = categoryMatch ? collapseWhitespace(categoryMatch[1]) : null;

    const dateMatch = /<span class="ic-single-next">([^<]+)<\/span>/.exec(row);
    if (!dateMatch) {
      throw new Error("Expected an ic-single-next date on a CM Sintra Agenda Cultural list row");
    }
    const date_iso = dateMatch[1].trim();

    const timeMatch = /<span class="ic-single-starttime">([^<]+)<\/span>/.exec(row);
    const time_text = timeMatch ? timeMatch[1].trim() : null;

    const venueMatch = /<div class="place ic-place">([\s\S]*?)<\/div>/.exec(row);
    if (!venueMatch) {
      throw new Error("Expected a place (ic-place) line on a CM Sintra Agenda Cultural list row");
    }
    const venue_text = collapseWhitespace(venueMatch[1]);
    if (venue_text === "") {
      throw new Error("Expected non-empty venue text on a CM Sintra Agenda Cultural list row");
    }

    records.push({
      title,
      date_iso,
      time_text,
      venue_text,
      category_text,
      price_text: null,
      permalink,
    });
  }

  return records;
}

/**
 * Extract one CM Sintra Agenda Cultural event-detail page's own bounded
 * event-content facts. Returns the SAME record shape as
 * parseCmSintraAgendaMusicRecords() above, but with price_text populated
 * (best-effort — see below) — used to enrich a list-derived record, or as
 * a standalone extraction when only a detail page is available. Throws if
 * a required, always-directly-stated element is missing or malformed
 * (title, og:url self-declared permalink, date, venue — every retained
 * detail page carried all four directly).
 *
 * This platform emits no <link rel="canonical"> at all (confirmed absent
 * in investigation.json's site_classification); the permalink is instead
 * read from the page's own self-declared <meta property="og:url">, proven
 * to exactly match the fetched URL on both retained detail pages (2/2).
 *
 * end/duration is intentionally never extracted here: investigation.json
 * field_assessment.end.state is NOT_PRESENT — no end-time, duration, or
 * "Duração:" field of any kind was found anywhere on either retained
 * detail page, so no code path here even attempts one.
 */
export function extractCmSintraEventFacts(detailHtml) {
  assertNonEmptyHtml(detailHtml, "event-detail page");

  const ogUrlMatch = /<meta property="og:url" content="([^"]+)"\s*\/?>/.exec(detailHtml);
  if (!ogUrlMatch) {
    throw new Error('Expected a <meta property="og:url"> on a CM Sintra Agenda Cultural event-detail page');
  }
  const permalink = ogUrlMatch[1];
  if (!EVENT_PERMALINK_RE.test(permalink)) {
    throw new Error(`Malformed CM Sintra Agenda Cultural og:url permalink: ${permalink}`);
  }

  const titleMatch = /<h1>\s*([\s\S]*?)\s*<\/h1>/.exec(detailHtml);
  if (!titleMatch || titleMatch[1].trim() === "") {
    throw new Error("Expected a non-empty <h1> event title on a CM Sintra Agenda Cultural event-detail page");
  }
  const title = collapseWhitespace(titleMatch[1]);

  const categoryMatch = /<div class="title-cat ic-title-cat[^"]*"[^>]*>\s*([^<]+?)\s*<\/div>/.exec(detailHtml);
  const category_text = categoryMatch ? collapseWhitespace(categoryMatch[1]) : null;

  const dateBlockMatch = /<div class="ic-event-date">[\s\S]*?<\/div>/.exec(detailHtml);
  if (!dateBlockMatch) {
    throw new Error("Expected an ic-event-date block on a CM Sintra Agenda Cultural event-detail page");
  }
  const dateBlock = dateBlockMatch[0];

  const dateMatch = /<span class="ic-single-next">([^<]+)<\/span>/.exec(dateBlock);
  if (!dateMatch) {
    throw new Error("Expected an ic-single-next date on a CM Sintra Agenda Cultural event-detail page");
  }
  const date_iso = dateMatch[1].trim();

  const timeMatch = /<span class="ic-single-starttime">([^<]+)<\/span>/.exec(dateBlock);
  const time_text = timeMatch ? timeMatch[1].trim() : null;

  const venueMatch = /<span class="iCicon iCicon-location"[^>]*><\/span>&nbsp;\s*([\s\S]*?)<\/p>/.exec(detailHtml);
  if (!venueMatch) {
    throw new Error("Expected a venue (iCicon-location) line on a CM Sintra Agenda Cultural event-detail page");
  }
  const venue_text = collapseWhitespace(venueMatch[1]);
  if (venue_text === "") {
    throw new Error("Expected non-empty venue text on a CM Sintra Agenda Cultural event-detail page");
  }

  // Price is neither a dedicated field nor a reliably present one
  // (investigation.json field_assessment.price: PARTIAL). Best effort
  // only, and deliberately narrow: only a "Preço:" labelled paragraph
  // inside the event's own ic-full-description block counts. A naive
  // whole-page "gratuit*" text search would be actively wrong — the word
  // "gratuita" appears on the retained Evita page inside an UNRELATED
  // footer news-slider item about a different venue's free exhibition,
  // not about Evita's own price (investigation.json field_assessment.
  // price.notes). This never matches either retained fixture, honestly
  // resolving to null for both.
  const fullDescMatch = /<div class="ic-full-description">([\s\S]*?)<\/div>/.exec(detailHtml);
  let price_text = null;
  if (fullDescMatch) {
    const precoLabelMatch = /<p[^>]*>\s*<strong>\s*Pre[cç]o:?\s*<\/strong>\s*<\/p>/i.exec(fullDescMatch[1]);
    if (precoLabelMatch) {
      const after = fullDescMatch[1].slice(precoLabelMatch.index + precoLabelMatch[0].length);
      const paraRe = /<p[^>]*>([\s\S]*?)<\/p>/g;
      const parts = [];
      let match;
      while ((match = paraRe.exec(after))) {
        const text = collapseWhitespace(match[1].replace(/<[^>]+>/g, " "));
        if (text === "" || /Bilhetes/i.test(text)) break;
        parts.push(text);
      }
      price_text = parts.length > 0 ? parts.join(" | ") : null;
    }
  }

  return {
    title,
    date_iso,
    time_text,
    venue_text,
    category_text,
    price_text,
    permalink,
  };
}
