// VENUE-DISCOVERY-ENGINE-01 — explainable, evidence-based confidence
// classification.
//
// Deliberately NOT an opaque AI/ML score: every source adapter (see
// ingestion/venue-discovery/overpass/tag-rules.mjs,
// ingestion/venue-discovery/barcelona-open-data/category-rules.mjs)
// reduces its own raw tags/categories to a small list of explicit
// SIGNALS, each with a fixed strength tier and a human-readable reason.
// This module's only job is combining those signals into one
// discovery_status — the strongest tier present wins, and every
// contributing reason is preserved so a human can always answer "why
// does BeatMapped think this might be a music venue?" (or why it
// doesn't).

export const SIGNAL_LEVELS = new Set(["STRONG", "MEDIUM", "WEAK"]);

const LEVEL_TO_STATUS = Object.freeze({
  STRONG: "LIKELY_LIVE_MUSIC_VENUE",
  MEDIUM: "POSSIBLE_LIVE_MUSIC_VENUE",
  WEAK: "WEAK_CANDIDATE",
});

const LEVEL_RANK = Object.freeze({ STRONG: 3, MEDIUM: 2, WEAK: 1 });

/**
 * Combine a list of `{ level, reason }` signals (any order, any source)
 * into one `{ status, reasons }` classification. An empty/absent signal
 * list always classifies EXCLUDED — a candidate with zero qualifying
 * music-related evidence is never promoted by default; every source
 * adapter is responsible for only emitting a candidate at all when it
 * found at least one such signal (see run.mjs).
 */
export function classifyCandidate(signals) {
  const valid = (signals ?? []).filter((s) => s && SIGNAL_LEVELS.has(s.level) && typeof s.reason === "string");

  if (valid.length === 0) {
    return { status: "EXCLUDED", reasons: ["no qualifying live-music evidence found"] };
  }

  const bestLevel = valid.reduce(
    (best, s) => (LEVEL_RANK[s.level] > LEVEL_RANK[best] ? s.level : best),
    valid[0].level,
  );

  return {
    status: LEVEL_TO_STATUS[bestLevel],
    // De-duplicated, in first-seen order, so a candidate produced from
    // more than one signal (e.g. an OSM element with both
    // amenity=nightclub and live_music=yes) keeps every distinct reason.
    reasons: [...new Set(valid.map((s) => s.reason))],
  };
}
