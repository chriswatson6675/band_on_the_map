// BEATMAPPED-CITY-WORKER-DRAIN-AND-EXIT-OPERATOR-LIFECYCLE-01 — the unit
// file itself.
//
// Drain-and-exit only actually works if systemd agrees that a drained
// worker has SUCCEEDED. That is not a property of our JavaScript, it is a
// property of three lines in
// deploy/systemd/beatmapped-city-worker.service, so it is asserted here
// directly — against a parsed unit file, not against prose.
//
// The audit result these tests lock in: the unit already had the right
// directives (`Restart=on-failure`, no `SuccessExitStatus=`), so no
// behavioural correction was required. These tests exist so that stays
// true — `Restart=always`, `Restart=on-success`, or any
// `SuccessExitStatus=` would silently restore the always-active state
// that blocked every deployment.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));
const UNIT_PATH = join(REPO_ROOT, "deploy/systemd/beatmapped-city-worker.service");

/** Parse a systemd unit into { Section: { Key: [values...] } }, ignoring comments. */
async function parseUnit() {
  const raw = (await readFile(UNIT_PATH, "utf8")).replace(/\r\n/g, "\n");
  const sections = {};
  let current = null;
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith(";")) continue;
    const sectionMatch = /^\[(.+)\]$/.exec(trimmed);
    if (sectionMatch) {
      current = sectionMatch[1];
      sections[current] = sections[current] ?? {};
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq < 0 || !current) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    (sections[current][key] = sections[current][key] ?? []).push(value);
  }
  return sections;
}

test("audit: the unit's service type, ExecStart, and stop timeout are exactly what drain-and-exit requires", async () => {
  const unit = await parseUnit();
  assert.deepEqual(unit.Service.Type, ["simple"]);
  assert.deepEqual(unit.Service.ExecStart, ["/usr/bin/node ingestion/city-worker/worker-loop-main.mjs"]);
  assert.deepEqual(unit.Service.WorkingDirectory, ["/opt/band-on-the-map"]);
  assert.deepEqual(unit.Service.User, ["botm"]);
  // A clean shutdown must have real time to finish the in-flight source batch.
  assert.deepEqual(unit.Service.TimeoutStopSec, ["120"]);
  assert.deepEqual(unit.Service.KillSignal, ["SIGTERM"]);
});

test("§24: a clean queue-drained exit is treated as SUCCESS and is NOT respawned", async () => {
  const unit = await parseUnit();

  // `on-failure` respawns on non-zero exit / signal / timeout / watchdog,
  // and never on exit 0. These are the only two policies that would
  // respawn a successfully-drained worker.
  assert.deepEqual(unit.Service.Restart, ["on-failure"], "Restart must be exactly on-failure");
  assert.notDeepEqual(unit.Service.Restart, ["always"]);
  assert.notDeepEqual(unit.Service.Restart, ["on-success"]);

  // With no SuccessExitStatus=, "success" means exactly exit 0 — so exit 2
  // (lock contention) and exit 1 (fatal) both remain restart-eligible.
  assert.equal(unit.Service.SuccessExitStatus, undefined, "SuccessExitStatus must not be set — it would change which exits systemd respawns");
});

test("§24: a genuine process failure still follows the intended restart-on-failure policy, with a rate floor", async () => {
  const unit = await parseUnit();
  assert.deepEqual(unit.Service.Restart, ["on-failure"]);
  assert.ok(unit.Service.RestartSec, "a restart floor must exist so a persistently crashing worker cannot spin the host");
  const seconds = Number.parseInt(String(unit.Service.RestartSec[0]).replace(/s$/, ""), 10);
  assert.ok(seconds >= 5, `RestartSec must be a real floor, got ${unit.Service.RestartSec[0]}`);
  // systemd's default start-rate limit is 5 starts / 10s; a >=5s floor
  // cannot trip it, so a contended wake retries rather than wedging the
  // unit into a failed state.
  assert.ok(seconds >= 2, "RestartSec must exceed the default StartLimitIntervalSec pacing");
});

test("§24: the worker's exit-code contract matches what the unit's restart policy assumes", async () => {
  const main = await readFile(join(REPO_ROOT, "ingestion/city-worker/worker-loop-main.mjs"), "utf8");
  // 2 = refused (lock contention), 1 = fatal. 0 is the default and is
  // never set explicitly — a drained run simply falls off the end.
  assert.match(main, /process\.exitCode = 2;/, "lock contention must keep its distinct exit code");
  assert.match(main, /process\.exitCode = 1;/, "a fatal error must remain non-zero so restart-on-failure fires");
  const explicitCodes = [...main.matchAll(/process\.exitCode = (\d+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(explicitCodes)].sort(), ["1", "2"], "the worker must never explicitly set any other exit code");
});

test("§24: there is no timer for the city worker, and none may be added", async () => {
  const files = await readdir(join(REPO_ROOT, "deploy/systemd"));
  assert.ok(!files.some((name) => name.startsWith("beatmapped-city-worker") && name.endsWith(".timer")), "the city worker must never gain a timer");
  const unitRaw = await readFile(UNIT_PATH, "utf8");
  assert.doesNotMatch(unitRaw, /^\s*\[Timer\]/m);
  assert.doesNotMatch(unitRaw, /^\s*OnCalendar=/m);
  assert.doesNotMatch(unitRaw, /^\s*OnUnitActiveSec=/m);
});

test("§24: nothing in the sanctioned deployment path enables the city worker", async () => {
  const installer = await readFile(join(REPO_ROOT, "deploy/install.sh"), "utf8");
  const executable = installer
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  assert.doesNotMatch(executable, /systemctl\s+(--now\s+)?enable[^\n]*beatmapped-city-worker/);
  assert.doesNotMatch(executable, /systemctl\s+(start|restart)[^\n]*beatmapped-city-worker/, "deployment makes the worker available, never running");
  // It IS installed and reloaded — that ownership must not regress.
  assert.match(executable, /install -m 0644 [^\n]*beatmapped-city-worker\.service/);
});

test("§24: the unit still declares no boot-time Install alias beyond the standard target, and is never enabled by an operator control", async () => {
  const unit = await parseUnit();
  // WantedBy is what `systemctl enable` WOULD use — its presence is fine
  // and expected; what matters is that nothing ever runs `enable`.
  assert.deepEqual(unit.Install.WantedBy, ["multi-user.target"]);
  assert.equal(unit.Install.Alias, undefined);
  assert.equal(unit.Install.RequiredBy, undefined);

  const enqueueWorkflow = await readFile(join(REPO_ROOT, ".github/workflows/enqueue-beatmapped-city-job.yml"), "utf8");
  const executable = enqueueWorkflow
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
  assert.doesNotMatch(executable, /systemctl\s+(--now\s+)?enable/);
});
