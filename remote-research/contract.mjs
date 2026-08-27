import { createHash } from "node:crypto";

export const REMOTE_RESEARCH_CONTRACT_VERSION = "BEATMAPPED-REMOTE-RESEARCH-v1";
export const ALLOWED_RESEARCH_JOBS = new Set(["berlin-browser-proof"]);
export const RUNTIME_CLASSIFICATIONS = new Set([
  "BROWSER_RUNTIME_READY",
  "BROWSER_RUNTIME_MISSING_CHROMIUM",
  "BROWSER_RUNTIME_MISSING_LIBRARIES",
  "BROWSER_RUNTIME_RESOURCE_CONCERN",
  "BROWSER_RUNTIME_OTHER_BLOCKER",
]);

const FULL_SHA = /^[0-9a-f]{40}$/;
const RUN_TOKEN = /^gh-[1-9][0-9]*-[1-9][0-9]*$/;
const SENSITIVE_KEY = /(?:authorization|cookie|credential|password|private[_-]?key|secret|session|token)/i;
const SENSITIVE_QUERY_KEY = /(?:access|auth|api|client|cookie|jwt|key|secret|session|signature|signed|token)/i;
const CREDENTIAL_TEXT = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  /\b(?:bearer|basic)\s+[a-z0-9._~+/=-]+/gi,
  /\b(?:password|secret|token|api[_-]?key|authorization|cookie)\s*[:=]\s*[^\s,;]+/gi,
];

export function validateCandidateSha(value) {
  if (!FULL_SHA.test(String(value ?? ""))) throw new Error("candidate_sha must be exactly 40 lowercase hexadecimal characters");
  return value;
}

export function validateResearchJob(value) {
  if (!ALLOWED_RESEARCH_JOBS.has(value)) throw new Error(`research_job must be one of: ${[...ALLOWED_RESEARCH_JOBS].join(", ")}`);
  return value;
}

export function validateRunToken(value) {
  if (!RUN_TOKEN.test(String(value ?? ""))) throw new Error("run token must match gh-<run-id>-<attempt>");
  return value;
}

export function buildTemporaryRoot(runToken) {
  return `/tmp/beatmapped-research/${validateRunToken(runToken)}`;
}

function normalizeAbsolutePath(value) {
  const normalized = String(value ?? "").replace(/\/+$/, "") || "/";
  if (!normalized.startsWith("/")) throw new Error(`path must be absolute: ${value}`);
  return normalized;
}

export function assertIsolatedResearchPaths({ productionPath, researchRoot, publicationPath }) {
  const production = normalizeAbsolutePath(productionPath);
  const research = normalizeAbsolutePath(researchRoot);
  const publication = normalizeAbsolutePath(publicationPath);
  if (research === "/" || research === "/tmp" || research === "/tmp/beatmapped-research") throw new Error("research root is too broad");
  if (!research.startsWith("/tmp/beatmapped-research/gh-")) throw new Error("research root is outside the controlled temporary prefix");
  for (const protectedPath of [production, publication]) {
    if (research === protectedPath || research.startsWith(`${protectedPath}/`) || protectedPath.startsWith(`${research}/`)) {
      throw new Error(`research root overlaps protected production path: ${protectedPath}`);
    }
  }
  return { productionPath: production, researchRoot: research, publicationPath: publication };
}

function parseNodeMajorMinor(version) {
  const match = /^v?(\d+)\.(\d+)/.exec(String(version ?? ""));
  return match ? [Number(match[1]), Number(match[2])] : null;
}

export function classifyBrowserRuntime(audit) {
  if (!audit?.chromium?.executable_path) return "BROWSER_RUNTIME_MISSING_CHROMIUM";
  if ((audit.chromium.missing_libraries ?? []).length > 0) return "BROWSER_RUNTIME_MISSING_LIBRARIES";
  if ((audit.memory?.available_mb ?? 0) < 768 || (audit.temporary_disk?.available_mb ?? 0) < 1024) return "BROWSER_RUNTIME_RESOURCE_CONCERN";
  if (audit.production_path_writable !== false) return "BROWSER_RUNTIME_OTHER_BLOCKER";
  const node = parseNodeMajorMinor(audit.node_version);
  if (!node || node[0] < 20 || (node[0] === 20 && node[1] < 9)) return "BROWSER_RUNTIME_OTHER_BLOCKER";
  return "BROWSER_RUNTIME_READY";
}

export function sanitizeUrl(value) {
  if (typeof value !== "string") return value;
  try {
    const url = new URL(value);
    url.username = "";
    url.password = "";
    for (const key of [...url.searchParams.keys()]) if (SENSITIVE_QUERY_KEY.test(key)) url.searchParams.set(key, "[REDACTED]");
    url.hash = "";
    return url.href;
  } catch {
    return sanitizeText(value);
  }
}

export function sanitizeText(value) {
  let output = String(value ?? "");
  for (const pattern of CREDENTIAL_TEXT) output = output.replace(pattern, "[REDACTED_CREDENTIAL]");
  return output;
}

export function sanitizeArtifact(value, key = "") {
  if (SENSITIVE_KEY.test(key)) return "[REDACTED]";
  if (Array.isArray(value)) return value.map((item) => sanitizeArtifact(item));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitizeArtifact(child, childKey)]));
  if (typeof value === "string") return /^https?:\/\//i.test(value) ? sanitizeUrl(value) : sanitizeText(value);
  return value;
}

export function findCredentialLeaks(value, path = "$") {
  const leaks = [];
  if (Array.isArray(value)) value.forEach((child, index) => leaks.push(...findCredentialLeaks(child, `${path}[${index}]`)));
  else if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key) && child !== "[REDACTED]") leaks.push(`${path}.${key}`);
      leaks.push(...findCredentialLeaks(child, `${path}.${key}`));
    }
  } else if (typeof value === "string") {
    let parsedUrl = false;
    try {
      const url = new URL(value);
      parsedUrl = true;
      if (url.username || url.password || [...url.searchParams.keys()].some((key) => SENSITIVE_QUERY_KEY.test(key) && url.searchParams.get(key) !== "[REDACTED]")) leaks.push(path);
    } catch {}
    if (!parsedUrl && CREDENTIAL_TEXT.some((pattern) => { pattern.lastIndex = 0; return pattern.test(value); })) leaks.push(path);
  }
  return [...new Set(leaks)];
}

export function compareProductionBaselines(before, after) {
  const stable = ["production_path", "head", "git_status", "services", "publication", "registry_tree_sha256"];
  const differences = stable.filter((key) => JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null));
  return { unchanged: differences.length === 0, differences };
}

export function hashStableStrings(values) {
  return createHash("sha256").update([...values].sort().join("\n")).digest("hex");
}

export function validateOwnedCleanup({ pid, sessionId, command, researchRoot }) {
  if (!Number.isInteger(pid) || pid <= 1 || sessionId !== pid) return false;
  const root = normalizeAbsolutePath(researchRoot);
  return root.startsWith("/tmp/beatmapped-research/gh-") && String(command ?? "").includes(root);
}
