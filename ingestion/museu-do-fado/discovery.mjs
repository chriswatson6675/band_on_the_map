// Discovers Museu do Fado's own individual event detail pages from its
// public events list page (https://museudofado.pt/eventos), and extracts
// each detail page's own labelled field block (Data/Horas/Até/Termina/
// Local/Preços) into a small factual record.
//
// Entirely based on the READY_FOR_ACTIVATION investigation retained at
// research/source-investigations/museu-do-fado-lisbon-01/ (investigation.json
// + evidence/). Mirrors ingestion/capitolio/discovery.mjs's two-stage shape
// (list page -> detail-page URLs; detail page -> facts object), adapted to
// this source's own markup, proven correct against retained evidence by
// evidence/offline-proof.mjs (0 failures, 4/4 sampled events cross-checked).
//
// This module makes no network requests and never re-fetches the live
// site — every regex here is checked directly against the retained
// evidence files under that investigation's evidence/ directory.
//
// source_record_id: NOT derived here. No numeric internal event ID is
// exposed anywhere in the retained HTML (investigation.json's
// field_assessment.source_record_id.state is PARTIAL, not PROVEN — the
// investigation only observed the site once, so slug stability over time
// is not yet empirically proven). ingestion/museu-do-fado/observation-
// adapter.mjs derives a source_record_id candidate from the event_url's
// own slug and documents that PARTIAL basis explicitly — this module only
// hands back the raw event_url, never a synthesized id.
//
// Dates: each detail page's "Data" field gives an unambiguous Portuguese
// "D month, YYYY" calendar date (e.g. "7 novembro, 2026"). This module
// mechanically reformats that exact shape into an ISO calendar date
// (date_iso) — never guesses at a different shape (e.g. the list page's
// occasional "D month - D month, YYYY" multi-date RANGE format, which is
// deliberately NOT handled here; date_iso stays null rather than being
// approximated). No timezone/UTC offset is stated anywhere in the
// retained evidence for any date/time field — these are floating-local
// values, not confirmed UTC instants (see field_assessment.start_date/
// time/end notes in investigation.json).

const EVENT_LINK_RE = /https:\/\/museudofado\.pt\/evento\/[a-z0-9-]+/g;

const PT_MONTHS = {
  janeiro: "01",
  fevereiro: "02",
  março: "03",
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

// Only the small set of named HTML entities actually observed in this
// source's retained "Preços" field text (e.g. "3 &euro; por pessoa",
// "12,50&euro;-25,00&euro;") are decoded. Anything else is left as-is —
// no attempt is made to be a general-purpose HTML entity decoder.
const NAMED_ENTITIES = {
  euro: "€",
  amp: "&",
  nbsp: " ",
};

function decodeKnownEntities(text) {
  if (typeof text !== "string") return text;
  return text.replace(/&([a-zA-Z]+);/g, (full, name) => {
    const key = name.toLowerCase();
    return key in NAMED_ENTITIES ? NAMED_ENTITIES[key] : full;
  });
}

/**
 * Mechanically parse a single Portuguese "D month, YYYY" date (e.g.
 * "7 novembro, 2026") into an ISO calendar date "YYYY-MM-DD". Returns
 * null for anything that is not exactly this shape (e.g. a
 * "D month - D month, YYYY" range, or an unrecognised month name) —
 * deliberately never guesses.
 */
export function parseMuseuDoFadoDateToIso(dateText) {
  if (typeof dateText !== "string") return null;
  const match = /^(\d{1,2})\s+([a-zçãáéíóõôâê]+),\s*(\d{4})$/i.exec(dateText.trim());
  if (!match) return null;
  const monthName = match[2].toLowerCase();
  const month = PT_MONTHS[monthName];
  if (!month) return null;
  const day = match[1].padStart(2, "0");
  const year = match[3];
  return `${year}-${month}-${day}`;
}

/**
 * Parse the events list page's HTML into a deduplicated list of this
 * source's own individual event detail-page URLs, in document order.
 * Covers both ordinary card markup (`class="thumbnail line border"`) and
 * the one highlighted/featured card's markup (`class="frame"`) — both
 * link to the same `/evento/{slug}` detail-page shape.
 */
export function parseMuseuDoFadoAgendaLinks(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Museu do Fado events-list HTML");
  }
  return [...new Set([...html.matchAll(EVENT_LINK_RE)].map((m) => m[0]))];
}

