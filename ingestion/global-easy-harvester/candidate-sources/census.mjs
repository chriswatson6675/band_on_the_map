// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — candidate provider reading
// this repository's own retained venue-discovery census output
// (research/venue-discovery/<city>-01/census.json — the generic
// multi-source venue discovery framework's own artifact). This is the
// LOWEST-confidence, lowest-priority pool per Phase 5/candidate-pool.mjs:
// a NEW_DISCOVERY_CANDIDATE's `reported_website` is a discovery-stage
// hint (from OSM tags or open-data rows), not an investigator-confirmed
// official identity — acquireSource() itself is what proves or disproves
// it deterministically; this provider performs no investigation of its
// own.

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const VENUE_DISCOVERY_DIR = "research/venue-discovery";

function firstReportedWebsite(observations) {
  const withWebsite = (observations ?? []).find(
    (o) => typeof o?.reported_website === "string" && o.reported_website.trim() !== "",
  );
  return withWebsite?.reported_website ?? null;
}

function firstReportedName(observations) {
  return (observations ?? []).find((o) => typeof o?.reported_name === "string" && o.reported_name.trim() !== "")
    ?.reported_name ?? null;
}

export async function loadCensusCandidates({ root = ROOT, knownCities } = {}) {
  const dir = resolve(root, VENUE_DISCOVERY_DIR);
  let cityDirs;
  try {
    cityDirs = (await readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory());
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const candidates = [];
  for (const cityDir of cityDirs) {
    const censusPath = resolve(dir, cityDir.name, "census.json");
    let parsed;
    try {
      parsed = JSON.parse(await readFile(censusPath, "utf8"));
    } catch {
      continue; // no census.json in this discovery directory (e.g. a triage-only directory)
    }

    const fileCityLower = String(parsed?.city ?? "").toLowerCase().trim();
    const city =
      knownCities.find((c) => String(c.display_name ?? "").toLowerCase() === fileCityLower) ?? null;

    for (const record of parsed?.candidates ?? []) {
      if (record?.existing_registry_reconciliation?.status !== "NEW_DISCOVERY_CANDIDATE") continue;

      const website = firstReportedWebsite(record.observations);
      const canonicalName = firstReportedName(record.observations);
      if (!website || !canonicalName) continue;

      candidates.push({
        canonical_name: canonicalName,
        city: city?.display_name ?? parsed?.city ?? null,
        city_key: city?.city_key ?? null,
        country_code: city?.country_code ?? parsed?.country_code ?? null,
        website,
        programme_url: null,
        acquisition_class: null,
        identity_clear: city != null,
        provenance: {
          kind: "CENSUS",
          file: `${VENUE_DISCOVERY_DIR}/${cityDir.name}/census.json`,
          reconciled_candidate_id: record.reconciled_candidate_id ?? null,
        },
      });
    }
  }
  return candidates;
}

export { ROOT as CENSUS_PROVIDER_ROOT };
