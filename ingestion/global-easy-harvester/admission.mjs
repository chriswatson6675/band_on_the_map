// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — controlled admission of a
// Tier-1-proven candidate into this repository's EXISTING canonical
// registries (venues/<city>.json, sources/<city>.json,
// venues/source-venue-mappings.json). No shadow registry: every write
// goes through the same createVenue()/validateVenue()
// (ingestion/venue/contract.mjs) and validateEntry()/validateRegistry()
// (sources/registry/validate.mjs) functions the rest of this repository
// already uses, and every write is atomic (tmp + rename) and idempotent
// (a rerun against an already-admitted candidate writes nothing new).
//
// DELIBERATELY CONSERVATIVE lifecycle placement: this controller proves
// only the ACQUISITION path (a real, deterministic fetch — see
// tier1-gate.mjs). It performs no rights/licensing research of its own
// (docs/DATA_RIGHTS.md requires that to be genuinely evidenced, not
// inferred from public visibility), so every source this module admits
// is written with rights_status: "UNKNOWN" and lifecycle_status stops at
// "TECHNICALLY_REVIEWED" — never "ENABLED". Advancing a source to
// RIGHTS_REVIEWED/ENABLED remains "a separate, explicitly-authorised
// action or package" per docs/SOURCE_INVESTIGATION_POLICY.md's own
// "Investigation and activation are separate" rule — this module does not
// take that action on this package's behalf.

import { readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { createVenue } from "../venue/contract.mjs";
import { validateEntry, validateRegistry } from "../../sources/registry/validate.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const COLLECTOR_TO_ACQUISITION_METHOD = new Map([
  ["JSON_LD_EVENT", "JSON_LD_EVENT"],
  ["STATIC_HTML_CARDS", "STABLE_EVENT_PAGE"],
  ["EMBEDDED_NEXT_DATA", "EMBEDDED_JSON"],
  ["EMBEDDED_NUXT_STATE", "EMBEDDED_JSON"],
  ["EMBEDDED_SVELTEKIT_DATA", "EMBEDDED_JSON"],
  ["OTHER_EMBEDDED_APP_STATE", "EMBEDDED_JSON"],
]);

