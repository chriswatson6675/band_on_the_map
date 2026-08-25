// VENUE-DISCOVERY-ENGINE-01 — explainable OSM tag -> evidence signal
// rules for the Overpass discovery source.
//
// Reduces one OSM element's raw `tags` object to a list of `{ level,
// reason }` signals for classify.mjs. Every rule cites the exact tag
// combination it fired on — never a fuzzy "this looks musical" guess.
// See docs/VENUE_DISCOVERY.md PHASE 4 for the strong/medium/weak
// rationale this mirrors.

function truthy(tagValue) {
  return typeof tagValue === "string" && tagValue.trim() !== "" && tagValue !== "no";
}

/**
 * Evaluate one OSM element's tags. Returns [] (no music-related
 * evidence at all) for, e.g., a plain amenity=restaurant or an
 * amenity=bar with no live_music tag — which is the expected, honest
 * outcome for most elements this query's broader selectors (nightclub,
 * theatre, cultural centres) pull in alongside the genuinely
 * music-tagged ones.
 */
export function evaluateOsmTags(tags) {
  const t = tags ?? {};
  const signals = [];

  if (t.amenity === "music_venue" || t.leisure === "music_venue") {
    signals.push({ level: "STRONG", reason: "amenity/leisure=music_venue: explicit music venue classification" });
  }

  if (t.amenity === "concert_hall") {
    signals.push({ level: "STRONG", reason: "amenity=concert_hall: explicit concert hall classification" });
  }

  if (t.amenity === "theatre" && t["theatre:type"] === "concert_hall") {
    signals.push({ level: "STRONG", reason: "amenity=theatre + theatre:type=concert_hall" });
  }

  if (t.amenity === "events_venue") {
    signals.push({ level: "MEDIUM", reason: "amenity=events_venue: general events venue, music not guaranteed" });
  }

  // live_music is a key-existence discovery signal regardless of
  // amenity (bar, pub, restaurant, nightclub, ...) — but an explicit
  // live_music=no is negative evidence, never a signal.
  if (truthy(t.live_music)) {
    signals.push({ level: "MEDIUM", reason: `live_music=${t.live_music} tag present on this element` });
  }

  if (t.amenity === "nightclub" && !truthy(t.live_music)) {
    signals.push({ level: "WEAK", reason: "amenity=nightclub with no live_music evidence" });
  }

  if (t.amenity === "theatre" && t["theatre:type"] !== "concert_hall") {
    signals.push({ level: "WEAK", reason: "amenity=theatre with no music-specific evidence" });
  }

  if (["arts_centre", "community_centre", "social_centre"].includes(t.amenity)) {
    if (truthy(t.music) || truthy(t.genre)) {
      signals.push({
        level: "MEDIUM",
        reason: `amenity=${t.amenity} cultural centre with music/genre evidence (${t.music ?? t.genre})`,
      });
    } else {
      signals.push({ level: "WEAK", reason: `amenity=${t.amenity} cultural centre with no music-specific evidence` });
    }
  }

  return signals;
}
