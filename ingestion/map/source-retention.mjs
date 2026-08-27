// BEATMAPPED-SOURCE-FAILURE-GRACE-AND-RETRY-01 — the pure, dependency-free
// heart of the "a FAILED source means current state is unknown" rule.
//
// PRODUCT RULE (Founder-approved, this package):
//   - A source that FAILS this run: its current state is unknown, so its
//     most recent successfully-published data may be carried forward for
//     a bounded maximum of 24 hours from that source's OWN last success —
//     never longer, and never reset merely because another failed run
//     occurs (the clock is anchored to last SUCCESS, not latest failure).
//   - A source that SUCCEEDS this run — including succeeding with zero
//     current/future observations — is authoritative. Zero is a real,
//     accepted answer, never treated as failure, and never eligible for
//     stale-data retention.
//
// NO SECOND DATASTORE: the ONLY source of "last-known-good" data this
// module ever reads is the previously published, already-validated
// publication artifact itself (see runUnattendedCycle in
// ingestion/unattended-runner/run.mjs, which loads it via
// ingestion/publication-server/run.mjs's loadValidatedArtifact() —
// re-validated before ever being trusted, never assumed safe). The
// artifact's own source_report.sources[] gains one durable field this
// package adds, `last_success_at`, carried forward run-over-run — this
// is the entire persistence mechanism; no cache, no database, no second
// file.
//
// SOURCE-SCOPED ATTRIBUTION: a retained venue's retained listings are
// found ONLY via each display listing's own, already-existing
// `source_id` field (SINGLE-kind listings only — see
// extractRetainableMarkersForSource's own doc comment for why GROUP-kind
// listings, the Lisbon Hot Clube<->Capitólio association pair, are
// deliberately never retained this way). Nothing here infers attribution
// from venue proximity, name matching, or any other guess.
//
// This module NEVER touches the filesystem, the network, or the clock —
// every timestamp (`generatedAt`, `now`) is supplied by the caller,
// matching this project's existing pure-module convention
// (ingestion/map/publication.mjs, ingestion/map/date-filter.mjs) so it
// stays deterministic and directly unit-testable without real timers.

import { listingIdentity } from "./group-associated-listings.mjs";
import { listingWithinDateRange } from "./date-filter.mjs";

export const DEFAULT_RETENTION_GRACE_MS = 24 * 60 * 60 * 1000;

/**
 * This run's own value for a source's `last_success_at` provenance field:
 * refreshed to `generatedAt` when this run's acquisition succeeded
 * (including a legitimate zero-observation success — succeeding IS
 * succeeding, regardless of how many observations came back), otherwise
 * carried forward unchanged from whatever the previous artifact already
 * recorded for that source (or `null` if never observed to succeed).
 */
export function computeSourceLastSuccessAt({ success, generatedAt, previousLastSuccessAt = null }) {
  return success ? generatedAt : (previousLastSuccessAt ?? null);
}

/**
 * True only when `lastSuccessAt` is known AND `now` is no more than
 * `graceMs` after it — the ONE gate that decides whether a FAILED
 * source's previous data may still be carried forward. A source that has
 * never been observed to succeed (`lastSuccessAt` null/unparseable) is
 * never eligible — there is nothing safe to retain.
 */
export function isWithinRetentionGrace({ lastSuccessAt, now, graceMs = DEFAULT_RETENTION_GRACE_MS }) {
  if (!lastSuccessAt) return false;
  const lastSuccessMs = Date.parse(lastSuccessAt);
  const nowMs = Date.parse(now);
  if (Number.isNaN(lastSuccessMs) || Number.isNaN(nowMs)) return false;
  return nowMs - lastSuccessMs <= graceMs;
}

/**
 * BEATMAPPED-RETENTION-COLD-START-BOOTSTRAP-AND-BERLIN-INTEGRATION-01 —
 * derives a genuine `last_success_at` anchor for a source that has NO
 * recorded one (never observed to succeed under provenance tracking —
 * e.g. the very first run after this package was deployed for a given
 * entry point), from the SAME `previousArtifact` this module already
 * reads for retention (see this file's own "NO SECOND DATASTORE" header
 * comment) — never a second data source, never git history, never the
 * wall clock.
 *
 * This is a COLD-START path only: once a source has an explicit
 * `last_success_at` (bootstrapped or genuinely observed, this run or any
 * future one), `annotateSourceProvenance()` below never calls this again
 * for it — `previous.last_success_at` already wins over the bootstrap.
 *
 * FAIL CLOSED — returns `null` (never a guess) unless ALL of the
 * following hold:
 *   - `previousArtifact` is a real object with a valid ISO `generated_at`
 *     (the caller is responsible for having obtained it via the SAME
 *     canonical `loadValidatedArtifact()` / `validatePublicationArtifact()`
 *     path every other consumer of a previous artifact already uses —
 *     this function never re-validates or re-reads anything itself);
 *   - `previousArtifact.source_report.sources[]` has an entry for this
 *     exact `sourceId` with `success === true` (a source_report entry
 *     that never actually succeeded proves nothing);
 *   - that same artifact's own markers contain at least one real
 *     SINGLE-kind display listing whose `source_id` matches — proof the
 *     `success` flag corresponds to real, present data, not a stale or
 *     malformed entry with nothing behind it.
 *
 * The anchor returned is `previousArtifact.generated_at` itself: the one
 * moment the WHOLE artifact — and therefore this source's own listings
 * within it — was genuinely produced. Real, schema-native evidence,
 * never invented, never "now".
 */
