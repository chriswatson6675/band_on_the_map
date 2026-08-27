import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import { validateCandidateSha, validateResearchJob } from "./contract.mjs";

const [candidateSha, researchJob, candidateRoot] = process.argv.slice(2);
validateCandidateSha(candidateSha);
validateResearchJob(researchJob);

if (candidateRoot && researchJob === "berlin-browser-proof") {
  for (const relative of [
    "ingestion/browser-resolution/contract.mjs",
    "ingestion/browser-resolution/playwright-session.mjs",
    "ingestion/browser-resolution/probe.mjs",
    "ingestion/browser-resolution/queue.mjs",
    "research/venue-discovery/berlin-04-browser-resolution/browser-resolution-ledger.json",
  ]) await access(resolve(candidateRoot, relative), constants.R_OK);
  const contract = await readFile(resolve(candidateRoot, "ingestion/browser-resolution/contract.mjs"), "utf8");
  const session = await readFile(resolve(candidateRoot, "ingestion/browser-resolution/playwright-session.mjs"), "utf8");
  const probe = await readFile(resolve(candidateRoot, "ingestion/browser-resolution/probe.mjs"), "utf8");
  const queue = await readFile(resolve(candidateRoot, "ingestion/browser-resolution/queue.mjs"), "utf8");
  if (!probe.includes('schema_version: "BEATMAPPED-BROWSER-RESOLUTION-v1"')) throw new Error("candidate lacks the versioned controlled-browser resolution capability");
  if (!contract.includes("sameOriginOnly: true") || !contract.includes("totalProbeTimeoutMs")) throw new Error("candidate lacks bounded same-origin browser defaults");
  if (!session.includes("explicit Chromium executablePath is required")) throw new Error("candidate does not require an explicit system Chromium executable");
  if (!queue.includes("runBrowserResolutionQueue")) throw new Error("candidate lacks the failure-isolated browser queue");
}

console.log(JSON.stringify({ candidate_sha: candidateSha, research_job: researchJob, capability_check: candidateRoot ? "PASS" : "DEFERRED_UNTIL_CHECKOUT" }));
