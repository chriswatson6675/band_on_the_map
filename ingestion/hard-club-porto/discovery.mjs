// Parses genuinely retrieved Hard Club (Porto) warm-session AJAX event-list
// fragment HTML — and each event's own separate loadevent AJAX price
// fragment — into small, structured discovery records.
//
// Built ENTIRELY from the retained, READY_FOR_ACTIVATION investigation at
// research/source-investigations/hard-club-porto-02/ (investigation.json +
// evidence/). No live fetch happens in this module or its tests.
//
// TWO-STEP ACQUISITION (a prerequisite this module does not itself perform):
// per investigation.json's data_paths, the AJAX list fragment this module
// parses is only returned with real day+month text once the requesting HTTP
// client has first performed a normal GET of
// https://www.hardclubporto.com/PT/agenda/ to establish a PHPSESSID session
// cookie, then repeats that same cookie on the AJAX GET
// https://www.hardclubporto.com/include/ajax_functions.php?action=load-agenda&start=0&langid=1&passo=30&evento=
// ("warm"). A cookie-naive ("cold") fetch of the same URL silently returns
// day-of-month-only text with no month and no error — see
// evidence/ajax-agenda-cold2.html. This module assumes it has ALREADY been
// handed the warm fragment; it does not perform HTTP itself.
//
// STABLE IDENTIFIER: the event's own canonical URL-path slug (e.g.
// "johnny-hooker-euro-tour-2026-2026") — the SAME value the source itself
// already uses as the list fragment anchor's own "id" DOM attribute, the
// canonical /PT/evento/{slug}/ detail-page path, and the "id" parameter of
// its own loadevent AJAX call (investigation.json field_assessment.
// source_record_id). The fragment's numeric "data-rel" attribute is
// confirmed NOT stable (a pagination position index) and must never be used
// as source_record_id.
//
// DATE DERIVATION (THE central finding of hard-club-porto-02, policy v1.2
// DETERMINISTIC_CONTEXT): see deriveDateFromSlugYearAndDayMonth() below.
// This mirrors, field for field, the rule already proven offline in
// research/source-investigations/hard-club-porto-02/evidence/offline-proof.mjs
// (14/14 checks pass — see evidence/offline-proof-output.txt) — this module
// does not reinvent that rule, only re-implements it as a small,
// production-shaped, throwing pure function.
//
// PRICE is NOT present in the list fragment at all — it is exposed only via
// a SEPARATE per-event AJAX call (action=loadevent, keyed by the event's own
// slug — see investigation.json data_paths' AJAX_EVENT_DETAIL_FRAGMENT
// entry). parseHardClubEventPrice() parses that second fragment.
//
// END/END TIME: confirmed NOT_PRESENT anywhere in any retained evidence for
// this source (investigation.json field_assessment.end). This module never
// returns an end value — callers must leave it null/NOT_PRESENT.

// Portuguese abbreviated month lookup, exactly as observed live in the
// warm-session list fragment's own "data" field (e.g. "12 Set", "29 Jan",
// "12 Fev") — see evidence/ajax-agenda-warm.html and
// evidence/offline-proof.mjs's own PT_MONTHS table, which this mirrors.
const PT_MONTHS = {
  Jan: "01",
  Fev: "02",
  Mar: "03",
  Abr: "04",
  Mai: "05",
  Jun: "06",
  Jul: "07",
  Ago: "08",
  Set: "09",
  Out: "10",
  Nov: "11",
  Dez: "12",
};

const SLUG_TRAILING_YEAR_RE = /-(\d{4})$/;
const DAY_MONTH_TEXT_RE = /^(\d{1,2})\s+([A-Za-z]{3})$/;

/**
 * The exact DETERMINISTIC_CONTEXT date-derivation rule proven in
 * research/source-investigations/hard-club-porto-02/investigation.json's
 * field_assessment.start_date.notes/derivation and mechanically reproduced
 * in evidence/offline-proof.mjs:
 *
 *   The event's own canonical URL-path slug — source-owned; already used by
 *   the source itself as the DOM id attribute, the /PT/evento/{slug}/
 *   canonical detail-page path, and the id parameter of its own loadevent
 *   AJAX call — carries a trailing "-YYYY" segment stating the calendar
 *   year (e.g. "johnny-hooker-euro-tour-2026-2026" -> 2026). The list
 *   fragment's own "data" field separately states the event's day-of-month
 *   plus abbreviated Portuguese month (e.g. "12 Set"). Concatenating these
 *   two retained, first-party, source-owned signals as YYYY-MM-DD is a
 *   fixed, mechanical, exactly-one-result rule — it never relies on list
 *   order/sequence, and never on today's date.
 *
 * Example: slug "johnny-hooker-euro-tour-2026-2026" + data "12 Set" ->
 * "2026-09-12".
 *
 * Throws — never guesses — when the slug carries no trailing "-YYYY"
 * segment (the genuine anomalous case this investigation itself proved
 * against a real archive record, evidence/arquivo-boundary-excerpt.html's
 * slug "2020" block — see evidence/offline-proof-output.txt Step 6), when
 * the day+month text is not in the expected "DD Mon" shape, or when the
 * month abbreviation is not one of the 12 recognised Portuguese
 * abbreviations.
 */
