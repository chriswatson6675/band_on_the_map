// VENUE-DISCOVERY-ENGINE-01 — explainable secondary-filter -> evidence
// signal rules for the Barcelona Open Data "Espais de música i copes"
// source.
//
// Each record in that dataset carries a `secondary_filters_data[]` list
// of official municipal category tags (Catalan). This module reduces
// those category names to `{ level, reason }` signals for classify.mjs
// — see docs/VENUE_DISCOVERY.md PHASE 2C for the researched category
// list and PHASE 4 for the strong/medium/weak rationale.
//
// Category names in the live dataset carry inconsistent trailing
// whitespace/capitalisation (observed directly in the retained fixture
// — e.g. both "Bars i pubs musicals" and "Bars i pubs musicals "), so
// matching is done on a trimmed, lower-cased copy — this is exact
// (post-normalisation) matching against a known vocabulary, never fuzzy
// similarity.

function normaliseCategory(name) {
  return String(name ?? "").trim().toLowerCase();
}

// Explicit, non-exhaustive, evidence-only category vocabulary — see
// PHASE 2C. A category absent from all three sets contributes no
// signal at all (e.g. "Restaurants", "Cuina de mercat", "Karaokes").
const STRONG_CATEGORIES = new Set([
  "locals de música en viu",
  "locals de musica en viu",
  "locals música en viu",
  "auditoris i sales de concert",
  "auditoris i sales de concerts",
  "espais de concerts",
  "tablaos flamencs",
]);

const MEDIUM_CATEGORIES = new Set(["bars i pubs musicals", "ambient flamenc", "salons de ball", "sales de festes"]);

const WEAK_CATEGORIES = new Set(["discoteques", "multiespais", "sales"]);

/**
 * Evaluate one record's list of secondary-filter category names.
 * Returns [] when none of the record's categories are in any of the
 * three known sets (e.g. a purely food/restaurant listing) — that
 * record carries no music-related evidence from this source at all.
 */
export function evaluateSecondaryFilters(categoryNames) {
  const signals = [];
  const seen = new Set();

  for (const raw of categoryNames ?? []) {
    const name = normaliseCategory(raw);
    if (seen.has(name)) continue;
    seen.add(name);

    if (STRONG_CATEGORIES.has(name)) {
      signals.push({ level: "STRONG", reason: `Barcelona Open Data category "${raw.trim()}": explicit live-music/concert classification` });
    } else if (MEDIUM_CATEGORIES.has(name)) {
      signals.push({ level: "MEDIUM", reason: `Barcelona Open Data category "${raw.trim()}": music-adjacent classification` });
    } else if (WEAK_CATEGORIES.has(name)) {
      signals.push({ level: "WEAK", reason: `Barcelona Open Data category "${raw.trim()}": generic nightlife classification, no explicit music evidence` });
    }
  }

  return signals;
}
