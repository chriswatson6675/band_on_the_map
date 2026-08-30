// BEATMAPPED-MAINLINE-CITY-JOB-OPERATOR-CONTROL-01 — proof for the two
// operator controls:
//
//   .github/workflows/enqueue-beatmapped-city-job.yml
//   .github/workflows/check-beatmapped-city-jobs.yml
//
// Two layers, matching this repository's existing dependency-free
// deployment-workflow testing convention (tests/deploy-workflow-structure.test.mjs,
// tests/city-worker-bounded-trial-workflow.test.mjs) — never a YAML-parsing
// library as a declared dependency:
//
//   1. Content-level assertions on the raw workflow YAML text.
//   2. Genuine BEHAVIOURAL proof of the wake step's embedded remote
//      script — extracted byte-for-byte and actually executed as a real
//      bash subprocess against a stubbed systemd whose state changes the
//      way systemd's would.
//
// Nothing here contacts GitHub Actions or production; nothing dispatches
// anything.

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ENQUEUE_WORKFLOW = fileURLToPath(new URL("../.github/workflows/enqueue-beatmapped-city-job.yml", import.meta.url));
const STATUS_WORKFLOW = fileURLToPath(new URL("../.github/workflows/check-beatmapped-city-jobs.yml", import.meta.url));
const CATALOGUE = fileURLToPath(new URL("../ingestion/city-worker/city-estate-catalogue.json", import.meta.url));

const WAKE_STEP = "Wake the systemd worker with an idempotent start";
const ENQUEUE_STEP = "Enqueue exactly one governed city job";
const PREFLIGHT_STEP = "Preflight the deployed host";

