// Berghain / Kantine am Berghain — bespoke static-HTML card parser, see
// research/source-investigations/berghain-berlin-01/. A custom
// server-rendered site (no WordPress/Sanity/Nuxt/Next fingerprint); every
// event card on the program list page (both /en/program/, paginated via
// its own "?page=N" query parameter, and the separately-templated
// /en/program/kantine-am-berghain/ sub-page) repeats the identical
// server-rendered structure: `<a href="/en/event/{id}/">` wrapping a
// `<p>` with day name + `DD.MM.YYYY` + optional "doors HH:MM" + "start
// HH:MM", an `<h2>` title, and an `<h3>` room name. Genuinely bespoke to
// this exact markup.
//
// Date/time: the list card's own "start HH:MM" text is only a plain
// local time with no stated offset — never upgraded to UTC_INSTANT from
// the card alone. Per this investigation's own field assessment, the
// event's own detail page (`/en/event/{id}/`) states the identical
// instant directly and precisely, as a full ISO 8601 string WITH an
// explicit UTC offset, in the first running-order set's own
// `data-set-item-start` attribute (mirrored in a `<time datetime=...>`
// element) — e.g. `data-set-item-start="2026-08-27T22:00:00+02:00"`.
// Converting an explicit-offset ISO instant to UTC is deterministic
// arithmetic (`new Date(...).toISOString()`), never inference, so
// certainty is honestly UTC_INSTANT whenever this attribute is present
// and parseable. A real, retained edge case (event 82435, title literally
// "error" — a genuine data anomaly on the source's own site, not a
// parsing artifact) has NO running-order sets at all: no
// data-set-item-start/end anywhere on its detail page. When that
// attribute is missing, this adapter never fabricates an instant — it
// falls back to the card's own FLOATING_LOCAL date/time text, honestly
// uncertain, exactly like every other source in this project without a
// stated offset.
//
// source_record_id: each event's own canonical permalink path
// `/en/event/{numeric_id}/` — a deterministic source property the site
// itself uses as its own stable path (see the investigation's own
// source_record_id field assessment).
//
// venue_name/location_text: Berghain's own rooms (Berghain, Panorama Bar,
// Säule, Halle, Kantine am Berghain) are sub-locations of one physical
// venue, not separate venues — matching this project's existing
// room-is-not-a-separate-venue precedent (e.g. Zenner's Saal/Wintergarten/
// Klub in ingestion/zenner/observation-adapter.mjs). venue_name is fixed
// ("Berghain", resolved by source_id); the sampled room name is preserved
// honestly in location_text and source_fields.room. A Klubnacht card can
// list more than one room (e.g. Berghain + Panorama Bar) — only the
// first `<h3>` is captured per card, the room actually named directly
// alongside that event's own title; this is a genuine, disclosed
// limitation, not an invented single-room claim.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "berghain-berlin";

// Matches one event card on either /en/program/ (incl. its "?page=N"
// fragments) or /en/program/kantine-am-berghain/ — both templates share
// this exact structure, differing only in surrounding whitespace/attrs,
// which `[^>]*` and `\s*` absorb. A card's own "doors HH:MM" (present on
// many, not all, cards) is skipped; only "start HH:MM" — the value this
// investigation's own field assessment treats as the door/start time — is
// captured. The room `<h3>` is optional: a card could theoretically omit
// it, and only the FIRST `<h3>` after the title is captured (see module
// doc comment on multi-room Klubnacht cards).
const CARD_RE =
  /<a href="(\/en\/event\/(\d+)\/)"[^>]*>\s*<p class="text-sm md:text-md leading-tight">\s*\w+\s*<span class="font-bold">\s*(\d{2})\.(\d{2})\.(\d{4})\s*<\/span>\s*(?:doors \d{2}:\d{2}\s*)?(?:start (\d{2}:\d{2}))?\s*<\/p>\s*<h2[^>]*>\s*([^<]+)<\/h2>\s*(?:<h3[^>]*>\s*([^<]+)<\/h3>)?/g;

