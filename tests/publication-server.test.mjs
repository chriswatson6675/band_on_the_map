// BOTM-RUNTIME-PUBLICATION-BRIDGE-01 — offline proofs for the read-only
// publication HTTP service (ingestion/publication-server/run.mjs). Fully
// offline: a real node:http server is started on an ephemeral local port
// (127.0.0.1:0) against a fixture artifact file under an isolated tmpdir —
// never the real committed data/public/lisbon-porto-map.json, and never a
// live DigitalOcean host.
//
// Covers OFFLINE PROOFS (1) publication server serves valid canonical JSON,
// (2) server refuses/errors for an unreadable or invalid artifact, plus the
// service-shape guarantees (read-only, no arbitrary filesystem access, no
// write/admin API, CORS without credentials, no credential/hostname
// embedded in source).

import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createRequestHandler,
  loadValidatedArtifact,
  startServer,
  DEFAULT_HOST,
  DEFAULT_PORT,
  DEFAULT_ALLOWED_ORIGIN,
} from "../ingestion/publication-server/run.mjs";

function validArtifact({ generatedAt = "2026-08-25T09:00:00.000Z", venueId = "venue-test-a" } = {}) {
  return {
    generated_at: generatedAt,
    window: { from: null, to: null },
    source_report: { success_count: 1, failure_count: 0, sources: [{ source_id: "test-source", success: true, raw_record_count: 1, observation_count: 1 }] },
    counts: { observation_count: 1, display_listing_count: 1, map_marker_count: 1 },
    countries: {
      Portugal: {
        markers: [
          {
            venue_id: venueId,
            canonical_name: "Test Venue",
            latitude: 38.7,
            longitude: -9.1,
            address: "Test Address",
            display_listings: [{ kind: "SINGLE", source_id: "test-source", source_record_id: "rec-1" }],
          },
        ],
      },
      Croatia: { markers: [] },
    },
  };
}

async function withTempRoot(fn) {
  const dir = await mkdtemp(join(tmpdir(), "botm-publication-server-test-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("defaults are safe: local-only bind host, uncredentialed wildcard CORS origin", () => {
  assert.equal(DEFAULT_HOST, "127.0.0.1");
  assert.equal(typeof DEFAULT_PORT, "number");
  assert.equal(DEFAULT_ALLOWED_ORIGIN, "*");
});

test("loadValidatedArtifact: returns ok:true + the parsed artifact for a valid file", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "map.json");
    const artifact = validArtifact();
    await writeFile(path, JSON.stringify(artifact));

    const result = await loadValidatedArtifact({ artifactPath: path });
    assert.equal(result.ok, true);
    assert.deepEqual(result.artifact, artifact);
  });
});

test("loadValidatedArtifact: 503 for a missing/unreadable file — never an empty map as success", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "does-not-exist.json");
    const result = await loadValidatedArtifact({ artifactPath: path });
    assert.equal(result.ok, false);
    assert.equal(result.status, 503);
    assert.match(result.error, /unreadable/);
  });
});

test("loadValidatedArtifact: 502 for a file that is not valid JSON (e.g. an HTML error page)", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "map.json");
    await writeFile(path, "<html><body>502 Bad Gateway</body></html>");
    const result = await loadValidatedArtifact({ artifactPath: path });
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.match(result.error, /not valid JSON/);
  });
});

test("loadValidatedArtifact: 502 for JSON that fails schema validation (e.g. a drifting/malformed shape)", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "map.json");
    await writeFile(path, JSON.stringify({ not: "a publication artifact" }));
    const result = await loadValidatedArtifact({ artifactPath: path });
    assert.equal(result.ok, false);
    assert.equal(result.status, 502);
    assert.match(result.error, /schema validation/);
  });
});

test("GET /map-data: 200 + the exact validated canonical artifact JSON, correct Content-Type, no-store", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "map.json");
    const artifact = validArtifact();
    await writeFile(path, JSON.stringify(artifact));

    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath: path });
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/map-data`);
      assert.equal(res.status, 200);
      assert.match(res.headers.get("content-type"), /application\/json/);
      assert.equal(res.headers.get("cache-control"), "no-store");
      const body = await res.json();
      assert.deepEqual(body, artifact);
    } finally {
      server.close();
    }
  });
});

test("GET /map-data: explicit server error (never an empty-map 200) when the artifact is unreadable", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "missing.json");
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath: path });
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/map-data`);
      assert.equal(res.status, 503);
      const body = await res.json();
      assert.match(body.error, /unreadable/);
    } finally {
      server.close();
    }
  });
});

