import { extractEventNodes } from "../json-ld/parse.mjs";
import { sanitizeEvidenceText, safeResponseMetadata } from "./safety.mjs";
import { tuplesFromJsonLd, tuplesFromStructuredValue } from "./event-tuples.mjs";

const TITLE_KEYS = /^(?:title|name|eventName|event_title|headline)$/i;
const DATE_KEYS = /^(?:startDate|start_date|startTime|start_time|date|datetime|beginsAt|begins_at)$/i;
const URL_KEYS = /^(?:url|eventUrl|event_url|permalink|href|slug)$/i;
const ID_KEYS = /^(?:id|eventId|event_id|uid)$/i;
const ARTIST_KEYS = /^(?:artist|artists|performer|performers|lineup)$/i;
const VENUE_KEYS = /^(?:venue|location|place)$/i;

function objectSignals(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const keys = Object.keys(value);
  const has = (pattern) => keys.some((key) => pattern.test(key) && value[key] !== null && value[key] !== "");
  return {
    title: has(TITLE_KEYS),
    date: has(DATE_KEYS),
    url: has(URL_KEYS),
    id: has(ID_KEYS),
    artist: has(ARTIST_KEYS),
    venue: has(VENUE_KEYS),
  };
}

export function inspectStructuredValue(root, { maxNodes = 2_000, maxDepth = 12 } = {}) {
  const queue = [{ value: root, path: "$", depth: 0 }];
  const eventLike = [];
  const pagination = [];
  let inspected = 0;
  while (queue.length && inspected < maxNodes) {
    const { value, path, depth } = queue.shift();
    inspected += 1;
    const signals = objectSignals(value);
    if (signals?.title && signals.date && (signals.url || signals.id || signals.artist || signals.venue)) {
      eventLike.push({ path, signals });
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      for (const key of Object.keys(value)) {
        if (/^(?:next|nextPage|next_page|page|currentPage|current_page|totalPages|total_pages|hasNextPage|has_next_page|cursor|endCursor)$/i.test(key)) pagination.push(`${path}.${key}`);
      }
    }
    if (depth >= maxDepth || !value || typeof value !== "object") continue;
    if (Array.isArray(value)) value.slice(0, 200).forEach((child, index) => queue.push({ value: child, path: `${path}[${index}]`, depth: depth + 1 }));
    else Object.entries(value).slice(0, 200).forEach(([key, child]) => queue.push({ value: child, path: `${path}.${key}`, depth: depth + 1 }));
  }
  const uniquePaths = eventLike.slice(0, 20);
  return {
    state: eventLike.length >= 2 ? "PROGRAMME_ENDPOINT_PROVEN" : eventLike.length === 1 ? "LIKELY_PROGRAMME_ENDPOINT" : "STRUCTURED_RESPONSE_NOT_PROGRAMME",
    event_like_record_count: eventLike.length,
    sample_paths: uniquePaths.map((item) => item.path),
    pagination_paths: [...new Set(pagination)].slice(0, 20),
    signals: [...new Set(uniquePaths.flatMap((item) => Object.entries(item.signals).filter(([, present]) => present).map(([name]) => name)))],
    traversal_limited: queue.length > 0,
  };
}