async function readWorkflow(path) {
  return (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
}

function stripCommentLines(yaml) {
  return yaml
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

/** Extracts one step's full body — from its own `- name: <prefix>...` line up to the next 6-space-indented `- name:`, or EOF. */
function extractStepBody(yaml, namePrefix) {
  const lines = yaml.split("\n");
  const start = lines.findIndex((line) => line.trimStart().startsWith("- name:") && line.includes(namePrefix));
  assert.ok(start >= 0, `expected a step named like "${namePrefix}"`);
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (/^ {6}- name:/.test(lines[index])) {
      end = index;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

/** Extracts a step's embedded REMOTE_SCRIPT heredoc body (the half that runs ON the host). */
function extractRemoteScriptFrom(yaml, namePrefix) {
  const body = extractStepBody(yaml, namePrefix);
  const match = /<<'REMOTE_SCRIPT'[^\n]*\n([\s\S]*?)\n\s*REMOTE_SCRIPT/.exec(body);
  assert.ok(match, `expected step "${namePrefix}" to embed a REMOTE_SCRIPT heredoc`);
  return match[1];
}

/**
 * Extracts the RUNNER half of a step — everything after the REMOTE_SCRIPT
 * terminator. This is where the pass/fail decision actually lives, so
 * asserting "the control fails loudly" means executing THIS, not the
 * remote script (which only reports state and always exits 0).
 */
function extractRunnerTailFrom(yaml, namePrefix) {
  const body = extractStepBody(yaml, namePrefix);
  const index = body.indexOf("          REMOTE_SCRIPT\n");
  assert.ok(index > 0, `expected step "${namePrefix}" to have a runner-side tail after its REMOTE_SCRIPT`);
  return body.slice(index + "          REMOTE_SCRIPT\n".length);
}

/**
 * Runs a step's runner-side tail against a prepared wake-output file. The
 * hardcoded /tmp paths and the step summary are redirected into a scratch
 * directory — the only substitutions made, and both are asserted by the
 * caller's expectations rather than changing any decision logic.
 */
async function runWakeRunnerTail(tail, remoteOutput) {
  const dir = await mkdtemp(join(tmpdir(), "wake-tail-"));
  const outputPath = join(dir, "wake-output.txt");
  const summaryPath = join(dir, "summary.md");
  await writeFile(outputPath, remoteOutput, "utf8");
  await writeFile(summaryPath, "", "utf8");

  // The substituted path is interpolated into unquoted shell words, so it
  // must be POSIX-style — a Windows path's backslashes would be consumed
  // as escapes by bash.
  const script = tail.split("/tmp/wake-output.txt").join(outputPath.replace(/\\/g, "/"));
  const result = await new Promise((resolvePromise) => {
    const child = spawn("bash", [], { env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath.replace(/\\/g, "/"), CITY_WORKER_UNIT: "beatmapped-city-worker.service" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolvePromise({ status: code, stdout, stderr }));
    child.stdin.write(script);
    child.stdin.end();
  });

  const summary = await readFile(summaryPath, "utf8");
  await rm(dir, { recursive: true, force: true });
  return { ...result, summary };
}

/**
 * Runs the wake step's real remote script under a stubbed systemd that
 * behaves like the real thing, including the one behaviour the
 * drain-and-exit race turns on:
 *
 *   - `is-active`/`is-enabled` PRINT a state AND exit non-zero for the
 *     not-active / not-enabled cases (the systemd quirk that once produced
 *     "disabled\ndisabled");
 *   - `start` against an ALREADY-ACTIVE unit is a genuine NO-OP — it does
 *     not restart, and it does not stop the old process from exiting;
 *   - `start` against an inactive unit launches a fresh worker;
 *   - an "old" worker (`oldWorkerExitsAfter`) disappears after N is-active
 *     observations, exactly as a worker that has already made its final
 *     empty-queue check would.
 *
 * `runnableWork` is what the host's read-only `has-runnable-work` query
 * answers, and `drainsOnStart` models a freshly-started worker that drains
 * the queue and exits inside the convergence window.
 */
async function runWakeScript(script, { initialState = "inactive", enabled = "disabled", startRc = 0, oldWorkerExitsAfter = 0, runnableWork = "true", drainsOnStart = false, runnableQueryAvailable = true } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "wake-stub-"));
  const stateFile = join(dir, "state");
  const genFile = join(dir, "generation");
  const countdownFile = join(dir, "countdown");
  const runnableFile = join(dir, "runnable");
  const callsFile = join(dir, "calls");
  await writeFile(stateFile, initialState, "utf8");
  await writeFile(genFile, initialState === "inactive" ? "none" : "old", "utf8");
  await writeFile(countdownFile, String(oldWorkerExitsAfter), "utf8");
  await writeFile(runnableFile, runnableWork, "utf8");
  await writeFile(callsFile, "", "utf8");

  const harness = [
    // `sudo -u botm bash -c "... cli.mjs has-runnable-work"` is answered by
    // the stub; every other sudo invocation falls through to the real
    // command (which is the systemctl function below).
    "sudo() {",
    '  case "$*" in',
    "    *has-runnable-work*)",
    '      if [ "${STUB_RUNNABLE_QUERY:-1}" = "1" ]; then printf "RUNNABLE_WORK=%s\\n" "$(cat "$STUB_RUNNABLE_FILE")"; fi',
    "      return 0 ;;",
    "  esac",
    '  "$@"',
    "}",
    "sleep() { :; }",
    "systemctl() {",
    "  local args=() quiet=0 a",
    '  for a in "$@"; do if [ "$a" = "--quiet" ]; then quiet=1; else args+=("$a"); fi; done',
    '  printf "%s\\n" "${args[*]}" >> "$STUB_CALLS"',
    '  case "${args[0]}" in',
    "    is-active)",
    '      local s g n; s="$(cat "$STUB_STATE_FILE")"; g="$(cat "$STUB_GEN_FILE")"; n="$(cat "$STUB_COUNTDOWN_FILE")"',
    '      [ "$quiet" = "1" ] || printf "%s\\n" "$s"',
    '      if [ "$g" = "old" ] && [ "$n" -gt 0 ]; then',
    '        n=$((n - 1)); printf "%s" "$n" > "$STUB_COUNTDOWN_FILE"',
    '        if [ "$n" -le 0 ]; then printf "inactive" > "$STUB_STATE_FILE"; printf "none" > "$STUB_GEN_FILE"; fi',
    "      fi",
    '      case "$s" in active|activating|reloading) return 0 ;; *) return 3 ;; esac ;;',
    "    is-enabled)",
    '      [ "$quiet" = "1" ] || printf "%s\\n" "$STUB_ENABLED"',
    '      case "$STUB_ENABLED" in enabled|enabled-runtime) return 0 ;; *) return 1 ;; esac ;;',
    "    start)",
    '      local s; s="$(cat "$STUB_STATE_FILE")"',
    '      case "$s" in active|activating|reloading) return 0 ;; esac   # already running: a real no-op',
    '      if [ "${STUB_START_RC:-0}" != "0" ]; then return "${STUB_START_RC}"; fi',
    '      printf "active" > "$STUB_STATE_FILE"; printf "new" > "$STUB_GEN_FILE"',
    '      if [ "${STUB_DRAINS_ON_START:-0}" = "1" ]; then printf "false" > "$STUB_RUNNABLE_FILE"; fi',
    "      return 0 ;;",
    "  esac",
    "  return 1",
    "}",
    'set -- "beatmapped-city-worker.service" "/opt/band-on-the-map"',
    script,
  ].join("\n");

  const result = await new Promise((resolvePromise) => {
    const child = spawn("bash", [], {
      env: {
        ...process.env,
        STUB_STATE_FILE: stateFile,
        STUB_GEN_FILE: genFile,
        STUB_COUNTDOWN_FILE: countdownFile,
        STUB_RUNNABLE_FILE: runnableFile,
        STUB_CALLS: callsFile,
        STUB_ENABLED: enabled,
        STUB_START_RC: String(startRc),
        STUB_DRAINS_ON_START: drainsOnStart ? "1" : "0",
        STUB_RUNNABLE_QUERY: runnableQueryAvailable ? "1" : "0",
      },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolvePromise({ status: code, stdout, stderr }));
    child.stdin.write(harness);
    child.stdin.end();
  });

  const calls = (await readFile(callsFile, "utf8")).split("\n").filter(Boolean);
  const finalState = await readFile(stateFile, "utf8");
  await rm(dir, { recursive: true, force: true });
  return { ...result, calls, finalState, value: (key) => (new RegExp(`^${key}=(.*)$`, "m").exec(result.stdout) ?? [])[1] };
}

// ---------------------------------------------------------------------------
// A. inactive worker → enqueue, then systemctl start
// ---------------------------------------------------------------------------

test("A: an INACTIVE worker is started via systemd, and the enqueue step runs before the wake step", async () => {
  const yaml = await readWorkflow(ENQUEUE_WORKFLOW);
  const enqueueIndex = yaml.indexOf(ENQUEUE_STEP);
  const wakeIndex = yaml.indexOf(WAKE_STEP);
  assert.ok(enqueueIndex > 0 && wakeIndex > enqueueIndex, "the job must be durable before the worker is woken");

  const result = await runWakeScript(extractRemoteScriptFrom(yaml, WAKE_STEP), { initialState: "inactive" });
  assert.equal(result.status, 0, `expected a clean wake; stderr: ${result.stderr}`);
  assert.equal(result.value("WORKER_ACTIVE_BEFORE"), "inactive");
  assert.equal(result.value("WORKER_ACTIVE_AFTER"), "active");
  assert.equal(result.value("WORKER_WAKE_CONVERGED"), "WORKER_ACTIVE_AND_STABLE");
  assert.ok(result.calls.includes("start beatmapped-city-worker.service"));
});

test("A: every genuinely not-running state (inactive, failed, dead, unknown) is started", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  for (const state of ["inactive", "failed", "deactivating", "unknown"]) {
    const result = await runWakeScript(script, { initialState: state });
    assert.equal(result.status, 0, `"${state}" means the worker is not running and must be started; stderr: ${result.stderr}`);
    assert.equal(result.value("WORKER_WAKE_CONVERGED"), "WORKER_ACTIVE_AND_STABLE");
    assert.ok(result.calls.some((call) => call.startsWith("start ")));
  }
});

test("A: a worker that starts, drains and exits inside the convergence window is a SUCCESS, not a stranded job", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  // Small estate: the started worker finishes everything almost immediately
  // and exits — which under drain-and-exit is exactly the desired outcome.
  const result = await runWakeScript(script, { initialState: "inactive", drainsOnStart: true });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.value("WORKER_WAKE_CONVERGED"), "NO_RUNNABLE_WORK_REMAINS");
  assert.equal(result.value("WORKER_RUNNABLE_WORK"), "false");
});

// ---------------------------------------------------------------------------
// B. active worker → no restart
// ---------------------------------------------------------------------------

test("B/22: against an ALREADY-ACTIVE worker the wake issues only an IDEMPOTENT start — never a restart, never a stop, and the running process is untouched", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  for (const state of ["active", "activating", "reloading"]) {
    // oldWorkerExitsAfter: 0 — this worker stays up for the whole window.
    const result = await runWakeScript(script, { initialState: state });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.value("WORKER_WAKE_CONVERGED"), "WORKER_ACTIVE_AND_STABLE");

    // `start` IS issued (that is the race-safe rule) but is a genuine
    // no-op: the stub refuses to touch an already-running unit, and the
    // process generation never changes.
    assert.ok(result.calls.some((call) => call.startsWith("start ")), "the idempotent start is always issued");
    assert.ok(!result.calls.some((call) => call.startsWith("restart ")), "a running worker must never be restarted");
    assert.ok(!result.calls.some((call) => call.startsWith("try-restart")), "never try-restart either");
    assert.ok(!result.calls.some((call) => call.startsWith("reload")), "never reload");
    assert.ok(!result.calls.some((call) => call.startsWith("stop ")), "a running worker must never be stopped — no SIGTERM");
    assert.ok(!result.calls.some((call) => call.startsWith("kill")), "never signalled directly");
    assert.ok(!result.calls.some((call) => call.startsWith("enable")), "never enabled");
  }
});

