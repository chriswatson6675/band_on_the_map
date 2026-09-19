// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — candidate provider reading
// this repository's own retained, governed source-investigation dossiers
// (research/source-investigations/<id>/investigation.json,
// docs/SOURCE_INVESTIGATION_POLICY.md). This is "research already paid
// for" per Phase 5 of this package's brief: a READY_FOR_ACTIVATION
// investigation already carries PROVEN identity, a resolved
// acquisition_class, and at least one PUBLIC+CONFIRMED data path — this
// provider only reads and reshapes that retained evidence, never
// re-investigates or invents anything.

import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const INVESTIGATIONS_DIR = "research/source-investigations";

/**
 * Deterministically place an investigation within the KNOWN, CLOSED city
 * estate (never a guess at a new city). Matches when the investigation's
 * own id/venue_reference text names a known city — either signal alone is
 * sufficient (both are retained, investigator-asserted evidence, not a
 * harvester invention); if neither matches, returns null and the caller
 * must defer the candidate as identity-ambiguous rather than place it in
 * an unproven city.
 */
export function deriveCityForInvestigation(record, knownCities) {
  const idLower = String(record?.investigation_id ?? "").toLowerCase();
  const referenceLower = String(record?.venue_reference ?? "").toLowerCase();

  for (const city of knownCities) {
    const keySlug = city.city_key.toLowerCase();
    const nameLower = String(city.display_name ?? "").toLowerCase();
    const idHasCity = new RegExp(`(^|-)${keySlug}(-|$)`).test(idLower);
    const referenceHasCity = nameLower.length > 0 && referenceLower.includes(nameLower);
    if (idHasCity || referenceHasCity) return city;
  }
  return null;
}

/** Best public+confirmed programme URL this investigation already retained, or null. */
function selectProgrammeUrl(record) {
  const confirmed = (record?.data_paths ?? []).find(
    (p) => p?.access === "PUBLIC" && p?.status === "CONFIRMED" && typeof p?.url === "string",
  );
  return confirmed?.url ?? null;
}

/** A short, human-readable canonical name out of venue_reference's free-text description (everything before the first "(" or "," — the investigation's own leading descriptor). */
function deriveCanonicalName(venueReference) {
  const text = String(venueReference ?? "").trim();
  const cut = text.search(/[(,]/);
  return (cut > 0 ? text.slice(0, cut) : text).trim();
}

/**
 * Load every READY_FOR_ACTIVATION investigation and reshape it into this
 * controller's common Candidate shape. Non-READY_FOR_ACTIVATION records
 * (DEFER/HUMAN_REVIEW/REJECT/READY_FOR_OFFLINE_PROOF) are skipped — this
 * provider is deliberately Tier-1-scoped, not a general investigation
 * reader.
 */
export async function loadInvestigationCandidates({ root = ROOT, knownCities } = {}) {
  const dir = resolve(root, INVESTIGATIONS_DIR);
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error?.code === "ENOENT") return [];
    throw error;
  }

  const candidates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue; // skip governance fixtures / cross-site .md reports at the root
    const investigationPath = resolve(dir, entry.name, "investigation.json");
    let record;
    try {
      record = JSON.parse(await readFile(investigationPath, "utf8"));
    } catch {
      continue; // no investigation.json in this directory, or unreadable — not this provider's concern
    }

    if (record?.decision?.status !== "READY_FOR_ACTIVATION") continue;

    const city = deriveCityForInvestigation(record, knownCities);
    const canonicalName = deriveCanonicalName(record.venue_reference);

    candidates.push({
      canonical_name: canonicalName,
      city: city?.display_name ?? null,
      city_key: city?.city_key ?? null,
      country_code: city?.country_code ?? null,
      website: record.official_url ?? null,
      programme_url: selectProgrammeUrl(record),
      acquisition_class: record.site_classification?.acquisition_class ?? "UNKNOWN",
      identity_clear: city != null && canonicalName.length > 0 && record.identity?.status === "PROVEN",
      provenance: {
        kind: "INVESTIGATION",
        investigation_id: record.investigation_id,
        path: `${INVESTIGATIONS_DIR}/${entry.name}/investigation.json`,
      },
    });
  }
  return candidates;
}

export { ROOT as INVESTIGATIONS_PROVIDER_ROOT };
