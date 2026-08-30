// BEATMAPPED-MAINLINE-CITY-JOB-OPERATOR-CONTROL-01 — the governed
// city-estate catalogue: the ONLY way a normal operator names a city to
// acquire.
//
// WHY THIS EXISTS. Before this package the only real input a city job
// took was `estate_ref` — an arbitrary filesystem path (see job.mjs's
// own header: "an opaque pointer ... this module never reads or
// interprets it"). That is exactly right for the job model and exactly
// wrong for an operator control: a dispatch input carrying a path, a
// registry blob, or a free-text city name is an arbitrary-input surface.
// This module replaces that surface with a closed set of reviewed keys
// (city-estate-catalogue.json). An operator picks a key; everything else
// — country, city, registry, source universe — is derived here from
// already-governed, already-committed repository data.
//
// TWO GUARANTEES THIS MODULE OWNS:
//
//   1. NO DUPLICATED SOURCE UNIVERSE. An `ALL_ACTIVE` catalogue entry
//      names a registry, never a source-id list. The universe is derived
//      from sources/<city>.json at enqueue time, so this catalogue can
//      never drift out of agreement with the canonical registry
//      (docs/SOURCE_REGISTRY.md). Registries are read strictly read-only.
//
//   2. DURABLE ESTATE IDENTITY, FROZEN AT ENQUEUE. Deriving the universe
//      at enqueue time would, on its own, mean a job RESUMED after a
//      registry edit silently resumes against a DIFFERENT source set
//      under the same job id — its existing per-source checkpoints then
//      describe an estate that no longer exists. So enqueue MATERIALISES
//      the resolved universe into the job's own directory
//      (runtime/city-jobs/<job_id>/estate.json) and points `estate_ref`
//      at that snapshot. The snapshot is written once and never rewritten;
//      a restart/resume reconstructs the identical source set from disk,
//      whatever has happened to the registry since. The snapshot's shape
//      is deliberately the existing `{ registry, source_ids }` estate
//      format, so resolvers/programme-acquisition-resolver.mjs consumes it
//      unchanged.
//
// Registry entries are still re-read from sources/<city>.json for each
// source's live details (name, programme URL) — that registry remains the
// single source of truth for WHAT a source is. Only MEMBERSHIP is frozen.

import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";

import { listJobs } from "./job-store.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const CITY_ESTATE_CATALOGUE_PATH = "ingestion/city-worker/city-estate-catalogue.json";

/**
 * A catalogue key is deliberately the narrowest possible token: lowercase
 * alphanumerics and single hyphens. This is a defence-in-depth check only
 * — membership of the catalogue is the real authorisation — but it means
 * a malformed key can never reach a path join, a shell word, or an error
 * message as anything but an obviously-inert string.
 */
export const CITY_ESTATE_KEY_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const SELECTION_MODES = Object.freeze(["ALL_ACTIVE", "EXPLICIT_ESTATE_FILE"]);

