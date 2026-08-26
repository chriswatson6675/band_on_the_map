// BEATMAPPED-BERLIN-30-40-VENUE-COLLECTOR-REUSE-TRIAL-01 — a small,
// genuinely reusable link-discovery utility for the recurring pattern
// where a venue's own event LIST page is plain, statically-crawlable
// HTML containing real `<a href>` links to individual event DETAIL
// pages, and each detail page (not the list page) embeds its own
// schema.org JSON-LD Event/MusicEvent block — already handled with zero
// changes by the EXISTING ingestion/json-ld/ family.
//
// This is the SAME pattern already established (per-venue) by
// ingestion/sala-apolo/discovery.mjs in the Barcelona trial. This module
// generalises it: rather than one hardcoded regex per venue file, a
// caller supplies its own venue-specific `pattern` (a RegExp with exactly
// one capturing group — the URL/slug to keep) and `baseUrl` (to resolve
// relative links to absolute ones). First observed as a genuinely
// recurring need across FOUR distinct real Berlin venues sharing nothing
// else in common technically (Konzerthaus Berlin: custom in-house CMS;
// Lido Berlin: Ruby on Rails; b-flat: unknown small CMS; SO36: Shopify) —
// see each one's own research/source-investigations/<slug>-berlin-01/.
//
// This module performs NO network I/O and no JSON-LD extraction itself —
// it only discovers links. Matching ingestion/sala-apolo/discovery.mjs's
// own "link discovery only" scope, and ingestion/json-ld/parse.mjs's own
// "never decide what counts as music" boundary.

/**
 * Extract every distinct link matched by `pattern` from `html`, in
 * first-appearance order, deduplicated, and resolved to absolute URLs
 * against `baseUrl`.
 *
 * `pattern` must be a global RegExp (`/.../g`) with exactly one capturing
 * group — the href value to extract (which may itself already be
 * absolute, or site-relative starting with "/"). This module does not
 * care what the pattern actually matches (an href attribute, a specific
 * URL prefix, a query string) — that judgement is the caller's, per
 * venue, matching every other per-source discovery module in this
 * project (e.g. ingestion/sala-apolo/discovery.mjs's own EVENT_LINK_RE).
 *
 * Throws for empty input or a malformed `pattern`; returns `[]` (never
 * throws) if the page is genuinely well-formed but has no matching links
 * — a legitimate "nothing currently scheduled" result, distinct from a
 * malformed fetch, matching ingestion/sala-apolo/discovery.mjs's own
 * precedent.
 */
export function extractLinksMatching(html, pattern, { baseUrl } = {}) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty HTML");
  }
  if (!(pattern instanceof RegExp) || !pattern.global) {
    throw new Error("extractLinksMatching requires a global RegExp (/.../g) with one capturing group");
  }
  if (!baseUrl) {
    throw new Error("extractLinksMatching requires options.baseUrl to resolve relative links");
  }

  const seen = new Set();
  const urls = [];
  const re = new RegExp(pattern.source, pattern.flags);
  let match;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1];
    if (!raw) continue;
    const absolute = new URL(raw, baseUrl).toString();
    if (seen.has(absolute)) continue;
    seen.add(absolute);
    urls.push(absolute);
  }
  return urls;
}
