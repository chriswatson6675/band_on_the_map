// BOTM-MAP-DISCOVERY-UX-01 — pure, dependency-free helpers for the
// automatic "today/tomorrow" gig labels shown on the map at close zoom
// (components/DiscoveryMap.tsx). Kept out of the React component (and out
// of any browser-only code) so it can be exercised by deterministic
// node:test fixtures exactly like every other ingestion/map/*.mjs module
// in this repository.
//
// Operates ONLY on already-governed `display_listings` (SINGLE or GROUP,
// see ingestion/map/group-associated-listings.mjs) — never on raw,
// ungrouped Observations/`listings`. A GROUP display listing (a single
// real-world gig backed by more than one source) is one qualifying
// listing, never one per underlying source.
//
// Date handling is conservative by construction: a listing only
// qualifies when its `start.date` (the already-normalized YYYY-MM-DD
// calendar date carried by every ListingDateTime — DATE_ONLY,
// UTC_INSTANT and FLOATING_LOCAL certainties all populate it; only
// UNKNOWN certainty leaves it null) exactly matches today's or
// tomorrow's calendar date string. No other field (`raw`, `iso`) is ever
// used to *guess* a date here — if `start.date` is absent the listing is
// excluded, never inferred.
//
// Deliberate interpretation choice: "today"/"tomorrow" compares
// `start.date` directly against the reference date's own calendar date
// string, rather than converting a UTC instant through the visitor's
// browser timezone first. `start.date` already carries the event's
// intended local (Portugal) calendar day as extracted from the source at
// ingestion time (see e.g. ingestion/bota-anjos/observation-adapter.mjs);
// round-tripping a UTC instant through an arbitrary visitor timezone
// could silently shift it onto the wrong calendar day (e.g. a 22:00 UTC
// show viewed from a UTC-6 browser). Comparing the already-governed
// calendar-date strings directly is the deterministic, superior
// interpretation the task brief explicitly allows for.

export const NEAR_TERM_TODAY = "TODAY";
export const NEAR_TERM_TOMORROW = "TOMORROW";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** YYYY-MM-DD for `date`'s own local calendar day (never UTC-shifted). */
function localCalendarDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Classifies one listing's `start` (a ListingDateTime) as NEAR_TERM_TODAY,
 * NEAR_TERM_TOMORROW, or null (not near-term, or not confidently dated —
 * these two cases are indistinguishable on purpose: both mean "do not
 * show it automatically").
 *
 * `referenceDate` defaults to `new Date()` (the browser/user's current
 * local calendar date) but is an explicit parameter so tests stay
 * deterministic and never depend on the real wall clock.
 */
export function classifyNearTermDate(startDateTime, referenceDate = new Date()) {
  const dateStr = startDateTime?.date;
  if (!dateStr) return null; // unknown/unsafe — never guess

  const today = localCalendarDateString(referenceDate);
  if (dateStr === today) return NEAR_TERM_TODAY;

  const tomorrow = localCalendarDateString(new Date(referenceDate.getTime() + ONE_DAY_MS));
  if (dateStr === tomorrow) return NEAR_TERM_TOMORROW;

  return null;
}

function displayListingTitle(listing) {
  if (listing.kind === "GROUP") return listing.display_title ?? "(untitled listing)";
  return listing.title ?? "(untitled listing)";
}

/**
 * Filters one venue's `display_listings` (SINGLE and/or GROUP, already
 * governed/grouped — see module doc comment above) down to the ones
 * qualifying for the automatic near-term label, each paired with its
 * NEAR_TERM_TODAY/NEAR_TERM_TOMORROW bucket. Order is preserved. A GROUP
 * listing that qualifies contributes exactly one entry, regardless of how
 * many sources it carries.
 */
export function selectNearTermListings(displayListings, referenceDate = new Date()) {
  const out = [];
  for (const listing of displayListings ?? []) {
    const bucket = classifyNearTermDate(listing.start, referenceDate);
    if (bucket) out.push({ listing, bucket });
  }
  return out;
}

/**
 * Formats the compact, bounded label content for one venue's qualifying
 * near-term listings (as produced by selectNearTermListings). Returns
 * null when there is nothing to show.
 *
 * - Exactly one qualifying listing: concise date word + title, e.g.
 *   { venueLine: "Tonight · Julia Piedade" } or
 *   { venueLine: "Tomorrow · LUN8" }.
 * - More than one: a bounded count summary, e.g.
 *   { venueLine: "4 gigs today/tomorrow" } — never a per-title dump.
 */
export function formatNearTermLabel(qualifying) {
  if (!qualifying || qualifying.length === 0) return null;

  if (qualifying.length === 1) {
    const { listing, bucket } = qualifying[0];
    const dateWord = bucket === NEAR_TERM_TODAY ? "Tonight" : "Tomorrow";
    return {
      count: 1,
      venueLine: `${dateWord} · ${displayListingTitle(listing)}`,
    };
  }

  return {
    count: qualifying.length,
    venueLine: `${qualifying.length} gigs today/tomorrow`,
  };
}

/**
 * Convenience wrapper combining the two functions above for one venue's
 * display_listings. Returns null when the venue has no qualifying
 * near-term listing at all.
 */
export function buildNearTermLabel(displayListings, referenceDate = new Date()) {
  return formatNearTermLabel(selectNearTermListings(displayListings, referenceDate));
}
