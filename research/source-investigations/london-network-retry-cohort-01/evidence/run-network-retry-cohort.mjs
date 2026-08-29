import fs from "node:fs";
import { runCityAcquisition } from "../../../../ingestion/programme-acquisition/city-batch.mjs";

const prior = JSON.parse(fs.readFileSync(new URL("../../london-programme-resolution-rerun-01/evidence/city-rerun.json", import.meta.url)));
const networkIds = new Set(prior.results.filter((row) => row.state === "NETWORK_FAILURE").map((row) => row.source_id));
if (networkIds.size !== 20) throw new Error(`expected exactly 20 prior network failures, got ${networkIds.size}`);
const triageFiles = ["../../../../research/venue-discovery/london-01/passive-triage.json", "../../../../research/venue-discovery/london-01/remaining-passive-triage.json"];
const all = triageFiles.flatMap((file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url))).results)
  .map((candidate) => ({ source_id: candidate.candidate_id, venue: candidate.reported_name, website: candidate.final_url ?? candidate.requested_url, programme_url: candidate.programme_url ?? null }));
const sources = all.filter((source) => networkIds.has(source.source_id));
if (sources.length !== 20) throw new Error(`expected 20 cohort sources, got ${sources.length}`);

async function fetchDocument(url) {
  const response = await fetch(url, { headers: { "user-agent": "BandOnTheMap deterministic acquisition/1.0" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  const body = (await response.text()).slice(0, 100000);
  return { requested_url: url, url: response.url, at: new Date().toISOString(), status: response.status, content_type: response.headers.get("content-type"), body };
}

const results = await runCityAcquisition({ sources, fetchDocument, concurrency: 4, perHost: 1, detailLimit: 6 });
const counts = Object.fromEntries(Object.entries(Object.groupBy(results, (row) => row.state)).map(([key, value]) => [key, value.length]));
const artifact = {
  artifact_type: "NETWORK_RETRY_COHORT",
  cohort_definition: "The exact 20 source IDs with NETWORK_FAILURE in the retained programme-resolution city rerun.",
  sources_total: sources.length,
  request_bound: "Maximum three attempts per transient network failure; public first-party GET only, 15-second attempt timeout, concurrency 4, per-host 1, at most six same-origin detail GETs after a supported route; no browser, credentials, AI action, or state change.",
  counts,
  recovered_sources: results.filter((row) => row.state !== "NETWORK_FAILURE").map((row) => row.source_id),
  normalized_candidate_events: results.reduce((sum, row) => sum + row.normalized_event_count, 0),
  proven_events: results.reduce((sum, row) => sum + row.proven_event_count, 0),
  results,
};
fs.writeFileSync(new URL("./network-retry-cohort.json", import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ sources: sources.length, counts, recovered_sources: artifact.recovered_sources.length, normalized_candidate_events: artifact.normalized_candidate_events, proven_events: artifact.proven_events }));
