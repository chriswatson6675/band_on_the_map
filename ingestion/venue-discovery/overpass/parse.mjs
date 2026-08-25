// VENUE-DISCOVERY-ENGINE-01 — Overpass response parsing.
//
// Turns one raw Overpass JSON body (client.mjs's `body`) into a list of
// plain "raw lead" records, preserving every tag as evidence. Never
// classifies, never normalises a name/domain, never invents a
// coordinate or name that isn't in the response — a node/way/relation
// with no `tags.name` yields `name: null`, left for run.mjs to decide
// whether an unnamed lead is even usable as a candidate.

function coordinatesFor(element) {
  if (typeof element?.lat === "number" && typeof element?.lon === "number") {
    return { latitude: element.lat, longitude: element.lon };
  }
  if (element?.center && typeof element.center.lat === "number" && typeof element.center.lon === "number") {
    return { latitude: element.center.lat, longitude: element.center.lon };
  }
  return { latitude: null, longitude: null };
}

/**
 * Parse one Overpass response body into raw leads:
 *   { source_record_id, name, latitude, longitude, tags, source_url }
 *
 * Throws on a structurally malformed body (missing/non-array
 * `elements`) — a genuine upstream contract break the caller must
 * report, not silently treat as zero results. A body with a present but
 * EMPTY `elements` array is a legitimate "nothing found" result and
 * returns `[]`.
 */
export function parseOverpassResponse(body) {
  if (!body || typeof body !== "object" || !Array.isArray(body.elements)) {
    throw new Error("Malformed Overpass response: expected an object with an `elements` array");
  }

  const leads = [];
  for (const element of body.elements) {
    if (!element || typeof element !== "object" || !element.type || element.id === undefined) {
      continue; // not a real OSM element — skip rather than guess an identity
    }
    const { latitude, longitude } = coordinatesFor(element);
    const tags = element.tags && typeof element.tags === "object" ? element.tags : {};

    leads.push({
      source_record_id: `${element.type}/${element.id}`,
      name: typeof tags.name === "string" && tags.name.trim() !== "" ? tags.name.trim() : null,
      latitude,
      longitude,
      tags,
      source_url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
    });
  }
  return leads;
}
