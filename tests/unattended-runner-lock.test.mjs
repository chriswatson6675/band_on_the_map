import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import { acquireRunLock, isProcessAlive, releaseRunLock, resolveLockPath } from "../ingestion/unattended-runner/lock.mjs";

async function makeTempRoot() {
  return mkdtemp(join(tmpdir(), "botm-unattended-lock-test-"));
}

test("resolveLockPath resolves under runtime/, relative to the given root", async () => {
  const root = await makeTempRoot();
  const path = resolveLockPath({ root });
  assert.ok(path.replace(/\\/g, "/").endsWith("runtime/unattended-run.lock"));
  await rm(root, { recursive: true, force: true });
});

test("acquireRunLock succeeds when no lock exists, and writes pid/started_at", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const result = await acquireRunLock({ root, pid: 12345 });
  assert.equal(result.ok, true);

  const payload = JSON.parse(await readFile(result.path, "utf8"));
  assert.equal(payload.pid, 12345);
  assert.ok(!Number.isNaN(Date.parse(payload.started_at)));
});

test("a second concurrent acquireRunLock is refused safely while a live process holds it", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await acquireRunLock({ root, pid: process.pid }); // this test's own process — genuinely alive
  assert.equal(first.ok, true);

  const second = await acquireRunLock({ root, pid: process.pid });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "ANOTHER_RUN_IN_PROGRESS");
  assert.equal(second.existing.pid, process.pid);
});

test("releaseRunLock removes the lock, allowing a subsequent acquireRunLock to succeed", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await acquireRunLock({ root, pid: process.pid });
  await releaseRunLock({ root });

  const reacquired = await acquireRunLock({ root, pid: process.pid });
  assert.equal(reacquired.ok, true);
});

test("releaseRunLock is idempotent — releasing an already-absent lock never throws", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await assert.doesNotReject(() => releaseRunLock({ root }));
  await assert.doesNotReject(() => releaseRunLock({ root })); // twice
});

test("a lock held by a PID that no longer exists is treated as stale and safely reclaimed", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  // A PID astronomically unlikely to be a real live process.
  const deadPid = 2147480000;
  assert.equal(isProcessAlive(deadPid), false);

  const path = resolveLockPath({ root });
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ pid: deadPid, started_at: new Date().toISOString() }), "utf8");

  const result = await acquireRunLock({ root, pid: process.pid });
  assert.equal(result.ok, true, "a lock owned by a dead PID must be reclaimed, not treated as a live overlap");
});

test("a lock older than staleAfterMs is treated as stale and reclaimed, even if its PID happens to still be alive", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const path = resolveLockPath({ root });
  await mkdir(dirname(path), { recursive: true });
  const ancientStart = new Date(Date.now() - 10 * 60 * 60 * 1000).toISOString(); // 10 hours ago
  await writeFile(path, JSON.stringify({ pid: process.pid, started_at: ancientStart }), "utf8");

  const result = await acquireRunLock({ root, pid: process.pid, staleAfterMs: 2 * 60 * 60 * 1000 }); // 2h threshold
  assert.equal(result.ok, true, "a lock older than staleAfterMs must be reclaimed even from a live PID");
});

test("a fresh, live lock is NEVER reclaimed as stale merely because staleAfterMs is small in a later call", async (t) => {
  const root = await makeTempRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await acquireRunLock({ root, pid: process.pid, staleAfterMs: 2 * 60 * 60 * 1000 });
  assert.equal(first.ok, true);

  // Same fresh lock, checked again immediately — must still be respected.
  const second = await acquireRunLock({ root, pid: process.pid, staleAfterMs: 2 * 60 * 60 * 1000 });
  assert.equal(second.ok, false);
  assert.equal(second.reason, "ANOTHER_RUN_IN_PROGRESS");
});

test("isProcessAlive: true for this test's own running process", () => {
  assert.equal(isProcessAlive(process.pid), true);
});

test("isProcessAlive: false for a non-integer/invalid pid", () => {
  assert.equal(isProcessAlive(0), false);
  assert.equal(isProcessAlive(-1), false);
  assert.equal(isProcessAlive(NaN), false);
});
