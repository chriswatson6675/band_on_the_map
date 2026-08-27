import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const readJson = async (path) => JSON.parse(await readFile(resolve(ROOT, path), "utf8"));
const ledger = await readJson("research/venue-discovery/berlin-03-acquisition-learning/acquisition-ledger.json");
const candidates = ledger.records.filter((record) => record.venue_likelihood === "PROVEN_CURRENT_MUSIC_VENUE" && ["OTHER_EMBEDDED_APP_STATE", "CLIENT_RENDERED_UNKNOWN"].includes(record.technical_mechanism));
const results = [];

for (const candidate of candidates) {
  const investigationPath = candidate.source_evidence.find((path) => /^research\/source-investigations\/.+\/investigation\.json$/.test(path));
  const investigation = investigationPath ? await readJson(investigationPath) : null;
  const history = investigation?.probe_history ?? [];
  const browserEligible = history[0]?.level === 1 && history[0]?.outcome === "INSUFFICIENT" && history[1]?.level === 2 && history[1]?.outcome === "INSUFFICIENT";
  if (!browserEligible) throw new Error(`${candidate.canonical_name} lacks the retained Level 1/2 INSUFFICIENT prerequisites for Level 3`);
  results.push({
    candidate_id: candidate.candidate_id,
    venue: candidate.canonical_name,
    programme_url: candidate.programme_url ?? candidate.official_url,
    starting_mechanism: candidate.technical_mechanism,
    level_3_prerequisite_investigation: investigationPath,
    retained_probe_history: history.slice(0, 2),
    primary_result: "TECHNICAL_PROBE_FAILURE",
    failure: {
      type: "CONTROLLED_BROWSER_BACKEND_UNAVAILABLE",
      safe_evidence: "The required controlled-browser runtime reported no available browser backend; its supported recovery check also returned an empty backend list.",
      retry_suitable: true,
      ai_suitable: false,
      access_blocked: false,
    },
    discovered_endpoints: [],
    embedded_programme_state: null,
    rendered_dom_programme: null,
    deterministic_collector_candidate: null,
    browser_required_for_refresh: null,
    acquisition_result_before: candidate.acquisition_result,
    acquisition_result_after: candidate.acquisition_result,
    next_action: "RETRY_LATER",
  });
}

const counts = Object.fromEntries([...new Set(results.map((result) => result.primary_result))].map((state) => [state, results.filter((result) => result.primary_result === state).length]));
const output = {
  artifact_type: "BERLIN_CONTROLLED_BROWSER_RESOLUTION_LEDGER",
  schema_version: "BEATMAPPED-BROWSER-RESOLUTION-v1",
  generated_at: new Date().toISOString(),
  prerequisite_shas: {
    generic_research_pr_15: "681b8cbe019b2a1a6c7e01e83f2cf2a8eba2174c",
    berlin_deep_pr_16: "7d98a4f663ac4d0ea17967b26b9fd15978bbf547",
  },
  browser_backend: {
    implementation: "playwright-core adapter with explicit system Chromium executable",
    live_controlled_backend_status: "UNAVAILABLE",
    substitute_used: false,
  },
  counts: {
    proven_berlin_universe: ledger.counts.proven_independent_venues,
    currently_acquired: ledger.counts.canonically_acquired,
    acquisition_proven_before: ledger.counts.deterministic_acquisition_capability,
    acquisition_proven_after: ledger.counts.deterministic_acquisition_capability,
    acquisition_proven_coverage_percent: ledger.counts.acquisition_proven_coverage_percent,
    embedded_client_rendered_starting_residue: candidates.length,
    eligible_for_governed_level_3: results.filter((result) => result.retained_probe_history.length === 2).length,
    newly_unlocked: 0,
    structured_endpoints_discovered: 0,
    embedded_states_discovered: 0,
    rendered_dom_only_programmes: 0,
    technical_probe_failures: results.length,
  },
  primary_result_distribution: counts,
  results,
};
await writeFile(resolve(HERE, "browser-resolution-ledger.json"), `${JSON.stringify(output, null, 2)}\n`, "utf8");

