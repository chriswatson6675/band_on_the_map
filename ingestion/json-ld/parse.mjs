// BARCELONA-30-VENUE-POPULATION-01 — generic schema.org JSON-LD Event
// extraction, factored out as a genuinely reusable module (matching
// ingestion/ics/parse.mjs and ingestion/rss/parse.mjs's existing
// "generic, source-agnostic parsing layer" convention) rather than
// re-deriving ad hoc `<script type="application/ld+json">` regex parsing
// per source, as ingestion/lav/discovery.mjs (Lisbon, unchanged, never
// migrated to this module) currently does inline for its own one venue.
//
// This module extracts and flattens EVERY JSON-LD block on a page,
// including `@graph`-wrapped documents (a very common pattern from SEO
// plugins like Yoast — already documented for CCB in
// research/source-investigations/ccb-lisbon-01/) and pages with more than
// one `<script type="application/ld+json">` tag. It never itself decides
// what counts as "music" — see filterMusicEventNodes() for a bounded,
// keyword-based, always-overridable helper, and per-venue collector code
// for any stronger venue-specific judgement.
//
// It never fabricates a value, never resolves a stable ID (that is
// source-specific — see "The stable identifier rule",
// docs/SOURCE_INVESTIGATION_POLICY.md — and is left to a caller-supplied
// `deriveId` function), and never determines Venue identity/coordinates.

const LD_JSON_SCRIPT_RE = /<script[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;

// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — a bounded, generic repair
// pass used ONLY as a fallback when a JSON-LD block's raw text fails
// JSON.parse outright. New Morning Paris's own real homepage embeds a
// 72-record Event array with two independent, genuine site bugs: (1)
// literal, unescaped control characters (raw newlines/tabs/carriage
// returns) inside string values, and (2) a missing comma between two
// adjacent object properties on some records. Both are purely mechanical,
// structural repairs — no field value is invented, reordered, or altered;
// see research/source-investigations/new-morning-paris-01/ for the
// original offline proof this is lifted from verbatim. Never applied to
// already-valid JSON (the primary JSON.parse always runs first), so every
// existing zero-code JSON-LD source (Tempodrom, Waldbühne, etc.) is
// completely unaffected.
function escapeRawControlCharsInStrings(text) {
  let out = "";
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = false;
        out += ch;
        continue;
      }
      if (ch === "\n") {
        out += "\\n";
        continue;
      }
      if (ch === "\r") {
        out += "\\r";
        continue;
      }
      if (ch === "\t") {
        out += "\\t";
        continue;
      }
      out += ch;
    } else {
      if (ch === '"') {
        inString = true;
      }
      out += ch;
    }
  }
  return out;
}

function insertMissingCommas(text) {
  return text.replace(/\}(?!\s*,)(\s*\n\s*)"/g, '},$1"');
}

function repairMalformedJsonLd(raw) {
  return insertMissingCommas(escapeRawControlCharsInStrings(raw));
}

/**
 * Extract every JSON-LD document embedded in `html`, flattening
 * `@graph`-wrapped documents and top-level arrays into one flat list of
 * plain node objects. A script block that fails to parse as JSON is
 * skipped (not thrown on) — a page commonly carries several unrelated
 * JSON-LD blocks (Organization, BreadcrumbList, WebSite, ...) and one
 * malformed one must never abort extraction of the others; use
 * `{ strict: true }` to instead throw on the first parse failure, for a
 * caller that wants to notice a genuinely broken feed.
 */
// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01: the `type`
// attribute's quotes are now optional (`["']?`) — Tempodrom Berlin's own
// real, live page genuinely emits `<script type=application/ld+json>`
// with no quotes at all (valid, if unusual, HTML5), which the original
// quote-requiring regex silently failed to match at all (zero nodes
// extracted, not an error). A strictly backward-compatible widening: any
// HTML this already matched (quoted, single- or double-quoted) still
// matches identically.
export function extractJsonLdNodes(html, { strict = false } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("extractJsonLdNodes requires non-empty HTML");
  }

  const nodes = [];
  let match;
  LD_JSON_SCRIPT_RE.lastIndex = 0;
  while ((match = LD_JSON_SCRIPT_RE.exec(html)) !== null) {
    const raw = match[1].trim();
    if (raw === "") continue;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (firstError) {
      try {
        parsed = JSON.parse(repairMalformedJsonLd(raw));
      } catch {
        if (strict) throw new Error(`JSON-LD block did not parse as valid JSON: ${firstError.message}`);
        continue;
      }
    }

    for (const doc of Array.isArray(parsed) ? parsed : [parsed]) {
      if (doc && typeof doc === "object" && Array.isArray(doc["@graph"])) {
        nodes.push(...doc["@graph"].filter((n) => n && typeof n === "object"));
      } else if (doc && typeof doc === "object" && doc["@type"] === "ItemList" && Array.isArray(doc.itemListElement)) {
        // A common pattern (e.g. a venue's "Upcoming Events" block):
        // ItemList -> ListItem[] -> .item is the actual Event. Unwrap it;
        // a ListItem with no nested .item (already the item itself) is
        // pushed as-is rather than dropped.
        for (const element of doc.itemListElement) {
          const item = element && typeof element === "object" && element.item && typeof element.item === "object" ? element.item : element;
          if (item && typeof item === "object") nodes.push(item);
        }
      } else if (doc && typeof doc === "object") {
        nodes.push(doc);
      }
    }
  }
  return nodes;
}

function typeMatches(node, acceptedTypes) {
  const raw = node?.["@type"];
  const types = Array.isArray(raw) ? raw : [raw];
  return types.some((t) => typeof t === "string" && acceptedTypes.has(t));
}

/**
 * Filter already-extracted JSON-LD nodes (extractJsonLdNodes()) down to
 * schema.org Event-family nodes. Defaults to `Event`/`MusicEvent` — the
 * two types genuinely used for concerts/gigs/club nights across sites
 * observed so far — but accepts an explicit `types` set so a caller can
 * widen (e.g. add `SocialEvent` for a club that tags nights that way) or
 * narrow. This is deliberately NOT a music-relevance filter — a plain
 * `Event` node could equally be a `TheaterEvent`-shaped listing a badly
 * -tagged site mislabels — see filterMusicEventNodes() for that separate
 * concern.
 */
export function extractEventNodes(html, { types = new Set(["Event", "MusicEvent"]), strict = false } = {}) {
  const acceptedTypes = types instanceof Set ? types : new Set(types);
  return extractJsonLdNodes(html, { strict }).filter((node) => typeMatches(node, acceptedTypes));
}

// A bounded, non-exhaustive keyword list — never a frozen ontology, and
// never itself sufficient to CONFIRM a listing is music (a venue's own
// collector may still apply stronger judgement, e.g. checking `@type`
// itself is already `MusicEvent`, or excluding known non-music series
// names) — but useful as one honest, explainable signal alongside them.
// Matches PRODUCT INTENT's own genre list (concerts, DJs, jazz, flamenco,
// rock/indie/metal/punk, hip-hop, electronic, experimental) across
// English/Spanish/Catalan.
const MUSIC_KEYWORDS = [
  "concert",
  "concierto",
  "concert de",
  "música en directe",
  "musica en directe",
  "música en vivo",
  "musica en vivo",
  "live music",
  "dj set",
  "dj ",
  "banda",
  "band",
  "jazz",
  "flamenco",
  "flamenc",
  "rock",
  "indie",
  "pop",
  "punk",
  "metal",
  "hip hop",
  "hip-hop",
  "rap",
  "electr", // electrónica / electronic / electrònica
  "techno",
  "house music",
  "gira", // Spanish "tour"
  "tour",
  "en directe",
  "en directo",
  "actuació musical",
  "actuacion musical",
];

