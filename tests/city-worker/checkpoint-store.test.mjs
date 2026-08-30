import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  markSourceRunning,
  recordSourceResult,
  loadSourceCheckpoints,
  isTerminalCheckpoint,
  sanitizeSourceIdForFilename,
  resolveSourcesDir,
} from "../../ingestion/city-worker/checkpoint-store.mjs";

async function freshRoot() {
  return mkdtemp(join(tmpdir(), "city-worker-checkpoint-test-"));
}

test("sanitizeSourceIdForFilename strips characters unsafe for a filesystem path component", () => {
  assert.equal(sanitizeSourceIdForFilename("some/weird:id?*"), "some_weird_id__");
  assert.equal(sanitizeSourceIdForFilename("plain-id_123"), "plain-id_123");
});

test("RUNNING checkpoints are non-terminal; SUCCESS/FAILED/RESIDUE are terminal", () => {
  assert.equal(isTerminalCheckpoint({ status: "RUNNING" }), false);
  assert.equal(isTerminalCheckpoint({ status: "SUCCESS" }), true);
  assert.equal(isTerminalCheckpoint({ status: "FAILED" }), true);
  assert.equal(isTerminalCheckpoint({ status: "RESIDUE" }), true);
  assert.equal(isTerminalCheckpoint(undefined), false);
});

test("markSourceRunning then recordSourceResult overwrites with the terminal record", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await markSourceRunning("job-x", "venue-1", { root, startedAt: "2026-08-29T00:00:00.000Z" });
  let checkpoints = await loadSourceCheckpoints("job-x", { root });
  assert.equal(checkpoints.get("venue-1").status, "RUNNING");

  await recordSourceResult("job-x", "venue-1", { status: "SUCCESS", attempts: 2, startedAt: "2026-08-29T00:00:00.000Z", completedAt: "2026-08-29T00:00:05.000Z", observation_count: 4 }, { root });
  checkpoints = await loadSourceCheckpoints("job-x", { root });
  const record = checkpoints.get("venue-1");
  assert.equal(record.status, "SUCCESS");
  assert.equal(record.attempts, 2);
  assert.equal(record.observation_count, 4);
});

test("loadSourceCheckpoints on a job with no checkpoints yet returns an empty map, never throws", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const checkpoints = await loadSourceCheckpoints("never-started-job", { root });
  assert.equal(checkpoints.size, 0);
});

test("a corrupt checkpoint file is treated as not-yet-terminal, never a hard crash", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const dir = resolveSourcesDir("job-y", { root });
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${sanitizeSourceIdForFilename("venue-broken")}.json`), "{ not valid json", "utf8");

  const checkpoints = await loadSourceCheckpoints("job-y", { root });
  assert.equal(checkpoints.size, 0, "the corrupt file contributes no terminal checkpoint");
});