export function bootstrapLastSuccessAtFromPreviousArtifact({ previousArtifact, sourceId }) {
  if (!previousArtifact || typeof previousArtifact !== "object") return null;
  if (typeof previousArtifact.generated_at !== "string" || Number.isNaN(Date.parse(previousArtifact.generated_at))) return null;

  const sourceEntry = (previousArtifact.source_report?.sources ?? []).find((entry) => entry?.source_id === sourceId);
  if (!sourceEntry || sourceEntry.success !== true) return null;

  const hasRealListing = ["Portugal", "Spain", "Germany", "France"].some((country) =>
    (previousArtifact.countries?.[country]?.markers ?? []).some((marker) =>
      (marker.display_listings ?? []).some((listing) => listing?.kind === "SINGLE" && listing.source_id === sourceId),
    ),
  );
  if (!hasRealListing) return null;

  return previousArtifact.generated_at;
}

/**
 * Annotate this run's own per-source acquisition results (the exact shape
 * ingestion/lisbon-porto/run.mjs's and ingestion/barcelona/run.mjs's
 * acquireAll() already produce — success/observations/etc.) with durable,
 * cross-run provenance:
 *
 *   last_success_at   - see computeSourceLastSuccessAt() above. When no
 *                        explicit previous value exists, falls back to
 *                        bootstrapLastSuccessAtFromPreviousArtifact()
 *                        (see its own doc comment) before giving up and
 *                        recording `null` — a ONE-TIME cold-start path,
 *                        never consulted again once a real value exists.
 *   retained_eligible - true ONLY for a source that FAILED this run AND
 *                        whose last_success_at is within `graceMs` of
 *                        `generatedAt`. A source that succeeded this run
 *                        (zero observations or many) is never eligible —
 *                        successful-zero is authoritative, per the
 *                        Founder rule this package implements.
 *
 * `previousSourceReportSources` is the previous artifact's own
 * `source_report.sources` array (or `[]`/`undefined` when no previous
 * artifact is available) — every source not present there is treated as
 * never-yet-succeeded (`previousLastSuccessAt: null`) before the
 * bootstrap fallback is tried. `previousArtifact` (optional, defaults to
 * `null`) is the SAME previous artifact object, supplied only so the
 * bootstrap fallback can inspect its markers — every existing caller that
 * omits it keeps today's exact behaviour (bootstrap simply never fires).
 */
export function annotateSourceProvenance({ sourceResults, previousSourceReportSources = [], previousArtifact = null, generatedAt, graceMs = DEFAULT_RETENTION_GRACE_MS }) {
  const previousBySourceId = new Map((previousSourceReportSources ?? []).map((entry) => [entry.source_id, entry]));

  return (sourceResults ?? []).map((result) => {
    const previous = previousBySourceId.get(result.source_id);
    const previousLastSuccessAt =
      previous?.last_success_at ?? bootstrapLastSuccessAtFromPreviousArtifact({ previousArtifact, sourceId: result.source_id });
    const lastSuccessAt = computeSourceLastSuccessAt({
      success: result.success === true,
      generatedAt,
      previousLastSuccessAt,
    });
    const retainedEligible = result.success !== true && isWithinRetentionGrace({ lastSuccessAt, now: generatedAt, graceMs });
    return { ...result, last_success_at: lastSuccessAt, retained_eligible: retainedEligible };
  });
}

/**
 * Extract every SINGLE-kind display listing attributable to `sourceId`
 * from `previousArtifact`'s supported-country markers, grouped by venue_id.
 * Each returned venue carries its own venue_id/canonical_name/latitude/
 * longitude/address exactly as previously published (already schema-
 * valid — never re-derived, never re-geocoded).
 *
 * GROUP-kind listings (the Lisbon Hot Clube<->Capitólio association pair
 * — see ingestion/map/group-associated-listings.mjs) are deliberately
 * NEVER retained here: a GROUP listing only ever forms when BOTH its
 * source sides are present in the SAME run (ingestion/association/
 * hot-clube-capitolio.mjs), so if exactly one of those two sources fails,
 * there is no safe way to attribute "half" of an already-merged display
 * listing to it without guessing. This is a deliberate, documented scope
 * boundary, not a silent gap — see this package's own FINAL REPORT.
 *
 * `todayDateString` (a plain "YYYY-MM-DD", the SAME convention already
 * used by ingestion/map/publication.mjs's buildArtistIndex() for
 * "upcoming") drops retained listings that are already obviously expired
 * — reusing ingestion/map/date-filter.mjs's own listingWithinDateRange(),
 * never a second, parallel date rule. A listing whose date is genuinely
 * unknown is, as everywhere else in this project, never dropped.
 *
 * BEATMAPPED-BERLIN-CANONICAL-RESILIENCE-RECONCILIATION-AND-INTEGRATION-01:
 * every returned listing is stamped `stale: true` plus `retained_since`
 * (this SAME source's own `last_success_at`, as already computed by
 * annotateSourceProvenance() and passed in by the caller as
 * `retainedSince` — never a second, independently-derived timestamp).
 * `last_success_at` is already, by construction, "the last time this
 * source was genuinely fresh, never reset merely because another failed
 * run occurs" — exactly the semantic a `retained_since` field needs, so
 * this reuses that existing value rather than inventing a duplicate one.
 * A listing that was already retained in a prior run and is being
 * retained again here simply gets the SAME `retainedSince` value again
 * (it is anchored to the source's last success, not to "now"), so it
 * never appears to have just become fresh.
 */
