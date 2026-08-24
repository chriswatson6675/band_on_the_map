// Parses genuinely retrieved BOTA (Base Organizada da Toca das Artes)
// programme-index HTML (https://www.botaanjos.com/programacao) into
// small, structured per-event discovery records.
//
// Same Squarespace `?format=ical` export mechanism as
// ingestion/village-underground/discovery.mjs, and deliberately identical
// in shape/scope — see that module's doc comment. Kept as a separate,
// source-specific module (rather than a single shared "Squarespace
// discovery" abstraction) because the two sources' own configuration
// (base URL, index path) genuinely differs and this task's brief asks for
// shared *behaviour*, not a forced shared identity between two distinct
// registry Sources.

const ICAL_LINK_RE = /href="\/programacao\/([a-z0-9-]+)\?format=ical"/g;

/**
 * Parse one BOTA programme-index HTML document into discovery records,
 * one per distinct event slug (deduplicated; first occurrence order
 * kept). Each record: `{ slug, event_url, ics_url }`. Returns an empty
 * array (never throws) if none are present.
 */
export function parseBotaDiscovery(html, { baseUrl = "https://www.botaanjos.com" } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty BOTA programme-index HTML");
  }

  const seen = new Set();
  const records = [];
  const re = new RegExp(ICAL_LINK_RE);
  let match;

  while ((match = re.exec(html))) {
    const slug = match[1];
    if (seen.has(slug)) continue;
    seen.add(slug);

    records.push({
      slug,
      event_url: `${baseUrl}/programacao/${slug}`,
      ics_url: `${baseUrl}/programacao/${slug}?format=ical`,
    });
  }

  return records;
}