test("B/22: the wake converges in the minimum number of observations when the worker is stably running — it does not spin", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  const result = await runWakeScript(script, { initialState: "active" });
  assert.equal(result.value("WORKER_WAKE_ATTEMPTS"), "2", "two consecutive active observations is the convergence condition — no more, no fewer");
});

test("B: `restart` appears nowhere in the operator controls — restarting would SIGTERM a worker that may be mid-city", async () => {
  for (const path of [ENQUEUE_WORKFLOW, STATUS_WORKFLOW]) {
    const executable = stripCommentLines(await readWorkflow(path));
    assert.doesNotMatch(executable, /systemctl\s+restart/, `${path} must never restart the worker`);
    assert.doesNotMatch(executable, /systemctl\s+(stop|kill|disable|mask)\b/, `${path} must not stop/disable the worker either`);
  }
});

// ---------------------------------------------------------------------------
// C. the worker is never enabled
// ---------------------------------------------------------------------------

test("C: no operator control ever enables the city worker for boot", async () => {
  for (const path of [ENQUEUE_WORKFLOW, STATUS_WORKFLOW]) {
    const executable = stripCommentLines(await readWorkflow(path));
    assert.doesNotMatch(executable, /systemctl\s+(--now\s+)?enable/, `${path} must never enable a unit`);
    assert.doesNotMatch(executable, /enable\s+--now/, `${path} must never enable a unit`);
  }
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  for (const initialState of ["inactive", "active"]) {
    const result = await runWakeScript(script, { initialState });
    assert.ok(!result.calls.some((call) => call.startsWith("enable")), "the wake script must issue no enable verb");
    assert.equal(result.value("WORKER_ENABLED_AFTER"), "disabled");
  }
});