// The consistent structured field block every sampled detail page exposes
// runs from its own "wraps-description" wrapper to the start of the page
// body's main text column ("col-md col-12") — directly verified in
// evidence/offline-proof.mjs to bound exactly the Data/Horas/Até/Termina/
// Local/Preços block and nothing from a neighbouring "Próximos Eventos"
// related-event card (which uses different markup entirely).
function extractFieldBlock(html) {
  const start = html.indexOf('<div class="wraps-description">');
  const end = html.indexOf('<div class="col-md col-12">');
  if (start === -1 || end === -1 || end <= start) return null;
  return html.slice(start, end);
}

function readField(fieldBlock, label) {
  const re = new RegExp(`<h6>\\s*${label}\\s*<\\/h6>\\s*<h2>([\\s\\S]*?)<\\/h2>`);
  const match = re.exec(fieldBlock);
  if (!match) return null;
  const text = decodeKnownEntities(match[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim());
  return text === "" ? null : text;
}

/**
 * Extract one Museu do Fado event detail page's own labelled fields
 * (title, Data/Horas/Até/Termina/Local/Preços, event_url) from that
 * page's raw HTML. Throws on missing/malformed required elements — title,
 * event_url (the page's own og:url), the structured field block itself,
 * and its Data/Local/Preços fields, all of which were present on 4/4
 * sampled detail pages in the retained evidence. Horas/Até/Termina are
 * also present on 4/4 sampled pages but are read leniently (null, not a
 * thrown error, when genuinely absent) since this investigation's sample
 * did not include a genuinely multi-day/recurring event's own detail
 * page (see investigation.json field_assessment.end.notes) and this
 * module must not assume every future event necessarily carries them.
 */
export function extractMuseuDoFadoEventFacts(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Museu do Fado event-detail HTML");
  }

  const h1Match = /<h1>\s*([^<]*?)\s*<\/h1>/.exec(html);
  const title = h1Match ? h1Match[1].trim() : null;
  if (!title) {
    throw new Error("Expected an <h1> event title on a Museu do Fado event detail page");
  }

  const ogUrlMatch = /<meta property="og:url" content="([^"]*)"\s*\/?>/.exec(html);
  const eventUrl = ogUrlMatch ? ogUrlMatch[1].trim() : null;
  if (!eventUrl) {
    throw new Error("Expected an og:url <meta> tag on a Museu do Fado event detail page");
  }

  const fieldBlock = extractFieldBlock(html);
  if (!fieldBlock) {
    throw new Error(
      'Expected a structured "wraps-description" field block (Data/Horas/Até/Termina/Local/Preços) on a Museu do Fado event detail page',
    );
  }

  const dateText = readField(fieldBlock, "Data");
  if (!dateText) {
    throw new Error('Expected a "Data" field within the structured field block');
  }

  const venueLocationText = readField(fieldBlock, "Local");
  if (!venueLocationText) {
    throw new Error('Expected a "Local" field within the structured field block');
  }

  const priceText = readField(fieldBlock, "Preços");
  if (!priceText) {
    throw new Error('Expected a "Preços" field within the structured field block');
  }

  return {
    title,
    date_text: dateText,
    date_iso: parseMuseuDoFadoDateToIso(dateText),
    time_text: readField(fieldBlock, "Horas"),
    end_date_text: readField(fieldBlock, "Até"),
    end_time_text: readField(fieldBlock, "Termina"),
    venue_location_text: venueLocationText,
    event_url: eventUrl,
    price_text: priceText,
  };
}
