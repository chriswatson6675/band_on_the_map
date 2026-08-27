// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Salle Pleyel's own bespoke
// per-event detail-page parser — see
// research/source-investigations/salle-pleyel-paris-01/. This is a
// WordPress site whose own <script type="application/ld+json"> block is
// WebPage/BreadcrumbList/WebSite/Organization only (NOT a schema.org
// Event) — this project's existing ingestion/json-ld/ family therefore
// does not apply to the actual event fields here. The real date/time and
// price data instead lives in the detail page's own schema.org MICRODATA
// (itemprop attributes, plain HTML <time>/<table> markup), which this
// module parses directly. List -> detail discovery itself can reuse the
// EXISTING, unmodified ingestion/html-link-discovery/discovery.mjs
// (pattern: `href="(https://www.sallepleyel.com/evenement/[a-z0-9-]+/)"`),
// so only the field-extraction half of this source is genuinely new code.

const BREADCRUMB_NAME_RE = /"@type":"ListItem","position":2,"name":"([^"]+)"/;
const SCHEDULE_TIME_RE = /<time datetime="(\d{4}-\d{2}-\d{2})UTC(\d{2}:\d{2})">/;
const LOW_PRICE_RE = /itemprop="lowPrice">\s*([\d.,]+)\s*<\/meta>/;
const HIGH_PRICE_RE = /itemprop="highPrice">\s*([\d.,]+)\s*<\/meta>/;
const CURRENCY_RE = /itemprop="priceCurrency" content="([^"]+)"/;
const TICKET_URL_RE = /href="(https:\/\/tickets\.sallepleyel\.com\/[^"]+)"/;

/**
 * Extract this source's own per-event detail-page fields. Never throws on
 * a missing optional field (price/ticket URL) — only requires the page to
 * genuinely be parseable HTML; a field the page does not expose stays
 * null rather than being fabricated.
 */
export function extractEventDetail(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Salle Pleyel event detail-page HTML");
  }

  const breadcrumbName = BREADCRUMB_NAME_RE.exec(html);
  const scheduleTime = SCHEDULE_TIME_RE.exec(html);
  const lowPrice = LOW_PRICE_RE.exec(html);
  const highPrice = HIGH_PRICE_RE.exec(html);
  const currency = CURRENCY_RE.exec(html);
  const ticketUrl = TICKET_URL_RE.exec(html);

  return {
    // The page's own JSON-LD BreadcrumbList states a clean event/artist
    // name at position 2 (e.g. "FKJ") — a directly retained structured
    // field, distinct from the page's own long SEO-sentence <title>.
    title: breadcrumbName ? breadcrumbName[1].trim() : null,
    // This source's own schedule <time datetime="YYYY-MM-DDUTC HH:MM">
    // attribute — a non-standard but directly machine-readable
    // concatenation the site itself emits; "UTC" in the literal attribute
    // text is this source's own label, NOT independently confirmed to be
    // a true UTC offset (see observation-adapter.mjs, which honestly
    // treats this as FLOATING_LOCAL, mirroring this project's own
    // documented precedent for exactly this kind of source-side labelling
    // quirk, e.g. Lido Berlin's JSON-LD offset bug).
    date: scheduleTime ? scheduleTime[1] : null,
    time: scheduleTime ? scheduleTime[2] : null,
    lowPrice: lowPrice ? lowPrice[1].trim() : null,
    highPrice: highPrice ? highPrice[1].trim() : null,
    priceCurrency: currency ? currency[1].trim() : null,
    ticketUrl: ticketUrl ? ticketUrl[1] : null,
  };
}