export function extractRetainableMarkersForSource({ previousArtifact, sourceId, todayDateString, retainedSince = null }) {
  const retainedByVenueId = new Map();

  for (const country of ["Portugal", "Spain", "Germany", "France"]) {
    const markers = previousArtifact?.countries?.[country]?.markers ?? [];
    for (const marker of markers) {
      const retainedListings = (marker.display_listings ?? [])
        .filter((listing) => listing?.kind === "SINGLE" && listing.source_id === sourceId && listingWithinDateRange(listing, todayDateString, null))
        .map((listing) => ({ ...listing, stale: true, retained_since: retainedSince ?? null }));
      if (retainedListings.length === 0) continue;

      retainedByVenueId.set(marker.venue_id, {
        venue_id: marker.venue_id,
        canonical_name: marker.canonical_name,
        latitude: marker.latitude,
        longitude: marker.longitude,
        address: marker.address,
        country,
        listings: retainedListings,
      });
    }
  }

  return retainedByVenueId;
}

/**
 * Combine the per-source retained-venue maps from one or more eligible
 * FAILED sources (extractRetainableMarkersForSource(), called once per
 * eligible source_id by the caller) into a single map keyed by venue_id —
 * the rare case of two independently-failed sources both legitimately
 * attributable to the same venue simply has its retained listings
 * concatenated (still deduplicated later, in mergeRetainedMarkers, against
 * this run's fresh listings).
 */
export function combineRetainedVenueMaps(maps) {
  const combined = new Map();
  for (const map of maps ?? []) {
    for (const [venueId, venue] of map) {
      const existing = combined.get(venueId);
      if (existing) {
        existing.listings = [...existing.listings, ...venue.listings];
      } else {
        combined.set(venueId, { ...venue, listings: [...venue.listings] });
      }
    }
  }
  return combined;
}

/**
 * Merge retained venues into ONE country's freshly-built marker list
 * (buildPortugalMarkers()/buildSpainMarkers() output — never called on a
 * mixed-country list). Fresh data always wins:
 *
 *   - a retained venue that ALSO has a fresh marker this run (another,
 *     still-succeeding source covers the same venue — see this package's
 *     own multi-source-venue handling) has its retained listings APPENDED
 *     to that fresh marker, skipping any retained listing whose
 *     listingIdentity() already matches a fresh one (fresher data always
 *     supersedes a stale copy of the same event — never duplicated);
 *   - a retained venue with NO fresh marker this run (every source that
 *     ever covered it failed, or it has exactly one source and that one
 *     failed — e.g. the real L'Auditori/9-venue production incident this
 *     package fixes) is synthesized from its own last-known-good venue
 *     metadata plus only its retained listings.
 *
 * `retainedVenues` must already be filtered to markers belonging to THIS
 * country (see runUnattendedCycle's own wiring) — this function has no
 * country concept of its own, matching buildPortugalMarkers()/
 * buildSpainMarkers()'s existing per-country separation.
 */
export function mergeRetainedMarkers(freshMarkers, retainedVenues) {
  if (!retainedVenues || retainedVenues.size === 0) return freshMarkers ?? [];

  const merged = (freshMarkers ?? []).map((marker) => ({ ...marker, display_listings: [...marker.display_listings] }));
  const mergedByVenueId = new Map(merged.map((marker) => [marker.venue_id, marker]));

  for (const retained of retainedVenues.values()) {
    const existing = mergedByVenueId.get(retained.venue_id);
    if (existing) {
      const existingIdentities = new Set(existing.display_listings.filter((l) => l.kind === "SINGLE").map(listingIdentity));
      for (const listing of retained.listings) {
        if (!existingIdentities.has(listingIdentity(listing))) {
          existing.display_listings.push(listing);
          existingIdentities.add(listingIdentity(listing));
        }
      }
    } else {
      const synthesized = {
        venue_id: retained.venue_id,
        canonical_name: retained.canonical_name,
        latitude: retained.latitude,
        longitude: retained.longitude,
        address: retained.address,
        display_listings: [...retained.listings],
      };
      merged.push(synthesized);
      mergedByVenueId.set(retained.venue_id, synthesized);
    }
  }

  return merged;
}
