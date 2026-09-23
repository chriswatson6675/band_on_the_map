import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { recordSourceCheckpoint, loadSourceCheckpoints, saveRunCheckpoint, loadRunCheckpoint, TERMINAL_SOURCE_STATUSES } from "../ingestion/uk-programme-acquisition/checkpoint.mjs";

async function tempRoot() {
  return mkdtemp(join(tmpdir(), "botm-uk-prog-checkpoint-test-"));
}

test("recordSourceCheckpoint + loadSourceCheckpoints round-trips durably (not just in-process memory)", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await recordSourceCheckpoint("run1", "uk-prog-a", { status: "ACQUIRED", proven_event_count: 5 }, { root });
  await recordSourceCheckpoint("run1", "uk-prog-b", { status: "NO_SOURCE_FOUND" }, { root });

  const reloaded = await loadSourceCheckpoints("run1", { root });
  assert.equal(reloaded.size, 2);
  assert.equal(reloaded.get("uk-prog-a").status, "ACQUIRED");
  assert.equal(reloaded.get("uk-prog-a").proven_event_count, 5);
});

test("loadSourceCheckpoints returns an empty Map for a run that has never checkpointed anything", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  const reloaded = await loadSourceCheckpoints("never-run", { root });
  assert.equal(reloaded.size, 0);
});

test("every TERMINAL_SOURCE_STATUSES member is a real, distinguishable outcome (no accidental duplicates)", () => {
  assert.equal(TERMINAL_SOURCE_STATUSES.size, new Set([...TERMINAL_SOURCE_STATUSES]).size);
  assert.ok(TERMINAL_SOURCE_STATUSES.has("ACQUIRED"));
  assert.ok(TERMINAL_SOURCE_STATUSES.has("RESIDUE"));
  assert.ok(!TERMINAL_SOURCE_STATUSES.has("RETRYABLE"), "a transient/retryable failure must never be treated as terminal");
});

test("saveRunCheckpoint + loadRunCheckpoint round-trips the run-level summary", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await saveRunCheckpoint("run1", { total_sources: 100, acquired: 40 }, { root });
  const reloaded = await loadRunCheckpoint("run1", { root });
  assert.equal(reloaded.total_sources, 100);
  assert.equal(reloaded.acquired, 40);
});

test("loadRunCheckpoint returns null for a run with no saved summary yet", async (t) => {
  const root = await tempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  assert.equal(await loadRunCheckpoint("never-run", { root }), null);
});