test("C: a worker found ENABLED for boot fails the control closed, even when the wake itself succeeded", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  for (const enabled of ["enabled", "enabled-runtime"]) {
    const result = await runWakeScript(script, { initialState: "inactive", enabled });
    assert.equal(result.value("WORKER_ENABLED_AFTER"), enabled);
  }
  // The fail-closed decision itself lives in the runner half of the step.
  const body = extractStepBody(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  assert.match(body, /enabled\|enabled-runtime\)/);
  assert.match(body, /CITY_WORKER_ENABLED_FOR_BOOT/);
  assert.match(body, /exit 1/);
});

test("C: the canonical single-line state read is used — never the `|| echo` composite that produced \"disabled\\ndisabled\"", async () => {
  const body = stripCommentLines(extractStepBody(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP));
  assert.match(body, /systemd_state\(\) \{/);
  assert.match(body, /head -n1/);
  assert.doesNotMatch(body, /\$\(\s*systemctl\s+is-(?:active|enabled)[^)]*\|\|\s*echo/);

  // And prove it behaviourally: `is-enabled` printing "disabled" AND exiting
  // non-zero must yield the single token, never a two-line composite.
  const result = await runWakeScript(extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP), { initialState: "inactive", enabled: "disabled" });
  assert.equal(result.value("WORKER_ENABLED_BEFORE"), "disabled");
  assert.doesNotMatch(result.stdout, /=disabled\s*\n\s*disabled/);
});

// ---------------------------------------------------------------------------
// D / E. no foreground node worker, no nohup/tmux/screen
// ---------------------------------------------------------------------------

test("D: the worker process is never launched in the SSH foreground — only systemd starts it", async () => {
  for (const path of [ENQUEUE_WORKFLOW, STATUS_WORKFLOW]) {
    const executable = stripCommentLines(await readWorkflow(path));
    assert.doesNotMatch(executable, /worker-loop-main\.mjs/, `${path} must never run the worker daemon directly`);
    assert.doesNotMatch(executable, /city-worker:daemon/, `${path} must never run the daemon npm script`);
    assert.doesNotMatch(executable, /cli\.mjs\s+run-worker/, `${path} must never drain the queue in the SSH foreground`);
    assert.doesNotMatch(executable, /cli\.mjs\s+resume-job/, `${path} must never run a job in the SSH foreground`);
  }
});

test("D: the only remote CLI commands the enqueue control runs are the governed enqueue and a read-only listing", async () => {
  const executable = stripCommentLines(await readWorkflow(ENQUEUE_WORKFLOW));
  const commands = [...executable.matchAll(/cli\.mjs\s+([a-z-]+)/g)].map((match) => match[1]);
  // `has-runnable-work` was added by
  // BEATMAPPED-CITY-WORKER-DRAIN-AND-EXIT-OPERATOR-LIFECYCLE-01 and is, like
  // `list-city-estates`, strictly read-only.
  assert.deepEqual([...new Set(commands)].sort(), ["enqueue-city-estate", "has-runnable-work", "list-city-estates"]);
  // The original arbitrary-input primitive must never be reachable from an operator control.
  assert.ok(!commands.includes("enqueue-city"), "the operator control must use the governed entry point, not the arbitrary-path primitive");
});

test("E: no nohup, tmux, screen, or backgrounding is used anywhere in either control", async () => {
  for (const path of [ENQUEUE_WORKFLOW, STATUS_WORKFLOW]) {
    const executable = stripCommentLines(await readWorkflow(path));
    assert.doesNotMatch(executable, /\bnohup\b/);
    assert.doesNotMatch(executable, /\btmux\b/);
    assert.doesNotMatch(executable, /\bscreen\b/);
    assert.doesNotMatch(executable, /\bdisown\b/);
    assert.doesNotMatch(executable, /\bsetsid\b/);
  }
});

