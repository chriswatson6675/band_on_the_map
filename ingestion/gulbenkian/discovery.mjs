// Discovers Fundação Calouste Gulbenkian's "Gulbenkian Música" concert
// agenda events from https://gulbenkian.pt/musica/agenda/ and parses each
// event's own detail page.
//
// Built entirely from the retained, READY_FOR_ACTIVATION investigation at
// research/source-investigations/gulbenkian-lisbon-01/ (investigation.json
// + evidence/) — see that directory for the governed field_assessment this
// module must not exceed. Never re-fetches the live site.
//
// STRUCTURE (two-stage, like ingestion/capitolio/discovery.mjs): the list
// page (https://gulbenkian.pt/musica/agenda/) renders server-side
// <article class="fcg-card ..."> cards, each wrapped in an <a href="...">
// linking to that event's own detail page. Each DETAIL page embeds a
// genuine schema.org JSON-LD block
// (<script type="application/ld+json">{"@graph":[...]}</script>) with one
// node of @type "MusicEvent" or "Event", plus a SEPARATE static DOM node
// (<dd class="fcg-event-ticket-price__value">) for price/admission text
// that is not part of the JSON-LD itself — matching
// ingestion/lav/discovery.mjs's convention of reading a source's own
// structured data over scraping surrounding card HTML, but here the
// structured block lives on the per-event detail page, one MusicEvent per
// page, not one array on the list page.
//
// source_record_id: the JSON-LD node's own "@id"
// (".../MusicEvent/106594") — investigation.field_assessment.
// source_record_id.state is PROVEN, self-documented by the source and
// empirically stable for 5/5 sampled events (evidence/offline-proof.mjs).
// CAVEAT, carried forward honestly rather than hidden: a multi-session
// production (e.g. "Oedipus Rex") shares one top-level id across every
// performance date, with per-date detail living only in an unlabelled
// subEvent[] array. This module reads only the top-level MusicEvent node
// (name/startDate/endDate/location), matching the scope of this task; a
// future per-occurrence collector would need the composite-key strategy
// investigation.json's field_assessment.source_record_id.notes describes.
//
// start_iso/end_iso: the JSON-LD's own startDate/endDate are
// "YYYY-MM-DD HH:MM:SS" strings with NO timezone/offset anywhere in the
// retained HTML — investigation.field_assessment.start_date/time/end all
// record this as a floating-local value, never a confirmed UTC instant.
// This module only reformats the separator (space -> "T") into
// "YYYY-MM-DDTHH:MM:SS" — a lossless, mechanical string transform, not an
// inference — and never attaches an offset/Z suffix. The observation
// adapter must record certainty FLOATING_LOCAL, never UTC_INSTANT.
//
// event_url: investigation.field_assessment.event_url's own caveat is that
// a title-derived slug is NOT safely guessable (a stale, unrelated 2020
// "Beatrice Rana" event was found at the un-suffixed slug). This module
// does not construct or guess a URL from a title at all — it reads the
// JSON-LD node's own "url" field verbatim, which the investigation
// independently verified matches both that page's own
// <link rel="canonical"> and the href actually followed from the list
// page for every sampled event.
//
// price_text: read from the separate static DOM node
// dd.fcg-event-ticket-price__value alongside the JSON-LD, per
// investigation.field_assessment.price (PROVEN) — never derived from the
// JSON-LD block, which does not carry price at all.

const CARD_LINK_RE = /https:\/\/gulbenkian\.pt\/musica\/agenda\/[a-z0-9][a-z0-9-]*\//g;

const JSON_LD_SCRIPT_RE = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

const PRICE_RE = /<dd class="fcg-event-ticket-price__value">([\s\S]*?)<\/dd>/;

const EVENT_ID_RE = /\/(?:MusicEvent|Event)\/(\d+)$/;

const DATETIME_RE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/;

/**
 * Parse the Gulbenkian Música agenda list page's HTML into a deduplicated
 * list of this source's own individual event detail-page URLs, in
 * document order. Every card is a real, server-rendered
 * <a href="https://gulbenkian.pt/musica/agenda/{slug}/">; the same event
 * can legitimately appear on more than one card (e.g. a two-date
 * production listed once per date) and is deduplicated to one URL here.
 *
 * Throws on empty/non-string input. Does not throw when zero links are
 * found on otherwise-valid HTML (an empty/filtered agenda is a possible,
 * non-malformed state) — matching ingestion/capitolio/discovery.mjs's
 * parseCapitolioAgendaLinks precedent.
 */
export function parseGulbenkianAgendaLinks(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Gulbenkian Música agenda list-page HTML");
  }
  return [...new Set([...html.matchAll(CARD_LINK_RE)].map((m) => m[0]))];
}