/** Thrown for anything that is not an exact, reviewed catalogue key — the single rejection path for every arbitrary-input attempt (a path, a source id, a free-text city, a shell fragment). */
export class UnknownCityEstateError extends Error {
  constructor(requested, availableKeys) {
    super(
      `UNKNOWN_CITY_ESTATE_KEY: ${JSON.stringify(String(requested ?? ""))} is not a governed city estate. ` +
        `The enqueue control accepts ONLY a key from ${CITY_ESTATE_CATALOGUE_PATH}: ${availableKeys.join(", ")}. ` +
        "Adding a city is a reviewed commit to that catalogue, never a dispatch argument.",
    );
    this.name = "UnknownCityEstateError";
    this.code = "UNKNOWN_CITY_ESTATE_KEY";
    this.requested = String(requested ?? "");
    this.available_keys = availableKeys;
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

/** The reviewed catalogue, exactly as committed. Never merged with, or overridable by, anything at runtime. */
export async function loadCityEstateCatalogue({ root = ROOT } = {}) {
  const catalogue = await readJson(resolve(root, CITY_ESTATE_CATALOGUE_PATH));
  const entries = Array.isArray(catalogue?.entries) ? catalogue.entries : [];
  return entries;
}

export async function listCityEstateKeys({ root = ROOT } = {}) {
  return (await loadCityEstateCatalogue({ root })).map((entry) => entry.key);
}

/** Operator-facing catalogue listing: what may be enqueued, with no source-level detail (that is the registry's job, and is resolved only at enqueue time). */
export async function describeCityEstates({ root = ROOT } = {}) {
  return (await loadCityEstateCatalogue({ root })).map((entry) => ({
    key: entry.key,
    country: entry.country,
    city: entry.city,
    label: entry.label ?? null,
    selection: entry.selection,
    registry: entry.registry ?? null,
    estate_file: entry.estate_file ?? null,
  }));
}

/** Derive an ALL_ACTIVE universe from a canonical registry: every entry whose active_status is exactly ACTIVE, in the registry's own file order (so the result is deterministic, not set-ordered). Read-only. */
function deriveActiveSourceIds(registry) {
  const entries = Array.isArray(registry?.entries) ? registry.entries : [];
  return entries.filter((entry) => entry?.active_status === "ACTIVE").map((entry) => entry.id);
}

/**
 * Resolve one catalogue key into a concrete, ready-to-materialise estate.
 * Throws UnknownCityEstateError for anything not in the catalogue, and a
 * plain Error for a catalogue entry that is itself malformed or resolves
 * to zero sources (a zero-source job is a job-level catastrophe — see
 * job.mjs's determineFinalJobState — so it is refused at enqueue time
 * rather than enqueued to fail).
 */
export async function resolveCityEstate(key, { root = ROOT } = {}) {
  const entries = await loadCityEstateCatalogue({ root });
  const availableKeys = entries.map((entry) => entry.key);

  if (typeof key !== "string" || !CITY_ESTATE_KEY_PATTERN.test(key)) {
    throw new UnknownCityEstateError(key, availableKeys);
  }
  const entry = entries.find((candidate) => candidate.key === key);
  if (!entry) throw new UnknownCityEstateError(key, availableKeys);

  let registryRef;
  let sourceIds;

  if (entry.selection === "ALL_ACTIVE") {
    if (!entry.registry) throw new Error(`catalogue entry "${key}" is ALL_ACTIVE but names no registry`);
    registryRef = entry.registry;
    sourceIds = deriveActiveSourceIds(await readJson(resolve(root, registryRef)));
  } else if (entry.selection === "EXPLICIT_ESTATE_FILE") {
    if (!entry.estate_file) throw new Error(`catalogue entry "${key}" is EXPLICIT_ESTATE_FILE but names no estate_file`);
    const estateFile = await readJson(resolve(root, entry.estate_file));
    registryRef = estateFile.registry;
    sourceIds = [...(estateFile.source_ids ?? [])];
    if (!registryRef) throw new Error(`catalogue entry "${key}" names estate file ${entry.estate_file}, which has no registry`);
  } else {
    throw new Error(`catalogue entry "${key}" has unsupported selection ${JSON.stringify(entry.selection)} (expected one of ${SELECTION_MODES.join(", ")})`);
  }

  if (sourceIds.length === 0) {
    throw new Error(`EMPTY_CITY_ESTATE: catalogue entry "${key}" resolves to zero sources — refusing to enqueue a job that could only fail.`);
  }
  const unique = new Set(sourceIds);
  if (unique.size !== sourceIds.length) {
    throw new Error(`DUPLICATE_SOURCE_IDS: catalogue entry "${key}" resolves to a source universe containing duplicates.`);
  }

  return {
    key: entry.key,
    country: entry.country,
    city: entry.city,
    label: entry.label ?? null,
    selection: entry.selection,
    registry: registryRef,
    estate_file: entry.estate_file ?? null,
    source_ids: sourceIds,
  };
}

export function resolveJobEstateSnapshotRef(jobId) {
  return `runtime/city-jobs/${jobId}/estate.json`;
}

/**
 * Freeze a resolved estate into the job's own directory and return the
 * repository-relative `estate_ref` to store on the job record. Written
 * atomically (tmp + rename, matching job-store.mjs) and NEVER rewritten
 * afterwards — this file is the job's durable estate identity.
 */
export async function materialiseJobEstate({ jobId, estate, materialisedAt, root = ROOT }) {
  const ref = resolveJobEstateSnapshotRef(jobId);
  const finalPath = resolve(root, ref);
  await mkdir(dirname(finalPath), { recursive: true });

  const snapshot = {
    _comment:
      "Frozen at enqueue time by ingestion/city-worker/city-estate-catalogue.mjs. This file — not the catalogue, and not the registry's current membership — defines which sources this job covers, so a resume after a registry edit reconstructs the identical estate. Never edit or regenerate it for an existing job.",
    city_estate_key: estate.key,
    selection: estate.selection,
    catalogue: CITY_ESTATE_CATALOGUE_PATH,
    materialised_at: materialisedAt,
    country: estate.country,
    city: estate.city,
    // The two fields resolvers/programme-acquisition-resolver.mjs actually
    // consumes — deliberately the existing durable estate format, so no
    // resolver change is needed to read a materialised estate.
    registry: estate.registry,
    source_ids: estate.source_ids,
  };

  const tmpPath = resolve(dirname(finalPath), `.estate.${randomUUID()}.tmp`);
  await writeFile(tmpPath, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  await rename(tmpPath, finalPath);
  return ref;
}

/** The catalogue key a job was enqueued for, or null for a job created before this control existed (e.g. the bounded live trial's own jobs). */
export function readJobCityEstateKey(job) {
  return job?.configuration?.city_estate_key ?? null;
}

/**
 * The single duplicate-active-job rule: at most ONE non-terminal job per
 * governed estate. A second dispatch for an estate that is still QUEUED
 * or RUNNING is refused (never silently deduplicated, never queued behind
 * itself); a new cycle is only allowed once the previous one is terminal.
 */
export async function findActiveJobForEstate(key, { root = ROOT } = {}) {
  const jobs = await listJobs({ root });
  const active = jobs.filter((job) => readJobCityEstateKey(job) === key && (job.state === "QUEUED" || job.state === "RUNNING"));
  active.sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")));
  return active[0] ?? null;
}

export { ROOT as CITY_ESTATE_CATALOGUE_ROOT };