// ---------------------------------------------------------------------------
// F. an enqueue failure must not start the worker
// ---------------------------------------------------------------------------

test("F: the wake step is unconditional-on-success — a failed enqueue skips it, so no worker is started for a job that does not exist", async () => {
  const yaml = await readWorkflow(ENQUEUE_WORKFLOW);
  const wakeBody = extractStepBody(yaml, WAKE_STEP);
  assert.doesNotMatch(wakeBody, /^\s{8}if:/m, "the wake step must have no `if:` — an earlier failure must skip it");
  assert.doesNotMatch(wakeBody, /always\(\)|failure\(\)/, "the wake step must never run after a failure");

  // The preflight (which is what fails when production is not ready) is
  // itself read-only, and precedes both enqueue and wake.
  const preflightBody = extractStepBody(yaml, PREFLIGHT_STEP);
  assert.ok(yaml.indexOf(PREFLIGHT_STEP) < yaml.indexOf(ENQUEUE_STEP));
  assert.doesNotMatch(preflightBody, /systemctl\s+(start|restart|stop|enable|disable)/, "preflight must change nothing");
  assert.doesNotMatch(preflightBody, /enqueue-city-estate/, "preflight must never enqueue");
});

test("F: an unknown estate key is refused on the runner, before any SSH connection is made", async () => {
  const yaml = await readWorkflow(ENQUEUE_WORKFLOW);
  const validateIndex = yaml.indexOf("Validate the requested estate key");
  const sshIndex = yaml.indexOf("Configure pinned SSH access");
  assert.ok(validateIndex > 0 && validateIndex < sshIndex, "key validation must precede SSH key material being written");
});

test("F: the dispatch input is a closed `choice` list that exactly matches the governed catalogue", async () => {
  const yaml = await readWorkflow(ENQUEUE_WORKFLOW);
  const inputBlock = yaml.slice(yaml.indexOf("city_estate:"), yaml.indexOf("permissions:"));
  assert.match(inputBlock, /type: choice/, "the estate input must be a closed choice, never free text");

  const offered = [...inputBlock.matchAll(/^\s+- ([a-z0-9-]+)$/gm)].map((match) => match[1]);
  const catalogue = JSON.parse(await readFile(CATALOGUE, "utf8"));
  assert.deepEqual(offered, catalogue.entries.map((entry) => entry.key), "the dispatch choices must be exactly the governed catalogue keys, in catalogue order");
});

test("F: neither control accepts a path, a source id, a registry blob, or a free-text country/city as an input", async () => {
  for (const path of [ENQUEUE_WORKFLOW, STATUS_WORKFLOW]) {
    const yaml = await readWorkflow(path);
    const inputs = yaml.slice(yaml.indexOf("inputs:"), yaml.indexOf("permissions:"));
    for (const forbidden of ["estate_ref", "estate_path", "source_id", "source_ids", "registry", "country", "city:", "config", "ref:"]) {
      assert.ok(!inputs.includes(forbidden), `${path} must not offer an input named like "${forbidden}"`);
    }
  }
  // The status control's one free-text input is constrained to a UUID.
  const statusYaml = await readWorkflow(STATUS_WORKFLOW);
  assert.match(statusYaml, /\[0-9a-fA-F\]\{8\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{4\}-\[0-9a-fA-F\]\{12\}/);
});

// ---------------------------------------------------------------------------
// G. a start failure leaves a recoverable durable job
// ---------------------------------------------------------------------------

test("G: when systemd refuses to start the worker, the remote script reports NOT_CONVERGED rather than claiming success", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  const result = await runWakeScript(script, { initialState: "inactive", startRc: 1 });
  assert.equal(result.value("WORKER_ACTIVE_AFTER"), "inactive");
  assert.equal(result.value("WORKER_WAKE_CONVERGED"), "NOT_CONVERGED");
  assert.equal(result.value("WORKER_START_FAILURES"), "8", "every bounded attempt is genuinely tried before giving up");
  assert.equal(result.value("WORKER_RUNNABLE_WORK"), "true", "and the work is honestly reported as still outstanding");
});