/**
 * Bounded, explainable, keyword-based music-relevance filter over
 * already-extracted Event-family nodes. A node whose own `@type` is
 * exactly `MusicEvent` always passes (the source's own classification is
 * stronger evidence than any keyword match). Otherwise, passes only if
 * `name`/`description` contains one of MUSIC_KEYWORDS (case-insensitive,
 * diacritic-insensitive). Returns `{ musicNodes, rejectedNodes }` so a
 * caller can honestly report what was excluded, never silently.
 */
export function filterMusicEventNodes(nodes, { extraKeywords = [] } = {}) {
  const keywords = [...MUSIC_KEYWORDS, ...extraKeywords].map((k) => foldText(k));
  const musicNodes = [];
  const rejectedNodes = [];

  for (const node of nodes ?? []) {
    const types = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
    if (types.includes("MusicEvent")) {
      musicNodes.push(node);
      continue;
    }
    const haystack = foldText(`${node?.name ?? ""} ${node?.description ?? ""}`);
    if (keywords.some((k) => haystack.includes(k))) {
      musicNodes.push(node);
    } else {
      rejectedNodes.push(node);
    }
  }

  return { musicNodes, rejectedNodes };
}

function foldText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function namesFrom(value) {
  if (!value) return [];
  const items = Array.isArray(value) ? value : [value];
  return items
    .map((item) => (typeof item === "string" ? item : nonEmptyString(item?.name)))
    .filter((name) => typeof name === "string" && name.trim() !== "");
}

function offerPriceText(offers) {
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  const priced = list.find((o) => o && (o.price !== undefined || o.priceSpecification));
  if (!priced) return null;
  const price = priced.price ?? priced.priceSpecification?.price;
  const currency = priced.priceCurrency ?? priced.priceSpecification?.priceCurrency;
  if (price === undefined || price === null || price === "") return null;
  return currency ? `${price} ${currency}` : String(price);
}

function offerUrl(offers) {
  if (!offers) return null;
  const list = Array.isArray(offers) ? offers : [offers];
  const withUrl = list.find((o) => nonEmptyString(o?.url));
  return withUrl ? nonEmptyString(withUrl.url) : null;
}

/**
 * Normalise one schema.org Event/MusicEvent node into a small, generic,
 * per-record shape — pure mapping only, exactly like
 * ingestion/events-calendar-api/client.mjs's normalizeEventRecord(): no
 * fabricated values, no source-specific judgement, no stable-ID decision
 * (left to the caller via `deriveId`, since a site's stable-identity
 * strategy must be documented/proven per docs/SOURCE_INVESTIGATION_POLICY.md's
 * "stable identifier rule" — this module cannot know it generically).
 */
export function normaliseJsonLdEvent(node, { deriveId } = {}) {
  if (!node || typeof node !== "object") {
    throw new Error("normaliseJsonLdEvent requires a JSON-LD node object");
  }

  const location = node.location && typeof node.location === "object" ? node.location : null;
  const address = location?.address && typeof location.address === "object" ? location.address : null;

  return {
    source_record_id: typeof deriveId === "function" ? deriveId(node) : null,
    types: Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]].filter(Boolean),
    title: nonEmptyString(node.name),
    description: nonEmptyString(node.description),
    event_url: nonEmptyString(node.url),
    start_raw: nonEmptyString(node.startDate),
    end_raw: nonEmptyString(node.endDate),
    event_status: nonEmptyString(node.eventStatus),
    event_attendance_mode: nonEmptyString(node.eventAttendanceMode),
    location_name: nonEmptyString(location?.name),
    location_address: address
      ? {
          streetAddress: nonEmptyString(address.streetAddress),
          addressLocality: nonEmptyString(address.addressLocality),
          addressRegion: nonEmptyString(address.addressRegion),
          postalCode: nonEmptyString(address.postalCode),
          addressCountry: nonEmptyString(address.addressCountry),
        }
      : null,
    performers: namesFrom(node.performer),
    price_text: offerPriceText(node.offers),
    ticket_url: offerUrl(node.offers),
    raw: node,
  };
}