export function classifyNetworkResponse(response, { maxResponseBytes, maxEventTuples = 5, sourcePageUrl } = {}) {
  const metadata = safeResponseMetadata(response);
  if ([401, 403, 429].includes(metadata.status)) return { ...metadata, state: "ACCESS_BLOCKED", evidence: ["public response returned an access-limiting status"] };
  if (response.body_skipped === true) return { ...metadata, state: "PROBE_LIMIT_REACHED", evidence: [response.skip_reason ?? "response body exceeded or lacked a safe inspection bound"] };
  const body = sanitizeEvidenceText(response.body, maxResponseBytes);
  if (/text\/calendar/i.test(metadata.content_type ?? "") || /BEGIN:VEVENT/i.test(body)) {
    return { ...metadata, state: "PROGRAMME_ENDPOINT_PROVEN", mechanism: "ICS_OR_ICAL", evidence: ["bounded response contains iCalendar VEVENT data"] };
  }
  if (!/json|graphql/i.test(metadata.content_type ?? "") && !/^\s*[\[{]/.test(body)) {
    return { ...metadata, state: "STRUCTURED_RESPONSE_NOT_PROGRAMME", evidence: ["response is not a supported structured payload"] };
  }
  try {
    const parsed = JSON.parse(body);
    const structural = inspectStructuredValue(parsed);
    const mechanism = /graphql/i.test(`${metadata.url} ${metadata.content_type}`) || (parsed?.data && parsed?.errors !== undefined) ? "PUBLIC_GRAPHQL" : "PUBLIC_REST_JSON";
    return { ...metadata, ...structural, mechanism, event_tuples: tuplesFromStructuredValue(parsed, { sourcePageUrl: sourcePageUrl ?? metadata.url, mechanism: "NETWORK_JSON", max: maxEventTuples }), evidence: structural.event_like_record_count ? [`${structural.event_like_record_count} event-like record(s) have title, date, and identity/location structure`] : ["JSON parsed but no event-like record structure was established"] };
  } catch {
    return { ...metadata, state: "STRUCTURED_RESPONSE_NOT_PROGRAMME", evidence: ["structured content type did not contain valid bounded JSON"] };
  }
}

export function extractEmbeddedState(html, { maxBlocks = 30, maxResponseBytes = 256 * 1024, maxEventTuples = 5, sourcePageUrl } = {}) {
  const results = [];
  const scripts = String(html ?? "").matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi);
  for (const match of scripts) {
    if (results.length >= maxBlocks) break;
    const attributes = match[1];
    const body = match[2].trim();
    const id = /\bid=["']([^"']+)["']/i.exec(attributes)?.[1] ?? null;
    const type = /\btype=["']([^"']+)["']/i.exec(attributes)?.[1] ?? null;
    const known = /__NEXT_DATA__|__NUXT__|__data|svelte/i.test(`${id} ${attributes}`);
    const jsonType = /application\/(?:ld\+)?json/i.test(type ?? "");
    if (!body || (!known && !jsonType)) continue;
    if (Buffer.byteLength(body, "utf8") > maxResponseBytes) {
      results.push({ id, type, state: "PROBE_LIMIT_REACHED", mechanism: known ? "OTHER_EMBEDDED_APP_STATE" : null, evidence: ["embedded state exceeded the inspection byte bound"] });
      continue;
    }
    if (/ld\+json/i.test(type ?? "")) {
      try {
        const eventCount = extractEventNodes(`<script type="application/ld+json">${body}</script>`).length;
        if (eventCount) results.push({ id, type, state: "EMBEDDED_PROGRAMME_STATE_PROVEN", mechanism: "JSON_LD_EVENT", event_like_record_count: eventCount, event_tuples: tuplesFromJsonLd(`<script type="application/ld+json">${body}</script>`, { sourcePageUrl, max: maxEventTuples }), evidence: [`${eventCount} schema.org Event node(s) found`] });
      } catch { /* malformed JSON-LD is not a proven state */ }
      continue;
    }
    try {
      const parsed = JSON.parse(body);
      const structural = inspectStructuredValue(parsed);
      const mechanism = /__NEXT_DATA__/i.test(id ?? "") ? "EMBEDDED_NEXT_DATA" : /__NUXT__/i.test(`${id} ${attributes}`) ? "EMBEDDED_NUXT_STATE" : /svelte/i.test(`${id} ${attributes}`) ? "EMBEDDED_SVELTEKIT_DATA" : "OTHER_EMBEDDED_APP_STATE";
      results.push({ id, type, ...structural, state: structural.state === "PROGRAMME_ENDPOINT_PROVEN" ? "EMBEDDED_PROGRAMME_STATE_PROVEN" : structural.state, mechanism, event_tuples: tuplesFromStructuredValue(parsed, { sourcePageUrl, mechanism: "EMBEDDED_STATE", max: maxEventTuples }), evidence: structural.event_like_record_count ? [`${structural.event_like_record_count} event-like embedded record(s) found`] : ["embedded JSON parsed without proven programme records"] });
    } catch { /* non-JSON script blocks are ignored */ }
  }
  return results;
}

export function classifyRenderedDom(snapshot = {}) {
  const html = String(snapshot.html ?? "");
  const text = String(snapshot.text ?? "");
  const links = snapshot.links ?? [];
  const eventLinks = links.filter((link) => /event|concert|gig|show|programm|spielplan|veranstalt|tickets?/i.test(`${link.text ?? ""} ${link.url ?? ""}`));
  const dates = text.match(/\b(?:20\d{2}-\d{2}-\d{2}|\d{1,2}[./-]\d{1,2}[./-]20\d{2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|januar|februar|märz|mai|juni|juli|oktober|dezember)[a-zä]*\s+\d{1,2})\b/gi) ?? [];
  const jsonLdEvents = html.trim() ? extractEventNodes(html).length : 0;
  const meaningful = jsonLdEvents > 0 || (eventLinks.length >= 2 && dates.length >= 2);
  return {
    state: meaningful ? "RENDERED_DOM_PROGRAMME_ONLY" : "NO_PROGRAMME_DATA_DISCOVERED",
    event_link_count: eventLinks.length,
    date_signal_count: dates.length,
    json_ld_event_count: jsonLdEvents,
    hydrated_change_observed: typeof snapshot.initialText === "string" && snapshot.initialText.trim() !== text.trim(),
    sample_links: eventLinks.slice(0, 10),
    evidence: meaningful ? ["rendered DOM contains repeated event-link/date structure"] : ["bounded rendered DOM did not establish repeated programme structure"],
  };
}
