// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Alhambra (Paris) discovery.
// See research/source-investigations/alhambra-paris-01/.
//
// IMPORTANT STRUCTURAL HAZARD (see the governed investigation's own
// field_assessment.start_date.notes): this venue's homepage renders each
// event card's date/status footer AFTER its own title+image but BEFORE
// the NEXT card's title begins, so a naive "nearest preceding title"
// extraction of the homepage alone mismatches dates to the wrong titles.
// This module therefore deliberately does NOT attempt to parse dates from
// the homepage at all — it only harvests title+href pairs (which are safe,
// since title and href co-occur inside the very same <a> tag with no
// ordering ambiguity), reusing the EXISTING, unmodified
// ingestion/html-link-discovery/discovery.mjs for that step. Each event's
// own detail page (parsed by observation-adapter.mjs) is the sole
// authority for start_date/time/price/venue.

import { extractLinksMatching } from "../html-link-discovery/discovery.mjs";

// Matches this platform's own "<slug>-lo<numeric-id>.html" event page
// scheme (never the "<category>-loc<numeric-id>.html" listing pages,
// which use a distinct 'loc' infix this pattern does not match).
const EVENT_LINK_RE = /href='([a-z0-9-]+-lo\d+\.html)'/g;

/**
 * Harvest every distinct event link from the venue's own homepage
 * (which structurally serves as the full programmation listing). Returns
 * absolute URLs, in first-appearance order, deduplicated. Never attempts
 * to read a date from this page — see this module's own doc comment.
 */
export function discoverEventUrls(html, { baseUrl = "https://www.alhambra-paris.com/" } = {}) {
  return extractLinksMatching(html, EVENT_LINK_RE, { baseUrl });
}
