// le-baiser-sale-paris-01 — adapts extractEventCards() output
// (discovery.mjs) into this project's canonical Observation shape. See
// ingestion/observation/contract.mjs and
// research/source-investigations/le-baiser-sale-paris-01/.

import { createObservation, emptyDateTime } from "../observation/contract.mjs";

export const SOURCE_ID = "le-baiser-sale-paris";

function deriveDateTime(card) {
  const dt = emptyDateTime();
  dt.raw = `${card.date} ${card.time}`;
  dt.date = card.date;
  // No timezone/offset is stated anywhere on the page — a floating local
  // time, never upgraded to a UTC instant (matches this investigation's
  // own honest field assessment).
  dt.certainty = "FLOATING_LOCAL";
  return dt;
}

// This source's own permalink slugs are usually [a-z0-9-] only, but at
// least one real, retained sampled record includes literal "..." (e.g.
// "5869-lapetiteheure-by...-etienne-mbappe") — widened to accept dots
// rather than silently dropping/renaming the source's own slug.
const SLUG_RE = /\/fr\/agenda\/([0-9]+-[a-z0-9.-]+)\/?$/;

export function toObservation(card, { retrievedAt, fixturePath } = {}) {
  if (!card?.eventUrl) {
    throw new Error("toObservation requires card.eventUrl");
  }
  const slugMatch = SLUG_RE.exec(card.eventUrl);
  if (!slugMatch) {
    throw new Error(`event URL does not match the expected /fr/agenda/{id-slug} shape: ${card.eventUrl}`);
  }
  const absoluteUrl = new URL(card.eventUrl, "https://www.lebaisersale.com").toString();

  return createObservation({
    source_id: SOURCE_ID,
    // This source's own numeric-id-prefixed permalink slug is stable and
    // site-authored, but at least one real, retained sampled recurring
    // series (e.g. "#LaPetiteHeure by... Etienne Mbappé") reuses the SAME
    // slug across several distinct consecutive calendar dates — the slug
    // alone is therefore not 1:1 with a single occurrence. Composed with
    // this card's own governing date (deterministically derived from the
    // page's own nearest-preceding date heading, see discovery.mjs), the
    // pair is unique per real occurrence without fabricating a new ID.
    source_record_id: `${slugMatch[1]}#${card.date}`,
    retrieved_at: retrievedAt ?? null,

    source_url: absoluteUrl,
    content_type: "text/html",

    title: card.title ?? null,
    description: null,

    start: deriveDateTime(card),
    end: emptyDateTime(),

    // NOT_PRESENT rather than a literal — this source is a single-venue
    // site, but its own page never states its venue name/address as a
    // discrete field (per-card or page-level, structurally provable),
    // matching this project's existing single-venue-per-source precedent
    // (see research/source-investigations/badehaus-berlin-01/). Venue
    // identity for this source is intended to resolve via source_id at
    // activation time, not by parsing a field the source does not
    // actually expose.
    venue_name: null,
    location_text: null,

    // NOT_PRESENT — no price appears on this page; the "Réserver" button
    // links to a third-party ticketing domain (billetweb.fr), which this
    // project's policy does not treat as first-party authority for a
    // price fact (see docs/SOURCE_INVESTIGATION_POLICY.md's "Third-party
    // sources" section).
    price_text: null,
    event_url: absoluteUrl,

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