/**
 * Extract the JSON-LD @graph's own MusicEvent/Event node from one detail
 * page's HTML. Returns null if none is found (never guesses/synthesizes
 * one) — callers decide whether that is fatal.
 */
function extractEventNode(detailHtml) {
  JSON_LD_SCRIPT_RE.lastIndex = 0;
  let match;
  while ((match = JSON_LD_SCRIPT_RE.exec(detailHtml)) !== null) {
    let data;
    try {
      data = JSON.parse(match[1]);
    } catch {
      continue;
    }
    const graph = Array.isArray(data?.["@graph"]) ? data["@graph"] : [];
    const eventNode = graph.find((node) => node?.["@type"] === "MusicEvent" || node?.["@type"] === "Event");
    if (eventNode) return eventNode;
  }
  return null;
}

/**
 * Parse the static, server-rendered ticket-price DOM node
 * (dd.fcg-event-ticket-price__value) alongside the JSON-LD block. This is
 * genuinely a separate DOM node, not part of the JSON-LD itself — every
 * sampled detail page in the investigation carried one, giving either a
 * price range ("31,00 € – 70,00 €") or a free-admission label
 * ("Entrada gratuita" / "Entrada Livre"). Returns null (never a fabricated
 * number) if the node is genuinely absent.
 */
export function extractGulbenkianPriceText(detailHtml) {
  const match = PRICE_RE.exec(detailHtml);
  return match ? match[1].replace(/\s+/g, " ").trim() : null;
}

function toFloatingLocalIso(value, fieldLabel) {
  const match = DATETIME_RE.exec(value ?? "");
  if (!match) {
    throw new Error(
      `Expected JSON-LD "${fieldLabel}" as a "YYYY-MM-DD HH:MM:SS" floating-local string, got: ${JSON.stringify(value)}`,
    );
  }
  return `${match[1]}T${match[2]}`;
}

/**
 * Parse one Gulbenkian Música event detail page's HTML into a discovery
 * record: `{ source_record_id, title, description, start_iso, end_iso,
 * location_name, event_url, price_text }`.
 *
 * Throws on any missing/malformed required element (no JSON-LD
 * MusicEvent/Event node, no usable @id, no name, no startDate/endDate in
 * the expected floating-local shape, no location, no price DOM node) —
 * never guesses a value the page does not genuinely provide.
 * `description` is the one field this source itself sometimes omits
 * entirely (e.g. the sampled "Beatrice Rana" page carries no JSON-LD
 * "description" at all) and is left null rather than treated as an error.
 */
export function parseGulbenkianEventDetail(detailHtml) {
  if (typeof detailHtml !== "string" || detailHtml.trim() === "") {
    throw new Error("Expected non-empty Gulbenkian Música event detail-page HTML");
  }

  const eventNode = extractEventNode(detailHtml);
  if (!eventNode) {
    throw new Error("No schema.org JSON-LD MusicEvent/Event node found on this Gulbenkian detail page");
  }

  const idMatch = EVENT_ID_RE.exec(eventNode["@id"] ?? "");
  if (!idMatch) {
    throw new Error(`JSON-LD node "@id" did not end in a numeric MusicEvent/Event id: ${JSON.stringify(eventNode["@id"])}`);
  }

  if (typeof eventNode.name !== "string" || eventNode.name.trim() === "") {
    throw new Error("JSON-LD MusicEvent/Event node has no usable \"name\"");
  }

  const locationName = Array.isArray(eventNode.location)
    ? eventNode.location.map((place) => place?.name).filter(Boolean).join(" / ")
    : null;
  if (!locationName) {
    throw new Error("JSON-LD MusicEvent/Event node has no usable \"location\"");
  }

  if (typeof eventNode.url !== "string" || eventNode.url.trim() === "") {
    throw new Error("JSON-LD MusicEvent/Event node has no usable \"url\" — never guessed/constructed from a title slug");
  }

  const priceText = extractGulbenkianPriceText(detailHtml);
  if (priceText === null) {
    throw new Error("No static price/admission DOM node (dd.fcg-event-ticket-price__value) found on this detail page");
  }

  return {
    source_record_id: idMatch[1],
    title: eventNode.name.trim(),
    description: typeof eventNode.description === "string" ? eventNode.description : null,
    start_iso: toFloatingLocalIso(eventNode.startDate, "startDate"),
    end_iso: toFloatingLocalIso(eventNode.endDate, "endDate"),
    location_name: locationName,
    event_url: eventNode.url,
    price_text: priceText,
  };
}
