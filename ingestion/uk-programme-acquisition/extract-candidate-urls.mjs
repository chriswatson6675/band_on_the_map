// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 — extracts a
// candidate official-website URL for a canonical UK venue purely from
// already-committed evidence already retained on the venue record itself
// (venues/uk.json) — zero new network calls, zero new research. Every
// source this reads was itself already retained with its own provenance
// by an earlier package (BEATMAPPED-UK-MUSIC-VENUES-GEOCODE-ONBOARD-
// PUBLISH-LIVE-01's UK_MAJOR_EVENT_CENSUS entries, and BEATMAPPED-UK-
// NATIONAL-VENUE-BULK-OSM-COMPLETION-02's DISCOVERY_OSM_TAGS entries,
// which embed the OSM element's own website/contact:website tag).
//
// Pure module — no network, no filesystem.

const WEBSITE_EVIDENCE_KINDS = new Set(["UK_MAJOR_EVENT_CENSUS", "OFFICIAL_VENUE_WEBSITE"]);

function isHttpUrl(value) {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

/**
 * Pull the embedded OSM tags JSON out of a DISCOVERY_OSM_TAGS evidence
 * note (ingestion/venue-discovery/providers/overpass.mjs's own
 * `OSM_TAGS=${JSON.stringify(tags)}` note shape — see
 * ingestion/uk-national-discovery/admission.mjs's parseOsmTagsEvidence,
 * mirrored here rather than imported, since this module must stay a pure,
 * dependency-free reader of the already-committed venue record).
 */
function parseOsmTagsFromNote(note) {
  if (typeof note !== "string") return null;
  const marker = "OSM_TAGS=";
  const index = note.indexOf(marker);
  if (index === -1) return null;
  try {
    return JSON.parse(note.slice(index + marker.length));
  } catch {
    return null;
  }
}

/**
 * The one candidate website URL for a venue, or null if none of its
 * retained evidence carries one. Preference order: an explicit,
 * human-verified evidence URL (UK_MAJOR_EVENT_CENSUS /
 * OFFICIAL_VENUE_WEBSITE) before a raw OSM tag value — never the reverse,
 * since the census entries were themselves individually reviewed at
 * onboarding time (see venues/uk.json's own evidence.note text) while an
 * OSM tag is unreviewed crowd-sourced data.
 */
export function extractCandidateWebsite(venue) {
  for (const evidence of venue.evidence ?? []) {
    if (WEBSITE_EVIDENCE_KINDS.has(evidence.kind) && isHttpUrl(evidence.url)) {
      return { url: evidence.url.trim(), evidence_kind: evidence.kind };
    }
  }
  for (const evidence of venue.evidence ?? []) {
    if (evidence.kind !== "DISCOVERY_OSM_TAGS") continue;
    const tags = parseOsmTagsFromNote(evidence.note);
    const site = tags?.website ?? tags?.["contact:website"];
    if (isHttpUrl(site)) return { url: site.trim(), evidence_kind: "DISCOVERY_OSM_TAGS" };
  }
  return null;
}

/** Normalises a URL for cross-venue duplicate detection only (never used as the URL actually fetched) — strips protocol/www/trailing slash, lowercases. */
export function normaliseWebsiteForDedup(url) {
  return url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

/**
 * Build the full candidate list across every venue, deduplicated by
 * normalised website. When two or more DIFFERENT venue_ids genuinely
 * share the same official website (a real, observed pattern — e.g. one
 * multi-auditorium complex with several named performance spaces each
 * onboarded as its own canonical venue), this package's own brief (Phase
 * 8: "Ambiguous external multi-venue calendars must fail closed at the
 * record level rather than attach events to the wrong venue") requires
 * failing closed rather than guessing which venue an event belongs to.
 * Exactly ONE source is ever created per distinct website — deterministically
 * the venue whose canonical_name is lexicographically first, so the choice
 * is reproducible — and every OTHER venue sharing that website is recorded
 * in `skippedSharedWebsite`, never silently dropped, never given its own
 * conflicting registry entry (sources/registry/validate.mjs's own
 * validateRegistry() independently rejects duplicate official_website
 * values across entries — this would fail structurally even if attempted).
 */
export function buildCandidateUrlEstate(venues) {
  const byNormalisedUrl = new Map();
  const noWebsite = [];

  for (const venue of venues) {
    const candidate = extractCandidateWebsite(venue);
    if (!candidate) {
      noWebsite.push(venue.venue_id);
      continue;
    }
    const key = normaliseWebsiteForDedup(candidate.url);
    if (!byNormalisedUrl.has(key)) byNormalisedUrl.set(key, []);
    byNormalisedUrl.get(key).push({ venue, candidate });
  }

  const sources = [];
  const skippedSharedWebsite = [];

  for (const entries of byNormalisedUrl.values()) {
    if (entries.length === 1) {
      sources.push(entries[0]);
      continue;
    }
    const sorted = [...entries].sort((a, b) => a.venue.canonical_name.localeCompare(b.venue.canonical_name));
    sources.push(sorted[0]);
    for (const skipped of sorted.slice(1)) {
      skippedSharedWebsite.push({
        venue_id: skipped.venue.venue_id,
        canonical_name: skipped.venue.canonical_name,
        shared_website: skipped.candidate.url,
        attributed_to_venue_id: sorted[0].venue.venue_id,
      });
    }
  }

  return { sources, skippedSharedWebsite, noWebsite };
}