test("G: the runner half genuinely FAILS the control on a non-converged wake, and PASSES on each converged outcome", async () => {
  const tail = extractRunnerTailFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  const base = ["WORKER_ACTIVE_BEFORE=inactive", "WORKER_ENABLED_BEFORE=disabled", "WORKER_WAKE_ATTEMPTS=8", "WORKER_STARTS_ISSUED=0", "WORKER_START_FAILURES=8", "WORKER_ENABLED_AFTER=disabled"];

  const failed = await runWakeRunnerTail(tail, [...base, "WORKER_RUNNABLE_WORK=true", "WORKER_ACTIVE_AFTER=inactive", "WORKER_WAKE_CONVERGED=NOT_CONVERGED"].join("\n") + "\n");
  assert.equal(failed.status, 1, "a wake that never produced a worker must fail the control");
  assert.match(failed.stdout, /WORKER_WAKE_DID_NOT_CONVERGE/);
  assert.match(failed.stdout, /REMAINS DURABLE AND QUEUED/);

  const stable = await runWakeRunnerTail(tail, [...base, "WORKER_RUNNABLE_WORK=true", "WORKER_ACTIVE_AFTER=active", "WORKER_WAKE_CONVERGED=WORKER_ACTIVE_AND_STABLE"].join("\n") + "\n");
  assert.equal(stable.status, 0, `stderr: ${stable.stderr}`);
  assert.match(stable.summary, /worker running and systemd-owned/);

  // Drained-and-exited inside the window is a SUCCESS under drain-and-exit,
  // not a stranded job — the single most important new pass case.
  const drained = await runWakeRunnerTail(tail, [...base, "WORKER_RUNNABLE_WORK=false", "WORKER_ACTIVE_AFTER=inactive", "WORKER_WAKE_CONVERGED=NO_RUNNABLE_WORK_REMAINS"].join("\n") + "\n");
  assert.equal(drained.status, 0, `a worker that drained and exited must not be reported as a failure; stderr: ${drained.stderr}`);
  assert.match(drained.summary, /drained and exited cleanly/);
});

test("G: an ENABLED-for-boot worker fails the runner half closed, whatever the wake outcome was", async () => {
  const tail = extractRunnerTailFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  for (const enabled of ["enabled", "enabled-runtime"]) {
    const result = await runWakeRunnerTail(
      tail,
      ["WORKER_ACTIVE_BEFORE=inactive", "WORKER_WAKE_ATTEMPTS=1", "WORKER_STARTS_ISSUED=1", "WORKER_START_FAILURES=0", "WORKER_RUNNABLE_WORK=true", "WORKER_ACTIVE_AFTER=active", `WORKER_ENABLED_AFTER=${enabled}`, "WORKER_WAKE_CONVERGED=WORKER_ACTIVE_AND_STABLE"].join("\n") + "\n",
    );
    assert.equal(result.status, 1, `"${enabled}" must fail closed even though the wake itself converged`);
    assert.match(result.stdout, /CITY_WORKER_ENABLED_FOR_BOOT/);
  }
});

test("G: a start failure fails the control loudly AND states that the queued job is durable and recoverable", async () => {
  const body = extractStepBody(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  assert.match(body, /WORKER_WAKE_DID_NOT_CONVERGE/);
  assert.match(body, /REMAINS DURABLE AND QUEUED/);
  assert.match(body, /re-dispatch this workflow/, "the recovery path must be named, not left to the operator to invent");
  // The recovery works precisely because a re-dispatch cannot duplicate the
  // job — proven behaviourally in tests/city-worker/city-job-cycle-policy.test.mjs.
  assert.match(body, /no duplicate job will be created/);
  assert.match(body, /WORK_NEEDS_WAKE/, "the operator is told which status the read-only control will show");
});

// ---------------------------------------------------------------------------
// §21 — the shutdown-boundary race, reproduced explicitly.
//
// THE PROPERTY: a durable queued job plus a successful operator action
// must always leave SOME systemd-owned worker started. Under drain-and-exit
// the dangerous case is the instant between a worker's final empty-queue
// check and its process exiting — during which `systemctl start` is a
// no-op because systemd still reports the unit active.
// ---------------------------------------------------------------------------

test("21: PRIOR WORKER ALREADY INACTIVE — the job is picked up by a freshly started worker", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  const result = await runWakeScript(script, { initialState: "inactive", runnableWork: "true" });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.value("WORKER_WAKE_CONVERGED"), "WORKER_ACTIVE_AND_STABLE");
  assert.equal(result.finalState, "active");
});

test("21: PRIOR WORKER ACTIVE AND STAYING ACTIVE — no new process is needed; the running worker will drain the new job", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  const result = await runWakeScript(script, { initialState: "active", oldWorkerExitsAfter: 0, runnableWork: "true" });
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.equal(result.value("WORKER_WAKE_CONVERGED"), "WORKER_ACTIVE_AND_STABLE");
  assert.ok(!result.calls.some((call) => call.startsWith("restart ")));
});

