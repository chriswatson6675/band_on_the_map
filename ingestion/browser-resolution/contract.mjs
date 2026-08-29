export const ENDPOINT_STATES = new Set([
  "PROGRAMME_ENDPOINT_PROVEN",
  "LIKELY_PROGRAMME_ENDPOINT",
  "STRUCTURED_RESPONSE_NOT_PROGRAMME",
  "EMBEDDED_PROGRAMME_STATE_PROVEN",
  "RENDERED_DOM_PROGRAMME_ONLY",
  "NO_PROGRAMME_DATA_DISCOVERED",
  "ACCESS_BLOCKED",
  "PROBE_LIMIT_REACHED",
]);

export const PRIMARY_RESULTS = new Set([
  "STRUCTURED_ENDPOINT_DISCOVERED",
  "EMBEDDED_PROGRAMME_STATE_DISCOVERED",
  "RENDERED_DOM_PROGRAMME_DISCOVERED",
  "EXISTING_DETERMINISTIC_CAPABILITY_NOW_APPLIES",
  "NEW_GENERIC_CAPABILITY_REQUIRED",
  "AI_RESEARCH_REQUIRED",
  "ACCESS_BLOCKED",
  "NO_CURRENT_PROGRAMME_DISCOVERED",
  "TECHNICAL_PROBE_FAILURE",
]);

export const DEFAULT_BROWSER_PROBE_OPTIONS = Object.freeze({
  navigationTimeoutMs: 20_000,
  totalProbeTimeoutMs: 35_000,
  waitAfterLoadMs: 1_500,
  maxNetworkResponses: 40,
  maxResponseBytes: 256 * 1024,
  maxInteractions: 1,
  sameOriginOnly: true,
  allowedContentTypes: ["application/json", "application/graphql-response+json", "text/calendar", "text/html"],
  userAgent: "BeatMapped-controlled-browser-resolver/1.0 (+https://github.com/chriswatson6675/band_on_the_map)",
});

const positiveInteger = (value) => Number.isInteger(value) && value > 0;

export function normalizeBrowserProbeOptions(options = {}) {
  const normalized = {
    ...DEFAULT_BROWSER_PROBE_OPTIONS,
    ...options,
    allowedContentTypes: [...(options.allowedContentTypes ?? DEFAULT_BROWSER_PROBE_OPTIONS.allowedContentTypes)],
  };
  for (const field of ["navigationTimeoutMs", "totalProbeTimeoutMs", "maxNetworkResponses", "maxResponseBytes"]) {
    if (!positiveInteger(normalized[field])) throw new Error(`${field} must be a positive integer`);
  }
  for (const field of ["waitAfterLoadMs", "maxInteractions"]) {
    if (!Number.isInteger(normalized[field]) || normalized[field] < 0) throw new Error(`${field} must be a non-negative integer`);
  }
  if (normalized.totalProbeTimeoutMs < normalized.navigationTimeoutMs) {
    throw new Error("totalProbeTimeoutMs must be at least navigationTimeoutMs");
  }
  if (typeof normalized.sameOriginOnly !== "boolean") throw new Error("sameOriginOnly must be boolean");
  if (!normalized.allowedContentTypes.length || normalized.allowedContentTypes.some((value) => typeof value !== "string" || !value.trim())) {
    throw new Error("allowedContentTypes must contain non-empty strings");
  }
  if (typeof normalized.userAgent !== "string" || !normalized.userAgent.trim()) throw new Error("userAgent is required");
  return normalized;
}
