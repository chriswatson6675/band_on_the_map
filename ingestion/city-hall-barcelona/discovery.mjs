// BARCELONA-30-VENUE-POPULATION-01 — City Hall Barcelona's own Wix
// Events booking widget embeds a full `"events":[...]` JSON array
// directly in its public `/event-list` page HTML (Wix SSR "warmup"
// state) — no separate API call, no authentication. Proven live in
// research/source-investigations/city-hall-barcelona-01/.
//
// The array is embedded deep inside a much larger Wix runtime-state
// blob that is impractical to fully JSON.parse as one document (it
// mixes component-tree metadata with the actual event data). This
// module extracts just the `events` array value with a small,
// deterministic bracket-depth scanner that correctly skips over
// bracket characters appearing inside JSON string values — never a
// naive regex/substring guess.

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Extract the balanced `[...]` JSON array value starting at
 * `openBracketIndex` (which must point at the opening `[`), correctly
 * treating characters inside JSON string values (including escaped
 * quotes/backslashes) as inert. Returns null if the brackets never
 * balance before the end of the text.
 */
export function extractBalancedJsonArray(text, openBracketIndex) {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openBracketIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escape) escape = false;
      else if (ch === "\\") escape = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === "[") depth++;
    if (ch === "]") {
      depth--;
      if (depth === 0) return text.slice(openBracketIndex, i + 1);
    }
  }
  return null;
}

const EVENTS_MARKER = '"events":[';

/**
 * Parse one fetched `/event-list` HTML document into the raw Wix event
 * objects exactly as embedded (per-record normalisation is a separate
 * step — see observation-adapter.mjs). Throws if the marker isn't found
 * at all, if the brackets never balance, or if the extracted text isn't
 * valid JSON — a genuine page-structure break this project must report,
 * not silently treat as zero events. An extracted, valid, but genuinely
 * empty `[]` array is a legitimate, different, non-throwing result.
 */
export function parseCityHallEvents(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty City Hall event-list HTML");
  }
  const markerIndex = html.indexOf(EVENTS_MARKER);
  if (markerIndex === -1) {
    throw new Error('No embedded "events":[...] array found on this City Hall page');
  }
  const arrayText = extractBalancedJsonArray(html, markerIndex + EVENTS_MARKER.length - 1);
  if (!arrayText) {
    throw new Error("Found the events array marker but its brackets never balanced");
  }

  let rawEvents;
  try {
    rawEvents = JSON.parse(arrayText);
  } catch (error) {
    throw new Error(`Extracted City Hall events array did not parse as valid JSON: ${error.message}`);
  }
  if (!Array.isArray(rawEvents)) {
    throw new Error("Extracted City Hall events value was not a JSON array");
  }

  return rawEvents.map((raw) => ({
    source_record_id: nonEmptyString(raw.id),
    title: nonEmptyString(raw.title),
    description: nonEmptyString(raw.description),
    slug: nonEmptyString(raw.slug),
    event_url: raw.slug ? `https://www.cityhallbarcelona.com/event-details/${raw.slug}` : null,
    start_iso: nonEmptyString(raw?.scheduling?.config?.startDate),
    end_iso: nonEmptyString(raw?.scheduling?.config?.endDate),
    location_name: nonEmptyString(raw?.location?.name),
    location_address: nonEmptyString(raw?.location?.address),
    location_lat: typeof raw?.location?.coordinates?.lat === "number" ? raw.location.coordinates.lat : null,
    location_lng: typeof raw?.location?.coordinates?.lng === "number" ? raw.location.coordinates.lng : null,
  }));
}
