// Parses genuinely retrieved LAV — Lisboa ao Vivo public agenda-listing
// HTML (https://lisboaaovivo.com/agenda/) into small, structured per-event
// discovery records.
//
// LISBON-PORTO-P1-SOURCE-AUTOMATION-01: proven live. The venue also runs
// "The Events Calendar" WordPress plugin (the same family already proven
// for Super Bock Arena — see ingestion/super-bock-arena/discovery.mjs),
// but its own list view additionally emits a genuine
// `<script type="application/ld+json">[{ "@type": "Event", ... }, ...]</script>`
// array directly on the page — a first-party, machine-readable
// schema.org Event feed, not an HTML-scraping fallback. This module reads
// only that JSON-LD block (never the surrounding HTML card markup this
// same plugin also renders), matching this task's "prefer the source's
// own structured data" precedent already used for Casa da Música's
// microdata.
//
// Stable identifier: no numeric id is exposed anywhere in the JSON-LD.
// Every event's own `url` field is this source's own permanent
// `/evento/{slug}/` page, so the slug is used as source_record_id — the
// same honest, documented judgement call already made for
// ingestion/cm-gaia-eventos/discovery.mjs (no id -> permalink slug).
//
// Date/time: `startDate`/`endDate` are full ISO 8601 instants with an
// explicit `+00:00` UTC offset — a genuine confirmed UTC instant, unlike
// every other WordPress-Events-Calendar source this project has so far
// automated (Super Bock Arena's own list view carries no offset at all).
// Retained verbatim; parsed into the Observation contract's UTC_INSTANT
// certainty by ingestion/lav/observation-adapter.mjs, never re-derived
// here.
//
// Venue/address: most `location.name` values are the bare string "LAV",
// but a few genuinely carry a room-level `location.name` ("LAV – Sala 1",
// "LAV – Sala 2") AND, only on those same records, a fully-populated
// `location.address` (streetAddress/addressLocality/addressRegion/
// postalCode/addressCountry) — the source's own first-party address
// evidence for this venue, independently corroborating the same address
// this task's venue-estate research already found via secondary sources.
// Every field found is retained in the discovery record; this module
// makes no admission/onboarding decision itself.

const LD_JSON_SCRIPT_RE = /<script type="application\/ld\+json">\s*(\[[\s\S]*?\])\s*<\/script>/;
const SLUG_RE = /\/evento\/([a-z0-9-]+)\/?$/;

function slugFromUrl(url) {
  if (typeof url !== "string") return null;
  const match = SLUG_RE.exec(url);
  return match ? match[1] : null;
}

function decodeHtmlEntities(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/&#8211;/g, "–")
    .replace(/&#8216;/g, "‘")
    .replace(/&#8217;/g, "’")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&");
}

/**
 * Parse one LAV /agenda/ HTML document's embedded JSON-LD Event array into
 * discovery records, one per distinct event `url` slug (deduplicated;
 * first occurrence order kept). Returns an empty array (never throws) if
 * the JSON-LD block is present but genuinely empty (`[]`). Throws on
 * empty/non-string input, on a missing/malformed JSON-LD block, or on a
 * block that does not parse as valid JSON — never guessed at.
 *
 * Each record: `{ source_record_id, title, description, event_url,
 * start_iso, end_iso, location_name, location_address }`.
 * `location_address` is the source's own JSON-LD PostalAddress object
 * verbatim (or null when this particular event's location carries none).
 */
export function parseLavAgendaJsonLd(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty LAV agenda HTML");
  }

  const scriptMatch = LD_JSON_SCRIPT_RE.exec(html);
  if (!scriptMatch) {
    throw new Error("No <script type=\"application/ld+json\"> Event array found on this LAV agenda page");
  }

  let events;
  try {
    events = JSON.parse(scriptMatch[1]);
  } catch (error) {
    throw new Error(`LAV agenda JSON-LD block did not parse as valid JSON: ${error.message}`);
  }
  if (!Array.isArray(events)) {
    throw new Error("LAV agenda JSON-LD block did not contain an array of Events");
  }

  const seen = new Set();
  const records = [];

  for (const event of events) {
    if (event?.["@type"] !== "Event") continue;
    const slug = slugFromUrl(event.url);
    if (!slug || seen.has(slug)) continue;
    seen.add(slug);

    const address = event?.location?.address;
    const hasAddress =
      address && typeof address === "object" && Object.keys(address).some((k) => k !== "@type" && address[k]);

    records.push({
      source_record_id: slug,
      title: decodeHtmlEntities(event.name ?? null),
      description: typeof event.description === "string" ? event.description : null,
      event_url: event.url ?? null,
      start_iso: event.startDate ?? null,
      end_iso: event.endDate ?? null,
      location_name: decodeHtmlEntities(event?.location?.name ?? null),
      location_address: hasAddress ? address : null,
    });
  }

  return records;
}
