import { toObservations } from "../json-ld/observation-adapter.mjs";

const CARD_START = /<(article|li|div)\b([^>]*\bclass=["'][^"']*(?:event|programme|calendar)[^"']*(?:card|item)[^"']*["'][^>]*)>/gi;
const TITLE_LINK = /<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*(?:<[^>]+>\s*)*([^<]{2,200})/i;
const DATE = /<time\b[^>]*datetime=["'](\d{4}-\d{2}-\d{2}(?:[T ][^"']+)?)['"]/i;
const plain = (value) => String(value ?? "").replace(/\s+/g, " ").trim();

/** Conservative, hostname-free extraction of self-contained static event cards. */
export function collectStaticCardEvents(document, { sourceId, venueName, cutoffDate } = {}) {
  const body = String(document?.body ?? ""); const cutoff = cutoffDate ?? new Date().toISOString().slice(0, 10); const records = []; const starts = [...body.matchAll(CARD_START)];
  for (const match of starts) {
    const end = body.indexOf(`</${match[1]}>`, match.index + match[0].length); if (end < 0) continue;
    const card = body.slice(match.index, end + match[1].length + 3); const titleLink = TITLE_LINK.exec(card); const date = DATE.exec(card)?.[1] ?? null;
    if (!titleLink || !date || date.slice(0, 10) < cutoff) continue;
    let event_url; try { event_url = new URL(titleLink[1], document.url); event_url.hash = ""; if (event_url.origin !== new URL(document.url).origin) continue; } catch { continue; }
    const title = plain(titleLink[2]); if (!title || /^(?:events?|what'?s on|programme|calendar|tickets?)$/i.test(title)) continue;
    records.push({ source_record_id: event_url.href, title, start_raw: date, end_raw: null, event_url: event_url.href, ticket_url: null, types: [], raw: { card_fragment: card.slice(0, 1000) } });
  }
  const unique = [...new Map(records.map((record) => [record.source_record_id, record])).values()];
  return { records: unique, observations: toObservations(unique, { source_id: sourceId }, { retrievedAt: document?.at, sourceUrl: document?.url, venueNameOverride: venueName }), routing_provenance: { card_candidates_inspected: starts.length, card_records_accepted: unique.length } };
}
