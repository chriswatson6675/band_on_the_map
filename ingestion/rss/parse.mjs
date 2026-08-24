// Small, dependency-free RSS 2.0 parsing layer, matching the scope and
// spirit of ingestion/ics/parse.mjs: deliberately generic (this module
// must never reference any specific source), and deliberately bounded to
// the flat, well-formed `<channel><item>...</item></channel>` shape real
// municipal RSS feeds in this project have needed so far — not a general
// XML parser. It consumes raw RSS/XML text and returns SOURCE RECORD data
// only: plain per-item fields, unmodified beyond XML entity-unescaping.
// It never invents a value the feed did not contain, never resolves a
// canonical Venue, and never produces a Band on the Map Event/Observation
// identity (see docs/ARCHITECTURE.md) — a parsed RSS item is source
// material for a future Observation, not an Observation itself.
//
// Scope, deliberately bounded:
//   - one `<channel>`, zero or more `<item>` children
//   - `<title>`, `<link>`, `<guid>`, `<pubDate>`, `<description>`, and
//     zero or more `<category>` per item
//   - CDATA sections and numeric/named XML entities in text content
//   - does NOT implement a general/recursive XML DOM, namespaces beyond
//     ignoring their prefix, or RSS/Atom extension elements. If a future
//     source's feed genuinely requires that, stop and evaluate a
//     narrowly-scoped, mature library rather than extending this parser
//     to guess at that behaviour.

// The 5 predefined XML entities, plus the common HTML named entities
// genuinely observed in real retained feed content in this project
// (accented Portuguese characters and a few punctuation marks). Real
// municipal RSS description fields carry HTML markup that is itself
// entity-encoded when embedded in XML (e.g. a literal "&ccedil;" becomes
// "&amp;ccedil;" in the feed's own XML source), so decoding stops one
// level short without these. Deliberately a small, fixed table — not a
// full HTML5 entity list; a future source needing more should extend
// this table explicitly, not fall back to guessing.
const NAMED_ENTITIES = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  aacute: "á",
  Aacute: "Á",
  agrave: "à",
  Agrave: "À",
  acirc: "â",
  Acirc: "Â",
  atilde: "ã",
  Atilde: "Ã",
  auml: "ä",
  Auml: "Ä",
  eacute: "é",
  Eacute: "É",
  egrave: "è",
  Egrave: "È",
  ecirc: "ê",
  Ecirc: "Ê",
  euml: "ë",
  Euml: "Ë",
  iacute: "í",
  Iacute: "Í",
  igrave: "ì",
  Igrave: "Ì",
  icirc: "î",
  Icirc: "Î",
  iuml: "ï",
  Iuml: "Ï",
  oacute: "ó",
  Oacute: "Ó",
  ograve: "ò",
  Ograve: "Ò",
  ocirc: "ô",
  Ocirc: "Ô",
  otilde: "õ",
  Otilde: "Õ",
  ouml: "ö",
  Ouml: "Ö",
  uacute: "ú",
  Uacute: "Ú",
  ugrave: "ù",
  Ugrave: "Ù",
  ucirc: "û",
  Ucirc: "Û",
  uuml: "ü",
  Uuml: "Ü",
  ccedil: "ç",
  Ccedil: "Ç",
  ntilde: "ñ",
  Ntilde: "Ñ",
  ldquo: "“",
  rdquo: "”",
  lsquo: "‘",
  rsquo: "’",
  hellip: "…",
  mdash: "—",
  ndash: "–",
};

/**
 * Unescape XML text content: named entities, decimal (`&#39;`) and hex
 * (`&#x27;`) numeric character references. Anything not recognised is
 * left as-is rather than guessed.
 *
 * Applied repeatedly to a fixed point (bounded to a small max pass
 * count): real retained municipal feed content genuinely double-encodes
 * entities — a literal "&ccedil;" becomes "&amp;ccedil;" once the HTML it
 * lives in is itself embedded as XML text — so a single pass only
 * recovers "&ccedil;", not "ç". Each pass only ever replaces entities
 * that were already literally present in the input to that pass (never
 * re-interprets plain "&" text as the start of a new entity), so this
 * cannot runaway on ordinary content; it simply stops once a pass
 * changes nothing.
 */