test("21: PRIOR WORKER JUST EXITING — the exact race. A single start would be a no-op and strand the job; the wake converges instead and a NEW worker is started", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  // The old worker is still reported `active` on the first observation and
  // is gone by the second — i.e. it had already made its final empty-queue
  // check when the operator's job was enqueued.
  const result = await runWakeScript(script, { initialState: "active", oldWorkerExitsAfter: 1, runnableWork: "true" });

  assert.equal(result.status, 0, `the job must not be stranded; stderr: ${result.stderr}`);
  assert.equal(result.value("WORKER_ACTIVE_BEFORE"), "active", "systemd reported the OLD worker as active when the operator acted");
  assert.equal(result.value("WORKER_WAKE_CONVERGED"), "WORKER_ACTIVE_AND_STABLE");
  assert.equal(result.finalState, "active", "a worker is running at the end — the durable job is not stranded");
  // More than one start was needed: the first was the no-op against the
  // dying worker, a later one genuinely launched a replacement.
  assert.ok(Number(result.value("WORKER_WAKE_ATTEMPTS")) >= 2, "the wake must not stop at the first observation");
  assert.ok(result.calls.filter((call) => call.startsWith("start ")).length >= 2, "start must be re-issued after the old worker went away");
  assert.ok(!result.calls.some((call) => call.startsWith("restart ")), "and never by restarting");
});

test("21: a SINGLE non-converging start would have stranded the job — proving the convergence loop is what closes the race, not `always start` alone", async () => {
  const body = stripCommentLines(extractStepBody(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP));
  // The loop, the re-issued start inside it, and the two-observation
  // stability rule are all load-bearing; a regression to a single start
  // outside a loop must fail this test.
  assert.match(body, /while \[ "\$ATTEMPTS" -lt "\$MAX_WAKE_ATTEMPTS" \]/, "the wake must be a bounded convergence loop");
  assert.match(body, /CONSECUTIVE_ACTIVE" -ge 2/, "stability must require two consecutive active observations");
  assert.match(body, /sudo systemctl start "\$UNIT"/, "start must be re-issued inside the loop");
  assert.match(body, /has-runnable-work/, "convergence must consult whether work actually remains");
});

test("21: the wake is bounded — it returns promptly and never waits for a city to finish", async () => {
  const body = stripCommentLines(extractStepBody(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP));
  assert.match(body, /MAX_WAKE_ATTEMPTS=(\d+)/);
  const attempts = Number(/MAX_WAKE_ATTEMPTS=(\d+)/.exec(body)[1]);
  const grace = Number(/WAKE_GRACE_SECONDS=(\d+)/.exec(body)[1]);
  assert.ok(attempts * grace <= 60, `the wake's worst case must stay well under a minute, got ${attempts * grace}s`);
  // It must never poll for a terminal job state — that is the status control's job.
  assert.doesNotMatch(body, /COMPLETE_WITH_RESIDUE|show-job|city-jobs-status/, "the wake must not wait for job completion");
});

test("21: if the host cannot answer whether work remains, the wake assumes work REMAINS (fails safe) rather than declaring success", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  const result = await runWakeScript(script, { initialState: "inactive", runnableQueryAvailable: false });
  assert.equal(result.value("WORKER_RUNNABLE_WORK"), "unknown");
  // "unknown" must never be mistaken for "false" — convergence still has to
  // come from an actually-running worker.
  assert.equal(result.value("WORKER_WAKE_CONVERGED"), "WORKER_ACTIVE_AND_STABLE");
  assert.equal(result.status, 0);
});

test("21: the enqueue control preflights the read-only query its convergence check depends on, before anything is enqueued", async () => {
  const yaml = await readWorkflow(ENQUEUE_WORKFLOW);
  const preflightBody = extractStepBody(yaml, PREFLIGHT_STEP);
  assert.match(preflightBody, /RUNNABLE_WORK_QUERY_AVAILABLE/);
  assert.match(preflightBody, /RUNNABLE_WORK_QUERY_NOT_DEPLOYED/);
  assert.ok(yaml.indexOf(PREFLIGHT_STEP) < yaml.indexOf(ENQUEUE_STEP));
});

// ---------------------------------------------------------------------------
// §8 — a duplicate-active decision must still wake the worker
// ---------------------------------------------------------------------------

