// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 — the live
// acquisition call this package's own sources/uk.json entries need at
// PUBLICATION time, mirroring ingestion/london/run.mjs's own
// acquireLondon() precedent exactly: re-fetch live on every publish run,
// never read a stale cache of Observations. Reuses
// ingestion/programme-acquisition/source-execution.mjs's acquireSource()
// (via city-batch.mjs's runCityAcquisition, unchanged) for the actual
// network work — this file only selects which sources/uk.json entries
// are worth re-running and flattens their proven Observations.
//
// Only entries this package's own investigation already proved
// (monitoring_status: TECHNICAL_PATH_PROVEN — see registry-entries.mjs's
// updateEntryFromAcquisition()) are re-acquired here. A source that never
// reached that status contributes nothing to publication — this file
// never re-attempts discovery/classification at publish time, only
// re-runs the SAME already-proven collector path for its own already-
// confirmed programme_url.

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { runCityAcquisition } from "../programme-acquisition/city-batch.mjs";
import { fetchText } from "../http/fetch.mjs";

const UK_SOURCES_PATH = "sources/uk.json";

async function defaultFetchDocument(url) {
  const response = await fetchText(url);
  return { url: response.url, at: response.retrievedAt, status: response.status, content_type: response.contentType, body: response.text };
}

/**
 * Load sources/uk.json and return only the entries this package's own
 * investigation already proved acquirable — never every entry (a
 * DEFERred/residue entry has no confirmed events_url worth re-fetching at
 * publication time).
 */
export async function loadProvenUkSources(root) {
  let registry;
  try {
    registry = JSON.parse(await readFile(resolve(root, UK_SOURCES_PATH), "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  return registry.entries.filter((entry) => entry.monitoring_status === "TECHNICAL_PATH_PROVEN" && entry.events_url);
}

/**
 * Live-acquire every proven UK source and return the flattened list of
 * real, proven Observations (each tagged with its own source_id, matching
 * every other Observation this repository already produces) —
 * never throws for an individual source's own acquisition failure (that
 * is `acquireSource()`'s own, already-governed contract); a source that
 * fails to re-acquire on THIS publish run simply contributes nothing this
 * time, exactly like any other source-level failure elsewhere in this
 * project's publication pipeline.
 */
export async function acquireUkObservations({ root, fetchDocument = defaultFetchDocument, concurrency = 8, perHost = 1 } = {}) {
  const provenSources = await loadProvenUkSources(root);
  if (provenSources.length === 0) return { ukSourceRegistry: { entries: [] }, ukObservations: [], ukResults: [] };

  const sources = provenSources.map((entry) => ({ source_id: entry.id, venue: entry.name, website: entry.official_website, programme_url: entry.events_url }));
  const results = await runCityAcquisition({ sources, fetchDocument, concurrency, perHost });

  const observations = results
    .filter((result) => result.state === "ACQUISITION_PROVEN")
    .flatMap((result) => (result.observations ?? []).map((observation) => ({ ...observation, source_id: result.source_id })));

  return { ukSourceRegistry: { entries: provenSources }, ukObservations: observations, ukResults: results };
}
