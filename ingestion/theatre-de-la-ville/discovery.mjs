// BEATMAPPED-PARIS-30-40-VENUE-POPULATION-01 — Théâtre de la Ville (Sarah
// Bernhardt hall + Théâtre des Abbesses, same operator) is NOT a schema.org
// JSON-LD-in-HTML source (ingestion/json-ld/'s existing family): its
// homepage only exposes Article JSON-LD. Its real event data lives behind
// a separate, public, unauthenticated Hydra/API-Platform JSON REST API at
// api.theatredelaville-paris.com — see
// research/source-investigations/theatre-de-la-ville-paris-01/.
//
// This module is a small, generic Hydra-collection unwrapper plus this
// source's own observed canonical-URL construction rule. It performs NO
// network I/O itself and never decides what counts as "music" (that
// judgement — filtering to the site's own "Musiques" taxonomy, id 63 — is
// the caller's, via the `mainCategory` query parameter passed to the real
// /events endpoint in a future live-run wiring, not this module).

/**
 * Unwrap one Hydra ("hydra:member") collection response into a plain array
 * of member node objects. Generic across this API's /events, /event_dates,
 * and /taxons collections alike — none of which this module interprets any
 * further.
 */
export function extractHydraMembers(json) {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    throw new Error("extractHydraMembers requires a Hydra collection response object");
  }
  if (!Array.isArray(json["hydra:member"])) {
    throw new Error("extractHydraMembers requires a 'hydra:member' array");
  }
  return json["hydra:member"];
}

/**
 * This source's own observed canonical event-page URL pattern, confirmed
 * against the venue's own rendered HTML navigation (see
 * research/source-investigations/theatre-de-la-ville-paris-01/evidence/
 * ev-musiques-season-2627-links.txt) — DETERMINISTIC_CONTEXT per
 * docs/SOURCE_INVESTIGATION_POLICY.md's v1.2 model: this API never returns
 * a 'url' field on the event/event_date record itself, so the canonical
 * page URL is reconstructed from three fields the API DOES return directly
 * (season.slug, mainCategory.slug, event.slug), never guessed.
 */
export function buildEventPageUrl({ baseUrl, seasonSlug, mainCategorySlug, slug }) {
  if (!baseUrl || !seasonSlug || !mainCategorySlug || !slug) {
    throw new Error("buildEventPageUrl requires baseUrl, seasonSlug, mainCategorySlug, and slug");
  }
  return `${baseUrl}/fr/spectacles/${seasonSlug}/${mainCategorySlug}/${slug}`;
}
