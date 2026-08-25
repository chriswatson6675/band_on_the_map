// BOTM-RUNTIME-PUBLICATION-BRIDGE-01 — the client-side (browser-safe)
// counterpart to ingestion/publication-server/run.mjs: decides, given an
// optional runtime endpoint URL and the already-bundled publication
// artifact, which dataset the website should actually render.
//
// Dependency-free, no Node built-ins — safe to import from the browser
// bundle, matching the exact existing convention already established by
// ingestion/map/projection.mjs and ingestion/map/publication.mjs (both of
// which app/page.tsx already imports directly). This module performs its
// own network call (`fetch`) only when explicitly asked to via
// resolveMapData() below — it is never imported for its side effects.
//
// This module makes NO Git/filesystem assumption of any kind. Refreshing
// the data it can return never requires a commit, a push, or a Netlify
// rebuild — only a new successful response from the configured runtime
// endpoint.

import { validatePublicationArtifact } from "./publication.mjs";

export const RUNTIME_DATA_SOURCES = Object.freeze(["runtime", "bundled"]);

export const DEFAULT_TIMEOUT_MS = 4000;

/**
 * True only for a publication artifact that passes the SAME schema/
 * cross-check validation ingestion/map/publish-artifact-io.mjs's atomic
 * writer already enforces before ever committing a byte to disk — no
 * second, unrelated schema is invented here. Exported directly so a
 * caller (or a test) can validate a candidate payload without also
 * performing a fetch.
 */
export function isValidPublicationArtifact(candidate) {
  if (candidate === null || typeof candidate !== "object") return false;
  return validatePublicationArtifact(candidate).length === 0;
}

/**
 * Fetch and validate the runtime publication endpoint. Never throws —
 * every failure mode (network error, timeout, non-2xx response, a
 * response body that isn't valid JSON, valid JSON that fails schema
 * validation) resolves to `{ ok: false, reason }` so a caller can fall
 * back to the bundled artifact without a try/catch of its own.
 *
 * `fetchImpl` defaults to the global `fetch` (available in both the
 * browser and modern Node) and is the ONE seam a test needs to inject a
 * fake response — no network mocking library required.
 */
export async function fetchRuntimePublicationData(url, { fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!url) return { ok: false, reason: "NO_URL_CONFIGURED" };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetchImpl(url, { signal: controller.signal, headers: { Accept: "application/json" } });
  } catch (error) {
    return { ok: false, reason: error?.name === "AbortError" ? "TIMEOUT" : "NETWORK_ERROR", detail: error?.message };
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    return { ok: false, reason: "HTTP_ERROR", detail: `HTTP ${response.status}` };
  }

  let body;
  try {
    body = await response.text();
  } catch (error) {
    return { ok: false, reason: "NETWORK_ERROR", detail: error?.message };
  }

  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    // Covers both a malformed-JSON payload AND an HTML/error page served
    // with a 200 (e.g. a misconfigured proxy) — either way, this is not
    // usable data, never treated as one.
    return { ok: false, reason: "MALFORMED_JSON" };
  }

  if (!isValidPublicationArtifact(parsed)) {
    return { ok: false, reason: "INVALID_SCHEMA" };
  }

  return { ok: true, artifact: parsed };
}

/**
 * The single decision point the website calls: given a (possibly unset)
 * runtime URL and the already-bundled artifact, return exactly which
 * dataset to render plus a small, honest `source` indicator
 * ("runtime" | "bundled") — no visible UI redesign required, but callers
 * that DO want to surface it (e.g. a debug footer) always can.
 *
 *   - no runtime URL configured                  -> bundled, immediately
 *   - runtime fetch succeeds + validates          -> runtime wins
 *   - runtime unreachable/timeout/malformed/       -> bundled (fallback),
 *     invalid-schema                                 never a blank map
 *
 * Never throws.
 *
 * Explicit JSDoc types below (rather than relying on TypeScript's
 * allowJs inference) because a bare destructured parameter with only
 * SOME properties carrying inline defaults (`fetchImpl`/`timeoutMs` do,
 * `runtimeUrl`/`bundledArtifact` don't) is a known TS inference gap for
 * plain `.mjs` — inferring only the defaulted properties and silently
 * dropping the rest from the synthesized parameter type. app/page.tsx
 * (a strict, type-checked `.tsx` consumer) needs the real shape.
 *
 * @param {Object} [options]
 * @param {string|null} [options.runtimeUrl]
 * @param {*} [options.bundledArtifact]
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.timeoutMs]
 * @returns {Promise<{source: "runtime"|"bundled", artifact: *, runtimeError: string|null}>}
 */
export async function resolveMapData({ runtimeUrl, bundledArtifact, fetchImpl = fetch, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  if (!runtimeUrl) {
    return { source: "bundled", artifact: bundledArtifact, runtimeError: null };
  }

  const result = await fetchRuntimePublicationData(runtimeUrl, { fetchImpl, timeoutMs });
  if (result.ok) {
    return { source: "runtime", artifact: result.artifact, runtimeError: null };
  }
  return { source: "bundled", artifact: bundledArtifact, runtimeError: result.reason };
}
