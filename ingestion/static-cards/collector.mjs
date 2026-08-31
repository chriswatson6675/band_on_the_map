import { toObservations } from "../json-ld/observation-adapter.mjs";
import { extractMonthYearHeadings, inferNumericDateOrder, resolveCardDate } from "./card-date.mjs";

const CARD_START = /<(article|li|div)\b([^>]*\bclass=["'][^"']*(?:event|programme|calendar)[^"']*(?:card|item)[^"']*["'][^>]*)>/gi;
const TITLE_LINK = /<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*(?:<[^>]+>\s*)*([^<]{2,200})/i;
const DATE = /<time\b[^>]*datetime=["'](\d{4}-\d{2}-\d{2}(?:[T ][^"']+)?)['"]/i;
const plain = (value) => String(value ?? "").replace(/\s+/g, " ").trim();
const cardText = (card) => plain(card.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " "));

/**
 * Conservative, hostname-free extraction of self-contained static event cards.
 *
 * BEATMAPPED-STATIC-CARD-TEXT-DATE-ACQUISITION-01 widened ONLY where a card's
 * date comes from, never what makes a card acceptable. A card must still
 * carry a same-origin title link and a real title, and must still resolve to
 * a complete calendar date at or after the cutoff. What changed is that the
 * date may now also come from the card's own complete text date, or from the
 * card's day+month combined with the nearest preceding month/year heading —
 * see ./card-date.mjs, which owns that hierarchy and refuses to guess a
 * missing year. A card whose year cannot be established deterministically is
 * rejected exactly as it was before.
 */
export function collectStaticCardEvents(document, { sourceId, venueName, cutoffDate } = {}) {
  const body = String(document?.body ?? ""); const cutoff = cutoffDate ?? new Date().toISOString().slice(0, 10); const records = []; const starts = [...body.matchAll(CARD_START)];
  const headings = extractMonthYearHeadings(body);
  const numeric = inferNumericDateOrder(body);
  const dateSourceCounts = { MACHINE_READABLE_DATETIME: 0, COMPLETE_TEXT_DATE: 0, DETERMINISTIC_CONTEXT_YEAR: 0, DETERMINISTIC_CONTEXT_NUMERIC_ORDER: 0 };
  let rejectedNoResolvableDate = 0;
  for (const match of starts) {
    const end = body.indexOf(`</${match[1]}>`, match.index + match[0].length); if (end < 0) continue;
    const card = body.slice(match.index, end + match[1].length + 3); const titleLink = TITLE_LINK.exec(card);
    const resolved = resolveCardDate({ machineReadable: DATE.exec(card)?.[1] ?? null, cardText: cardText(card), headings, cardIndex: match.index, numericOrder: numeric.order, numericOrderEvidence: numeric.evidence });
    if (!resolved) { rejectedNoResolvableDate += 1; continue; }
    const date = resolved.raw;
    if (!titleLink || date.slice(0, 10) < cutoff) continue;
    let event_url; try { event_url = new URL(titleLink[1], document.url); event_url.hash = ""; if (event_url.origin !== new URL(document.url).origin) continue; } catch { continue; }
    const title = plain(titleLink[2]); if (!title || /^(?:events?|what'?s on|programme|calendar|tickets?)$/i.test(title)) continue;
    dateSourceCounts[resolved.basis] += 1;
    records.push({
      source_record_id: event_url.href, title, start_raw: date, end_raw: null, event_url: event_url.href, ticket_url: null, types: [],
      // Provenance is explicit: a context-derived date must never be
      // indistinguishable from one the source stated machine-readably.
      date_provenance: { source: resolved.basis, ...(resolved.inputs ? { inputs: resolved.inputs } : {}), ...(resolved.derivation ? { derivation: resolved.derivation } : {}) },
      raw: { card_fragment: card.slice(0, 1000) },
    });
  }
  const unique = [...new Map(records.map((record) => [record.source_record_id, record])).values()];
  return {
    records: unique,
    observations: toObservations(unique, { source_id: sourceId }, { retrievedAt: document?.at, sourceUrl: document?.url, venueNameOverride: venueName }),
    routing_provenance: {
      card_candidates_inspected: starts.length,
      card_records_accepted: unique.length,
      month_year_headings_found: headings.length,
      numeric_date_order_proven: numeric.order,
      numeric_date_order_evidence: numeric.evidence,
      cards_rejected_no_resolvable_date: rejectedNoResolvableDate,
      date_sources: dateSourceCounts,
    },
  };
}
