// Parses genuinely retrieved Câmara Municipal de Vila Nova de Gaia public
// "Eventos" listing HTML (https://www.cm-gaia.pt/pt/eventos/, and its own
// paginated continuation pages /pt/eventos/pagina-N/) into small,
// structured per-entry discovery records.
//
// PORTO-COVERAGE-02: proven live. The listing is server-rendered as a
// sequence of `<li>` items inside one `<ul class="blocoEventosList
// -events">`, each carrying the site's OWN category tag (e.g. "#
// música", "# desporto", "# infância" — a real, first-party
// classification, not inferred here), a free-text date field, a title, a
// short description, and a permalink. This is a genuinely multi-category
// municipal feed (matching the existing precedent already established
// for ingestion/odivelas/discovery.mjs) — this module retains every
// item's own tag honestly rather than filtering; filterMusicRecords()
// below is the one, explicit, deterministic filtering step a caller
// applies before building Observations (see
// ingestion/cm-gaia-eventos/observation-adapter.mjs's doc comment for
// why filtering happens on this source-provided tag text, never on
// inferred/AI classification).
//
// Date text shape (important — read fully before touching
// observation-adapter.mjs's date derivation): this field is genuinely
// free text, not a single fixed format. Every shape actually observed
// live on 2026-08-24 is retained verbatim in `date_text` here, entity-
// decoded but otherwise unmodified:
//   "20 Set 2026"                  - a single day
//   "11 e 12 Set 2026"             - two days, same month/year
//   "01 a 31 Ago 2026"             - a day range, same month/year
//   "19 Set a 17 Out 2026"         - a day range, different months, same year
//   "24 Abr 2026 a 30 Abr 2027"    - a day range, different months AND years
//   ""                              - genuinely empty (no date stated at all)
// Never guessed or reshaped here — this module's job is only to retain
// the source's own text faithfully; ingestion/cm-gaia-eventos/
// observation-adapter.mjs's deriveStart() is the one place that parses
// it into a calendar date, and fails closed (UNKNOWN certainty, no
// start.date) on anything it cannot unambiguously read.
//
// No numeric id is rendered anywhere on this listing. The permalink slug
// (present in both the wrapping image link's href and the "Ler Mais"
// link) is the only source-derived identifier available, so it is used
// as source_record_id — the same honest, documented judgement call
// already made for ingestion/teatro-municipal-porto/discovery.mjs.

import { unescapeXmlText } from "../rss/parse.mjs";

export const MUSIC_TAG = "música";

const LIST_BLOCK_RE = /<ul class="blocoEventosList -events">([\s\S]*?)<\/ul>/;
const ITEM_SPLIT_RE = /(?=<li>\s*<a href="\/pt\/eventos\/)/;
const SLUG_RE = /<a href="\/pt\/eventos\/([a-z0-9-]+)\/">/;
const TAG_RE = /<span class="tag"[^>]*><a[^>]*>\s*#\s*([^<]*)<\/a><\/span>/;
const DATA_RE = /<span class="data">([^<]*)<\/span>/;
const TITULO_RE = /<span class="titulo"><a[^>]*>([^<]*)<\/a><\/span>/;
const DESCRICAO_RE = /<span class="descricao">([^<]*)<\/span>/;
const NEXT_PAGE_RE = /<li class="setas pagSeguinte"><a href='([^']+)'>/;

function decoded(text) {
  return typeof text === "string" ? unescapeXmlText(text).trim() : null;
}

/**
 * Parse one CM Gaia /pt/eventos/ (or /pt/eventos/pagina-N/) HTML document
 * into discovery records, one per distinct permalink slug (deduplicated;
 * first occurrence order kept). Returns an empty array (never throws) if
 * the listing block is present but genuinely has no items — a legitimate
 * "nothing currently listed" result. Throws only on empty/non-string
 * input, matching every other discovery module's convention.
 *
 * Each record: `{ source_record_id, title, tag, description, date_text,
 * event_url }`. `tag` is the source's own category label, lower-cased and
 * trimmed but otherwise unmodified — every category this feed actually
 * uses (música, desporto, infância, literatura, exposições, artes,
 * formação, cinema, cultura, ...) is retained honestly, not just music.
 */
export function parseCmGaiaEventosAgenda(html, { baseUrl = "https://www.cm-gaia.pt" } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty CM Gaia eventos HTML");
  }

  const listMatch = LIST_BLOCK_RE.exec(html);
  if (!listMatch) return []; // no events list block on this page at all — not guessed at

  const seen = new Set();
  const records = [];

  for (const itemBlock of listMatch[1].split(ITEM_SPLIT_RE)) {
    const slugMatch = SLUG_RE.exec(itemBlock);
    if (!slugMatch) continue;
    const slug = slugMatch[1];
    if (seen.has(slug)) continue;

    const titleMatch = TITULO_RE.exec(itemBlock);
    if (!titleMatch) continue; // no title found for this permalink — skip, don't guess
    seen.add(slug);

    const tagMatch = TAG_RE.exec(itemBlock);
    const dataMatch = DATA_RE.exec(itemBlock);
    const descricaoMatch = DESCRICAO_RE.exec(itemBlock);

    records.push({
      source_record_id: slug,
      title: decoded(titleMatch[1]),
      tag: tagMatch ? decoded(tagMatch[1]).toLowerCase() : null,
      description: descricaoMatch && descricaoMatch[1].trim() !== "" ? decoded(descricaoMatch[1]) : null,
      date_text: dataMatch ? decoded(dataMatch[1]) : null,
      event_url: `${baseUrl}/pt/eventos/${slug}/`,
    });
  }

  return records;
}

/**
 * Keep only records whose own source-provided `tag` is exactly "música"
 * (case already normalised by parseCmGaiaEventosAgenda above). This is
 * the ONE deterministic music-relevance filter this source needs — see
 * this module's own doc comment. A record with no tag at all is never
 * included (never assumed music by default).
 */
export function filterMusicRecords(records) {
  return (records ?? []).filter((record) => record.tag === MUSIC_TAG);
}

/**
 * Read the document's own "próxima página" (»various) pagination pointer
 * from its navbar, or null if absent (the last page carries none — see
 * fixtures/cm-gaia-eventos/eventos-page-2-excerpt.html for a real,
 * retained example of a terminal page). Never constructs a page-N URL
 * itself — only reads what the page states.
 */
export function parseCmGaiaEventosNextPageUrl(html, { baseUrl = "https://www.cm-gaia.pt" } = {}) {
  if (typeof html !== "string") return null;
  const match = NEXT_PAGE_RE.exec(html);
  if (!match) return null;
  const href = match[1];
  return href.startsWith("http") ? href : `${baseUrl}${href.startsWith("/") ? "" : "/"}${href}`;
}
