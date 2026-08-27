import { toObservations } from "../json-ld/observation-adapter.mjs";

function stripTags(value) {
  return String(value ?? "").replace(/<script\b[\s\S]*?<\/script>/gi, " ").replace(/<style\b[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
  return String(value ?? "").replace(/&amp;/gi, "&").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'").replace(/&nbsp;/gi, " ").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">");
}

function property(block, name) {
  const tag = block.match(new RegExp(`<([a-z0-9]+)\\b[^>]*itemprop=["']${name}["'][^>]*>`, "i"));
  if (!tag) return null;
  const content = tag[0].match(/\bcontent=["']([^"']+)["']/i)?.[1];
  if (content) return decodeEntities(content).trim();
  const closing = new RegExp(`<${tag[1]}\\b[^>]*itemprop=["']${name}["'][^>]*>([\\s\\S]*?)<\\/${tag[1]}>`, "i").exec(block)?.[1];
  return closing ? decodeEntities(stripTags(closing)) : null;
}

function propertyUrl(block, name, documentUrl) {
  const raw = block.match(new RegExp(`<a\\b[^>]*itemprop=["']${name}["'][^>]*href=["']([^"']+)["']|<a\\b[^>]*href=["']([^"']+)["'][^>]*itemprop=["']${name}["']`, "i"));
  const value = raw?.[1] ?? raw?.[2];
  if (!value) return null;
  try { return new URL(decodeEntities(value), documentUrl).href; } catch { return null; }
}

export function extractMicrodataEvents(html, { documentUrl } = {}) {
  if (typeof html !== "string" || html.trim() === "") throw new Error("extractMicrodataEvents requires non-empty HTML");
  if (!documentUrl) throw new Error("extractMicrodataEvents requires documentUrl");
  const starts = [...html.matchAll(/<[^>]+itemscope\b[^>]*itemtype=["']https?:\/\/schema\.org\/(?:Event|MusicEvent)["'][^>]*>/gi)];
  const records = [];
  for (let index = 0; index < starts.length; index += 1) {
    const block = html.slice(starts[index].index, starts[index + 1]?.index ?? html.length);
    const title = property(block, "name");
    const start = property(block, "startDate");
    if (!title || !start) continue;
    const eventUrl = propertyUrl(block, "url", documentUrl) ?? documentUrl;
    records.push({
      source_record_id: eventUrl,
      types: ["Event"],
      title,
      description: property(block, "description"),
      start_raw: start,
      end_raw: property(block, "endDate"),
      location_name: property(block, "name") === title ? null : property(block, "name"),
      location_address: {
        streetAddress: property(block, "streetAddress"),
        postalCode: property(block, "postalCode"),
        addressLocality: property(block, "addressLocality"),
        addressRegion: property(block, "addressRegion"),
      },
      performers: [],
      price_text: null,
      event_url: eventUrl,
      ticket_url: null,
      event_status: null,
      event_attendance_mode: null,
    });
  }
  return records;
}

export function proveMicrodataEvents(html, { documentUrl, sourceId, venueName, retrievedAt, cutoffDate } = {}) {
  const cutoff = cutoffDate ?? new Date().toISOString().slice(0, 10);
  const records = extractMicrodataEvents(html, { documentUrl }).filter((record) => /^\d{4}-\d{2}-\d{2}/.test(record.start_raw) && record.start_raw.slice(0, 10) >= cutoff);
  return {
    records,
    observations: toObservations(records, { source_id: sourceId }, { retrievedAt, sourceUrl: documentUrl, venueNameOverride: venueName }),
  };
}
