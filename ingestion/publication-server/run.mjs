#!/usr/bin/env node
// BOTM-RUNTIME-PUBLICATION-BRIDGE-01 — the ONE tiny, read-only HTTP
// service that lets the public website consume fresh map data without a
// Git commit or a Netlify rebuild. Runs continuously (unlike the
// oneshot `npm run unattended` collector) and is deliberately small:
// - reads the SAME canonical artifact `npm run unattended`/`npm run
//   publish:map-data` already write (ingestion/map/publish-artifact-io.mjs's
//   resolvePublicationArtifactPath()) — never a second data store;
// - validates it with the SAME schema the atomic writer already enforces
//   (ingestion/map/publication.mjs's validatePublicationArtifact()) —
//   never a second, unrelated schema;
// - NEVER writes, mutates, or deletes anything;
// - NEVER runs a collector, NEVER shells out, NEVER serves an arbitrary
//   filesystem path, NEVER lists a directory, NEVER exposes a write/admin
//   API of any kind. Two GET routes only.
//
// No web framework dependency — plain Node `http`, matching this
// project's existing "dependency-free ingestion code" convention
// (ingestion/http/fetch.mjs, ingestion/map/publish-artifact-io.mjs, etc.).
//
// Package command: `npm run serve:map-data`. Never started automatically
// by this package — see deploy/README.md for the (not-yet-installed)
// systemd unit, deploy/systemd/botm-publication.service.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { validatePublicationArtifact } from "../map/publication.mjs";
import { resolvePublicationArtifactPath } from "../map/publish-artifact-io.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Safe-by-default local bind: reachable only from the same host unless the
// operator explicitly opts into something broader (e.g. behind an nginx/
// Caddy HTTPS reverse proxy on the SAME host, which is the documented,
// required production shape — see deploy/README.md's "HTTPS boundary").
// A future deployment sets BOTM_PUBLICATION_HOST=0.0.0.0 (or similar) only
// once it is genuinely behind that proxy — this module never assumes so.
export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 8787;

// No wildcard+credentialed CORS anywhere in this file (this endpoint never
// sends Access-Control-Allow-Credentials at all) — see this file's own
// applyCorsHeaders() below. This is public, read-only, non-personal gig
// listing data; the default is permissive-but-uncredentialed (`*`),
// overridable via BOTM_PUBLICATION_ALLOWED_ORIGIN once the live BOTM
// origin is known (deploy/README.md documents configuring this later —
// this package does not need to know that origin yet).
export const DEFAULT_ALLOWED_ORIGIN = "*";

/**
 * Read, parse, and validate the canonical publication artifact from disk.
 * Returns `{ ok: true, artifact }` or `{ ok: false, status, error }` —
 * never throws, and never treats a missing/invalid/unreadable file as an
 * empty-but-successful map (this is the one place the "no empty map as
 * success" rule from docs/UNATTENDED_RUNNER.md's own publication rule is
 * re-applied at the READ side, not just the write side).
 */
export async function loadValidatedArtifact({ artifactPath } = {}) {
  const path = artifactPath ?? resolvePublicationArtifactPath({ root: ROOT });
  let raw;
  try {
    raw = await readFile(path, "utf8");
  } catch (error) {
    return { ok: false, status: 503, error: `publication artifact unreadable: ${error.message}` };
  }

  let artifact;
  try {
    artifact = JSON.parse(raw);
  } catch (error) {
    return { ok: false, status: 502, error: `publication artifact is not valid JSON: ${error.message}` };
  }

  const errors = validatePublicationArtifact(artifact);
  if (errors.length > 0) {
    return { ok: false, status: 502, error: `publication artifact failed schema validation: ${errors.join("; ")}` };
  }

  return { ok: true, artifact };
}

function applyCorsHeaders(res, allowedOrigin) {
  if (allowedOrigin) {
    res.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    res.setHeader("Vary", "Origin");
  }
  // Deliberately never set — this is public, uncredentialed data:
  //   Access-Control-Allow-Credentials
}

function sendJson(res, status, body) {
  const serialized = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(serialized),
    "Cache-Control": "no-store", // always the current on-disk artifact, never browser/proxy-cached staleness
  });
  res.end(serialized);
}

/**
 * Build the request handler. Exported (not just used internally by
 * startServer()) so tests can exercise routing/CORS/error-shape logic
 * directly against a real `http.Server` without needing to also prove
 * host/port binding — see tests/publication-server.test.mjs.
 */
export function createRequestHandler({ artifactPath, allowedOrigin = DEFAULT_ALLOWED_ORIGIN } = {}) {
  return async function handler(req, res) {
    applyCorsHeaders(res, allowedOrigin);

    if (req.method === "OPTIONS") {
      res.writeHead(204, { "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" });
      res.end();
      return;
    }

    if (req.method !== "GET") {
      sendJson(res, 405, { error: "method not allowed — this is a read-only service (GET only)" });
      return;
    }

    // Deliberately no path parameters, no query-driven filesystem access —
    // exactly two fixed, hardcoded routes. Anything else is a plain 404,
    // never a directory listing or arbitrary file read.
    const url = new URL(req.url ?? "/", "http://localhost");

    if (url.pathname === "/health") {
      const result = await loadValidatedArtifact({ artifactPath });
      sendJson(res, 200, {
        status: "ok",
        checked_at: new Date().toISOString(),
        artifact_readable: result.ok,
        ...(result.ok ? { generated_at: result.artifact.generated_at } : { detail: result.error }),
      });
      return;
    }

    if (url.pathname === "/map-data") {
      const result = await loadValidatedArtifact({ artifactPath });
      if (!result.ok) {
        // Explicit server error — never an empty map returned as success.
        sendJson(res, result.status, { error: result.error });
        return;
      }
      sendJson(res, 200, result.artifact);
      return;
    }

    sendJson(res, 404, { error: "not found" });
  };
}

/**
 * Start the HTTP server. Returns the live `http.Server` instance (call
 * `.close()` to stop it — used directly by tests, never by this module
 * itself outside of the CLI entry point below).
 */
export function startServer({ host = DEFAULT_HOST, port = DEFAULT_PORT, artifactPath, allowedOrigin = DEFAULT_ALLOWED_ORIGIN } = {}) {
  const server = createServer(createRequestHandler({ artifactPath, allowedOrigin }));
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      server.off("error", reject);
      resolvePromise(server);
    });
  });
}

function envInt(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function main() {
  const host = process.env.BOTM_PUBLICATION_HOST || DEFAULT_HOST;
  const port = envInt("BOTM_PUBLICATION_PORT", DEFAULT_PORT);
  const allowedOrigin = process.env.BOTM_PUBLICATION_ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  const artifactPath = process.env.BOTM_PUBLICATION_ARTIFACT_PATH || undefined;

  const server = await startServer({ host, port, artifactPath, allowedOrigin });
  const address = server.address();
  console.log(`[publication-server] listening on http://${address.address}:${address.port} (GET /map-data, GET /health)`);
  console.log(`[publication-server] allowed origin: ${allowedOrigin}`);
  console.log(`[publication-server] artifact path: ${artifactPath ?? resolvePublicationArtifactPath({ root: ROOT })}`);

  const shutdown = (signal) => {
    console.log(`[publication-server] received ${signal}, shutting down`);
    server.close(() => process.exit(0));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`[publication-server] FATAL: ${error?.stack ?? error?.message ?? error}`);
    process.exitCode = 1;
  });
}

export { main };
