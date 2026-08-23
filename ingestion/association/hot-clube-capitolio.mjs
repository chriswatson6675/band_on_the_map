// Evidence-backed, fail-closed association between Hot Clube de Portugal
// Observations and Teatro Variedades & Capitólio Observations that appear
// to describe the same real-world "Há Jazz no Parque Mayer!" performance.
//
// This is BOTM-MULTISOURCE-LINKS-01's reconciliation layer, and it is
// deliberately narrow: it never creates a canonical Event, never merges
// or deletes either Observation, and never performs broad/fuzzy entity
// resolution. Both source records always remain independently
// retrievable — this module only ever returns references to them plus
// the evidence that justified pairing them for DISPLAY.
//
// DECLARED_PAIRS below is a small, explicit, hand-identified candidate
// list — exactly the five gigs this task set out to prove, no more. It
// is NOT trusted blindly: associateHotClubeCapitolio() independently
// re-verifies every declared pair against the real Observation data
// (same performance date, same resolved canonical venue, and
// deterministic word-level performer/title correspondence) and fails
// closed to UNASSOCIATED if any check does not hold, or if either
// Observation cannot be found at all. A declared pair is a candidate,
// never a guarantee.

import { resolveObservation } from "../venue/resolver.mjs";

export const HOT_CLUBE_SOURCE_ID = "hot-clube-de-portugal";
export const CAPITOLIO_SOURCE_ID = "teatro-variedades-capitolio";

const DECLARED_PAIRS = [
  { hot_clube_event_id: "3794", capitolio_source_record_id: "2908" },
  { hot_clube_event_id: "3795", capitolio_source_record_id: "2909" },
  { hot_clube_event_id: "3797", capitolio_source_record_id: "2911" },
  { hot_clube_event_id: "3799", capitolio_source_record_id: "2913" },
  { hot_clube_event_id: "3801", capitolio_source_record_id: "2915" },
];

// Generic ensemble-type words that legitimately appear on one side's
// title and not the other purely as phrasing (e.g. Capitólio's own
// title adds "Quarteto" after a performer's name where Hot Clube's does
// not) — stripped before the containment check below. This is a tiny,
// fixed list, not a similarity threshold: every other word must still
// match verbatim.
const TITLE_STOPWORDS = new Set(["quarteto", "trio"]);

function normalizeTitleWords(text) {
  if (typeof text !== "string") return [];
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Narrow, deterministic, non-fuzzy word-containment check: every
 * meaningful word of `capitolioTitle` (after stripping the fixed
 * stoplist above) must appear verbatim somewhere in `hotClubeTitle`. No
 * scoring, no similarity threshold, no edit distance — a word is either
 * present or it is not.
 */
function titleWordsCorrespond(hotClubeTitle, capitolioTitle) {
  const hcWords = new Set(normalizeTitleWords(hotClubeTitle));
  const capWords = normalizeTitleWords(capitolioTitle).filter((w) => !TITLE_STOPWORDS.has(w));
  if (capWords.length === 0) return false;
  return capWords.every((w) => hcWords.has(w));
}

function findByRecordId(observations, sourceId, sourceRecordId) {
  return (
    (observations ?? []).find(
      (o) => o.source_id === sourceId && o.source_record_id === String(sourceRecordId),
    ) ?? null
  );
}

/**
 * Attempt to associate every declared Hot Clube <-> Capitólio candidate
 * pair against the real Observations supplied. Returns one result per
 * declared pair, in DECLARED_PAIRS order — ASSOCIATED only when every
 * evidence check passes; UNASSOCIATED (with a specific reason) otherwise.
 * Never merges, deletes, or mutates either Observation — both are always
 * returned by reference so a caller can still resolve their individual
 * source_id/source_record_id/event_url independently.
 */
export function associateHotClubeCapitolio(hotClubeObservations, capitolioObservations) {
  return DECLARED_PAIRS.map(({ hot_clube_event_id, capitolio_source_record_id }) => {
    const hotClube = findByRecordId(hotClubeObservations, HOT_CLUBE_SOURCE_ID, hot_clube_event_id);
    const capitolio = findByRecordId(capitolioObservations, CAPITOLIO_SOURCE_ID, capitolio_source_record_id);

    if (!hotClube || !capitolio) {
      return {
        hot_clube_event_id,
        capitolio_source_record_id,
        association_status: "UNASSOCIATED",
        reason: "ONE_OR_BOTH_OBSERVATIONS_NOT_FOUND",
        hot_clube: hotClube,
        capitolio: capitolio,
        evidence: null,
      };
    }

    const hotClubeVenue = resolveObservation(hotClube);
    const capitolioVenue = resolveObservation(capitolio);

    const evidence = {
      same_date:
        Boolean(hotClube.start?.date) &&
        Boolean(capitolio.start?.date) &&
        hotClube.start.date === capitolio.start.date,
      hot_clube_date: hotClube.start?.date ?? null,
      capitolio_date: capitolio.start?.date ?? null,

      same_canonical_venue:
        hotClubeVenue.resolution_status === "RESOLVED" &&
        capitolioVenue.resolution_status === "RESOLVED" &&
        hotClubeVenue.venue_id === capitolioVenue.venue_id,
      hot_clube_venue_id: hotClubeVenue.venue_id,
      capitolio_venue_id: capitolioVenue.venue_id,

      title_correspondence: titleWordsCorrespond(hotClube.title, capitolio.title),
      hot_clube_title: hotClube.title,
      capitolio_title: capitolio.title,
    };

    const associated = evidence.same_date && evidence.same_canonical_venue && evidence.title_correspondence;

    return {
      hot_clube_event_id,
      capitolio_source_record_id,
      association_status: associated ? "ASSOCIATED" : "UNASSOCIATED",
      reason: associated ? "EVIDENCE_CONFIRMED" : "EVIDENCE_INSUFFICIENT",
      hot_clube: hotClube,
      capitolio: capitolio,
      evidence,
    };
  });
}
