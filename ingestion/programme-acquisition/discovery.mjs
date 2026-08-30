import { extractEventNodes, normaliseJsonLdEvent } from "../json-ld/parse.mjs";
import { toObservations } from "../json-ld/observation-adapter.mjs";

const EVENT_SIGNAL = /\b(event|events|veranstaltung|veranstaltungen|konzert|konzerte|concert|concerts|gig|gigs|show|shows|programm|programme|spielplan|calendar|kalender|agenda|tickets?)\b/i;
const REJECTED_PATH = /\b(privacy|impressum|kontakt|contact|about|login|account|cart|warenkorb|newsletter|press|jobs?)\b/i;
const ASSET_PATH = /\.(?:avif|css|gif|ico|jpe?g|js|pdf|png|svg|webp|woff2?)(?:[?#]|$)/i;

function stripTags(value) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeEntities(value) {
  return String(value ?? "")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

export function extractProgrammeLinks(html, { baseUrl, limit = 40 } = {}) {
  if (typeof html !== "string" || html.trim() === "") throw new Error("extractProgrammeLinks requires non-empty HTML");
  if (!baseUrl) throw new Error("extractProgrammeLinks requires baseUrl");
  const origin = new URL(baseUrl).origin;
  const links = [];
  const seen = new Set();
  for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    let url;
    try {
      url = new URL(decodeEntities(match[1]), baseUrl);
    } catch {
      continue;
    }
    if (!/^https?:$/.test(url.protocol) || url.origin !== origin || ASSET_PATH.test(url.href)) continue;
    const text = decodeEntities(stripTags(match[2]));
    const signal = `${url.pathname} ${url.search} ${text}`;
    if (!EVENT_SIGNAL.test(signal) || REJECTED_PATH.test(signal)) continue;
    url.hash = "";
    const href = url.href;
    if (seen.has(href)) continue;
    seen.add(href);
    links.push({ url: href, text, role: "EVENT_DETAIL_CANDIDATE" });
    if (links.length >= limit) break;
  }
  return links;
}

/**
 * Extract same-origin event detail URLs declared by JSON-LD Event nodes on a
 * listing page. This complements anchor discovery: a source may publish its
 * event cards only as structured data, while still exposing a first-party
 * detail route fit for the ordinary generic detail fetch and offline proof.
 */
export function extractJsonLdEventLinks(html, { baseUrl, limit = 40 } = {}) {
  if (typeof html !== "string" || html.trim() === "") throw new Error("extractJsonLdEventLinks requires non-empty HTML");
  if (!baseUrl) throw new Error("extractJsonLdEventLinks requires baseUrl");
  const origin = new URL(baseUrl).origin;
  const links = [];
  const seen = new Set();
  for (const node of extractEventNodes(html)) {
    const raw = typeof node?.url === "string" ? node.url : node?.url?.url;
    let url;
    try { url = new URL(raw, baseUrl); } catch { continue; }
    if (!/^https?:$/.test(url.protocol) || url.origin !== origin) continue;
    url.hash = "";
    if (seen.has(url.href)) continue;
    seen.add(url.href);
    links.push({ url: url.href, text: typeof node.name === "string" ? node.name.trim() : "", role: "JSON_LD_EVENT_DETAIL_CANDIDATE" });
    if (links.length >= limit) break;
  }
  return links;
}

function eventUrl(node, fallbackUrl) {
  const value = typeof node?.url === "string" ? node.url : node?.url?.url;
  if (typeof value === "string" && value.trim()) {
    try { return new URL(value, fallbackUrl).href; } catch { /* keep the retained detail URL */ }
  }
  return fallbackUrl;
}

export function proveJsonLdEvents(documents, { sourceId, venueName, retrievedAt, cutoffDate } = {}) {
  if (!sourceId) throw new Error("proveJsonLdEvents requires sourceId");
  const cutoff = cutoffDate ?? new Date().toISOString().slice(0, 10);
  const records = [];
  for (const document of documents ?? []) {
    const nodes = extractEventNodes(document.body);
    for (const node of nodes) {
      const url = eventUrl(node, document.url);
      const record = normaliseJsonLdEvent(node, { deriveId: () => url });
      if (!record.event_url) record.event_url = url;
      if (!record.title || !record.start_raw || !url) continue;
      const date = /^\d{4}-\d{2}-\d{2}/.exec(record.start_raw)?.[0] ?? null;
      if (!date || date < cutoff) continue;
      records.push({ ...record, source_document_url: document.url });
    }
  }
  const unique = [...new Map(records.map((record) => [record.source_record_id, record])).values()];
  const observations = toObservations(unique, { source_id: sourceId }, {
    retrievedAt,
    sourceUrl: documents?.[0]?.url ?? null,
    venueNameOverride: venueName,
  });
  return { records: unique, observations };
}
