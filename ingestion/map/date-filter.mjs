// BEATMAPPED-DATE-FILTER-LIVE-01 — client-side From/To date filtering
// over already-enriched display markers (see ingestion/map/
// attach-artist-genres.mjs, ingestion/map/artist-genre-search.mjs).
// Browser-safe, dependency-free, imported directly by app/page.tsx —
// mirrors artist-genre-search.mjs's own conventions exactly, including
// reusing its filterMarkersByListingPredicate() so a marker left with
// zero matching listings is dropped the same way a Genre/Artist filter
// already drops one.
//
// Event date field: every display listing (SINGLE and, since a GROUP
// listing carries one shared start/end, GROUP alike) carries `start.date`
// — a plain "YYYY-MM-DD" calendar-date string, per ingestion/observation/
// contract.mjs's ListingDateTime shape (docs/OBSERVATION_PIPELINE.md).
// This is the ONLY field this module reads: never `start.iso` (a UTC
// instant, not always known — see certainty: "DATE_ONLY" for the MEO
// Arena pilot events themselves) and never a constructed JS Date. Plain
// "YYYY-MM-DD" strings compare correctly with ordinary string
// comparison (lexicographic order == calendar order for this format),
// so no Date object — and therefore no timezone conversion that could
// shift a date to the adjacent day — is ever involved.
//
// Unknown-date handling deliberately mirrors the EXISTING, already-
// established precedent in ingestion/lisbon-porto/run.mjs's own
// withinDateBounds(): a listing with no genuinely known start.date is
// never dropped by a date filter — "never drop an [Event] with a
// genuinely unknown date" (the same rule, same wording, applied one
// layer up: raw Observations there, already-enriched display listings
// here). Hiding an imprecisely-dated real event would silently assert
// "this is not in your range", which nothing here can actually prove.

import { filterMarkersByListingPredicate } from "./artist-genre-search.mjs";

/**
 * True if `listing` (a display listing — SINGLE or GROUP) satisfies the
 * given inclusive [from, to] calendar-date range. Either bound may be
 * omitted (null/undefined/""); an omitted bound is simply not enforced.
 * A listing whose start.date is unknown (null) always satisfies any
 * range — see this module's own doc comment above for why.
 */
export function listingWithinDateRange(listing, from, to) {
  const date = listing?.start?.date;
  if (!date) return true; // genuinely unknown date — never dropped, see doc comment above
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

/**
 * Filter markers down to only listings whose start.date falls inside
 * [from, to] (each independently optional), dropping any marker left
 * with zero matching listings — same composition rule as
 * filterMarkersByGenre()/filterMarkersByArtistId() in
 * ingestion/map/artist-genre-search.mjs. Passing neither bound (both
 * falsy — covers `null`, `undefined`, and the empty string a cleared
 * <input type="date"> produces) returns `markers` completely unchanged,
 * matching those two filters' own "Any"/null no-op convention.
 */
export function filterMarkersByDateRange(markers, from, to) {
  if (!from && !to) return markers ?? [];
  return filterMarkersByListingPredicate(markers, (listing) => listingWithinDateRange(listing, from, to));
}

// BAND-ON-THE-MAP-BARCELONA-PRE-INTEGRATION-DATE-AUDIT-01 — the default
// lower bound app/page.tsx applies to the "From" field ITSELF (never to
// this module's own filterMarkersByDateRange/listingWithinDateRange,
// whose "empty bound == unbounded" contract above stays exactly as
// documented and tested).
//
// Before this package, `fromDate` started as "" and nothing ever
// changed it unless the visitor touched a Quick dates button or the From
// input directly — so a real visitor's FIRST view of the map (before any
// interaction) applied no lower bound at all, and a venue with clearly
// expired listings (e.g. a source that still lists last week's gig)
// rendered them identically to a genuinely upcoming one, both in the pin
// count and the venue panel. That is the exact "expired event
// accidentally entering the current public-facing map dataset" defect
// this task's audit was asked to check for — confirmed present for
// Portugal (already-live) and would have been inherited unchanged by
// Spain the moment it is wired into this page's country selector.
//
// The fix is at THIS layer, not in the artifact or in Observations: the
// publication artifact and every Observation genuinely SHOULD keep
// carrying full history (proof/evidence, "Quick dates"/From letting a
// visitor deliberately look backward, a future analytics surface, etc.)
// — see docs/BARCELONA_PRE_INTEGRATION_DATE_AUDIT_01.md. Only the
// visitor's DEFAULT view needed narrowing.
//
// `currentFromDate` is returned completely unchanged whenever it is
// already non-empty — an explicit value (typed by the visitor, or set by
// a Quick dates preset) is always respected exactly as before; this
// function only ever supplies a floor for the genuinely-untouched ""
// starting state. A listing with a genuinely unknown start.date is,
// exactly as always, never affected by any From/To bound at all (see
// listingWithinDateRange's own doc comment above).
export function resolveDefaultFromDate(currentFromDate, todayDateString) {
  return currentFromDate || todayDateString;
}
