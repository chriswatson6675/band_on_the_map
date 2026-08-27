// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Truskel (Paris) mapping
// from one retained event-details page's HTML into the project's generic
// Observation contract, reusing the EXISTING, unmodified
// ingestion/json-ld/ family for every part of the shape that family
// already handles (extractEventNodes/normaliseJsonLdEvent/toObservation's
// date-certainty logic). See
// research/source-investigations/truskel-paris-01/ for the retained
// evidence this is built against.
//
// The one genuinely source-specific wrinkle: unlike every other JSON-LD
// source in this project so far, Truskel's own Event node does NOT carry
// a top-level `url` field — its canonical page URL is nested at
// `location.url` instead (schema.org allows either; this source's own
// markup happens to place it there). ingestion/json-ld/parse.mjs's
// normaliseJsonLdEvent() reads `node.url` for `event_url`, which is
// genuinely absent here — so this adapter patches that one field in from
// `location.url` after normalisation, rather than editing the shared,
// already-proven-elsewhere family module for one source's own quirk.

import { extractEventNodes, normaliseJsonLdEvent } from "../json-ld/parse.mjs";
import { toObservation as jsonLdToObservation } from "../json-ld/observation-adapter.mjs";
import { deriveSourceRecordId } from "./discovery.mjs";

export const SOURCE_ID = "truskel-paris";
const VENUE_NAME = "Truskel";

/**
 * Extract every schema.org Event node from one retained event-details
 * page's HTML. Truskel places exactly one Event node per page (never a
 * bulk array), but this reuses extractEventNodes() unchanged rather than
 * assuming that cardinality.
 */
export function extractEventNodesFromPage(html) {
  return extractEventNodes(html);
}

/**
 * Convert one already-extracted JSON-LD Event node (from one retained
 * event-details page) into an Observation. `options` — `{ retrievedAt,
 * sourceUrl, fixturePath }`, matching every other observation-adapter's
 * convention in this project.
 */
export function toObservation(node, options = {}) {
  const record = normaliseJsonLdEvent(node, { deriveId: deriveSourceRecordId });
  // Patch in event_url from the nested location.url this source actually
  // provides, since node.url (what normaliseJsonLdEvent reads by default)
  // is genuinely absent on this source's own markup — see this module's
  // doc comment above.
  if (!record.event_url && typeof node?.location?.url === "string") {
    record.event_url = node.location.url;
  }

  return jsonLdToObservation(
    record,
    { source_id: SOURCE_ID },
    {
      retrievedAt: options.retrievedAt ?? null,
      sourceUrl: options.sourceUrl ?? record.event_url ?? null,
      contentType: "application/ld+json",
      fixturePath: options.fixturePath ?? null,
      venueNameOverride: VENUE_NAME,
    },
  );
}

/**
 * Convert every Event node extracted from one page into Observations,
 * sharing one retrieval timestamp/source URL/fixture path.
 */
export function toObservations(nodes, options = {}) {
  return (nodes ?? []).map((node) => toObservation(node, options));
}
