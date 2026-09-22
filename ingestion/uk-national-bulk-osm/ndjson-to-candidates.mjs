// BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02 — turns
// pbf_extract.py's (optionally nation_filter.py-split) raw-OSM-element
// NDJSON output into this repository's own VenueDiscoveryCandidate shape,
// bucketed per coverage unit. Every element is parsed through
// ingestion/venue-discovery/providers/overpass.mjs's parseOverpassCandidates()
// completely UNCHANGED — the exact same function package-02's live
// Overpass sweep already uses — because pbf_extract.py deliberately
// writes each line in the same {type, id, lat, lon, tags} shape a live
// Overpass `out center tags;` response's elements[] already has. This
// file's only job is grouping and driving that existing parser; it never
// re-implements candidate construction itself.

import { createInterface } from "node:readline";
import { createReadStream } from "node:fs";

import { parseOverpassCandidates } from "../venue-discovery/providers/overpass.mjs";
import { assignCoverageUnit } from "./assign-coverage-unit.mjs";
import { partitionByEligibility } from "./candidate-eligibility.mjs";

/**
 * Read an NDJSON file of raw OSM elements, assign each to a coverage
 * unit by its own (lat, lon), and return a Map<coverage_unit_id,
 * VenueDiscoveryCandidate[]> covering every unit passed in `units`
 * (units with zero matched elements still get an empty array entry — see
 * checkpoint.mjs's COMPLETE_NO_CANDIDATES handling, which depends on
 * every unit being present, not just ones with candidates).
 *
 * Elements whose own coordinate falls outside every coverage unit are
 * never silently discarded — they are returned separately as
 * `unassigned`, each carrying its own OSM identity, so a genuine gap in
 * the coverage grid (or a bad source coordinate) is visible in the run's
 * own accounting rather than an invisible drop.
 *
 * candidate-eligibility.mjs's partitionByEligibility() runs BEFORE
 * candidate construction (founder correction, this package): a bare
 * noisy category (community_centre, pub, bar, ...) never reaches
 * parseOverpassCandidates() at all unless it carries explicit live-event
 * tag evidence or a strong existing-registry match — see that module's
 * own header. Filtered leads are returned separately as
 * `filteredGenericLeads`, retaining full OSM identity, never silently
 * dropped, never counted among candidates.
 */
export async function loadCandidatesByCoverageUnit(ndjsonPath, units, { retrievedAt = new Date().toISOString(), sourceLabel = "bulk-osm", registryRecords = [] } = {}) {
  const elementsByUnit = new Map(units.map((u) => [u.coverage_unit_id, []]));
  const unassignedElements = [];

  const rl = createInterface({ input: createReadStream(ndjsonPath, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const element = JSON.parse(trimmed);
    const unit = assignCoverageUnit(units, element.lat, element.lon);
    if (!unit) {
      unassignedElements.push(element);
      continue;
    }
    elementsByUnit.get(unit.coverage_unit_id).push(element);
  }

  const candidatesByUnit = new Map();
  let excludedTotal = [];
  let filteredGenericLeads = [];
  const signalCounts = {};

  for (const [unitId, rawElements] of elementsByUnit) {
    if (rawElements.length === 0) {
      candidatesByUnit.set(unitId, []);
      continue;
    }
    const { eligible, filtered, signalCounts: unitSignalCounts } = partitionByEligibility(rawElements, registryRecords);
    for (const [signal, count] of Object.entries(unitSignalCounts)) signalCounts[signal] = (signalCounts[signal] ?? 0) + count;
    filteredGenericLeads = filteredGenericLeads.concat(filtered.map((f) => ({ ...f, coverage_unit_id: unitId, source: sourceLabel })));

    if (eligible.length === 0) {
      candidatesByUnit.set(unitId, []);
      continue;
    }
    const { candidates, excluded } = parseOverpassCandidates(
      { elements: eligible },
      { city: unitId, country_code: "GB", retrieved_at: retrievedAt },
    );
    candidatesByUnit.set(unitId, candidates);
    excludedTotal = excludedTotal.concat(excluded.map((e) => ({ ...e, coverage_unit_id: unitId, source: sourceLabel })));
  }

  const { eligible: unassignedEligible, filtered: unassignedFiltered } = partitionByEligibility(unassignedElements, registryRecords);
  filteredGenericLeads = filteredGenericLeads.concat(unassignedFiltered.map((f) => ({ ...f, coverage_unit_id: "UNASSIGNED", source: sourceLabel })));
  const { candidates: unassignedCandidates, excluded: unassignedExcluded } = unassignedEligible.length
    ? parseOverpassCandidates({ elements: unassignedEligible }, { city: "UNASSIGNED", country_code: "GB", retrieved_at: retrievedAt })
    : { candidates: [], excluded: [] };

  return {
    candidatesByUnit,
    unassigned: unassignedCandidates,
    excludedMissingName: [...excludedTotal, ...unassignedExcluded.map((e) => ({ ...e, coverage_unit_id: "UNASSIGNED", source: sourceLabel }))],
    filteredGenericLeads,
    signalCounts,
  };
}
