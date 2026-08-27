// les-trois-baudets-paris-01 — PARIS_ZERO_CODE: this source needs no new
// ingestion code at all. It reuses, entirely unchanged:
//   - ingestion/html-link-discovery/discovery.mjs (extractLinksMatching)
//     to enumerate /l-agenda/{slug} event detail URLs from the list page;
//   - ingestion/json-ld/parse.mjs (extractEventNodes/normaliseJsonLdEvent)
//     + ingestion/json-ld/observation-adapter.mjs (toObservation)
//     to parse each detail page's own schema.org Event JSON-LD block.
// This test proves that existing, generic pipeline reproduces this
// investigation's own retained fixtures deterministically and offline.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractLinksMatching } from "../ingestion/html-link-discovery/discovery.mjs";
import { extractEventNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";
import { toObservation } from "../ingestion/json-ld/observation-adapter.mjs";

const BASE_URL = "https://lestroisbaudets.com";
const SOURCE_ID = "les-trois-baudets-paris";

async function fixture(name) {
  return readFile(new URL(`../fixtures/les-trois-baudets-paris/${name}`, import.meta.url), "utf8");
}

function lastPathSegment(url) {
  const trimmed = (url ?? "").replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || null;
}

// This source's own JSON-LD 'Event' node carries no top-level 'url' field
// at all (unlike e.g. Tempodrom Berlin) — its own canonical detail-page URL
// is instead stated on 'offers.url' (present and identical on every
// sampled record). deriveId falls back to that, matching this
// investigation's own documented source_record_id judgement.
function deriveEventId(node) {
  const offersUrl = Array.isArray(node.offers) ? node.offers[0]?.url : node.offers?.url;
  return lastPathSegment(node.url ?? offersUrl);
}

test("extractLinksMatching: the retained /l-agenda list page yields many real event detail URLs", async () => {
  const html = await fixture("agenda-raw.html");
  const urls = extractLinksMatching(html, /href="(\/l-agenda\/[a-z0-9-]+)"/g, { baseUrl: BASE_URL });
  assert.ok(urls.length > 20);
  assert.ok(urls.includes("https://lestroisbaudets.com/l-agenda/jacob-alon"));
});

test("extractEventNodes + normaliseJsonLdEvent: Jacob Alon's own JSON-LD reproduces exactly", async () => {
  const html = await fixture("event-detail-jacob-alon-raw.html");
  const nodes = extractEventNodes(html);
  assert.equal(nodes.length, 1);
  const record = normaliseJsonLdEvent(nodes[0], { deriveId: deriveEventId });

  assert.equal(record.title, "Jacob Alon");
  assert.equal(record.source_record_id, "jacob-alon");
  assert.equal(record.start_raw, "2026-09-03T20:00");
  assert.equal(record.end_raw, "2026-09-03T23:00");
  assert.equal(record.location_name, "Les Trois Baudets");
  // This source's own Event node carries no top-level 'url' at all — only
  // 'offers.url' (used here as ticket_url, and by toObservation's own
  // event_url fallback chain: record.event_url ?? record.ticket_url).
  assert.equal(record.event_url, null);
  assert.equal(record.ticket_url, "https://lestroisbaudets.com/l-agenda/jacob-alon");
  assert.equal(record.price_text, "21 EUR");
});

test("toObservation: Jacob Alon adapts via the EXISTING, unchanged json-ld observation-adapter — title/venue/price/id/url all correct, but date/time normalisation needs a described fix", async () => {
  const html = await fixture("event-detail-jacob-alon-raw.html");
  const nodes = extractEventNodes(html);
  const record = normaliseJsonLdEvent(nodes[0], { deriveId: deriveEventId });
  const obs = toObservation(
    record,
    { source_id: SOURCE_ID },
    { retrievedAt: "2026-08-26T13:52:00Z", sourceUrl: "https://lestroisbaudets.com/l-agenda/jacob-alon", venueNameOverride: "Les Trois Baudets" },
  );

  assert.equal(obs.source_id, SOURCE_ID);
  assert.equal(obs.source_record_id, "jacob-alon");
  assert.equal(obs.title, "Jacob Alon");
  assert.equal(obs.venue_name, "Les Trois Baudets");
  assert.equal(obs.event_url, "https://lestroisbaudets.com/l-agenda/jacob-alon");
  assert.equal(obs.price_text, "21 EUR");

  // BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — this source's own
  // 'startDate'/'endDate' omit a seconds component ("2026-09-03T20:00",
  // not "...T20:00:00"). This investigation originally found the shared
  // ingestion/json-ld/observation-adapter.mjs's ISO_NO_OFFSET_RE required
  // seconds and fell back to TEXT_ONLY; that regex has since been widened
  // (seconds now optional, backward-compatibly) centrally in the shared
  // module specifically because of this finding, so this source now
  // reaches its true FLOATING_LOCAL richness with zero source-specific
  // code — a genuine PARIS_EXISTING_FAMILY_WITH_SMALL_FIX outcome.
  assert.equal(obs.start.raw, "2026-09-03T20:00");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.start.date, "2026-09-03");
  assert.equal(obs.end.raw, "2026-09-03T23:00");
  assert.equal(obs.end.certainty, "FLOATING_LOCAL");
  assert.equal(obs.end.date, "2026-09-03");
});

test("a second, distinct event (Les Nuits d'Été) reproduces the same JSON-LD shape", async () => {
  const html = await fixture("event-detail-les-nuits-d-ete-raw.html");
  const nodes = extractEventNodes(html);
  assert.equal(nodes.length, 1);
  const record = normaliseJsonLdEvent(nodes[0], { deriveId: deriveEventId });
  assert.equal(record.title, "LES NUITS D'ETE");
  assert.equal(record.start_raw, "2026-09-18T20:00");
  assert.equal(record.location_name, "Les Trois Baudets");
});
