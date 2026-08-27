export function createEndpointMemory(handoff, { verifiedAt, reverifyAfter } = {}) {
  if (!handoff?.inspected_programme_url) throw new Error("handoff is required");
  return {
    schema_version: "BEATMAPPED-ENDPOINT-MEMORY-v1",
    programme_url: handoff.inspected_programme_url,
    browser_probe_state: handoff.state,
    discovered_endpoints: handoff.discovered_endpoints ?? [],
    collector_fit: handoff.collector_fit ?? "NEEDS_DEEPER_INVESTIGATION",
    browser_required_for_refresh: handoff.browser_required_for_refresh ?? null,
    verification_state: handoff.discovered_endpoints?.length ? "CURRENT" : "UNVERIFIED",
    last_verified_at: verifiedAt ?? handoff.probed_at,
    reverify_after: reverifyAfter ?? null,
    next_action: handoff.next_action,
  };
}
export function chooseResolutionPath(memory, { now = new Date().toISOString(), deterministicValidationPassed = null } = {}) {
  if (!memory?.discovered_endpoints?.length) return { path: "BROWSER_RESOLUTION", reason: "No endpoint is stored." };
  if (deterministicValidationPassed === true) return { path: "DETERMINISTIC_COLLECTION", reason: "The stored endpoint revalidated successfully." };
  if (deterministicValidationPassed === false) return { path: "BROWSER_RESOLUTION", reason: "Stored endpoint validation failed." };
  if (memory.reverify_after && now >= memory.reverify_after) return { path: "DETERMINISTIC_REVALIDATION", reason: "The stored endpoint reached its revalidation time." };
  return { path: "DETERMINISTIC_COLLECTION", reason: "Use stored endpoint without repeating browser research." };
}
