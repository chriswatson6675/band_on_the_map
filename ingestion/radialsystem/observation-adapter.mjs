// BEATMAPPED-BERLIN-SECOND-PASS-30-40-VENUE-COMPLETION-01 — Radialsystem
// Berlin's own bespoke static-HTML list-view parser — see
// research/source-investigations/radialsystem-berlin-01/. Custom-built
// (ProcessWire CMS) site using Alpine.js for client-side filter UI only;
// both the "grid" and "list" renderings of the programme calendar
// (https://www.radialsystem.de/en/programm/programm/) are fully
// server-rendered in the raw HTML — no client-side data fetch is needed to
// read them.
//
// This adapter parses the page's "list" view specifically (`x-show=
// "isDisplaySelected('list')"` section), not the "grid" view, because the
// list view already expands one row PER PERFORMANCE OCCURRENCE (its own
// date/time/location/href), whereas the grid view bundles every occurrence
// of one production into a single card with multiple stacked dateblocks.
// Both views repeat the exact same underlying data — this is a genuine
// same-data, different-rendering choice, not a second, independent source.
//
// One production genuinely has multiple performance dates (e.g. "Zweiland"
// has 6) — the list view's own per-row link
// (`/en/veranstaltungen/{slug}/?date={unixTimestamp}`) already disambiguates
// each occurrence with a second, source-authored value alongside the slug,
// resolving this investigation's earlier PARTIAL source_record_id note (see
// investigation.json field_assessment.source_record_id).
//
// The programme mixes disciplines (Dance, Exhibition, Workshop, Lecture,
// Family Format, Party, Music theatre, Concert/Concerts/Musik, ...) via the
// source's own `<span class="tag">...</span>` category markup per row —
// this is the SAME "source's own first-party category is stronger evidence
// than a keyword guess" judgement as filterMusicEventCards() in
// ingestion/per-event-ics/discovery.mjs, just against Radialsystem's own
// tag vocabulary instead of that platform's `data-categoryname`.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "radialsystem-berlin";

const VENUE_NAME = "Radialsystem"; // the source's own <title>/brand name (no "Berlin" suffix used by the site itself)

const BASE_URL = "https://www.radialsystem.de";

// Only the venue's own confirmed single-production detail-page URL shape
// (see investigation.json data_paths: HTML_EVENT_DETAIL_PAGE,
// "/en/veranstaltungen/{slug}/"). The programme list also links a small
// number of rows to "/en/festivals/{slug}/" — a whole multi-activity
// festival umbrella page, not a single production/performance — which is
// out of scope here: this investigation never sampled or confirmed that
// page shape as an event detail page, so cards linking to it are silently
// excluded from extraction rather than guessed at.
const EVENT_PATH_RE = /^\/en\/veranstaltungen\/([a-z0-9-]+)\/$/;

// Locate just the "list" view's markup so the same underlying data is not
// double-counted from the "grid" view rendered elsewhere on the same page.
const LIST_VIEW_MARKER = `x-show="isDisplaySelected('list')"`;

// One row (one performance occurrence) in the "list" view. Field-by-field:
//   group 1 - urlPath        the production's own canonical path, e.g.
//                             "/en/veranstaltungen/zweiland/"
//   group 2 - dateTimestamp  this occurrence's own "?date=" query value,
//                             a second source-authored disambiguator
//   group 3 - day            <span class="mday"><span aria-hidden="true">DD
//   group 4 - month          <span class="month"><span aria-hidden="true">MM
//   group 5 - year           <span class="year">YYYY
//   group 6 - timeRaw        <span class="special">...</span> — "HH:MM",
//                             "HH:MM h", "from HH:MM", or "from HH:MM h"
//   group 7 - location       <span class="location">...</span> — this
//                             row's room (e.g. "Saal"/"Halle"); genuinely
//                             absent on some rows (festival/open-house
//                             style entries), hence optional
//   group 8 - tagsBlock      the row's own <span class="tag">...</span>
//                             category markup (zero, one, or many)
//   group 9 - title          the production's own title, e.g. "Zweiland"
const ROW_RE =
  /<div class="columns the-date">\s*<a href="([^"?]+)\?date=(\d+)">[\s\S]*?<div class="to-desktop">\s*<p class="dateblock">\s*<span class="wday">[^<]*<\/span>\s*<span class="mday"[^>]*><span aria-hidden="true">(\d+)<\/span><\/span>\s*<span class="month"[^>]*><span aria-hidden="true">(\d+)<\/span><\/span>\s*<span class="year">(\d+)<\/span>\s*<br>\s*<span class="special">([^<]*)<\/span>\s*(?:<span class="location">([^<]*)<\/span>)?[\s\S]*?<div class="columns the-format">[\s\S]*?<div class="between-flex full-height">\s*<p>([\s\S]*?)<\/p>[\s\S]*?<div class="columns the-name">\s*<a[^>]*>\s*<h1>([^<]*)<\/h1>/g;

const TAG_RE = /<span class="tag">([^<]*)<\/span>/g;
const TIME_RE = /(\d{2}:\d{2})/;

