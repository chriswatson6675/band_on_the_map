import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const paths = ["deterministic-recovery-results.json", "remaining-official-results.json", "generic-improvement-results.json"];
const artifacts = await Promise.all(paths.map(async (path) => JSON.parse(await readFile(resolve(HERE, path), "utf8"))));
const mechanismByFamily = {
  JSON_LD: "JSON_LD_EVENT",
  ICS_CALENDAR: "ICS_OR_ICAL",
  WORDPRESS_CALENDAR: "WORDPRESS_TRIBE_API",
};
const normalized = artifacts.flatMap((artifact) => artifact.results).map((result) => ({
  ...result,
  technical_mechanism: result.read_only_proof
    ? mechanismByFamily[result.read_only_proof.collector_family] ?? result.technical_mechanism
    : result.technical_mechanism,
  next_action: result.acquisition_result === "ACQUISITION_PROVEN_NOT_ACTIVATED"
    ? "NO_FURTHER_ACTION"
    : result.acquisition_result === "SOURCE_RESOLVED_COLLECTOR_GAP"
      ? "DETERMINISTIC_CONTINUE"
      : result.acquisition_result === "TECHNICAL_FAILURE"
        ? "RETRY_LATER"
        : "AI_RESEARCH_REQUIRED",
}));
const results = [...new Map(normalized.map((result) => [result.candidate_id, result])).values()].sort((a, b) => a.venue.localeCompare(b.venue));
const artifact = {
  artifact_type: "BERLIN_DEEP_PROGRAMME_PROBE_RESULTS",
  generated_at: new Date().toISOString(),
  cutoff_date: "2026-08-27",
  completed_level_1_2_candidates: results.length,
  browser_level_3: { status: "UNAVAILABLE", reason: "No controlled browser backend was connected; no substitute browser or unretained headless shortcut was used." },
  results,
};
await writeFile(resolve(HERE, "probe-results.json"), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ completed: results.length, acquisition_proven: results.filter((result) => result.acquisition_result === "ACQUISITION_PROVEN_NOT_ACTIVATED").length }, null, 2));
