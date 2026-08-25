// BEATMAPPED-ENRICHMENT-PILOT-01 — canonical Artist contract.
//
// An Artist is a first-class, performance-independent BeatMapped entity
// (docs/ARCHITECTURE.md's Artist object, previously defined but never
// implemented). "Bicep", "Bicep Live", and "Bicep (DJ set)" may all
// resolve to the same canonical Artist when evidence supports it —
// performance wording belongs to the event/appearance (an Observation's
// own title), never to the canonical Artist itself.
//
// This module is deliberately minimal: stable identity, a canonical
// display name, observed alias variants, and a small set of genre
// claims — no speculative fields (biography, images, socials, etc.).
// Mirrors the existing ingestion/venue/contract.mjs conventions
// (deterministic id derivation, createX()/validateX() pair, fail-closed
// validation) so this fits the repository's established shape rather
// than inventing a new one.
//
// Identity resolution is conservative by product decision: similar
// names alone are never sufficient to treat two Observations as the
// same canonical Artist (see ingestion/artist/resolver.mjs, which only
// ever resolves via an explicit, evidence-backed link — never fuzzy
// name matching).

export const GENRE_CONFIDENCE_LEVELS = new Set(["HIGH", "MODERATE", "LOW"]);

// How a genre claim was arrived at. AI_ASSESSED_PUBLIC_KNOWLEDGE is the
// only method this pilot uses: a claim interpreted by AI from stable,
// widely-documented public knowledge about an artist's own body of work
// (not from any single ingested Observation, and never invented for an
// artist with no such public record). See docs/ARTIST_ENRICHMENT.md.
export const GENRE_CLAIM_METHODS = new Set(["AI_ASSESSED_PUBLIC_KNOWLEDGE"]);

function slug(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Deterministic Band on the Map artist ID, derived only from
 * canonical_name — never random/incrementing. The same canonical name
 * always produces the same ID.
 */
export function createArtistId(canonicalName) {
  return `artist-${slug(canonicalName)}`;
}

/**
 * One genre claim attached to an Artist.
 *
 *   family      - broad, public-facing genre family (e.g. "Rock",
 *                  "Electronic", "Metal") — kept simple per product
 *                  decision #10.
 *   tag         - a more specific tag underneath the family (e.g.
 *                  "Gothic Metal"), or null when only the broad family
 *                  is genuinely warranted.
 *   confidence  - HIGH | MODERATE | LOW — never a false-precision
 *                  numeric score (product decision: "do not pretend
 *                  confidence is scientifically precise").
 *   method      - how the claim was arrived at (see GENRE_CLAIM_METHODS).
 *   basis       - free-text provenance: enough detail to answer "why
 *                  does BeatMapped believe this Artist has this genre?"
 *   asserted_at - "YYYY-MM-DD" the claim was made, retained rather than
 *                  computed at read time.
 */
export function createGenreClaim(fields) {
  return {
    family: fields.family ?? null,
    tag: fields.tag ?? null,
    confidence: fields.confidence ?? null,
    method: fields.method ?? null,
    basis: fields.basis ?? null,
    asserted_at: fields.asserted_at ?? null,
  };
}

export function validateGenreClaim(claim) {
  const errors = [];
  if (typeof claim?.family !== "string" || claim.family.trim() === "") {
    errors.push("genre claim family is required");
  }
  if (claim?.tag != null && typeof claim.tag !== "string") {
    errors.push("genre claim tag must be a string or null");
  }
  if (!GENRE_CONFIDENCE_LEVELS.has(claim?.confidence)) {
    errors.push(`genre claim confidence must be one of ${[...GENRE_CONFIDENCE_LEVELS].join(", ")}`);
  }
  if (!GENRE_CLAIM_METHODS.has(claim?.method)) {
    errors.push(`genre claim method must be one of ${[...GENRE_CLAIM_METHODS].join(", ")}`);
  }
  if (typeof claim?.basis !== "string" || claim.basis.trim() === "") {
    errors.push("genre claim basis is required (why BeatMapped believes this)");
  }
  if (typeof claim?.asserted_at !== "string" || Number.isNaN(Date.parse(claim.asserted_at))) {
    errors.push("genre claim asserted_at must be a valid date string");
  }
  return errors;
}

/**
 * Build one canonical Artist. artist_id defaults to
 * createArtistId(canonical_name) when not explicitly supplied. Throws if
 * the resulting Artist fails validateArtist().
 */
export function createArtist(fields) {
  const artist = {
    artist_id: fields.artist_id ?? createArtistId(fields.canonical_name),
    canonical_name: fields.canonical_name ?? null,
    aliases: fields.aliases ?? [],
    genres: (fields.genres ?? []).map((g) => (g && typeof g === "object" ? createGenreClaim(g) : g)),
  };

  const errors = validateArtist(artist);
  if (errors.length > 0) {
    throw new Error(`Invalid Artist: ${errors.join("; ")}`);
  }
  return artist;
}

/**
 * Return an array of validation error strings (empty if valid). Never
 * throws. An Artist may legitimately have zero genres (enrichment is
 * separate, later work per Observation -> Artist linking) — this
 * contract does not require at least one.
 */
export function validateArtist(artist) {
  const errors = [];

  if (!artist?.artist_id) errors.push("artist_id is required");
  if (typeof artist?.canonical_name !== "string" || artist.canonical_name.trim() === "") {
    errors.push("canonical_name is required");
  }

  if (!Array.isArray(artist?.aliases)) {
    errors.push("aliases must be an array");
  } else if (artist.aliases.some((a) => typeof a !== "string" || a.trim() === "")) {
    errors.push("every alias must be a non-empty string");
  }

  if (!Array.isArray(artist?.genres)) {
    errors.push("genres must be an array");
  } else {
    artist.genres.forEach((claim, i) => {
      for (const err of validateGenreClaim(claim)) {
        errors.push(`genres[${i}]: ${err}`);
      }
    });
  }

  return errors;
}
