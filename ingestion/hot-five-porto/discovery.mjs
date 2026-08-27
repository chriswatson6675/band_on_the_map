// Parses genuinely retained Hot Five Jazz & Blues Club (Porto) /shows/
// page HTML into small, structured per-event discovery records.
//
// Built ENTIRELY from the READY_FOR_ACTIVATION investigation at
// research/source-investigations/hot-five-porto-01/ — read that
// investigation.json in full before changing this module. Two governing
// findings from that investigation shape every decision below:
//
//   1. field_assessment.start_date is only PARTIAL: every event card gives
//      a day + Portuguese-month-abbreviation string ("28 ago", "03 set")
//      but NO card, page heading, or any other retained first-party
//      evidence states a calendar year anywhere on hotfive.pt. This
//      module therefore extracts `date_text` as opaque verbatim text —
//      it never attempts to parse a day/month number out of it, and it
//      NEVER invents, infers, or backfills a year. (A third-party
//      lebillet.eu ticket page does independently state a year, but per
//      docs/SOURCE_INVESTIGATION_POLICY.md's "Third-party sources" rule
//      that is not first-party authority for hotfive.pt's own dates, and
//      is not used here.)
//   2. field_assessment.source_record_id is only PARTIAL: 47/52 real
//      cards carry an outbound href to a third-party ticketing platform
//      (lebillet.eu) containing a numeric id in its URL path — but that
//      id is assigned by the external vendor, observed via only a single
//      snapshot, and is never documented by hotfive.pt itself as its own
//      identifier. This module surfaces that numeric id as a plain,
//      honestly-named `ticketing_numeric_id` field (never called
//      `source_record_id` at this layer) so the observation-adapter can
//      make its own documented identity decision on top of it.
//
// Site structure (site_classification, same investigation): hand-authored
// Elementor "icon-box" + "button" widget blocks, not a calendar/events
// CMS plugin, no JSON-LD Event data. Every event card is one
// `data-widget_type="icon-box.default"` widget (title + date text)
// immediately followed by one or more `data-widget_type="button.default"`
// widgets (an outbound "Buy tickets"/"unavailable" button, which may or
// may not carry an `href`). This module walks the document by splitting
// on that icon-box marker — exactly the same acquisition mechanic already
// mechanically proven offline in
// research/source-investigations/hot-five-porto-01/evidence/offline-proof.mjs
// (see that script's `parseEventCards()`), except this module throws
// instead of silently skipping when a genuine icon-box block turns out to
// be missing its required title or date text.
//
// One recorded MINOR blocker this module deliberately does not "fix": one
// card ("The House of Gatsby", "10 & 11 jul") carries TWO ticket buttons
// (two distinct lebillet.eu ids for what are presumably two distinct
// nights) under a single combined date-text card. This module keeps only
// the FIRST button's href/id for that card — the same simplification the
// investigation's own offline-proof.mjs already used — rather than
// guessing which id belongs to which of the two days. This mirrors
// collector_assessment.blockers' own MINOR entry documenting this exact
// shape; a future collector revision may choose to split such cards, but
// that is a new, separately-evidenced decision, not one this module makes
// silently.

const ICON_BOX_MARKER = 'data-widget_type="icon-box.default"';

const TITLE_RE = /elementor-icon-box-title">\s*<span\s*>\s*([\s\S]*?)<\/span>/;
const DATE_RE = /elementor-icon-box-description">\s*([^<]+?)\s*<\/p>/;
const BUTTON_HREF_RE = /<a class="elementor-button[^"]*"[^>]*\shref="([^"]+)"/;
const LEBILLET_EVENT_ID_RE = /lebillet\.eu\/event\/(\d+)/i;

function decodeEntities(text) {
  if (typeof text !== "string") return text;
  return text.replace(/&amp;/g, "&");
}

function normalizeWhitespace(text) {
  return text.replace(/<br\s*\/?>/gi, " ").replace(/\s+/g, " ").trim();
}

/**
 * Parse one retained Hot Five /shows/ (or home page "next shows" mini-list)
 * HTML document into discovery records, one per event card, in document
 * order. Never guesses a year, never invents an id. Throws on empty/
 * non-string input, on a document with no event-card markers at all, and
 * on any individual card block that is missing its required title or date
 * text (a genuinely malformed/unexpected card shape this module refuses
 * to silently skip past).
 *
 * Each record: `{ title, date_text, ticketing_url, ticketing_numeric_id }`.
 *   - `title`        - the card's event title, HTML-decoded and
 *                       whitespace-normalized (an embedded `<br>` becomes
 *                       a single space, e.g. "Amy Winehouse (Back to Amy)")
 *   - `date_text`     - the card's verbatim "DD mon" (or "DD & DD mon")
 *                       date string, exactly as printed — day + Portuguese
 *                       month abbreviation, genuinely no year present
 *   - `ticketing_url`      - the card's first outbound lebillet.eu
 *                            "Buy tickets" href, or `null` when the card's
 *                            button carries no href at all (a ticketless
 *                            "Buy tickets"/"unavailable" button, or no
 *                            button widget at all)
 *   - `ticketing_numeric_id` - the numeric id parsed from `ticketing_url`'s
 *                              `/event/{id}/...` path, or `null` when
 *                              `ticketing_url` is null or does not match
 *                              that expected lebillet.eu shape
 */
export function parseHotFiveShows(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Hot Five /shows/ HTML");
  }

  const parts = html.split(ICON_BOX_MARKER);
  if (parts.length < 2) {
    throw new Error(`No event-card marker ("${ICON_BOX_MARKER}") found in this Hot Five HTML document`);
  }

  const records = [];
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i];

    const titleMatch = TITLE_RE.exec(chunk);
    if (!titleMatch) {
      throw new Error(`Event card ${i} is missing its required title (elementor-icon-box-title) — refusing to guess`);
    }
    const dateMatch = DATE_RE.exec(chunk);
    if (!dateMatch) {
      throw new Error(`Event card ${i} ("${normalizeWhitespace(decodeEntities(titleMatch[1]))}") is missing its required date text (elementor-icon-box-description) — refusing to guess`);
    }

    const title = normalizeWhitespace(decodeEntities(titleMatch[1]));
    const dateText = decodeEntities(dateMatch[1]).trim();

    const hrefMatch = BUTTON_HREF_RE.exec(chunk);
    const ticketingUrl = hrefMatch ? hrefMatch[1] : null;

    const idMatch = ticketingUrl ? LEBILLET_EVENT_ID_RE.exec(ticketingUrl) : null;
    const ticketingNumericId = idMatch ? idMatch[1] : null;

    records.push({
      title,
      date_text: dateText,
      ticketing_url: ticketingUrl,
      ticketing_numeric_id: ticketingNumericId,
    });
  }

  return records;
}
