import fs from "node:fs";
import { runCityAcquisition } from "../../../../ingestion/programme-acquisition/city-batch.mjs";

const triageFiles = ["../../../../research/venue-discovery/london-01/passive-triage.json", "../../../../research/venue-discovery/london-01/remaining-passive-triage.json"];
const sources = triageFiles.flatMap((file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url))).results)
  .map((candidate) => ({ source_id: candidate.candidate_id, venue: candidate.reported_name, website: candidate.final_url ?? candidate.requested_url, programme_url: candidate.programme_url ?? null }));
const seen = new Set();
const estate = sources.filter((source) => !seen.has(source.source_id) && seen.add(source.source_id));
if (estate.length !== 227) throw new Error(`expected 227 governed sources, got ${estate.length}`);

async function fetchDocument(url) {
  const response = await fetch(url, { headers: { "user-agent": "BandOnTheMap deterministic acquisition/1.0" }, redirect: "follow", signal: AbortSignal.timeout(15000) });
  const body = (await response.text()).slice(0, 100000);
  return { requested_url: url, url: response.url, at: new Date().toISOString(), status: response.status, content_type: response.headers.get("content-type"), body };
}

const results = await runCityAcquisition({ sources: estate, fetchDocument, concurrency: 4, perHost: 1, detailLimit: 6 });
const counts = Object.fromEntries(Object.entries(Object.groupBy(results, (row) => row.state)).map(([key, value]) => [key, value.length]));
const artifact = { artifact_type: "DETERMINISTIC_CITY_ACQUISITION_BASELINE", sources_total: estate.length, request_bound: "One first-party programme GET for each governed source with a retained programme URL; at most six same-origin generic detail GETs only after a supported route; concurrency 4, per-host 1, 15-second timeout, no retry, browser, credentials, or state change.", capability_origin: "MIXED", counts, normalized_candidate_events: results.reduce((sum, row) => sum + row.normalized_event_count, 0), proven_events: results.reduce((sum, row) => sum + row.proven_event_count, 0), results };
fs.writeFileSync(new URL("./city-run.json", import.meta.url), `${JSON.stringify(artifact, null, 2)}\n`);
console.log(JSON.stringify({ sources: estate.length, counts, normalized_candidate_events: artifact.normalized_candidate_events, proven_events: artifact.proven_events }));