test("8: the wake runs after a DUPLICATE_ACTIVE_CITY_JOB decision too — a durable job is never stranded because the service changed state mid-request", async () => {
  const yaml = await readWorkflow(ENQUEUE_WORKFLOW);
  const enqueueBody = extractStepBody(yaml, ENQUEUE_STEP);

  // The duplicate branch exits ZERO (a policy outcome, not a crash), which
  // is precisely what lets the unconditional wake step below still run.
  assert.match(enqueueBody, /DUPLICATE_ACTIVE_CITY_JOB/);
  assert.doesNotMatch(enqueueBody, /reason === "DUPLICATE_ACTIVE_CITY_JOB"[\s\S]{0,400}?process\.exit\(1\)/, "a duplicate must not fail the step");

  const wakeBody = extractStepBody(yaml, WAKE_STEP);
  assert.doesNotMatch(wakeBody, /^\s{8}if:/m, "the wake must not be conditional on a NEW job having been created");
  // The rationale lives in the comment block immediately above the step's
  // own `- name:` line, so assert against that region of the workflow.
  const preamble = yaml.slice(yaml.indexOf("# SANCTIONED SYSTEMD WAKE"), yaml.indexOf(WAKE_STEP));
  assert.match(preamble, /DUPLICATE_ACTIVE_CITY_JOB decision/, "the intent must be stated where a future editor will see it");
  assert.match(preamble, /does NOT run if the enqueue step itself\s*\n\s*# failed/, "and so must the reason it is still skipped on a real failure");
});

test("G: the enqueue step's own JSON handling never deletes, cancels, or rewrites a job on failure", async () => {
  const body = extractStepBody(await readWorkflow(ENQUEUE_WORKFLOW), ENQUEUE_STEP);
  assert.doesNotMatch(body, /cancel-job|rm -rf|rm -f/, "a failed enqueue must never clean up a durable job");
});

// ---------------------------------------------------------------------------
// Secrets, publication coupling, automation — the standing prohibitions
// ---------------------------------------------------------------------------

test("secrets are only ever written to the pinned SSH files or used as the ssh destination — never echoed or summarised", async () => {
  for (const path of [ENQUEUE_WORKFLOW, STATUS_WORKFLOW]) {
    const yaml = await readWorkflow(path);
    for (const line of yaml.split("\n")) {
      if (!line.includes("secrets.")) continue;
      const permitted =
        /printf '%s\\n' "\$\{\{ secrets\.BEATMAPPED_PROD_(SSH_KEY|SSH_HOST_KEY) \}\}" > ~\/\.ssh\//.test(line) ||
        /"\$\{\{ secrets\.BEATMAPPED_PROD_USER \}\}@\$\{\{ secrets\.BEATMAPPED_PROD_HOST \}\}"/.test(line);
      assert.ok(permitted, `${path}: unexpected use of a secret: ${line.trim()}`);
      assert.ok(!/GITHUB_STEP_SUMMARY|GITHUB_OUTPUT|^\s*(echo|cat)\b/.test(line), `${path}: a secret must never be printed: ${line.trim()}`);
    }
    // SSH material is always removed, whatever the outcome.
    assert.match(yaml, /rm -rf ~\/\.ssh\/deploy_key ~\/\.ssh\/known_hosts/);
  }
});

test("no publication coupling: completing a city job never triggers map publication", async () => {
  for (const path of [ENQUEUE_WORKFLOW, STATUS_WORKFLOW]) {
    const executable = stripCommentLines(await readWorkflow(path));
    assert.doesNotMatch(executable, /botm-publication/, `${path} must never touch the publication service`);
    assert.doesNotMatch(executable, /publish:map-data|publish-map-data/, `${path} must never publish`);
    assert.doesNotMatch(executable, /install\.sh/, `${path} must never deploy code`);
    assert.doesNotMatch(executable, /botm-unattended/, `${path} must never touch the unattended runner`);
  }
});

test("no timer, cron, schedule, or automatic trigger: both controls are workflow_dispatch only", async () => {
  for (const path of [ENQUEUE_WORKFLOW, STATUS_WORKFLOW]) {
    const yaml = await readWorkflow(path);
    const triggerBlock = yaml.slice(yaml.indexOf("\non:"), yaml.indexOf("permissions:"));
    assert.match(triggerBlock, /workflow_dispatch:/);
    assert.doesNotMatch(triggerBlock, /schedule:|cron:|push:|pull_request:|repository_dispatch:|workflow_run:/, `${path} must be operator-triggered only`);
    assert.doesNotMatch(stripCommentLines(yaml), /systemd-run|\.timer\b/, `${path} must never create a timer`);
  }
});

test("both controls run in the same protected production Environment as deployment, with read-only repository permissions", async () => {
  for (const path of [ENQUEUE_WORKFLOW, STATUS_WORKFLOW]) {
    const yaml = await readWorkflow(path);
    assert.match(yaml, /environment: beatmapped-collector-production/, `${path} must use the protected Environment`);
    assert.match(yaml, /permissions:\n {2}contents: read/, `${path} must not request write permissions`);
    assert.match(yaml, /StrictHostKeyChecking=yes/, `${path} must pin the host key, never TOFU`);
  }
});

test("the enqueue control shares deployment's concurrency group; the read-only status control deliberately does not", async () => {
  assert.match(await readWorkflow(ENQUEUE_WORKFLOW), /group: deploy-beatmapped-collector/, "an enqueue and a deployment must never run against the host at once");
  const statusYaml = await readWorkflow(STATUS_WORKFLOW);
  assert.match(statusYaml, /group: check-beatmapped-city-jobs/);
  assert.doesNotMatch(statusYaml, /group: deploy-beatmapped-collector/, "a read-only status read must not be blocked behind a deployment");
});