test("GET /map-data: explicit server error when the artifact is malformed JSON", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "map.json");
    await writeFile(path, "{not json");
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath: path });
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/map-data`);
      assert.equal(res.status, 502);
      const body = await res.json();
      assert.match(body.error, /not valid JSON/);
    } finally {
      server.close();
    }
  });
});

test("GET /map-data: explicit server error when the artifact fails schema validation", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "map.json");
    await writeFile(path, JSON.stringify({ countries: {} }));
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath: path });
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/map-data`);
      assert.equal(res.status, 502);
      const body = await res.json();
      assert.match(body.error, /schema validation/);
    } finally {
      server.close();
    }
  });
});

test("GET /health: reports artifact_readable true + the artifact's own generated_at when healthy", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "map.json");
    const artifact = validArtifact({ generatedAt: "2026-08-20T00:00:00.000Z" });
    await writeFile(path, JSON.stringify(artifact));

    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath: path });
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.artifact_readable, true);
      assert.equal(body.generated_at, "2026-08-20T00:00:00.000Z");
    } finally {
      server.close();
    }
  });
});

test("GET /health: reports artifact_readable false (still 200, service itself is up) when the artifact is broken", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "missing.json");
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath: path });
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.artifact_readable, false);
      assert.match(body.detail, /unreadable/);
    } finally {
      server.close();
    }
  });
});

test("CORS: default response carries Access-Control-Allow-Origin: * and NEVER Access-Control-Allow-Credentials", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "map.json");
    await writeFile(path, JSON.stringify(validArtifact()));
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath: path });
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/map-data`);
      assert.equal(res.headers.get("access-control-allow-origin"), "*");
      assert.equal(res.headers.get("access-control-allow-credentials"), null);
    } finally {
      server.close();
    }
  });
});

test("CORS: allowedOrigin is configurable (no hardcoded live BOTM origin required by this package)", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "map.json");
    await writeFile(path, JSON.stringify(validArtifact()));
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath: path, allowedOrigin: "https://example-future-botm-origin.test" });
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/map-data`);
      assert.equal(res.headers.get("access-control-allow-origin"), "https://example-future-botm-origin.test");
    } finally {
      server.close();
    }
  });
});

test("OPTIONS preflight: 204 with CORS method/header hints, no body", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "map.json");
    await writeFile(path, JSON.stringify(validArtifact()));
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath: path });
    try {
      const { port } = server.address();
      const res = await fetch(`http://127.0.0.1:${port}/map-data`, { method: "OPTIONS" });
      assert.equal(res.status, 204);
      assert.match(res.headers.get("access-control-allow-methods"), /GET/);
    } finally {
      server.close();
    }
  });
});

test("write/mutating methods are refused (read-only service, no admin/write API of any kind)", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "map.json");
    await writeFile(path, JSON.stringify(validArtifact()));
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath: path });
    try {
      const { port } = server.address();
      for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
        const res = await fetch(`http://127.0.0.1:${port}/map-data`, { method });
        assert.equal(res.status, 405, `${method} must be refused`);
      }
    } finally {
      server.close();
    }
  });
});

test("no arbitrary filesystem access: an unrelated path is a plain 404, never a directory listing or file read", async () => {
  await withTempRoot(async (dir) => {
    const path = join(dir, "map.json");
    await writeFile(path, JSON.stringify(validArtifact()));
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath: path });
    try {
      const { port } = server.address();
      for (const target of ["/", "/etc/passwd", "/../../../../etc/passwd", "/data", "/admin"]) {
        const res = await fetch(`http://127.0.0.1:${port}${target}`);
        assert.equal(res.status, 404, `${target} must not resolve to any file`);
      }
    } finally {
      server.close();
    }
  });
});

test("createRequestHandler is exported directly so routing/CORS/error-shape can be exercised without also proving host/port binding", () => {
  assert.equal(typeof createRequestHandler, "function");
  const handler = createRequestHandler({ artifactPath: "/nonexistent" });
  assert.equal(typeof handler, "function");
});

test("no credential or hostname of any kind appears anywhere in the publication-server source", async () => {
  const { readFile } = await import("node:fs/promises");
  const { fileURLToPath } = await import("node:url");
  const source = await readFile(fileURLToPath(new URL("../ingestion/publication-server/run.mjs", import.meta.url)), "utf8");
  // No embedded DigitalOcean/production hostnames, no token-shaped literals.
  assert.doesNotMatch(source, /digitalocean\.com|\.do-vps\.|ghp_[A-Za-z0-9]|github_pat_/i);
  // The only literal IP-shaped strings permitted are the safe local default
  // (127.0.0.1, the real DEFAULT_HOST) and 0.0.0.0, which appears only
  // inside a documentation comment illustrating a FUTURE reverse-proxy
  // override — never a live production hostname or credential.
  const ipLiterals = source.match(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g) ?? [];
  for (const ip of ipLiterals) {
    assert.ok(["127.0.0.1", "0.0.0.0"].includes(ip), `unexpected IP literal in source: ${ip}`);
  }
});