/**
 * Extract every performance-occurrence row from the venue's own programme
 * list page HTML ("list" view only — see module doc). Never throws on zero
 * matches — a genuinely empty programme is legitimate. Rows linking to an
 * unsupported URL shape (e.g. a "/en/festivals/" umbrella page) are
 * silently excluded, not fabricated into a card shape this investigation
 * never confirmed.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Radialsystem programme-list HTML");
  }

  const listStart = html.indexOf(LIST_VIEW_MARKER);
  if (listStart === -1) {
    throw new Error('Expected a "list" view section (x-show="isDisplaySelected(\'list\')") in the programme HTML');
  }
  const listSection = html.slice(listStart);

  const cards = [];
  let match;
  ROW_RE.lastIndex = 0;
  while ((match = ROW_RE.exec(listSection)) !== null) {
    const [, urlPath, dateTimestamp, day, month, year, timeRaw, location, tagsBlock, title] = match;

    const slugMatch = EVENT_PATH_RE.exec(urlPath);
    if (!slugMatch) {
      continue; // out of scope: not a confirmed single-production detail page
    }

    const timeMatch = TIME_RE.exec(timeRaw);
    if (!timeMatch) {
      throw new Error(`Could not parse a HH:MM time out of "${timeRaw}" for ${urlPath}`);
    }

    const tags = [...tagsBlock.matchAll(TAG_RE)].map((t) => t[1].trim());

    cards.push({
      slug: slugMatch[1],
      eventUrl: `${BASE_URL}${urlPath}`,
      occurrenceTimestamp: dateTimestamp,
      date: `${year}-${month}-${day}`,
      time: timeMatch[1],
      location: location ?? null,
      tags,
      title: title.trim(),
    });
  }
  return cards;
}

// Bounded, explainable allow-list of this source's own `<span class="tag">`
// category values that genuinely mean "this is a concert/live-music
// performance" (English "Concert"/"Concerts" and German "Musik", all
// directly observed on the retained fixture). Deliberately narrow, matching
// this project's existing MUSIC_CATEGORY_NAMES convention (per-event-ics)
// of trusting a source's own first-party category label over a keyword
// guess: "Dance", "Exhibition", "Workshop", "Lecture", "Family Format",
// "Party", "Performance", "Performance / Tanz", and "Music theatre" are all
// real category values on this page that are NOT treated as music here —
// "Music theatre" in particular is a genuinely hybrid discipline (staged,
// dramatic work with music) this project's own product-intent genre list
// does not name, so it stays excluded rather than guessed in. Extend
// deliberately if future evidence shows a different tag is genuinely
// music-relevant — never silently widened without evidence.
const MUSIC_TAGS = new Set(["Concert", "Concerts", "Musik"]);

/**
 * Filter already-extracted cards (extractEventCards()) down to genuinely
 * music-relevant ones. A card passes if ANY of its own tags is in
 * MUSIC_TAGS — the source's own category markup is stronger evidence than
 * a title/description keyword guess would be, the same judgement
 * filterMusicEventNodes()/filterMusicEventCards() already make for other
 * sources in this project. Returns `{ musicCards, rejectedCards }` so a
 * caller can honestly report what was excluded and why.
 */
export function filterMusicEventCards(cards) {
  const musicCards = [];
  const rejectedCards = [];
  for (const card of cards ?? []) {
    if ((card.tags ?? []).some((tag) => MUSIC_TAGS.has(tag))) {
      musicCards.push(card);
    } else {
      rejectedCards.push(card);
    }
  }
  return { musicCards, rejectedCards };
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = `${card.date} ${card.time}`;
  dt.date = card.date;
  // No timezone/offset is stated anywhere on the page — a floating local
  // time, never upgraded to a UTC instant (matches this investigation's
  // own honest field assessment: time PROVEN as a local clock value, but
  // never claimed as a confirmed UTC instant).
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.slug || !card?.occurrenceTimestamp) {
    throw new Error("toObservation requires card.slug and card.occurrenceTimestamp");
  }

  return createObservation({
    source_id: SOURCE_ID,
    // Compound id: the production's own permalink slug + this occurrence's
    // own "?date=" query value, both read directly from the one retained
    // row's own href attribute — the same permalink-URL-is-the-source's-own
    // -canonical-path stability rule already accepted elsewhere in this
    // project, extended with the second disambiguator this source itself
    // provides for its genuine one-production-many-performances structure.
    source_record_id: `${card.slug}__${card.occurrenceTimestamp}`,
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: VENUE_NAME, // single-venue source, resolved by source_id
    location_text: card.location ?? null, // Radialsystem's own named internal room (e.g. "Saal"/"Halle"), not a separate venue

    price_text: null, // NOT_PRESENT on this list-view card shape (tiered pricing only found on the detail page, out of scope for this bounded card parse)
    event_url: card.eventUrl,

    source_fields: {
      tags: card.tags ?? [],
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

export function toObservations(cards, options = {}) {
  return (cards ?? []).map((card) => toObservation(card, options));
}
