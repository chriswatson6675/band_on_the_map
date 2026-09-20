// BEATMAPPED-UK-MAJOR-EVENT-VENUE-ATTRIBUTION-01 — Phases 14/15.
//
//   node ingestion/major-event-attribution/run-attribution.mjs
//
// Reads the retained acquisition Observations and the frozen census, and
// writes a SEPARATE derived attribution layer. It is pure and offline —
// it fetches nothing.
//
// The source Observations are READ ONLY. This package never rewrites a
// venue_name, never replaces source truth with a census venue, and never
// creates canonical Event identity.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCensusIndex } from "./census-index.mjs";
import { resolveAll } from "./resolve.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ACQUISITION = resolve(ROOT, "research/major-event-acquisition/uk-tier1-01");
const OUT_DIR = resolve(ROOT, "research/major-event-attribution/uk-tier1-01");

const writeJson = async (path, value) => {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
};

const tally = (items, keyFn) => {
  const counts = {};
  for (const item of items) {
    const key = keyFn(item);
    if (key == null) continue;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
};

/** Deterministic summary computed purely from the attribution records. */
export function summariseAttribution(records) {
  const resolved = records.filter((record) => record.resolved_venue_census_id);
  const redirected = records.filter((record) => record.attribution_state === "RESOLVED_TO_DIFFERENT_CENSUS_VENUE");

  const byDomain = {};
  for (const record of records) {
    const domain = (byDomain[record.event_domain ?? "(unknown)"] ??= {
      observations: 0, source_venue_match: 0, resolved_to_different: 0, unresolved: 0, resolved_venues: new Set(),
    });
    domain.observations += 1;
    if (record.attribution_state === "SOURCE_VENUE_MATCH") domain.source_venue_match += 1;
    if (record.attribution_state === "RESOLVED_TO_DIFFERENT_CENSUS_VENUE") domain.resolved_to_different += 1;
    if (!record.resolved_venue_census_id) domain.unresolved += 1;
    if (record.resolved_venue_census_id) domain.resolved_venues.add(record.resolved_venue_census_id);
  }

  return {
    total_observations: records.length,
    by_attribution_state: tally(records, (record) => record.attribution_state),
    by_confidence: tally(records, (record) => record.confidence),
    by_method: tally(records.filter((r) => r.attribution_method), (record) => record.attribution_method),
    resolved: resolved.length,
    unresolved: records.length - resolved.length,
    redirected_away_from_source_venue: redirected.length,
    distinct_resolved_venues: new Set(resolved.map((record) => record.resolved_venue_census_id)).size,
    by_event_domain: Object.fromEntries(Object.entries(byDomain).map(([key, value]) => [key, {
      observations: value.observations,
      source_venue_match: value.source_venue_match,
      resolved_to_different: value.resolved_to_different,
      unresolved: value.unresolved,
      distinct_resolved_venues: value.resolved_venues.size,
    }])),
    events_per_resolved_venue: Object.fromEntries(
      Object.entries(tally(resolved, (record) => record.resolved_venue_name)),
    ),
  };
}

async function run() {
  const index = await buildCensusIndex();
  const acquisition = JSON.parse(await readFile(resolve(ACQUISITION, "observations.json"), "utf8"));
  const observations = acquisition.observations;
  const derivedAt = new Date().toISOString();

  console.log(`census index: ${index.counts.venues} venues, ${index.counts.distinct_names} governed names`);
  console.log(`  names claimed by more than one venue: ${index.counts.names_claimed_by_multiple_venues}`);
  console.log(`observations to attribute: ${observations.length}\n`);

  const records = resolveAll(observations, index, { derivedAt });
  const summary = summariseAttribution(records);

  // Every observation must receive exactly one attribution record.
  const refs = new Set(records.map((record) => `${record.source_id}||${record.source_record_id}`));
  if (refs.size !== observations.length) {
    console.error(`STOP: ${observations.length} observations produced ${refs.size} distinct attribution refs`);
    process.exitCode = 1;
    return;
  }

  console.log(`states     : ${JSON.stringify(summary.by_attribution_state)}`);
  console.log(`confidence : ${JSON.stringify(summary.by_confidence)}`);
  console.log(`resolved   : ${summary.resolved} / ${records.length}  (${summary.distinct_resolved_venues} distinct venues)`);
  console.log(`redirected away from the source's own census venue: ${summary.redirected_away_from_source_venue}`);

  const unresolved = records.filter((record) => !record.resolved_venue_census_id);

  await writeJson(resolve(OUT_DIR, "attributions.json"), {
    artifact_type: "UK_MAJOR_EVENT_VENUE_ATTRIBUTION",
    run_id: "uk-tier1-01",
    derived_at: derivedAt,
    source_dataset: "research/major-event-acquisition/uk-tier1-01/observations.json",
    census: "research/major-event-venues/uk-major-event-census-01/venues.json",
    note: "A DERIVED layer. Source Observations are unmodified: venue_name remains the source's own words, and source_census_venue_id remains the provenance of the calendar the event was fetched from. resolved_venue_census_id is a separate decision about where the event actually occurs.",
    count: records.length,
    attributions: records,
  });

  await writeJson(resolve(OUT_DIR, "unresolved.json"), {
    artifact_type: "UK_MAJOR_EVENT_VENUE_ATTRIBUTION_UNRESOLVED",
    run_id: "uk-tier1-01",
    derived_at: derivedAt,
    note: "Every observation that did not resolve to exactly one census venue, with the exact reason. Preferring unresolved over speculative is deliberate: a wrong venue is worse than no venue.",
    count: unresolved.length,
    unresolved: unresolved.map((record) => ({
      source_id: record.source_id,
      source_record_id: record.source_record_id,
      source_census_venue_name: record.source_census_venue_name,
      source_reported_venue_name: record.source_reported_venue_name,
      source_reported_location_text: record.source_reported_location_text,
      event_domain: record.event_domain,
      attribution_state: record.attribution_state,
      confidence: record.confidence,
      evidence: record.evidence,
      ambiguity_candidates: record.ambiguity_candidates,
    })),
  });

  await writeJson(resolve(OUT_DIR, "evidence.json"), {
    artifact_type: "UK_MAJOR_EVENT_VENUE_ATTRIBUTION_EVIDENCE",
    run_id: "uk-tier1-01",
    derived_at: derivedAt,
    note: "The evidence behind each decision, and the index the decision was made against. Retained so any attribution can be re-checked without re-running.",
    census_index: index.counts,
    method_definitions: {
      GOVERNED_NAME_OR_ALIAS: "the source's venue name equals a census canonical name or a RETAINED alias",
      GOVERNED_NAME_WITHOUT_VENUE_TYPE_SUFFIX: "the source omitted a generic venue-type word the census name carries",
      SOURCE_CARRIED_EXTRA_VENUE_TYPE_SUFFIX: "the source carried a generic venue-type word the census name does not",
      VENUE_TYPE_SUFFIX_DIFFERS_ON_BOTH_SIDES: "both names carry a generic venue-type word, and they differ",
      GOVERNED_NAME_QUALIFIED_BY_CITY: "the source qualified the census name with the venue's own city",
      SOURCE_ADDRESS_NAMES_CENSUS_VENUE: "the source's own address text names the census venue, typically a named space within a larger site",
    },
    confidence_definitions: {
      HIGH: "a governed name or alias match whose geography the source's own location evidence positively confirms, or an address that names the venue outright",
      MEDIUM: "a unique governed match with agreeing but not confirming geography, or with no location evidence at all",
      REVIEW: "ambiguous, conflicting, or unmatched — a human decision is required",
    },
    per_observation: records.map((record) => ({
      source_id: record.source_id,
      source_record_id: record.source_record_id,
      attribution_state: record.attribution_state,
      attribution_method: record.attribution_method,
      confidence: record.confidence,
      evidence: record.evidence,
    })),
  });

  await writeJson(resolve(OUT_DIR, "summary.json"), {
    artifact_type: "UK_MAJOR_EVENT_VENUE_ATTRIBUTION_SUMMARY",
    run_id: "uk-tier1-01",
    derived_at: derivedAt,
    ...summary,
  });

  console.log(`\nRetained under research/major-event-attribution/uk-tier1-01/`);
}

await run();
