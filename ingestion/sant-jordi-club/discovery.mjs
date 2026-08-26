// BARCELONA-30-VENUE-POPULATION-01 — Sant Jordi Club, the smaller indoor
// hall within Barcelona's Anella Olímpica complex (Palau Sant Jordi).
// The complex's own events listing page contains real, statically
// -crawlable `/en/{slug}` links shared across every hall in the complex
// (the main Palau Sant Jordi arena, Estadi Olímpic Lluís Companys, AND
// Sant Jordi Club) — each individual event page then states its own
// exact hall as a literal JavaScript variable assignment
// (`let address = "..."`) in otherwise-static HTML (a client-rendering
// framework populates the page's real schema.org JSON-LD from this
// value at runtime, but the value itself is already present, verbatim,
// in the server-sent HTML — no JS execution is needed to read it).
// Proven live in research/source-investigations/sant-jordi-club-barcelona-01/.
//
// Only records whose own `address` value is EXACTLY "Sant Jordi Club"
// are ever retained — a record naming a different hall in the same
// complex is discarded, never silently misattributed.

// Known non-event navigation/info paths observed directly on the real
// listing page (accessibility info, "how to arrive", etc.) — excluded
// so this module doesn't waste a fetch discovering they aren't events;
// this is a real, evidenced exclusion list, not a guess, and is
// deliberately small/bounded (a future new nav page not in this list
// simply gets fetched and excluded by parseSantJordiEventPage() below
// instead, at the cost of one extra fetch, never a silent miss).
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

/**
 * Parse the Anella Olímpica complex's events-listing page HTML into a
 * deduplicated list of candidate event detail-page URLs (known
 * navigation pages excluded — see KNOWN_NON_EVENT_SLUGS above). Every
 * remaining URL is a CANDIDATE only; whether it is genuinely an event at
 * Sant Jordi Club specifically is decided per-page by
 * parseSantJordiEventPage() below.
 */
export function parseSantJordiListingLinks(html) {
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

export const SANT_JORDI_CLUB_HALL_NAME = "Sant Jordi Club";

/**
 * Parse one event detail page's HTML. Returns `null` (never throws) if
 * this page does not carry the expected `address`/`startDate`
 * JavaScript variables at all (a non-event nav page slipped past the
 * known-slugs exclusion list above) OR if its `address` names a
 * DIFFERENT hall in the same complex — both are legitimate "not a Sant
 * Jordi Club event" outcomes, never guessed past. Only a genuine parse
 * of a genuine Sant Jordi Club event page returns a record.
 */
export function parseSantJordiEventPage(html, { slug, url } = {}) {
  if (typeof html !== "string" || html.trim() === "") return null;

  const addressMatch = ADDRESS_RE.exec(html);
  if (!addressMatch || addressMatch[1] !== SANT_JORDI_CLUB_HALL_NAME) return null;

  const startMatch = START_DATE_RE.exec(html);
  if (!startMatch) return null;

  const endMatch = END_DATE_RE.exec(html);
  const titleMatch = TITLE_TAG_RE.exec(html);

  return {
    source_record_id: slug ?? null,
    title: titleMatch ? titleMatch[1].trim() : null,
    event_url: url ?? null,
    start_local: startMatch[1],
    end_local: endMatch ? endMatch[1] : null,
    hall: SANT_JORDI_CLUB_HALL_NAME,
  };
}
