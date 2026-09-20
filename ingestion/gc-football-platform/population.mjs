// BEATMAPPED-UK-GC-FOOTBALL-PLATFORM-ACQUISITION-01 — the candidate population.
//
// Derived programmatically from the FROZEN census. There is no
// hand-maintained club list in this package.
//
// Membership is deliberately decided by CENSUS FIELDS ONLY —
//   source_type = SPORT_FIXTURES, sport = football,
//   source_family = EMBEDDED_NUXT_STATE
// — and NOT by the source URL's path. An earlier note put the estate at
// 47 by additionally requiring a "/matches" path, but a URL path is a
// naming convention, not a platform fact, so it cannot define which
// sources belong to a platform. The field-only derivation yields 54
// candidates; whether each is genuinely this platform is then settled by
// live detection (see detect.mjs), not by assumption.
//
// Pure and offline: reads census artifacts, fetches nothing.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const CENSUS_DIR = resolve(ROOT, "research/major-event-venues/uk-major-event-census-01");

export const CANDIDATE_CRITERIA = {
  source_type: "SPORT_FIXTURES",
  sport: "football",
  source_family: "EMBEDDED_NUXT_STATE",
};

const domainOf = (url) => {
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); } catch { return null; }
};

/** Load the gc candidate population, joined to its census venues. */
export async function loadCandidatePopulation({ censusDir } = {}) {
  const dir = censusDir ?? CENSUS_DIR;
  const read = async (name) => JSON.parse(await readFile(resolve(dir, name), "utf8"));

  const calendarsDoc = await read("calendar-sources.json");
  const venuesDoc = await read("venues.json");
  const venues = new Map(venuesDoc.venues.map((venue) => [venue.venue_census_id, venue]));

  const all = calendarsDoc.calendar_sources ?? calendarsDoc.sources ?? [];
  const candidates = all
    .filter((source) =>
      source.source_type === CANDIDATE_CRITERIA.source_type &&
      String(source.sport ?? "").toLowerCase() === CANDIDATE_CRITERIA.sport &&
      source.source_family === CANDIDATE_CRITERIA.source_family)
    .map((source) => {
      const venue = venues.get(source.venue_census_id);
      return {
        source_id: source.calendar_source_id,
        source_url: source.source_url,
        domain: domainOf(source.source_url),
        census_venue_id: source.venue_census_id,
        census_venue_name: venue?.canonical_name ?? null,
        census_venue_city: venue?.city ?? null,
        census_venue_nation: venue?.nation ?? null,
        census_venue_postcode: venue?.postcode ?? null,
        census_readiness: source.acquisition_readiness ?? null,
        event_domain: source.source_type,
      };
    })
    .sort((a, b) => a.source_id.localeCompare(b.source_id));

  const domains = new Set(candidates.map((entry) => entry.domain).filter(Boolean));
  const venueIds = new Set(candidates.map((entry) => entry.census_venue_id));

  return {
    candidates,
    counts: {
      candidate_sources: candidates.length,
      distinct_domains: domains.size,
      distinct_census_venues: venueIds.size,
    },
    /** Domains serving more than one census venue — a real platform case. */
    multi_venue_domains: [...domains]
      .map((domain) => ({
        domain,
        venues: [...new Set(candidates.filter((entry) => entry.domain === domain).map((entry) => entry.census_venue_name))],
      }))
      .filter((entry) => entry.venues.length > 1),
  };
}