const families = {
  artifact_type: "BROWSER_ENDPOINT_FAMILIES_AND_RUNTIME_READINESS",
  generated_at: new Date().toISOString(),
  discovered_from_live_berlin_level_3: [],
  reusable_capabilities_implemented: [
    "BOUNDED_PLAYWRIGHT_CORE_SESSION_WITH_EXPLICIT_CHROMIUM",
    "SAME_ORIGIN_PUBLIC_RESPONSE_OBSERVATION",
    "STRUCTURAL_JSON_GRAPHQL_ICAL_ENDPOINT_CLASSIFICATION",
    "NEXT_NUXT_SVELTEKIT_GENERIC_EMBEDDED_STATE_DETECTION",
    "HYDRATED_DOM_PROGRAMME_FALLBACK",
    "CREDENTIAL_SAFE_BROWSER_EVIDENCE",
    "PERSISTENT_ENDPOINT_MEMORY_AND_DETERMINISTIC_REVALIDATION",
    "FAILURE_ISOLATED_QUEUE_EXECUTION",
  ],
  audit: {
    existing_and_reusable: ["JSON-LD parsing and Observation adapter", "SvelteKit route-data decoder", "programme fingerprints and collector routing", "source-investigation escalation contract", "credential redaction and full-delta audit"],
    exists_but_not_suitable: ["Prior retained browser observations are evidence fixtures, not a reusable lifecycle worker", "Optional transitive @playwright/test lock reference was not an installed project browser stack"],
    missing_before_this_package: ["Browser lifecycle owner", "network response interception", "bounded response inspection", "browser-to-collector handoff", "endpoint memory/revalidation"],
  },
  digitalocean_readiness: {
    code_model: "QUEUE_SUITABLE_BUT_NOT_LIVE_PROVEN",
    runtime_requirements: ["Node.js compatible with the repository", "playwright-core", "a separately installed Chromium executable supplied by explicit path", "Linux sandbox support and browser system libraries"],
    browser_binary_bundled: false,
    browser_lifecycle: "one browser/context/page session per bounded probe; context and browser close unconditionally in finally",
    orphan_protection: "launch/navigation/total timeouts plus unconditional close; the external queue supervisor should also enforce a process deadline",
    measured_memory: null,
    measured_memory_note: "No controlled browser backend was available, so process memory was not measured and server capacity is not guessed.",
    suggested_initial_concurrency: 1,
    concurrency_note: "Begin at one browser probe per worker until memory and CPU are measured on the actual host; deterministic acquisition remains separately concurrent and browser-free.",
    retry_policy: "bounded exponential retry for technical launch/network failures; no retry escalation for access controls; return to browser only after stored endpoint validation fails",
  },
  london_readiness_recommendation: "ANOTHER_GENERIC_BLOCKER_BEFORE_LONDON",
  remaining_blocker: "Connect and exercise a controlled Chromium backend against the governed 42-venue corpus, then validate actual lifecycle/resource measurements and endpoint handoffs.",
};
await writeFile(resolve(HERE, "endpoint-families.json"), `${JSON.stringify(families, null, 2)}\n`, "utf8");

const readme = `# Generic controlled-browser endpoint resolution\n\nThis package adds a city-agnostic, bounded Playwright Core resolver and browser-to-deterministic-collector handoff. It does not activate sources or venues and does not publish or deploy.\n\n## Browser audit\n\n### Existing and reusable\n\nJSON-LD/Observation ingestion, the SvelteKit data decoder, programme fingerprints, research-state routing, governed escalation, and credential redaction/audit were reused.\n\n### Exists but not suitable\n\nPrior retained browser observations are governed evidence, not an executable lifecycle worker. The lockfile's optional transitive \`@playwright/test\` reference was not an installed project stack.\n\n### Missing before this package\n\nA browser lifecycle owner, network interception, strict capture bounds, structural endpoint classifier, persisted handoff, and deterministic revalidation path.\n\n## Execution model\n\nThe adapter requires an explicit system Chromium path and creates a fresh browser context without retained authentication state. The default probe allows 20 seconds for navigation, 35 seconds total, 40 eligible network responses, 256 KiB per inspected/retained body, one obvious load-more interaction, a 1.5-second post-load wait, and same-origin structured responses only. Unknown or excessive response lengths are metadata-only. Cleanup runs in \`finally\`.\n\nThe browser is a resolver, not the routine collector. A proven endpoint is persisted and revalidated through ordinary deterministic acquisition; browser resolution returns only if that validation fails or the mechanism changes.\n\n## Berlin regression status\n\nThe ledger mechanically identifies ${candidates.length} PROVEN Berlin venues with embedded/client-rendered residue. All ${candidates.length} have retained Level 1 and Level 2 \`INSUFFICIENT\` evidence and are eligible for governed Level 3. No controlled backend was connected in this run, so each has the honest primary result \`TECHNICAL_PROBE_FAILURE\` / \`RETRY_LATER\`; no endpoint or acquisition proof is claimed.\n\n## DigitalOcean\n\nThe worker needs Node.js, \`playwright-core\`, an explicitly installed Chromium executable and its Linux libraries. No browser binary is bundled. Start at concurrency 1 until actual host memory/CPU measurements exist. Routine deterministic collection should not launch Chromium.\n\n## Recommendation\n\n\`ANOTHER_GENERIC_BLOCKER_BEFORE_LONDON\`: the generic code path exists and is fixture-proven, but it still requires a connected controlled Chromium regression run and real resource measurements before a large autonomous London scope.\n`;
await writeFile(resolve(HERE, "README.md"), readme, "utf8");
console.log(JSON.stringify({ candidates: candidates.length, browser_eligible: results.length, primary_results: counts }, null, 2));
