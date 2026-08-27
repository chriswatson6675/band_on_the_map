import { validateVenueDiscoveryCandidate } from "./contract.mjs";

export async function runProviderAdapter(adapter, input, context) {
  if (!adapter || typeof adapter.providerId !== "string" || typeof adapter.discover !== "function") {
    throw new Error("provider adapter requires providerId and discover(input, context)");
  }
  const candidates = await adapter.discover(input, Object.freeze({ ...context }));
  if (!Array.isArray(candidates)) throw new Error(`${adapter.providerId} did not return an array`);
  candidates.forEach((candidate, index) => {
    const errors = validateVenueDiscoveryCandidate(candidate);
    if (errors.length) throw new Error(`${adapter.providerId}[${index}]: ${errors.join("; ")}`);
    if (candidate.discovery_provider !== adapter.providerId) {
      throw new Error(`${adapter.providerId}[${index}] has mismatched discovery_provider`);
    }
  });
  return candidates;
}
