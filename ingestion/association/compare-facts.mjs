// Generic, source-agnostic per-field fact comparison between two
// Observations already established (by e.g.
// ingestion/association/hot-clube-capitolio.mjs) to describe the same
// real-world gig.
//
// This module never resolves a disagreement into a single fact — see
// BOTM-MULTISOURCE-LINKS-01's "No source-precedence policy is authorised"
// rule. Every field is retained from BOTH sides; `agree` only records
// whether the two sides' own values happened to be identical. Nothing
// here is fuzzy or inferred: it is plain equality on each Observation's
// own already-parsed fields.

function fact(valueA, valueB, agree) {
  return { agree, values: [valueA, valueB] };
}

/**
 * Compare two Observations already known (by a caller's association
 * logic) to describe the same gig. Returns a per-field record — never a
 * merged/resolved fact.
 */
export function compareObservationFacts(a, b) {
  const aTitle = a?.title ?? null;
  const bTitle = b?.title ?? null;
  const aDate = a?.start?.date ?? null;
  const bDate = b?.start?.date ?? null;
  const aStartRaw = a?.start?.raw ?? null;
  const bStartRaw = b?.start?.raw ?? null;
  const aVenueText = a?.location_text ?? null;
  const bVenueText = b?.location_text ?? null;
  const aPrice = a?.price_text ?? null;
  const bPrice = b?.price_text ?? null;

  return {
    sources: [a?.source_id ?? null, b?.source_id ?? null],
    title: fact(aTitle, bTitle, aTitle === bTitle),
    date: fact(aDate, bDate, aDate === bDate && aDate != null),
    start_time_raw: fact(aStartRaw, bStartRaw, aStartRaw === bStartRaw),
    venue_text: fact(aVenueText, bVenueText, aVenueText === bVenueText),
    price_text: fact(aPrice, bPrice, aPrice === bPrice),
  };
}

// BOTM-MULTISOURCE-LINKS-01A: `agree === false` on its own is NOT a safe
// customer-facing "Sources differ" signal. Two sources routinely express
// the very same real fact in different words or formats — Hot Clube's
// title repeats a series suffix Capitólio's own title omits, each source
// renders its own raw date/time text in its own format, each names the
// venue's sub-location slightly differently — and `agree` above
// correctly records all of that as a literal string mismatch (it must,
// so the underlying evidence stays honest — see compareObservationFacts
// above). None of that is a genuine contradiction, and treating it as
// one produced a misleading warning on every one of this proof's 5
// associated pairs.
//
// A field only ever qualifies as a safe material-conflict signal when
// BOTH sides supply a directly comparable, already-normalised, non-null
// value in the SAME representation — so a literal mismatch between them
// can only mean the two sources actually assert different facts, not
// that they merely phrased/formatted the same fact differently. In this
// bounded proof, only `price_text` qualifies: when present, both sides
// give it as a plain price string in the same shape (e.g. "5€"), so two
// different non-null values are a real contradiction. `title`,
// `start_time_raw`, and `venue_text` are deliberately excluded — none is
// safely comparable without semantic normalisation this project does
// not perform (see the module doc above and
// ingestion/association/hot-clube-capitolio.mjs's non-fuzzy-matching
// rule). `date` is excluded too: it is already required to agree as a
// precondition of association (see hot-clube-capitolio.mjs), so it can
// never itself carry a conflict for an associated pair.
//
// null vs a value, or both null, is NEVER a conflict by this rule — it
// means one source supplies information the other is silent on, not
// that the two disagree. If a future field needs the same treatment,
// add it here deliberately; this never infers comparability generically,
// and never performs fuzzy/semantic resolution.
const MATERIALLY_COMPARABLE_FIELDS = ["price_text"];

/**
 * A restrained, evidence-safe signal for whether a comparison produced
 * by compareObservationFacts() contains a GENUINE material contradiction
 * — safe to surface to a user as "Sources differ". Returns false (fails
 * closed, no warning) whenever the currently available fields cannot
 * safely express a contradiction, per MATERIALLY_COMPARABLE_FIELDS
 * above. Never mutates or discards `comparison` — the full evidence
 * remains exactly as compareObservationFacts() produced it.
 */
export function hasMaterialConflict(comparison) {
  if (!comparison) return false;
  return MATERIALLY_COMPARABLE_FIELDS.some((field) => {
    const entry = comparison[field];
    if (!entry) return false;
    const [a, b] = entry.values;
    return a != null && b != null && a !== b;
  });
}
