// Tresor Berlin — see research/source-investigations/tresor-berlin-01/.
// WordPress with a custom event-grid theme; no queryable events REST route
// (wp-json/tribe/events/v1/events confirmed 401 rest_disabled — re-verified
// live). The events list page (https://tresorberlin.com/club/events/) is
// fully server-rendered static HTML: every upcoming event is one
// `<article class="event-item">` block naming its own title and a
// day-name + DD.MM date, and linking (twice — once from the date bar, once
// from the title) to its own detail-page permalink of the form
// `/event/{YYYYMMDD}-{slug}/`. The permalink's own YYYYMMDD prefix is the
// full date, stated directly by the source (basis DIRECT_SOURCE) — not a
// derived/combined value — and is also this source's own stable canonical
// path, used here as source_record_id per the policy's stable-identifier
// rule.
//
// HONEST LIMITATION (documented, not silently worked around): the events
// list page does NOT state a start time anywhere — no time appears in the
// date bar, the title, or the per-floor "floor-name" text of a standard
// Klubnacht card (e.g. plain "Tresor" / "Globus"). A start time only
// appears on the event's own DETAIL page, inside each floor's own
// "lineup-time" entries (e.g. "23:00-02:00"), and — per this
// investigation's own field_assessment.time notes — that structure is not
// uniform across every event (some detail pages embed extra host/time text
// directly into the floor-name instead of a clean lineup-time block).
// Extracting a genuine per-event start time would require fetching every
// event's own detail page, which this list-page-only adapter deliberately
// does not do. Per policy ("Unknown facts must never be invented"), `time`
// is therefore left `null`/`UNKNOWN` here rather than guessed at or
// silently borrowed from one sampled detail page.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "tresor-berlin";

const CARD_RE =
  /<article class="event-item">\s*<div class="event-date bar"><a class="plus-link" href="([^"]+)"><span>([^<]+)<\/span><\/a><\/div>\s*<a class="event-title bar" href="([^"]+)"><span><span>([^<]*)<\/span><\/span><\/a>/g;

const SLUG_RE = /\/event\/((\d{8})-[a-z0-9-]+)\/?$/;

/**
 * Extract every event card from the venue's own events listing page HTML.
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Tresor Berlin events-page HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, dateHref, , titleHref, title] = match;
    const eventUrl = titleHref || dateHref;
    const slugMatch = SLUG_RE.exec(eventUrl);
    if (!slugMatch) {
      // The URL does not match this source's own date-prefixed permalink
      // shape — skip rather than fabricate a date for it.
      continue;
    }
    const [, sourceRecordId, yyyymmdd] = slugMatch;
    const date = `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
    cards.push({
      date,
      eventUrl,
      title: title.trim(),
      sourceRecordId,
    });
  }
  return cards;
}

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = card.date;
  dt.date = card.date;
  // The events list page states no time at all (see module header) — the
  // date itself comes directly from the source's own permalink slug, a
  // full, unambiguous DIRECT_SOURCE value, so DATE_ONLY is the honest
  // certainty here (not FLOATING_LOCAL, which this project reserves for a
  // known local date+time pair with no timezone offset).
  dt.certainty = "DATE_ONLY";
  return dt;
}

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  if (!card?.sourceRecordId) {
    throw new Error(`toObservation requires card.sourceRecordId (event URL did not match the expected /event/{YYYYMMDD}-{slug}/ shape: ${card.eventUrl})`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: card.sourceRecordId, // this source's own date-prefixed permalink slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    venue_name: "Tresor Berlin", // single-venue source, resolved by source_id
    location_text: null, // per-floor room name (Tresor/Globus/Aurora Bar) only appears on the detail page, not the list page — not fabricated here

    price_text: null, // NOT_PRESENT on this source's own card shape (tickets sold via a third-party, Resident Advisor)
    event_url: card.eventUrl,

    source_fields: {},

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
