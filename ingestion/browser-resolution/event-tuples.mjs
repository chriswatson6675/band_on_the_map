import { extractEventNodes, normaliseJsonLdEvent } from "../json-ld/parse.mjs";
import { sanitizeEvidenceText, sanitizeEvidenceUrl } from "./safety.mjs";

// Evidence tuples are deliberately research-sized. They retain only fields
// that the public page exposed in one source record; they are not Observations
// and do not make a stable-identity claim.
export const MAX_EVENT_TUPLES_PER_VENUE = 5;
export const MAX_EVENT_TUPLE_STRING_BYTES = 512;

function bounded(value, maxBytes = MAX_EVENT_TUPLE_STRING_BYTES) {
  if (typeof value !== "string" || !value.trim()) return null;
  return sanitizeEvidenceText(value.trim(), maxBytes) || null;
}

function firstString(...values) {
  return values.map((value) => typeof value === "number" ? String(value) : value).find((value) => typeof value === "string" && value.trim()) ?? null;
}

function firstPartyUrl(value, sourcePageUrl) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const page = new URL(sourcePageUrl);
    const candidate = new URL(value, page);
    return candidate.origin === page.origin ? sanitizeEvidenceUrl(candidate.href) : null;
  } catch { return null; }
}

function stableId(value) {
  if (typeof value === "string" || typeof value === "number") return bounded(String(value), 256);
  if (value && typeof value === "object") return bounded(firstString(value.value, value["@id"]), 256);
  return null;
}

function compact(tuple) {
  const fields = Object.fromEntries(Object.entries(tuple.fields).filter(([, value]) => value));
  if (!Object.keys(fields).length) return null;
  return { source_page_url: tuple.source_page_url, mechanism: tuple.mechanism, ...fields, provenance: tuple.provenance };
}

export function tuplesFromJsonLd(html, { sourcePageUrl, max = MAX_EVENT_TUPLES_PER_VENUE } = {}) {
  if (!sourcePageUrl) return [];
  return extractEventNodes(html).slice(0, max).map((node) => {
    const event = normaliseJsonLdEvent(node);
    const eventUrl = firstPartyUrl(event.event_url ?? node["@id"], sourcePageUrl);
    const ticketUrl = firstPartyUrl(event.ticket_url, sourcePageUrl);
    const sourceId = stableId(node.identifier ?? node["@id"] ?? node.id);
    return compact({
      source_page_url: sanitizeEvidenceUrl(sourcePageUrl),
      mechanism: "JSON_LD",
      fields: {
        title: bounded(event.title),
        start_raw: bounded(event.start_raw),
        end_raw: bounded(event.end_raw),
        source_record_id: sourceId,
        event_url: eventUrl,
        ticket_url: ticketUrl,
        types: event.types.length ? event.types.map((type) => bounded(type, 128)).filter(Boolean) : null,
      },
      provenance: {
        title: event.title ? "JSON_LD.name" : null,
        start_raw: event.start_raw ? "JSON_LD.startDate" : null,
        end_raw: event.end_raw ? "JSON_LD.endDate" : null,
        source_record_id: sourceId ? "JSON_LD.identifier/@id/id" : null,
        event_url: eventUrl ? "JSON_LD.url/@id" : null,
        ticket_url: ticketUrl ? "JSON_LD.offers.url" : null,
        types: event.types.length ? "JSON_LD.@type" : null,
      },
    });
  }).filter(Boolean);
}

const TITLE = ["title", "name", "eventName", "event_title", "headline"];
const START = ["startDate", "start_date", "startTime", "start_time", "date", "datetime", "beginsAt", "begins_at"];
const END = ["endDate", "end_date", "endTime", "end_time", "endsAt", "ends_at"];
const ID = ["id", "eventId", "event_id", "uid", "identifier"];
const EVENT_URL_KEYS = ["url", "eventUrl", "event_url", "permalink", "href"];
const TICKET = ["ticketUrl", "ticket_url", "bookingUrl", "booking_url"];

function valueFor(record, keys) { return firstString(...keys.map((key) => record?.[key])); }

export function tupleFromStructuredRecord(record, { sourcePageUrl, mechanism, recordPath = "$" } = {}) {
  if (!record || typeof record !== "object" || Array.isArray(record) || !sourcePageUrl) return null;
  const title = valueFor(record, TITLE);
  const start = valueFor(record, START);
  const id = stableId(firstString(...ID.map((key) => record[key])));
  const eventUrl = firstPartyUrl(valueFor(record, EVENT_URL_KEYS), sourcePageUrl);
  // Do not turn generic support/config JSON into an event merely because it
  // happens to have a name. An actual record needs title + date and identity
  // or an explicit first-party detail URL.
  if (!title || !start || (!id && !eventUrl)) return null;
  const end = valueFor(record, END);
  const ticketUrl = firstPartyUrl(valueFor(record, TICKET), sourcePageUrl);
  return compact({
    source_page_url: sanitizeEvidenceUrl(sourcePageUrl),
    mechanism,
    fields: { title: bounded(title), start_raw: bounded(start), end_raw: bounded(end), source_record_id: id, event_url: eventUrl, ticket_url: ticketUrl, types: null },
    provenance: { title: `${mechanism}.${recordPath}`, start_raw: `${mechanism}.${recordPath}`, end_raw: end ? `${mechanism}.${recordPath}` : null, source_record_id: id ? `${mechanism}.${recordPath}` : null, event_url: eventUrl ? `${mechanism}.${recordPath}` : null, ticket_url: ticketUrl ? `${mechanism}.${recordPath}` : null, types: null },
  });
}

export function tuplesFromStructuredValue(root, { sourcePageUrl, mechanism, max = MAX_EVENT_TUPLES_PER_VENUE } = {}) {
  const queue = [{ value: root, path: "$", depth: 0 }];
  const tuples = [];
  while (queue.length && tuples.length < max) {
    const { value, path, depth } = queue.shift();
    const tuple = tupleFromStructuredRecord(value, { sourcePageUrl, mechanism, recordPath: path });
    if (tuple) tuples.push(tuple);
    if (depth >= 12 || !value || typeof value !== "object") continue;
    if (Array.isArray(value)) value.slice(0, 100).forEach((child, index) => queue.push({ value: child, path: `${path}[${index}]`, depth: depth + 1 }));
    else Object.entries(value).slice(0, 100).forEach(([key, child]) => queue.push({ value: child, path: `${path}.${key}`, depth: depth + 1 }));
  }
  return tuples;
}

export function tuplesFromRenderedCards(cards, { sourcePageUrl, max = MAX_EVENT_TUPLES_PER_VENUE } = {}) {
  return (cards ?? []).slice(0, max).map((card, index) => {
    const tuple = tupleFromStructuredRecord(card, { sourcePageUrl, mechanism: "RENDERED_DOM", recordPath: `card[${index}]` });
    if (!tuple) return null;
    return tuple;
  }).filter(Boolean);
}
