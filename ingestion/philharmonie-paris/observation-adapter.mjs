// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — mapping from one
// Philharmonie de Paris EventCard (ingestion/philharmonie-paris/
// discovery.mjs's extractEventCardMeta()) plus its own detail page's
// schema.org JSON-LD MusicEvent into this project's generic Observation
// contract (ingestion/observation/contract.mjs). See
// research/source-investigations/philharmonie-paris-01/ for the governed
// investigation this is built against.
//
// Reuses the EXISTING, UNMODIFIED ingestion/json-ld/parse.mjs
// (extractEventNodes/normaliseJsonLdEvent) for the detail page's own
// JSON-LD, behind this source's own local sanitisation step (see
// discovery.mjs). The final Observation is assembled here, rather than via
// ingestion/json-ld/observation-adapter.mjs's own toObservation(), for two
// source-specific reasons kept honest rather than silently worked around:
//
//   1. source_record_id is NOT present anywhere in this source's own
//      JSON-LD (no 'url' or id-shaped field) — it comes from the CARD's
//      own data-event-eid/data-performance-eid HTML attributes instead
//      (see discovery.mjs), which the generic json-ld family has no way to
//      see (it only ever looks at the JSON-LD node itself).
//   2. this source's own JSON-LD 'location.address' is a plain STRING
//      ("221 avenue Jean-Jaurès, 75019 Paris"), not the PostalAddress
//      OBJECT ingestion/json-ld/parse.mjs's normaliseJsonLdEvent() expects
//      — its own location_address handling silently returns null for a
//      string address, so this adapter reads the raw address directly off
//      normaliseJsonLdEvent()'s own preserved `record.raw` field instead of
//      inventing a workaround inside the shared module.

import { createObservation } from "../observation/contract.mjs";
import { extractEventNodes, normaliseJsonLdEvent } from "../json-ld/parse.mjs";
import { deriveDateTimeFromIso } from "../json-ld/observation-adapter.mjs";
import { sanitiseJsonLdControlCharacters } from "./discovery.mjs";

export const SOURCE_ID = "philharmonie-paris";
export const BASE_URL = "https://philharmoniedeparis.fr";

/**
 * Extract the single schema.org Event/MusicEvent JSON-LD node from one
 * retained detail page, after this source's own required control
 * -character sanitisation. Throws if none is found.
 */
export function extractDetailEventNode(detailHtml) {
  const sanitised = sanitiseJsonLdControlCharacters(detailHtml);
  const nodes = extractEventNodes(sanitised, { types: new Set(["Event", "MusicEvent"]) });
  if (nodes.length === 0) {
    throw new Error("no schema.org Event/MusicEvent JSON-LD found on this detail page");
  }
  return nodes[0];
}

/**
 * Convert one card's metadata (extractEventCardMeta()) plus its own
 * detail-page JSON-LD node into an Observation.
 */
export function toObservation(cardMeta, detailNode, options = {}) {
  if (!cardMeta?.eventEid || !cardMeta?.performanceEid) {
    throw new Error("toObservation requires cardMeta.eventEid and cardMeta.performanceEid");
  }

  const record = normaliseJsonLdEvent(detailNode);
  const rawLocation = detailNode?.location && typeof detailNode.location === "object" ? detailNode.location : null;
  const locationAddressText = typeof rawLocation?.address === "string" ? rawLocation.address : null;

  return createObservation({
    source_id: SOURCE_ID,
    source_record_id: `event-eid:${cardMeta.eventEid}/performance-eid:${cardMeta.performanceEid}`,
    retrieved_at: options.retrievedAt ?? null,

    source_url: options.sourceUrl ?? null,
    content_type: "application/ld+json",

    title: record.title ?? null,
    description: record.description ?? null,

    start: deriveDateTimeFromIso(record.start_raw),
    end: deriveDateTimeFromIso(record.end_raw),

    venue_name: record.location_name ?? null,
    location_text: locationAddressText,

    price_text: record.price_text ?? null,
    event_url: cardMeta.detailHref ? new URL(cardMeta.detailHref, options.baseUrl ?? BASE_URL).toString() : record.event_url ?? null,

    source_fields: {
      event_eid: cardMeta.eventEid,
      performance_eid: cardMeta.performanceEid,
      timestamp_seconds: cardMeta.timestampSeconds ?? null,
      category: cardMeta.category ?? null,
      performers: record.performers ?? [],
      types: record.types ?? [],
    },

    raw_evidence: {
      fixture_path: options.fixturePath ?? null,
      evidence_kind: "PARSED_STRUCTURED_JSON",
      content_type: "application/ld+json",
      byte_faithful: false,
    },
  });
}
