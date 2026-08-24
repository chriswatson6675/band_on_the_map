// Parses genuinely retrieved Teatro Municipal do Porto (Rivoli / Campo
// Alegre) programme-listing HTML
// (https://www.teatromunicipaldoporto.pt/pt/programa/?categoria=musica)
// into small, structured per-entry discovery records.
//
// LISBON-PORTO-OVERNIGHT-COVERAGE-01: proven live. The listing is
// server-rendered as a sequence of `<article data-value="Month YYYY">`
// blocks (one per calendar month), each containing one
// `<div class="grid-item" id="p_{slug}">` per programme entry. A single
// entry can carry more than one dated occurrence (e.g. a Friday and a
// Saturday performance of the same production) — this module returns
// every occurrence it finds per entry; ingestion/teatro-municipal-porto/
// observation-adapter.mjs decides how to represent that honestly on one
// Observation (see that module's doc comment).
//
// The `?categoria=musica` query parameter is the SITE'S OWN category
// filter (observed directly on teatromunicipaldoporto.pt, not invented
// here) — every record parsed from a page fetched with it is already
// source-classified as music.
//
// No numeric id is rendered anywhere on this listing. The permalink slug
// (present both in the grid-item's own `id="p_{slug}"` and its
// `/pt/programa/{slug}/` link) is the only source-derived identifier
// available, so it is used as source_record_id — see this module's own
// fixtures/teatro-municipal-porto/metadata.json for why that is an
// honest, documented judgement call rather than an independently
// re-verified stable identifier the way Village Underground's ICS UID is.

const ARTICLE_SPLIT_RE = /(?=<article class="programa_container[^"]*" data-id-mask="list-programa" data-value=")/;
const ARTICLE_VALUE_RE = /data-value="([^"]+)"/;
const GRID_ITEM_SPLIT_RE = /(?=<div class="grid-item grid-sizer" id="p_)/;
const ITEM_ID_RE = /id="p_([a-z0-9-]+)"/;
const LOCAL_RE = /<div class="local"><span class="local-p">([^<]*)<\/span>(?:<span class="sep">([^<]*)<\/span>)?<\/div>/;
const HORARIO_RE = /<div class="horario-item">\s*<p class="hora">([^<]*)<\/p>[\s\S]*?<div class="dia_semana">([^<]*)<\/div>\s*<div class="dia_dia">([^<]*)<\/div>/g;
const EVENTO_WRAP_RE =
  /<div class="evento_wrap">\s*<a href="([^"]+)"><h2>([^<]*)<\/h2>(?:<p class="subtitulo">([^<]*)<\/p>)?<\/a>/;

/**
 * Parse one Teatro Municipal do Porto programme-listing HTML document
 * into discovery records, one per distinct grid-item slug (deduplicated
 * across the whole document; first occurrence order kept).
 *
 * Each record: `{ source_record_id, title, subtitle, venue_name,
 * sub_location, month_year, occurrences: [{ time, weekday, day }],
 * event_url }`. Returns an empty array (never throws) if no articles are
 * present.
 */
export function parseTeatroMunicipalPortoAgenda(html, { baseUrl = "https://www.teatromunicipaldoporto.pt" } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Teatro Municipal do Porto programme HTML");
  }

  const seen = new Set();
  const records = [];

  for (const articleBlock of html.split(ARTICLE_SPLIT_RE)) {
    const valueMatch = ARTICLE_VALUE_RE.exec(articleBlock);
    if (!valueMatch) continue;
    const monthYear = valueMatch[1];

    for (const itemBlock of articleBlock.split(GRID_ITEM_SPLIT_RE)) {
      const idMatch = ITEM_ID_RE.exec(itemBlock);
      if (!idMatch) continue;
      const slug = idMatch[1];
      if (seen.has(slug)) continue;

      const eventoMatch = EVENTO_WRAP_RE.exec(itemBlock);
      if (!eventoMatch) continue; // no title block found for this id — skip, don't guess
      seen.add(slug);

      const localMatch = LOCAL_RE.exec(itemBlock);

      const occurrences = [];
      let horarioMatch;
      HORARIO_RE.lastIndex = 0;
      while ((horarioMatch = HORARIO_RE.exec(itemBlock))) {
        occurrences.push({ time: horarioMatch[1].trim(), weekday: horarioMatch[2].trim(), day: horarioMatch[3].trim() });
      }

      const [, href, title, subtitle] = eventoMatch;

      records.push({
        source_record_id: slug,
        title: title.trim() || null,
        subtitle: subtitle && subtitle.trim() !== "" ? subtitle.trim() : null,
        venue_name: localMatch ? localMatch[1].trim() : null,
        sub_location: localMatch && localMatch[2] ? localMatch[2].trim() : null,
        month_year: monthYear,
        occurrences,
        event_url: href.startsWith("http") ? href : `${baseUrl}${href}`,
      });
    }
  }

  return records;
}