export function deriveDateFromSlugYearAndDayMonth(slug, dataText) {
  if (typeof slug !== "string" || slug.trim() === "") {
    throw new Error("deriveDateFromSlugYearAndDayMonth requires a non-empty slug");
  }
  if (typeof dataText !== "string" || dataText.trim() === "") {
    throw new Error(`deriveDateFromSlugYearAndDayMonth requires a non-empty day+month text (slug "${slug}")`);
  }

  const yearMatch = SLUG_TRAILING_YEAR_RE.exec(slug);
  if (!yearMatch) {
    throw new Error(`slug "${slug}" carries no trailing "-YYYY" segment — refusing to guess a year`);
  }

  const dayMonthMatch = DAY_MONTH_TEXT_RE.exec(dataText.trim());
  if (!dayMonthMatch) {
    throw new Error(`day+month text "${dataText}" (slug "${slug}") is not in the expected "DD Mon" shape`);
  }

  const [, day, monthAbbr] = dayMonthMatch;
  const month = PT_MONTHS[monthAbbr];
  if (!month) {
    throw new Error(`unrecognised Portuguese month abbreviation "${monthAbbr}" (slug "${slug}")`);
  }

  const year = yearMatch[1];
  return `${year}-${month}-${day.padStart(2, "0")}`;
}

const SOURCE_BASE_URL = "https://www.hardclubporto.com";

// Matches offline-proof.mjs's own block-splitting convention exactly: each
// event's own markup begins with `<li class="items ...`.
const BLOCK_SPLIT_RE = /(?=<li class="items)/;
const ANCHOR_RE = /<a href="([^"]+)"[^>]*\bid="([^"]+)"\s+class="post_rel"/;
const TITLE_RE = /<h3>([^<]*)(?:<p class="demi">([^<]*)<p>)?<\/h3>/;
const DATA_RE = /<p class="data">([^<]*)<\/p>/;
const LOCAL_HORA_RE = /<p class="local_hora">([^<]*)<\/p>/;

// "Sala 2 : 20H00" -> room "Sala 2", time "20H00". Some records (e.g. the
// genuine anomalous archive record used as this source's negative control)
// carry only a bare time with no room prefix at all (e.g. "15H00") — room
// is honestly null in that case, never fabricated.
const LOCAL_HORA_WITH_ROOM_RE = /^(.*?)\s*:\s*(\d{1,2}H\d{2})$/;
const LOCAL_HORA_TIME_ONLY_RE = /^(\d{1,2}H\d{2})$/;

function parseLocalHora(text) {
  const trimmed = (text ?? "").trim();
  const withRoom = LOCAL_HORA_WITH_ROOM_RE.exec(trimmed);
  if (withRoom) {
    return { room_label: withRoom[1].trim(), time_text: withRoom[2] };
  }
  const timeOnly = LOCAL_HORA_TIME_ONLY_RE.exec(trimmed);
  if (timeOnly) {
    return { room_label: null, time_text: timeOnly[1] };
  }
  return { room_label: null, time_text: trimmed || null };
}

/**
 * Parse one Hard Club warm-session load-agenda AJAX list fragment (e.g.
 * evidence/ajax-agenda-warm.html) into discovery records, one per `<li
 * class="items ...">` block found.
 *
 * Each record: `{ source_record_id, title, subtitle, room_label, time_text,
 * date_iso, event_url }`.
 *
 * Throws on missing/malformed required elements — never guesses a date. A
 * block missing its anchor id or its "data" (day+month) field is treated as
 * malformed input and throws, rather than being silently skipped, per this
 * project's "never guess" rule; a block whose slug/date combination cannot
 * be mechanically resolved (see deriveDateFromSlugYearAndDayMonth) also
 * throws, propagated from that function.
 */
export function parseHardClubAgendaFragment(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Hard Club agenda AJAX fragment HTML");
  }

  const blocks = html.split(BLOCK_SPLIT_RE).filter((b) => b.includes('<li class="items'));
  if (blocks.length === 0) {
    throw new Error('Expected at least one <li class="items...">...</li> event block in the fragment');
  }

  return blocks.map((block) => {
    const anchorMatch = ANCHOR_RE.exec(block);
    if (!anchorMatch) {
      throw new Error('Malformed event block: missing anchor href/id="..." class="post_rel"');
    }
    const [, href, slug] = anchorMatch;

    const dataMatch = DATA_RE.exec(block);
    if (!dataMatch) {
      throw new Error(`Malformed event block (slug "${slug}"): missing <p class="data"> field`);
    }
    const dateText = dataMatch[1].trim();

    const titleMatch = TITLE_RE.exec(block);
    const title = (titleMatch?.[1] ?? "").trim();
    const subtitle = (titleMatch?.[2] ?? "").trim() || null;

    const localHoraMatch = LOCAL_HORA_RE.exec(block);
    const { room_label, time_text } = parseLocalHora(localHoraMatch?.[1]);

    const date_iso = deriveDateFromSlugYearAndDayMonth(slug, dateText);

    return {
      source_record_id: slug,
      title: title || null,
      subtitle,
      room_label,
      time_text,
      date_iso,
      event_url: `${SOURCE_BASE_URL}${href}`,
    };
  });
}

const PRICE_RE = /<p class="preco"\s*>([^<]*)<\/p>/;

/**
 * Parse one Hard Club per-event loadevent AJAX fragment (action=loadevent,
 * keyed by the event's own slug — e.g.
 * evidence/ajax-loadevent-johnny-hooker-euro-tour-2026-2026.html) into
 * `{ price_text }`. Throws if no `<p class="preco">` element is present —
 * never guesses a price.
 */
export function parseHardClubEventPrice(loadEventHtml) {
  if (typeof loadEventHtml !== "string" || loadEventHtml.trim() === "") {
    throw new Error("Expected non-empty Hard Club loadevent AJAX fragment HTML");
  }

  const priceMatch = PRICE_RE.exec(loadEventHtml);
  if (!priceMatch) {
    throw new Error('Malformed loadevent fragment: missing <p class="preco">...</p> field');
  }

  return { price_text: priceMatch[1].trim() };
}
