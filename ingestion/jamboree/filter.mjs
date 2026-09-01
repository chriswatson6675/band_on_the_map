// BEATMAPPED-LONDON-SECOND-LIVE-TRANCHE-01 — Jamboree mixes genuine live
// music (jazz/folk/world-music gigs) with recurring dance/art classes
// (life-drawing, swing-dance taster) — see
// research/source-investigations/london-t2-jamboree-03/evidence/full-
// listing-review.json for the full real-listing review this filter is
// based on. Unlike ingestion/byron/filter.mjs's own title-keyword
// approach (needed there because Byron's API exposes no category
// taxonomy at all and Byron's own genuine music titles happened to
// contain obvious keywords like "jazz"/"concert"), Jamboree's own music
// event titles are usually just artist/act names with no inherent music
// keyword (e.g. "The Trouble Notes", "Opa Rosa + Karp.OS") — a
// title-keyword filter would incorrectly exclude most of them. Jamboree
// DOES expose a genuinely reliable, source-provided per-event field
// instead: every card's own <h4> programme-note text states "Live Music
// from ..." for music events and "Class Runs from ..." for its recurring
// classes (ingestion/jamboree/observation-adapter.mjs already preserves
// this verbatim in source_fields.programme_note). Filtering on THAT
// field, deterministically, is both more accurate and more future-proof
// than a static title list — it correctly classifies events this
// project has never seen before too, as long as the source's own <h4>
// convention holds.

const MUSIC_NOTE_MARKER = "live music";

/**
 * Filter Observations built by ingestion/jamboree/observation-adapter.mjs
 * down to genuinely music-relevant ones, by their own source-provided
 * programme_note field. A card whose note is missing, or does not
 * contain the literal substring "Live Music" (case-insensitive) — e.g.
 * "Class Runs from 11am-1pm", or the ambiguous "Open mic sign-ups from
 * 6.15pm / Live performance from 7pm" — is excluded, never guessed into
 * inclusion.
 */
export function filterJamboreeMusicRecords(observations) {
  return (observations ?? []).filter((observation) => {
    const note = observation?.source_fields?.programme_note;
    if (typeof note !== "string") return false;
    return note.toLowerCase().includes(MUSIC_NOTE_MARKER);
  });
}
