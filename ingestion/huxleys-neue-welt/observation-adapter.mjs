// SECOND_PASS_BESPOKE -- Huxleys Neue Welt
// Berlin's own bespoke static-HTML card parser -- see
// research/source-investigations/huxleys-neue-welt-berlin-01/. WordPress
// with the 'Events Manager' plugin's grouped-list widget: the events
// listing page (https://huxleysneuewelt.de/en/events) server-renders
// events grouped under month/year headings
// (<div class="month"><h3>September 2026</h3></div>), each event as an
// <li class="event-item ..."> card stating a start/doors time and title
// directly, plus a link to the event's own detail page whose URL itself
// directly states the event's full date as its own canonical path prefix
// (/en/event/YYYY-MM-DD-slug) -- the same slug this source already uses
// as its own stable source_record_id (see this investigation's
// field_assessment.source_record_id, basis DIRECT_SOURCE). Genuinely
// bespoke to this exact markup, not shared by any other source.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "huxleys-neue-welt-berlin";

const LI_RE = /<li class="event-item([^"]*)">([\s\S]*?)<\/li>/g;
const HREF_RE = /<a href="(https:\/\/huxleysneuewelt\.de\/en\/event\/[^"]+)">/;
const TIME_RE =
  /<div class="time">\s*(?:Beginn|Start):\s*(\d{2}:\d{2})\s*\|\s*(?:Einlass|Doors):\s*(\d{2}:\d{2})\s*<\/div>/;
const NAME_RE = /<span class="eventname">([^<]*)<\/span>/;
const SUPPORT_RE = /<span class="support">\+ Support: ([^<]*)<\/span>/;

// This source's own event-detail URL states its full date directly as the
// URL's own path prefix -- DIRECT_SOURCE, not a heading/day combination.
const SLUG_DATE_RE = /\/event\/(\d{4}-\d{2}-\d{2})-[^/?#]*\/?$/;
const SLUG_RE = /\/event\/([^/?#]+?)\/?$/;

// The detail page's own server-generated og:description meta tag is the
// only place this source states an explicit end time, e.g.
// `Wed 02.09.2026 @ 20:00 - 22:30 - <description text>`.
const OG_DESCRIPTION_END_RE =
  /<meta property="og:description" content="[A-Za-z]+ (\d{2})\.(\d{2})\.(\d{4}) @ (\d{2}):(\d{2}) - (\d{2}):(\d{2})/;

function decodeEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#0*38;/g, "&")
    .replace(/&#x27;/gi, "'")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .trim();
}

/**
 * Extract every event card from the venue's own events listing page HTML.
 * Never throws on zero matches -- a genuinely empty listing is legitimate.
 * Skips (never fabricates) any card missing a detail-page link, a
 * date-bearing URL, or a title.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Huxleys Neue Welt events-page HTML");
  }
  const cards = [];
  let match;
  LI_RE.lastIndex = 0;
  while ((match = LI_RE.exec(html)) !== null) {
    const [, statusClasses, block] = match;

    const hrefMatch = HREF_RE.exec(block);
    if (!hrefMatch) continue;
    const eventUrl = hrefMatch[1];

    const dateMatch = SLUG_DATE_RE.exec(eventUrl);
    if (!dateMatch) continue; // this card's own URL doesn't state a date -- skip, never guess one

    const nameMatch = NAME_RE.exec(block);
    if (!nameMatch) continue;

    const timeMatch = TIME_RE.exec(block);
    const supportMatch = SUPPORT_RE.exec(block);

    let status = "SCHEDULED";
    if (/\bAusverkauft\b/.test(statusClasses)) status = "SOLD_OUT";
    else if (/\bAbgesagt\b/.test(statusClasses)) status = "CANCELLED";

    cards.push({
      date: dateMatch[1],
      startTime: timeMatch ? timeMatch[1] : null,
      doorsTime: timeMatch ? timeMatch[2] : null,
      eventUrl,
      title: decodeEntities(nameMatch[1].trim()),
      support: supportMatch ? decodeEntities(supportMatch[1].trim()) : null,
      status,
    });
  }
  return cards;
}

function deriveStart(card) {
  const dt = emptyDateTime();
  dt.date = card.date;
  if (card.startTime) {
    dt.raw = `${card.date} ${card.startTime}`;
    // No timezone/offset is stated anywhere on this source -- a floating
    // local time, never upgraded to a UTC instant (matches this
    // investigation's own honest field-assessment for `time`).
    dt.certainty = "FLOATING_LOCAL";
  } else {
    dt.raw = card.date;
    dt.certainty = "DATE_ONLY";
  }
  return dt;
}

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /event/{slug} shape: ${card.eventUrl}`);
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: slugMatch[1], // this source's own detail-page URL slug, its canonical path
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveStart(card),
    end: emptyDateTime(), // NOT_PRESENT from the list page alone -- see enrichEndFromDetailPage()

    venue_name: "Huxleys Neue Welt", // single-venue source, resolved by source_id
    location_text: null,

    price_text: null, // NOT_PRESENT -- only an outbound Eventim ticket link, no first-party price field

    event_url: card.eventUrl,

    source_fields: {
      status: card.status,
      support: card.support ?? null,
      doors_time: card.doorsTime,
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

/**
 * Parse the explicit end time this source states only in its
 * server-generated og:description meta tag on the event's own detail
 * page (e.g. "Wed 02.09.2026 @ 20:00 - 22:30 - ..."). Returns null,
 * never a guess, if the tag is absent or does not match this exact,
 * observed "date @ start - end" shape.
 */
export function extractEndFromDetailPage(detailHtml) {
  if (typeof detailHtml !== "string" || detailHtml.trim() === "") {
    return null;
  }
  const m = OG_DESCRIPTION_END_RE.exec(detailHtml);
  if (!m) return null;
  const [, day, month, year, startHour, startMinute, endHour, endMinute] = m;
  return {
    date: `${year}-${month}-${day}`,
    start: `${startHour}:${startMinute}`,
    end: `${endHour}:${endMinute}`,
  };
}

/**
 * Enrich an Observation's `end` field from its own event's detail page
 * og:description. Only applies the enrichment when the detail page's own
 * stated date agrees with the Observation's own start date -- never
 * attaches a mismatched detail page's end time, and never fabricates an
 * end time when the tag is absent/unparseable (the Observation's `end`
 * is simply left as its existing NOT_PRESENT/emptyDateTime() value).
 */
export function enrichEndFromDetailPage(observation, detailHtml, { fixturePath } = {}) {
  const parsed = extractEndFromDetailPage(detailHtml);
  if (!parsed) return observation;
  if (observation?.start?.date && observation.start.date !== parsed.date) {
    return observation;
  }

  const end = emptyDateTime();
  end.date = parsed.date;
  end.raw = `${parsed.date} ${parsed.end}`;
  end.certainty = "FLOATING_LOCAL";

  return {
    ...observation,
    end,
    source_fields: {
      ...observation.source_fields,
      end_source: "og:description",
      end_fixture_path: fixturePath ?? null,
    },
  };
}