/**
 * Extract every event card from one program list page's HTML (the main
 * /en/program/ page, one of its own "?page=N" fragments, or the Kantine
 * am Berghain sub-page — all share this one markup shape). Never throws
 * on zero matches — a genuinely empty listing is legitimate.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Berghain program-page HTML");
  }
  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, path, id, day, month, year, time, title, room] = match;
    cards.push({
      permalinkId: id,
      eventUrl: `https://www.berghain.berlin${path}`,
      date: `${year}-${month}-${day}`,
      time: time ?? null,
      title: title.trim(),
      room: room ? room.trim() : null,
    });
  }
  return cards;
}

// The first running-order set's own start instant, stated directly with
// a full UTC offset — e.g. `data-set-item-start="2026-08-27T22:00:00+02:00"`.
const DETAIL_START_RE = /data-set-item-start="([^"]+)"/;

/**
 * Extract the real, precise start instant from one event's own detail
 * page HTML — the FIRST running-order set's `data-set-item-start`
 * attribute, which this investigation's own evidence confirms states the
 * identical instant the list card's own date/"start HH:MM" text
 * describes, but with a full, explicit UTC offset the list card never
 * carries. Returns null (never invents a value) when the attribute is
 * genuinely absent — a real, retained case (event 82435) has no
 * running-order sets at all.
 */
export function extractDetailStartInstant(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Berghain event-detail HTML");
  }
  const match = DETAIL_START_RE.exec(html);
  return match ? match[1] : null;
}

function deriveStart(card, detailStartInstant) {
  const dt = emptyDateTime();

  if (detailStartInstant) {
    const parsed = new Date(detailStartInstant);
    if (!Number.isNaN(parsed.getTime())) {
      dt.raw = detailStartInstant;
      dt.iso = parsed.toISOString();
      dt.is_utc = true;
      dt.date = dt.iso.slice(0, 10);
      dt.certainty = "UTC_INSTANT";
      return dt;
    }
  }

  // No confirmed detail-page instant available (attribute missing, or
  // this card was adapted from a list page alone) — fall back to the
  // card's own plain-text local date/time. Never upgraded to a UTC
  // instant without the source's own explicit offset.
  dt.raw = card.time ? `${card.date} ${card.time}` : card.date;
  dt.date = card.date ?? null;
  dt.certainty = card.time ? "FLOATING_LOCAL" : card.date ? "DATE_ONLY" : "UNKNOWN";
  return dt;
}

/**
 * Convert one extracted card into an Observation. `detailStartInstant`,
 * when supplied, is the exact string read from that event's own detail
 * page by extractDetailStartInstant() — the caller is responsible for
 * fetching/retaining that page; this function performs no I/O itself.
 */
export function toObservation(card, { detailStartInstant, retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl || !card?.permalinkId) {
    throw new Error("toObservation requires card.eventUrl and card.permalinkId");
  }

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: card.permalinkId, // this source's own stable numeric permalink id
    retrieved_at: retrievedAt ?? null,

    source_url: card.eventUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveStart(card, detailStartInstant ?? null),
    end: emptyDateTime(), // NOT_PRESENT — no overall closing time is ever published

    venue_name: "Berghain", // single-source, multi-room venue — resolved by source_id
    location_text: card.room ?? null,

    price_text: null, // NOT_PRESENT on the list card; only PARTIAL on the detail page, not generalised here
    event_url: card.eventUrl,

    source_fields: {
      room: card.room ?? null,
    },

    raw_evidence: {
      fixture_path: fixturePath ?? null,
      evidence_kind: "RAW_HTTP_RESPONSE_BYTES",
      content_type: "text/html",
      byte_faithful: true,
    },
  });
}

/**
 * Batch-adapt cards. `detailStartInstantsById` maps a card's own
 * `permalinkId` to the value extractDetailStartInstant() returned for
 * that event's detail page (or is omitted/lacks an entry for a card
 * whose detail page was not fetched — that card simply falls back to
 * FLOATING_LOCAL, never fabricated).
 */
export function toObservations(cards, detailStartInstantsById = {}, options = {}) {
  return (cards ?? []).map((card) =>
    toObservation(card, {
      ...options,
      detailStartInstant: detailStartInstantsById?.[card.permalinkId] ?? null,
    })
  );
}
