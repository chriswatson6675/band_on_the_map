// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Badaboum (Paris). See
// research/source-investigations/badaboum-paris-01/.
//
// WordPress with a custom "evenement" post type (confirmed via a public
// `wp-json/wp/v2/evenement/{id}` REST route linked from every page's own
// <link rel="https://api.w.org/post"> — but that REST resource's own
// fields carry only WordPress's post-management `date`/`modified`
// timestamps and a `content.rendered` free-text blob, never a structured
// event date/time; genuinely inspected live, 2026-08-26, and rejected as
// a data path for exactly that reason — see investigation.json
// data_paths). No schema.org Event JSON-LD either (the page's own single
// JSON-LD block is Yoast SEO boilerplate: WebPage/BreadcrumbList/WebSite/
// Organization only).
//
// The venue's own official agenda list page
// (https://badaboum.paris/agenda/) repeats:
//
//   <a href="{eventUrl}" class="elem-agenda ...">
//     ...
//     <div class="date"><span>{D MONTH_FR YYYY}</span>
//       <div class="type-event"><div class="type"><ul class="c-tags">
//         <li class="c-tag">{CATEGORY}</li>
//       </ul></div></div>
//     </div>
//     <h2>{TITLE}</h2>
//   </a>
//
// This module is discovery-layer ONLY, matching this project's existing
// two-step "discover-then-fetch-detail" convention. The list page's own
// date text carries no time-of-day and is superseded, for start/end
// purposes, by the DETAIL page's own machine-readable `google-event`
// data attributes (see ./observation-adapter.mjs) — this module's
// `dateRaw` is retained only as a cross-check/fallback, never itself
// promoted to an Observation's proven `start` value.

const CARD_RE =
  /<a href="(https:\/\/badaboum\.paris\/evenement\/[^"]+)" class="elem-agenda[^"]*">[\s\S]*?<span>([^<]+)<\/span>[\s\S]*?<li class="c-tag">([^<]*)<\/li>[\s\S]*?<h2>([^<]+)<\/h2>/g;

const SLUG_RE = /\/evenement\/([^/]+)\/?$/;

function decodeHtmlEntities(text) {
  return String(text ?? "")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();
}

/**
 * Extract every event card from the venue's own agenda list page HTML.
 * Never throws on zero matches — a genuinely empty listing is legitimate.
 * Each card: { eventUrl, slug, title, category, dateRaw }.
 */
export function extractEventCards(html) {
  if (typeof html !== "string" || html.trim() === "") {
    throw new Error("Expected non-empty Badaboum agenda-page HTML");
  }

  const cards = [];
  let match;
  CARD_RE.lastIndex = 0;
  while ((match = CARD_RE.exec(html)) !== null) {
    const [, eventUrl, dateRaw, category, title] = match;
    // eventUrl is kept EXACTLY as the source states it (percent-encoded
    // where the source itself percent-encodes, e.g. "%c2%b7" for "·" in
    // a small minority of titles) — never re-encoded/decoded, since this
    // is the literal, fetchable, canonical href the source itself emits.
    const slugMatch = SLUG_RE.exec(eventUrl);
    cards.push({
      eventUrl,
      slug: slugMatch ? slugMatch[1] : null,
      title: decodeHtmlEntities(title),
      category: category.trim() === "" ? null : decodeHtmlEntities(category),
      dateRaw: dateRaw.trim(),
    });
  }
  return cards;
}
