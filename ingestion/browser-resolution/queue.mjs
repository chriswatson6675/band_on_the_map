import { runControlledBrowserProbe } from "./probe.mjs";
import { sanitizeEvidenceText, sanitizeEvidenceUrl } from "./safety.mjs";

export async function runBrowserResolutionQueue(candidates, dependencies = {}) {
  const results = [];
  for (const candidate of candidates ?? []) {
    try {
      results.push({ candidate_id: candidate.candidate_id, venue: candidate.venue ?? null, ...(await runControlledBrowserProbe({ url: candidate.url, options: candidate.options }, dependencies)) });
    } catch (error) {
      results.push({
        candidate_id: candidate.candidate_id,
        venue: candidate.venue ?? null,
        inspected_programme_url: sanitizeEvidenceUrl(candidate.url),
        primary_result: "TECHNICAL_PROBE_FAILURE",
        failure: { type: "QUEUE_ITEM_ERROR", message: sanitizeEvidenceText(error instanceof Error ? error.message : String(error), 2_048), retry_suitable: true, ai_suitable: false, access_blocked: false },
        discovered_endpoints: [],
        next_action: "RETRY_LATER",
      });
    }
  }
  return results;
}
