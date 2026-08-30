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

const WAKE_STEP = "Wake the systemd worker if (and only if) it is not already active";
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

/** Extracts a step's embedded REMOTE_SCRIPT heredoc body. */
function extractRemoteScriptFrom(yaml, namePrefix) {
  const body = extractStepBody(yaml, namePrefix);
  const match = /<<'REMOTE_SCRIPT'[^\n]*\n([\s\S]*?)\n\s*REMOTE_SCRIPT/.exec(body);
  assert.ok(match, `expected step "${namePrefix}" to embed a REMOTE_SCRIPT heredoc`);
  return match[1];
}

/**
 * Runs the wake step's real remote script under a stubbed systemd that
 * behaves like the real thing: `is-active`/`is-enabled` PRINT a state and
 * exit non-zero for the not-active/not-enabled cases, and a successful
 * `start` genuinely flips the unit's state.
 */
async function runWakeScript(script, { initialState = "inactive", enabled = "disabled", startRc = 0 } = {}) {
  const dir = await mkdtemp(join(tmpdir(), "wake-stub-"));
  const stateFile = join(dir, "state");
  const callsFile = join(dir, "calls");
  await writeFile(stateFile, initialState, "utf8");
  await writeFile(callsFile, "", "utf8");

  const harness = [
    'sudo() { "$@"; }',
    "sleep() { :; }",
    "systemctl() {",
    "  local args=() quiet=0 a",
    '  for a in "$@"; do if [ "$a" = "--quiet" ]; then quiet=1; else args+=("$a"); fi; done',
    '  printf "%s\\n" "${args[*]}" >> "$STUB_CALLS"',
    '  case "${args[0]}" in',
    "    is-active)",
    '      local s; s="$(cat "$STUB_STATE_FILE")"',
    '      [ "$quiet" = "1" ] || printf "%s\\n" "$s"',
    '      case "$s" in active|activating|reloading) return 0 ;; *) return 3 ;; esac ;;',
    "    is-enabled)",
    '      [ "$quiet" = "1" ] || printf "%s\\n" "$STUB_ENABLED"',
    '      case "$STUB_ENABLED" in enabled|enabled-runtime) return 0 ;; *) return 1 ;; esac ;;',
    "    start)",
    '      if [ "${STUB_START_RC:-0}" = "0" ]; then printf "active" > "$STUB_STATE_FILE"; return 0; fi',
    '      return "${STUB_START_RC}" ;;',
    "  esac",
    "  return 1",
    "}",
    'set -- "beatmapped-city-worker.service"',
    script,
  ].join("\n");

  const result = await new Promise((resolvePromise) => {
    const child = spawn("bash", [], { env: { ...process.env, STUB_STATE_FILE: stateFile, STUB_CALLS: callsFile, STUB_ENABLED: enabled, STUB_START_RC: String(startRc) } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolvePromise({ status: code, stdout, stderr }));
    child.stdin.write(harness);
    child.stdin.end();
  });

  const calls = (await readFile(callsFile, "utf8")).split("\n").filter(Boolean);
  await rm(dir, { recursive: true, force: true });
  return { ...result, calls, value: (key) => (new RegExp(`^${key}=(.*)$`, "m").exec(result.stdout) ?? [])[1] };
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
  assert.equal(result.value("WORKER_WAKE_ACTION"), "STARTED");
  assert.equal(result.value("WORKER_ACTIVE_AFTER"), "active");
  assert.equal(result.value("WORKER_ACTIVE_CONFIRMED"), "1");
  assert.ok(result.calls.includes("start beatmapped-city-worker.service"));
});

test("A: every genuinely not-running state (inactive, failed, dead, unknown) is started", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  for (const state of ["inactive", "failed", "deactivating", "unknown"]) {
    const result = await runWakeScript(script, { initialState: state });
    assert.equal(result.value("WORKER_WAKE_ACTION"), "STARTED", `"${state}" means the worker is not running and must be started`);
    assert.equal(result.status, 0);
  }
});

// ---------------------------------------------------------------------------
// B. active worker → no restart
// ---------------------------------------------------------------------------

test("B: an ALREADY-ACTIVE worker is left completely alone — no start, and above all no restart", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  for (const state of ["active", "activating", "reloading"]) {
    const result = await runWakeScript(script, { initialState: state });
    assert.equal(result.status, 0, `stderr: ${result.stderr}`);
    assert.equal(result.value("WORKER_WAKE_ACTION"), "NONE_ALREADY_ACTIVE");
    assert.ok(!result.calls.some((call) => call.startsWith("start ")), `"${state}" must not be started again`);
    assert.ok(!result.calls.some((call) => call.startsWith("restart ")), "a running worker must never be restarted");
    assert.ok(!result.calls.some((call) => call.startsWith("stop ")), "a running worker must never be stopped");
  }
});

test("B: `restart` appears nowhere in the operator controls — a resident worker already polls for new jobs", async () => {
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
  const result = await runWakeScript(script, { initialState: "inactive" });
  assert.ok(!result.calls.some((call) => call.startsWith("enable")), "the wake script must issue no enable verb");
  assert.equal(result.value("WORKER_ENABLED_AFTER"), "disabled");
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
  assert.deepEqual([...new Set(commands)].sort(), ["enqueue-city-estate", "list-city-estates"]);
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

test("G: when systemd refuses to start the worker, the wake script reports START_FAILED rather than claiming success", async () => {
  const script = extractRemoteScriptFrom(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  const result = await runWakeScript(script, { initialState: "inactive", startRc: 1 });
  assert.equal(result.value("WORKER_WAKE_ACTION"), "START_FAILED");
  assert.equal(result.value("WORKER_ACTIVE_AFTER"), "inactive");
  assert.equal(result.value("WORKER_ACTIVE_CONFIRMED"), "0");
});

test("G: a start failure fails the control loudly AND states that the queued job is durable and recoverable", async () => {
  const body = extractStepBody(await readWorkflow(ENQUEUE_WORKFLOW), WAKE_STEP);
  assert.match(body, /WORKER_START_FAILED/);
  assert.match(body, /REMAINS DURABLE AND QUEUED/);
  assert.match(body, /re-dispatch this workflow/, "the recovery path must be named, not left to the operator to invent");
  // The recovery works precisely because a re-dispatch cannot duplicate the
  // job — proven behaviourally in tests/city-worker/city-job-cycle-policy.test.mjs.
  assert.match(body, /no duplicate job will be created/);
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
