const CREDENTIAL_PATTERNS = [
  /\b(?:pk|sk)\.[A-Za-z0-9._-]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?\b/g,
  /\bAIza[A-Za-z0-9_-]{30,}\b/g,
  /(?:api[_-]?key|access[_-]?token|client[_-]?secret|authorization|password)["']?\s*[:=]\s*["'](?!\[REDACTED_)[^"'\s<&]{16,}/gi,
  /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)=[^&"'\s<>\[]+/gi,
];

export function redactSensitiveText(value) {
  if (typeof value !== "string") return value;
  return CREDENTIAL_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, "[REDACTED_CREDENTIAL]"),
    value,
  );
}
