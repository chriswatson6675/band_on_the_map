// BEATMAPPED-UNATTENDED-CITY-WORKER-REAL-INTEGRATION-01 — the real
// `resolveSourceTasks(job)` adapter both prior packages identified as the
// one missing piece: it turns this repository's real, existing
// per-source acquisition interface
// (ingestion/programme-acquisition/source-execution.mjs's
// `acquireSource()`) into the generic `SourceTask[]` shape
// ingestion/city-worker/runner.mjs requires — reusing, never
// duplicating, the collector/normalization/proof machinery underneath
// it.
//
// DURABLE, RESTART-SAFE ESTATE FORMAT (see docs/UNATTENDED_CITY_WORKER.md,
// "Current-line job estate format"): `job.estate_ref` names a small JSON
// file — e.g. `{ "registry": "sources/<city>.json", "source_ids": [...] }`
// — that is itself reconstructable purely from disk: this registry file
// is this repository's OWN existing, canonical, already-durable source
// registry (docs/SOURCE_REGISTRY.md). Nothing here embeds a live
// collector, a closure, or any other in-memory-only state into the job or
// estate record; every call to `resolveSourceTasks(job)` re-reads both
// files fresh from disk, so a worker restart reconstructs the exact same
// source tasks with zero dependency on what the previous process held in
// memory.
//
// NEVER MUTATES the registry it reads (read-only — matches this
// project's own canonical-data-must-not-be-mutated-during-acquisition
// rule) and never writes to `sources/*.json`, `venues/*.json`, or any
// other canonical file.
//
// ONE RETRY OWNER: `run()` below NEVER throws for an ordinary acquisition
// outcome — `acquireSource()` already exhausted its own retry budget by
// the time it returns, and `mapAcquisitionResultToCheckpoint()`'s result
// is mapped straight into a non-throwing SourceTask outcome (SUCCESS /
// RESIDUE / FAILED), so runner.mjs's own outer retry never fires a second
// time for the same acquisition attempt (see runner.mjs's own "ONE RETRY
// OWNER" header note, and tests/city-worker/one-retry-owner.test.mjs).

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { acquireSource } from "../../programme-acquisition/source-execution.mjs";
import { mapAcquisitionResultToCheckpoint } from "../../programme-acquisition/worker-checkpoint-mapping.mjs";
import { fetchText } from "../../http/fetch.mjs";

/** Reuses (never duplicates) this repository's own generic HTTP fetch helper — reshaped into the fetchDocument({url, at, status, content_type, body}) contract acquireSource() requires. This is the DEFAULT — real, live network — fetchDocument; tests inject a synthetic replacement via resolveSourceTasks()'s own options (see below), production callers (cli.mjs, worker-loop-main.mjs) never override it. */
async function defaultFetchDocument(url) {
  const response = await fetchText(url);
  return { url: response.url, at: response.retrievedAt, status: response.status, content_type: response.contentType, body: response.text };
}

/** Map one existing sources/*.json registry entry into acquireSource()'s own source shape. Read-only — this project's canonical registries are never mutated here. */
function toGovernedSource(entry) {
  return {
    source_id: entry.id,
    venue: entry.name,
    website: entry.official_website ?? null,
    programme_url: entry.events_url ?? null,
  };
}

/** Strip worker-bookkeeping fields (status/attempts/timestamps — runner.mjs's own processSourceTask already records these itself) leaving only the outcome-specific detail, then reshape into the non-throwing SourceTask.run() return contract. */
function toSourceTaskOutcome(checkpoint) {
  const detail = { ...checkpoint };
  delete detail.status;
  delete detail.attempts;
  delete detail.startedAt;
  delete detail.completedAt;
  return { outcome: checkpoint.status, ...detail };
}

/**
 * The real resolveSourceTasks(job) adapter. `job.estate_ref` must name a
 * JSON file (resolved relative to `root`) of the shape
 * `{ registry: "sources/<city>.json", source_ids: [...] }`.
 */
export async function resolveSourceTasks(job, { root, detailLimit, fetchDocument = defaultFetchDocument } = {}) {
  const estatePath = resolve(root, job.estate_ref);
  const estate = JSON.parse(await readFile(estatePath, "utf8"));
  const registryPath = resolve(root, estate.registry);
  const registry = JSON.parse(await readFile(registryPath, "utf8"));
  const byId = new Map(registry.entries.map((entry) => [entry.id, entry]));

  return estate.source_ids.map((sourceId) => {
    const entry = byId.get(sourceId);
    if (!entry) throw new Error(`programme-acquisition-resolver: "${sourceId}" is not present in ${estate.registry}`);
    const source = toGovernedSource(entry);
    return {
      source_id: source.source_id,
      run: async () => {
        const result = await acquireSource(source, { fetchDocument, detailLimit });
        const checkpoint = mapAcquisitionResultToCheckpoint(result);
        return toSourceTaskOutcome(checkpoint);
      },
    };
  });
}
