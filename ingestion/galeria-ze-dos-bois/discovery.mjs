// Parses genuinely retrieved Galeria Zé dos Bois (ZDB) public programme-
// listing HTML (https://zedosbois.org/en/programme/) into small,
// structured per-entry discovery records.
//
// LISBON-PORTO-P1-SOURCE-AUTOMATION-01: proven live. The listing is
// server-rendered as a sequence of `<article class="col-md-12 thumb ...">`
// items, each carrying the venue's OWN first-party classification —
// a top-level `area` (e.g. "Music", "Visual Arts", "Performing Arts",
// "Learning") and one or more `categorias` tags (e.g. "Concerts",
// "Exhibitions", "Workshops", "Theater") — a real, multi-discipline
// cultural-centre programme, not a music-only feed (this venue also runs
// exhibitions, workshops and theatre; see filterMusicRecords() below for
// the one deterministic filter this task applies).
//
// Date text shape (important — read fully before touching
// ingestion/galeria-ze-dos-bois/observation-adapter.mjs's date
// derivation): this venue's own `class="thumb-date"` block renders TWO
// genuinely different shapes, both retained verbatim here and never
// reshaped:
//   - A single dated/timed entry (every "Music"/"Concerts" entry
//     observed live): `<span class="week">Wed</span><span
//     class="day">09.09.26</span><span class="hour">09:30PM</span>` — a
//     real DD.MM.YY calendar date plus a 12-hour clock time.
//   - A multi-day range (every "Exhibitions"/"Workshops" entry observed
//     live, none of them music): plain leading text, e.g.
//     "23.05 — 26.09.26", with an always-empty trailing
//     `<span class="hour"></span>`.
// This module reports whichever shape was actually found (`day_text` +
// `hour_text`, or `date_range_text`) without guessing which one a given
// entry "should" have.
//
// Stable identifier: no numeric id is exposed anywhere on this listing.
// Every entry's own permalink slug (`/en/programa/{slug}/`) is this
// venue's own stable identifier — the same honest, documented judgement
// call already made for ingestion/cm-gaia-eventos/discovery.mjs.
//
// Venue/location: most entries' own `class="thumb-local"` text is
// "Galeria Zé dos Bois" (this venue's own main building, already a
// canonical Venue admitted under LISBON-PORTO-VENUE-ESTATE-01), but this
// is genuinely a multi-location listing — a handful of entries are
// off-site (e.g. "Igreja St. George", "LAV - Lisboa Ao Vivo", "ZDB 8
// MARVILA", a distinct second physical location) — every entry's own
// exact `local` text is retained honestly, never merged or guessed at.

const ARTICLE_SPLIT_RE = /(?=<article class="col-md-12 thumb)/;
const SLUG_RE = /<a href="https:\/\/zedosbois\.org\/en\/programa\/([a-z0-9-]+)\/"/;
const AREA_RE = /class='area'>([^<]*)</g;
const CATEGORY_RE = /class='categorias'>([^<]*)</g;
const TITLE_RE = /<h3>([^<]*)<\/h3>/;
const THUMB_DATE_BLOCK_RE = /class="thumb-date">([\s\S]*?)<\/div>/;
const WEEK_DAY_HOUR_RE =
  /class="week">([^<]*)<\/span><span class="day">([^<]*)<\/span><span class="hour">([^<]*)<\/span>/;
const LOCAL_RE = /thumb-local">([^<]*)</;

function decoded(text) {
  return typeof text === "string"
    ? text.replace(/&#8216;/g, "‘").replace(/&#8217;/g, "’").replace(/&#038;/g, "&").replace(/&amp;/g, "&").trim()
    : null;
}

/**
 * Parse one ZDB /en/programme/ HTML document into discovery records, one
 * per distinct permalink slug (deduplicated; first occurrence order
 * kept). Returns an empty array (never throws) if no `<article>` items
 * are present. Throws only on empty/non-string input, matching every
 * other discovery module's convention.
 *
 * Each record: `{ source_record_id, title, area, categories, day_text,
 * week_text, hour_text, date_range_text, local, event_url }`. Exactly one
 * of (`day_text`, `date_range_text`) is non-null for any real entry this
 * venue has ever rendered live; both may be null if this venue's markup
 * ever omits a date block entirely (never guessed at).
 */
export function parseZdbProgramme(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Galeria Zé dos Bois programme HTML");
  }

  const seen = new Set();
  const records = [];

  for (const block of html.split(ARTICLE_SPLIT_RE)) {
    const slugMatch = SLUG_RE.exec(block);
    if (!slugMatch) continue;
    const slug = slugMatch[1];
    if (seen.has(slug)) continue;

    const titleMatch = TITLE_RE.exec(block);
    if (!titleMatch) continue; // no title found for this permalink — skip, don't guess
    seen.add(slug);

    const areas = [...block.matchAll(AREA_RE)].map((m) => decoded(m[1]));
    const categories = [...block.matchAll(CATEGORY_RE)].map((m) => decoded(m[1]));
    const localMatch = LOCAL_RE.exec(block);

    const dateBlockMatch = THUMB_DATE_BLOCK_RE.exec(block);
    let dayText = null;
    let weekText = null;
    let hourText = null;
    let dateRangeText = null;
    if (dateBlockMatch) {
      const wdh = WEEK_DAY_HOUR_RE.exec(dateBlockMatch[1]);
      if (wdh) {
        weekText = wdh[1].trim() || null;
        dayText = wdh[2].trim() || null;
        hourText = wdh[3].trim() || null;
      } else {
        const plain = dateBlockMatch[1].replace(/<span[^>]*>[\s\S]*?<\/span>/g, "").trim();
        dateRangeText = plain !== "" ? plain : null;
      }
    }

    records.push({
      source_record_id: slug,
      title: decoded(titleMatch[1]),
      area: areas[0] ?? null,
      categories,
      day_text: dayText,
      week_text: weekText,
      hour_text: hourText,
      date_range_text: dateRangeText,
      local: localMatch ? decoded(localMatch[1]) : null,
      event_url: `https://zedosbois.org/en/programa/${slug}/`,
    });
  }

  return records;
}

// This venue's own first-party classification for a genuine music
// performance, confirmed against the live listing
// (LISBON-PORTO-P1-SOURCE-AUTOMATION-01): area "Music" AND category
// "Concerts" together (both are always present together on every live
// music entry observed) — deliberately excludes this same venue's own
// non-music areas/categories actually observed live: "Visual Arts"
// (Exhibitions), "Learning" (Workshops), "Performing Arts"
// (Performance/Theater).
export function isMusicRecord(record) {
  return record?.area === "Music" && (record?.categories ?? []).includes("Concerts");
}

/**
 * Keep only records this venue's own taxonomy marks as a genuine music
 * performance (see isMusicRecord() above) — deterministic, first-party,
 * never AI/heuristic classification.
 */
export function filterMusicRecords(records) {
  return (records ?? []).filter(isMusicRecord);
}