function mapCollectorToAcquisitionMethod(collector) {
  return COLLECTOR_TO_ACQUISITION_METHOD.get(collector) ?? "UNKNOWN";
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJsonAtomic(path, doc) {
  const dir = dirname(path);
  const tmpPath = resolve(dir, `.${randomUUID()}.tmp`);
  await writeFile(tmpPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");
  await rename(tmpPath, path);
}

function todayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function provenanceResearchId(candidate) {
  if (candidate.provenance?.kind === "INVESTIGATION") return candidate.provenance.investigation_id;
  if (candidate.provenance?.kind === "VENUE_ESTATE") return `venue-estate:${candidate.provenance.file}#${candidate.provenance.index}`;
  return `census:${candidate.provenance?.reconciled_candidate_id ?? candidate.venue_id}`;
}

/**
 * Admit one Tier-1-proven candidate. `acquisitionResult` must be an
 * ACQUISITION_PROVEN SourceAcquisitionResult (see tier1-gate.mjs). Returns
 * a structured outcome describing exactly what was written (or would have
 * been written, in `dryRun` mode) — never throws for an ordinary
 * validation failure; that is reported as `{ admitted: false, errors }`
 * instead, so one candidate's bad data can never abort the whole sweep.
 */
export async function admitCandidate(candidate, acquisitionResult, { root = ROOT, dryRun = false } = {}) {
  const venuesPath = resolve(root, "venues", `${candidate.city_key}.json`);
  const sourcesPath = resolve(root, "sources", `${candidate.city_key}.json`);
  const mappingsPath = resolve(root, "venues/source-venue-mappings.json");

  const [venuesDoc, sourcesDoc, mappingsDoc] = await Promise.all([
    readJson(venuesPath),
    readJson(sourcesPath),
    readJson(mappingsPath),
  ]);

  let venueWritten = false;
  let venue = candidate.existing_venue;
  if (!venue) {
    try {
      venue = createVenue({
        venue_id: candidate.venue_id,
        canonical_name: candidate.canonical_name,
        country_code: candidate.country_code,
        city: candidate.city,
        municipality: candidate.city,
        address: candidate.address ?? null,
        location_status: "ADDRESS_ONLY",
        evidence: [{ url: candidate.website, kind: "OFFICIAL_VENUE_WEBSITE", note: "Retained via BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 Tier-1 acquisition proof." }],
      });
    } catch (error) {
      return { admitted: false, errors: [String(error.message ?? error)] };
    }
    venueWritten = true;
  }

  const sourceAlreadyPresent = sourcesDoc.entries.some((e) => e.id === candidate.source_id);
  let sourceWritten = false;
  let sourceEntry = candidate.existing_source ?? sourcesDoc.entries.find((e) => e.id === candidate.source_id) ?? null;
  if (!sourceAlreadyPresent) {
    sourceEntry = {
      id: candidate.source_id,
      name: candidate.canonical_name,
      source_type: "VENUE",
      country_code: candidate.country_code,
      city: candidate.city,
      municipality: candidate.city ?? null,
      neighbourhood: null,
      physical_address: candidate.address ?? null,
      official_website: candidate.website ?? null,
      events_url: candidate.programme_url ?? acquisitionResult.programme_url ?? null,
      source_priority: "P3",
      scale: "UNKNOWN",
      genres: null,
      acquisition_method: mapCollectorToAcquisitionMethod(acquisitionResult.collector),
      acquisition_path_detail: `Proven by BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 via acquireSource(): collector=${acquisitionResult.collector}, proven_event_count=${acquisitionResult.proven_event_count}.`,
      monitoring_status: "TECHNICAL_PATH_PROVEN",
      rights_status: "UNKNOWN",
      rights_notes: null,
      rights_evidence_url: null,
      regular_future_listings: acquisitionResult.proven_event_count > 0 ? "YES" : "UNCLEAR",
      active_status: "ACTIVE",
      overlap_notes: null,
      research_notes: "Admitted by BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 Tier-1 controller. lifecycle_status intentionally held at TECHNICALLY_REVIEWED — rights review not performed by this controller (see docs/DATA_RIGHTS.md); a separate, explicitly-authorised action is required before ENABLED.",
      detailed_source_ref: candidate.provenance?.path ?? candidate.provenance?.file ?? null,
      lifecycle_status: "TECHNICALLY_REVIEWED",
      discovered_at: todayDateString(),
      last_reviewed_at: todayDateString(),
      research_provenance: { research_id: provenanceResearchId(candidate), review_date: todayDateString(), note: `provider=${candidate.provenance?.kind ?? "UNKNOWN"}` },
    };

    const entryErrors = validateEntry(sourceEntry, sourcesDoc.entries.length);
    if (entryErrors.length > 0) {
      return { admitted: false, errors: entryErrors };
    }
    const registryErrors = validateRegistry([...sourcesDoc.entries, sourceEntry]);
    if (registryErrors.length > 0) {
      return { admitted: false, errors: registryErrors };
    }
    sourceWritten = true;
  }

  const mappingAlreadyPresent = mappingsDoc.mappings.some(
    (m) => m.source_id === sourceEntry.id && m.venue_id === candidate.venue_id,
  );
  let mappingWritten = false;
  if (!mappingAlreadyPresent) mappingWritten = true;

  if (dryRun) {
    return {
      admitted: venueWritten || sourceWritten || mappingWritten || (venue != null && sourceEntry != null),
      dry_run: true,
      venue_id: candidate.venue_id,
      source_id: sourceEntry.id,
      venue_written: venueWritten,
      source_written: sourceWritten,
      mapping_written: mappingWritten,
    };
  }

  if (venueWritten) {
    venuesDoc.venues.push(venue);
    await writeJsonAtomic(venuesPath, venuesDoc);
  }
  if (sourceWritten) {
    sourcesDoc.entries.push(sourceEntry);
    await writeJsonAtomic(sourcesPath, sourcesDoc);
  }
  if (mappingWritten) {
    mappingsDoc.mappings.push({
      source_id: sourceEntry.id,
      source_key_type: "SOURCE_ID",
      source_key: sourceEntry.id,
      venue_id: candidate.venue_id,
      method: "BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01",
      evidence: [{ url: candidate.website, kind: "OFFICIAL_VENUE_WEBSITE", note: "Tier-1 acquisition proof." }],
      created_at: todayDateString(),
      retrieved_at: todayDateString(),
    });
    await writeJsonAtomic(mappingsPath, mappingsDoc);
  }

  return {
    admitted: true,
    dry_run: false,
    venue_id: candidate.venue_id,
    source_id: sourceEntry.id,
    venue_written: venueWritten,
    source_written: sourceWritten,
    mapping_written: mappingWritten,
  };
}

export { ROOT as ADMISSION_ROOT };
