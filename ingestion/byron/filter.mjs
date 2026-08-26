// BARCELONA-30-VENUE-POPULATION-01 — Byron (a bookshop/cultural space
// running a full "The Events Calendar" install, reusing
// ingestion/events-calendar-api/ unchanged) mixes literary programming
// (book presentations, a chess tournament) with genuine musical
// concerts. This source's own REST API exposes no category taxonomy at
// all (every sampled record's own `categories` array was empty — see
// research/source-investigations/byron-barcelona-01/), so music
// relevance is decided from the record's own title text instead —
// matching this project's existing filterMusicRecords() naming
// convention (ingestion/cm-gaia-eventos/discovery.mjs,
// ingestion/super-bock-arena/discovery.mjs, ingestion/galeria-ze-dos-bois/
// discovery.mjs), applied here to already-normalized Events Calendar API
// records rather than to raw HTML.
//
// Bounded, explainable, non-exhaustive keyword list — a title matching
// none of these is EXCLUDED, never guessed into inclusion (see PRODUCT
// INTENT's "reject irrelevant programme entries" rule) — e.g. "V Byron
// Chess Open" and a plain book-presentation title are correctly rejected
// by this list.
const MUSIC_KEYWORDS = ["piano", "jazz", "flamenc", "música", "musica", "cantoria", "cantoría", "concert", "guitar", "cor "];

function foldText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/**
 * Filter already-normalized Events Calendar API records
 * (ingestion/events-calendar-api/client.mjs's normalizeEventRecord())
 * down to genuinely music-relevant ones, by title keyword match.
 */
export function filterByronMusicRecords(records) {
  return (records ?? []).filter((record) => {
    const haystack = foldText(record.title);
    return MUSIC_KEYWORDS.some((keyword) => haystack.includes(foldText(keyword)));
  });
}