export function unescapeXmlText(value) {
  if (typeof value !== "string") return value;

  const decodeOnce = (text) =>
    text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (whole, body) => {
      if (body[0] === "#") {
        const isHex = body[1] === "x" || body[1] === "X";
        const codePoint = parseInt(body.slice(isHex ? 2 : 1), isHex ? 16 : 10);
        return Number.isNaN(codePoint) ? whole : String.fromCodePoint(codePoint);
      }
      return body in NAMED_ENTITIES ? NAMED_ENTITIES[body] : whole;
    });

  let current = value;
  for (let pass = 0; pass < 5; pass++) {
    const next = decodeOnce(current);
    if (next === current) break;
    current = next;
  }
  return current;
}

/**
 * Extract one field's text content from a single `<item>...</item>`
 * block: `<TAG>text</TAG>` or `<TAG><![CDATA[text]]></TAG>`, tolerating a
 * namespace prefix (`<atom:TAG>`) and simple attributes on the opening
 * tag (`<guid isPermaLink="false">`). Returns null when the tag is
 * genuinely absent — never an empty-string placeholder.
 */
export function extractField(itemBlock, tagName) {
  const re = new RegExp(
    `<(?:[a-zA-Z0-9_-]+:)?${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)</(?:[a-zA-Z0-9_-]+:)?${tagName}>`,
    "i",
  );
  const match = re.exec(itemBlock);
  if (!match) return null;

  const raw = match[1].trim();
  if (raw === "") return null;

  const cdataMatch = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw);
  const text = cdataMatch ? cdataMatch[1] : unescapeXmlText(raw);
  return text.trim() === "" ? null : text;
}

/**
 * Extract every `<category>` value from one `<item>` block, in document
 * order. Returns an empty array (never null) when none are present.
 */
export function extractCategories(itemBlock) {
  const categories = [];
  const re = /<(?:[a-zA-Z0-9_-]+:)?category(?:\s[^>]*)?>([\s\S]*?)<\/(?:[a-zA-Z0-9_-]+:)?category>/gi;
  let match;
  while ((match = re.exec(itemBlock))) {
    const raw = match[1].trim();
    if (raw === "") continue;
    const cdataMatch = /^<!\[CDATA\[([\s\S]*)\]\]>$/.exec(raw);
    categories.push((cdataMatch ? cdataMatch[1] : unescapeXmlText(raw)).trim());
  }
  return categories.filter(Boolean);
}

/**
 * Parse raw RSS 2.0 text into `{ channel, items }`.
 *
 *   channel - { title, link, description } from the top-level <channel>
 *             element (fields outside any <item>), each null if absent
 *   items   - one SOURCE RECORD per <item>, in document order:
 *             { title, link, guid, pubDate, description, categories }
 *
 * This is deliberately NOT a canonical Event or Observation: no identity
 * scheme, no deduplication, no Venue resolution. It is the per-field data
 * a future Observation adapter would be built from.
 */
export function parseRSS(text) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("Expected non-empty RSS text");
  }

  const channelMatch = /<channel(?:\s[^>]*)?>([\s\S]*)<\/channel>/i.exec(text);
  const channelBlock = channelMatch ? channelMatch[1] : text;

  // The channel's own fields, excluding anything inside an <item>.
  const channelOnlyBlock = channelBlock.replace(/<item(?:\s[^>]*)?>[\s\S]*?<\/item>/gi, "");
  const channel = {
    title: extractField(channelOnlyBlock, "title"),
    link: extractField(channelOnlyBlock, "link"),
    description: extractField(channelOnlyBlock, "description"),
  };

  const items = [];
  const itemRe = /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRe.exec(channelBlock))) {
    const block = match[1];
    items.push({
      title: extractField(block, "title"),
      link: extractField(block, "link"),
      guid: extractField(block, "guid"),
      pubDate: extractField(block, "pubDate"),
      description: extractField(block, "description"),
      categories: extractCategories(block),
    });
  }

  return { channel, items };
}
