// BEATMAPPED-UK-MAJOR-EVENT-ACQUISITION-TIER1-01 — Phase 1/2.
//
// Derives the acquisition population from the FROZEN UK major-event venue
// census, programmatically. There is deliberately no hand-maintained
// second list of URLs anywhere in this package: the census artifacts are
// the single source of truth, so the population cannot silently drift from
// what was frozen and reviewed.
//
// This module is pure and offline. It reads the census artifacts and
// joins them; it never fetches, never writes, and never admits anything.

import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const CENSUS_DIR = resolve(ROOT, "research/major-event-venues/uk-major-event-census-01");

/** The readiness tier this package is scoped to. Tier 2 is a later package. */
export const TARGET_READINESS = "READY_TIER1";

/**
 * Source families this package can acquire with EXISTING deterministic
 * capability, mapped to the collector that already handles them. Adding a
 * family here would mean building a new collector, which this package
 * explicitly must not do.
 */
export const SUPPORTED_FAMILIES = new Map([
  ["JSON_LD_EVENT", "ingestion/json-ld"],
  ["WORDPRESS_TRIBE_API", "ingestion/events-calendar-api"],
]);

/**
 * The event-domain label for an acquired observation comes from the
 * census's own governed calendar classification — NEVER inferred from the
 * venue's type. A stadium's calendar is not "sport" because it is a
 * stadium; it is sport because the census recorded that calendar as
 * publishing SPORT_FIXTURES. Inferring from venue type is exactly how a
 * conference at an arena becomes a "concert".
 */
export function eventDomainFromCensus(source) {
  const calendarClass = source?.source_type;
  return typeof calendarClass === "string" && calendarClass.trim() !== "" ? calendarClass : "OTHER_MAJOR_EVENTS";
}

const readJson = async (name) => JSON.parse(await readFile(resolve(CENSUS_DIR, name), "utf8"));

/**
 * Load the READY_TIER1 acquisition population, joining each calendar
 * source to its census venue. Every field a downstream consumer needs is
 * carried explicitly so the retained dataset can be read without the
 * census to hand.
 */
export async function loadTier1Population({ censusDir } = {}) {
  const dir = censusDir ?? CENSUS_DIR;
  const read = async (name) => JSON.parse(await readFile(resolve(dir, name), "utf8"));

  const calendarsDoc = await read("calendar-sources.json");
  const venuesDoc = await read("venues.json");
  const venues = new Map(venuesDoc.venues.map((venue) => [venue.venue_census_id, venue]));

  const selected = calendarsDoc.calendar_sources.filter((source) => source.acquisition_readiness === TARGET_READINESS);

  const population = selected.map((source) => {
    const venue = venues.get(source.venue_census_id) ?? null;
    return {
      calendar_source_id: source.calendar_source_id,
      venue_census_id: source.venue_census_id,
      venue_name: venue?.canonical_name ?? null,
      city: venue?.city ?? null,
      nation: venue?.nation ?? null,
      venue_type: venue?.venue_type ?? null,
      calendar_url: source.source_url,
      census_calendar_class: source.source_type,
      event_domain: eventDomainFromCensus(source),
      sport: source.sport ?? null,
      source_family: source.source_family,
      collector_route: source.collector_route,
      collector_module: SUPPORTED_FAMILIES.get(source.source_family) ?? null,
      census_last_checked: source.fingerprinted_at ?? source.last_checked ?? null,
      census_http_status: source.http_status ?? null,
      acquisition_readiness: source.acquisition_readiness,
      census_provenance: {
        census_id: calendarsDoc.census_id ?? "uk-major-event-census-01",
        venue_workstream: venue?.provenance?.workstream ?? null,
        family_audit_verdict: source.family_audit_verdict ?? null,
      },
    };
  }).sort((a, b) => a.calendar_source_id.localeCompare(b.calendar_source_id));

  return {
    population,
    counts: summarisePopulation(population),
    unsupported: population.filter((entry) => entry.collector_module === null),
  };
}

/** Deterministic population counts, for the run record and for tests. */
export function summarisePopulation(population) {
  const byFamily = {};
  const byDomain = {};
  const byNation = {};
  const venueIds = new Set();
  for (const entry of population) {
    venueIds.add(entry.venue_census_id);
    const family = (byFamily[entry.source_family] ??= { sources: 0, venues: new Set() });
    family.sources += 1;
    family.venues.add(entry.venue_census_id);
    byDomain[entry.event_domain] = (byDomain[entry.event_domain] ?? 0) + 1;
    byNation[entry.nation ?? "(unknown)"] = (byNation[entry.nation ?? "(unknown)"] ?? 0) + 1;
  }
  return {
    sources: population.length,
    venues: venueIds.size,
    by_family: Object.fromEntries(Object.entries(byFamily).map(([key, value]) => [key, { sources: value.sources, venues: value.venues.size }])),
    by_event_domain: Object.fromEntries(Object.entries(byDomain).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
    by_nation: Object.fromEntries(Object.entries(byNation).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))),
  };
}

/**
 * Venues served by more than one READY_TIER1 source. Phase 12: these are
 * reported so cross-source overlap is visible, but their observations are
 * NEVER merged — canonical Event reconciliation is a later package, and
 * merging here would destroy the evidence that two sources said it.
 */
export function venuesWithMultipleSources(population) {
  const byVenue = new Map();
  for (const entry of population) {
    byVenue.set(entry.venue_census_id, [...(byVenue.get(entry.venue_census_id) ?? []), entry]);
  }
  return [...byVenue.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([venueCensusId, entries]) => ({
      venue_census_id: venueCensusId,
      venue_name: entries[0].venue_name,
      city: entries[0].city,
      nation: entries[0].nation,
      source_count: entries.length,
      sources: entries.map((entry) => ({
        calendar_source_id: entry.calendar_source_id,
        calendar_url: entry.calendar_url,
        source_family: entry.source_family,
        event_domain: entry.event_domain,
      })),
    }))
    .sort((a, b) => b.source_count - a.source_count || a.venue_census_id.localeCompare(b.venue_census_id));
}

export { readJson };
