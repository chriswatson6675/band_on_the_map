import { redactSensitiveText } from "../source-investigation/redact-sensitive-text.mjs";

const SENSITIVE_QUERY_KEY = /(?:access|auth|api|client|session|signature|signed|token|secret|key|cookie|jwt)/i;

export function sanitizeEvidenceUrl(value) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(redactSensitiveText(value));
    for (const key of [...url.searchParams.keys()]) {
      if (SENSITIVE_QUERY_KEY.test(key)) url.searchParams.set(key, "[REDACTED_CREDENTIAL]");
    }
    url.hash = "";
    return url.href;
  } catch {
    return redactSensitiveText(value);
  }
}
export function safeResponseMetadata(response = {}) {
  return {
    url: sanitizeEvidenceUrl(response.url),
    status: Number.isInteger(response.status) ? response.status : null,
    content_type: redactSensitiveText(response.content_type ?? "") || null,
    content_length: Number.isFinite(response.content_length) ? response.content_length : null,
    relationship: response.relationship ?? "UNKNOWN",
  };
}

export function sanitizeEvidenceText(value, maxBytes) {
  const redacted = redactSensitiveText(String(value ?? ""))
    .replace(/\b(?:bearer|basic)\s+[a-z0-9._~+\/-]{16,}\b/gi, "[REDACTED_CREDENTIAL]")
    .replace(/\b(?:token|secret|api[_-]?key|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED_CREDENTIAL]");
  return Buffer.from(redacted, "utf8").subarray(0, maxBytes).toString("utf8");
}
