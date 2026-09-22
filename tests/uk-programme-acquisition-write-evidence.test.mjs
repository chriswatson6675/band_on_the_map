import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { writeEvidenceFiles, writeAttemptLog } from "../ingestion/uk-programme-acquisition/write-evidence.mjs";
import { isGovernedEvidencePath } from "../ingestion/source-investigation/contract.mjs";

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "botm-uk-prog-evidence-test-"));
}

test("writeEvidenceFiles writes real files and returns governed, existing paths", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const meta = await writeEvidenceFiles({
    root,
    sourceId: "uk-prog-example",
    documents: [
      { url: "https://example.com/", at: "2026-09-23T10:00:00.000Z", status: 200, content_type: "text/html", body: "<html>homepage</html>" },
      { url: "https://example.com/events", at: "2026-09-23T10:00:01.000Z", status: 200, content_type: "application/json", body: '{"events":[]}' },
    ],
    labels: ["homepage", "programme"],
  });

  assert.equal(meta.length, 2);
  for (const m of meta) {
    assert.ok(isGovernedEvidencePath(m.path), `${m.path} must be a governed evidence path`);
    const content = await readFile(join(root, m.path), "utf8");
    assert.ok(content.length > 0);
  }
  assert.ok(meta[1].path.endsWith(".json"), "a JSON content_type document must be written with a .json extension");
  assert.ok(meta[0].path.endsWith(".html"));
});

test("writeEvidenceFiles returns [] for an empty documents array, never writes anything", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const meta = await writeEvidenceFiles({ root, sourceId: "uk-prog-example", documents: [] });
  assert.deepEqual(meta, []);
});

test("writeAttemptLog writes a real, governed, retained record of a total failure", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const meta = await writeAttemptLog({ root, sourceId: "uk-prog-example", url: "https://example.com/", attemptedAt: "2026-09-23T10:00:00.000Z", error: new Error("getaddrinfo ENOTFOUND example.com") });

  assert.equal(meta.length, 1);
  assert.ok(isGovernedEvidencePath(meta[0].path));
  const content = JSON.parse(await readFile(join(root, meta[0].path), "utf8"));
  assert.equal(content.url, "https://example.com/");
  assert.match(content.error, /ENOTFOUND/);
});
