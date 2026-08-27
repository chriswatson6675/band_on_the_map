import { execFileSync } from "node:child_process";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import os from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { findCredentialLeaks, sanitizeArtifact, validateCandidateSha } from "./contract.mjs";

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const checkout = resolve(argument("checkout") ?? "");
const output = resolve(argument("output") ?? "");
const chromium = argument("chromium");
const candidateSha = validateCandidateSha(argument("candidate-sha"));
if (!chromium) throw new Error("--chromium is required");
await mkdir(output, { recursive: true });

const ledgerPath = join(checkout, "research/venue-discovery/berlin-04-browser-resolution/browser-resolution-ledger.json");
const ledger = JSON.parse(await readFile(ledgerPath, "utf8"));
const candidates = ledger.results.filter((record) => ["OTHER_EMBEDDED_APP_STATE", "CLIENT_RENDERED_UNKNOWN"].includes(record.starting_mechanism));
if (new Set(candidates.map((record) => record.candidate_id)).size !== candidates.length) throw new Error("browser corpus contains duplicate candidate IDs");
for (const candidate of candidates) {
  const history = candidate.retained_probe_history ?? [];
  if (!(history[0]?.level === 1 && history[0]?.outcome === "INSUFFICIENT" && history[1]?.level === 2 && history[1]?.outcome === "INSUFFICIENT")) {
    throw new Error(`${candidate.candidate_id} is not eligible for governed Level 3 browser observation`);
  }
}

const { runBrowserResolutionQueue } = await import(pathToFileURL(join(checkout, "ingestion/browser-resolution/queue.mjs")));
const { createPlaywrightSessionFactory } = await import(pathToFileURL(join(checkout, "ingestion/browser-resolution/playwright-session.mjs")));
const sessionFactory = createPlaywrightSessionFactory({ executablePath: chromium });

function processTreeSample() {
  try {
    const rows = execFileSync("ps", ["-eo", "pid=,ppid=,rss=,pcpu=,comm="], { encoding: "utf8", timeout: 2_000 }).trim().split(/\r?\n/).map((line) => {
      const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+([0-9.]+)\s+(.+)$/.exec(line);
      return match ? { pid: Number(match[1]), ppid: Number(match[2]), rssKb: Number(match[3]), cpu: Number(match[4]), command: match[5] } : null;
    }).filter(Boolean);
    const owned = new Set([process.pid]);
    let changed = true;
    while (changed) { changed = false; for (const row of rows) if (owned.has(row.ppid) && !owned.has(row.pid)) { owned.add(row.pid); changed = true; } }
    const selected = rows.filter((row) => owned.has(row.pid));
    return { rss_mb: Math.round(selected.reduce((sum, row) => sum + row.rssKb, 0) / 1024), cpu_percent_sum: selected.reduce((sum, row) => sum + row.cpu, 0), process_count: selected.length };
  } catch { return null; }
}

const results = [];
const durations = [];
let peak = { rss_mb: 0, cpu_percent_sum: 0, process_count: 0 };
const startedAt = new Date().toISOString();
for (const candidate of candidates) {
  const started = Date.now();
  const sampler = setInterval(() => {
    const sample = processTreeSample();
    if (sample && sample.rss_mb > peak.rss_mb) peak = sample;
  }, 250);
  try {
    const [result] = await runBrowserResolutionQueue([{ candidate_id: candidate.candidate_id, venue: candidate.venue, url: candidate.programme_url }], { sessionFactory });
    results.push({ ...candidate, ...result, probe_duration_ms: Date.now() - started });
  } finally {
    clearInterval(sampler);
    durations.push(Date.now() - started);
  }
}

const distribution = Object.fromEntries([...new Set(results.map((result) => result.primary_result))].sort().map((state) => [state, results.filter((result) => result.primary_result === state).length]));
const successfulStates = new Set(["STRUCTURED_ENDPOINT_DISCOVERED", "EMBEDDED_PROGRAMME_STATE_DISCOVERED", "RENDERED_DOM_PROGRAMME_DISCOVERED", "EXISTING_DETERMINISTIC_CAPABILITY_NOW_APPLIES"]);
const sortedDurations = [...durations].sort((a, b) => a - b);
const orphanRows = (() => {
  try { return execFileSync("ps", ["-eo", "pid=,ppid=,sid=,comm=,args="], { encoding: "utf8" }).split(/\r?\n/).filter((line) => /chrom(?:e|ium)/i.test(line) && line.includes(process.env.TMPDIR ?? "__NO_MATCH__")).map((line) => sanitizeArtifact(line.trim())); }
  catch { return []; }
})();

const liveResults = sanitizeArtifact({
  artifact_type: "BERLIN_LIVE_CONTROLLED_BROWSER_PROOF",
  schema_version: "BEATMAPPED-BROWSER-RESOLUTION-v1",
  candidate_sha: candidateSha,
  generated_at: new Date().toISOString(),
  started_at: startedAt,
  corpus: { count: candidates.length, unique_ids: new Set(candidates.map((item) => item.candidate_id)).size, mechanisms: { OTHER_EMBEDDED_APP_STATE: candidates.filter((item) => item.starting_mechanism === "OTHER_EMBEDDED_APP_STATE").length, CLIENT_RENDERED_UNKNOWN: candidates.filter((item) => item.starting_mechanism === "CLIENT_RENDERED_UNKNOWN").length } },
  counts: { attempted: results.length, successful_browser_probes: results.filter((item) => successfulStates.has(item.primary_result)).length, technical_probe_failures: results.filter((item) => item.primary_result === "TECHNICAL_PROBE_FAILURE").length },
  primary_result_distribution: distribution,
  results,
});
const endpoints = sanitizeArtifact({ schema_version: "BEATMAPPED-RESOLVED-ENDPOINTS-v1", candidate_sha: candidateSha, generated_at: new Date().toISOString(), endpoints: results.flatMap((result) => (result.discovered_endpoints ?? []).map((endpoint) => ({ candidate_id: result.candidate_id, venue: result.venue, programme_url: result.programme_url, ...endpoint }))) });
const measurements = sanitizeArtifact({ schema_version: "BEATMAPPED-BROWSER-RUNTIME-MEASUREMENTS-v1", candidate_sha: candidateSha, generated_at: new Date().toISOString(), browser_executable: chromium, browser_launches: results.length, concurrency: 1, duration_ms: { total: durations.reduce((sum, value) => sum + value, 0), median: sortedDurations.length ? sortedDurations[Math.floor(sortedDurations.length / 2)] : null, minimum: sortedDurations[0] ?? null, maximum: sortedDurations.at(-1) ?? null }, peak_process_tree: peak, host_free_memory_mb_after: Math.floor(os.freemem() / 1048576), timeout_count: results.filter((item) => item.failure?.type === "TOTAL_PROBE_TIMEOUT").length, orphan_browser_processes: orphanRows });

for (const [name, artifact] of [["live-browser-results.json", liveResults], ["resolved-endpoints.json", endpoints], ["runtime-measurements.json", measurements]]) {
  const leaks = findCredentialLeaks(artifact);
  if (leaks.length) throw new Error(`${name} failed credential audit at ${leaks.join(", ")}`);
  await writeFile(join(output, name), `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
}
console.log(JSON.stringify({ corpus_count: candidates.length, attempted: results.length, successes: liveResults.counts.successful_browser_probes, failures: liveResults.counts.technical_probe_failures, artifacts: ["live-browser-results.json", "resolved-endpoints.json", "runtime-measurements.json"] }));
