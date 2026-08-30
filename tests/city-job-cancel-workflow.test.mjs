// BEATMAPPED-CITY-JOB-OPERATOR-CANCEL-CONTROL-01 — safety proof for
// .github/workflows/cancel-beatmapped-city-job.yml.
//
// Same dependency-free convention as this repository's other workflow
// suites: content-level assertions on the raw YAML plus real execution of
// the embedded scripts. Nothing here contacts GitHub Actions or
// production, and nothing dispatches anything.
//
// The property that matters most: this is a JOB-LIFECYCLE control, not a
// process control. It must contain no systemd verb at all — cancelling a
// city must never be implemented by stopping, killing or restarting the
// worker, because the worker may still need to finish the in-flight
// source, persist the cancellation, and drain other queued cities.

import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const CANCEL_WORKFLOW = fileURLToPath(new URL("../.github/workflows/cancel-beatmapped-city-job.yml", import.meta.url));
const ENQUEUE_WORKFLOW = fileURLToPath(new URL("../.github/workflows/enqueue-beatmapped-city-job.yml", import.meta.url));
const STATUS_WORKFLOW = fileURLToPath(new URL("../.github/workflows/check-beatmapped-city-jobs.yml", import.meta.url));

async function readWorkflow(path = CANCEL_WORKFLOW) {
  return (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
}

function stripCommentLines(yaml) {
  return yaml
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

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

/** Runs the UUID-validation step's real shell body against a candidate input. */
async function runValidation(body, jobId) {
  const script = body
    .split("\n")
    .filter((line) => !line.trim().startsWith("- name:") && !line.trim().startsWith("id:") && !line.trim().startsWith("run: |"))
    .map((line) => line.replace(/^ {10}/, ""))
    .join("\n");

  return new Promise((resolvePromise) => {
    const child = spawn("bash", [], { env: { ...process.env, JOB_ID: jobId, GITHUB_OUTPUT: "/dev/null", GITHUB_STEP_SUMMARY: "/dev/null" } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolvePromise({ status: code, stdout, stderr }));
    child.stdin.write(script);
    child.stdin.end();
  });
}

// ---------------------------------------------------------------------------
// §17 / §9 — no systemd lifecycle control whatsoever
// ---------------------------------------------------------------------------

test("17: the cancel control contains NO systemctl verb at all — cancelling a city never touches the worker process", async () => {
  const executable = stripCommentLines(await readWorkflow());
  assert.doesNotMatch(executable, /systemctl/, "a job-lifecycle control must not contain systemctl at all");
  for (const verb of ["stop", "restart", "kill", "enable", "disable", "mask"]) {
    assert.doesNotMatch(executable, new RegExp(`systemctl\\s+${verb}`), `must never systemctl ${verb}`);
  }
  assert.doesNotMatch(executable, /\bkill\b|\bpkill\b|SIGKILL|SIGTERM|-9\b/, "cancellation must never signal a process");
  assert.doesNotMatch(executable, /\bnohup\b|\btmux\b|\bscreen\b|\bsetsid\b/);
});

test("9: the cancel control never stops the worker, so other queued cities keep draining", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /never stops, kills, restarts, enables or signals/, "the intent must be stated where a future editor sees it");
  const executable = stripCommentLines(yaml);
  // The only remote CLI command it may run, besides the read-only preflight.
  const commands = [...executable.matchAll(/cli\.mjs\s+([a-z-]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(commands)].sort(), ["cancel-job", "city-jobs-status"], "exactly one mutation primitive plus the read-only status query");
});

// ---------------------------------------------------------------------------
// §5 / §24 — input validation
// ---------------------------------------------------------------------------

test("5: job_id is the only input, and there is no city/estate/path/command/PID/host input", async () => {
  const yaml = await readWorkflow();
  const inputs = yaml.slice(yaml.indexOf("inputs:"), yaml.indexOf("permissions:"));
  assert.match(inputs, /job_id:/);
  for (const forbidden of ["city", "estate", "source_id", "registry", "path", "command", "pid", "unit", "host", "ref:", "config"]) {
    assert.ok(!inputs.includes(forbidden), `cancel must not offer an input named like "${forbidden}"`);
  }
  // Exactly one input key is declared.
  assert.equal((inputs.match(/^ {6}[a-z_]+:$/gm) ?? []).length, 1);
});

test("24: the UUID validation genuinely rejects everything that is not a canonical job id", async () => {
  const body = extractStepBody(await readWorkflow(), "Validate the job id is a canonical UUID");

  const good = await runValidation(body, "649d5648-7fcc-4076-a768-de264ff80e1c");
  assert.equal(good.status, 0, `a real job id must be accepted; stderr: ${good.stderr}`);

  for (const bad of [
    "",
    "berlin-proof-5",
    "Berlin",
    "runtime/city-jobs/649d5648-7fcc-4076-a768-de264ff80e1c/job.json",
    "../../etc/passwd",
    "649d5648-7fcc-4076-a768-de264ff80e1c; rm -rf /",
    "649d5648-7fcc-4076-a768-de264ff80e1c && whoami",
    "$(id)",
    "`id`",
    "102961",
    "beatmapped-city-worker.service",
    "649d5648-7fcc-4076-a768",
    "*",
  ]) {
    const result = await runValidation(body, bad);
    assert.equal(result.status, 1, `${JSON.stringify(bad)} must be refused`);
    assert.match(result.stdout + result.stderr, /::error::/);
  }
});

test("24: validation happens before any SSH key material is written", async () => {
  const yaml = await readWorkflow();
  assert.ok(yaml.indexOf("Validate the job id") < yaml.indexOf("Configure pinned SSH access"));
});

// ---------------------------------------------------------------------------
// §6 — read-only preflight before any mutation
// ---------------------------------------------------------------------------

test("6: a read-only preflight precedes the mutation and fails closed on a missing job, an unreadable record, or a missing cancel capability", async () => {
  const yaml = await readWorkflow();
  const preflight = extractStepBody(yaml, "Preflight the job");
  // Compare STEP markers — the job's own name also contains the phrase
  // "Request cooperative cancellation" and appears earlier in the file.
  assert.ok(yaml.indexOf("- name: Preflight the job") < yaml.indexOf("- name: Request cooperative cancellation"));

  assert.match(preflight, /CANCEL_CAPABILITY_NOT_DEPLOYED/);
  assert.match(preflight, /JOB_RECORD_UNREADABLE/);
  assert.match(preflight, /NO_SUCH_JOB/);
  assert.doesNotMatch(preflight, /cancel-job /, "the preflight must never itself cancel anything");
  // It reports the before-state an operator needs.
  for (const field of ["State BEFORE", "cancel_requested BEFORE", "Sources completed BEFORE", "Current source BEFORE", "Estate key", "Frozen estate ref"]) {
    assert.ok(preflight.includes(field), `preflight must report "${field}"`);
  }
});

// ---------------------------------------------------------------------------
// BEATMAPPED-CANCEL-CAPABILITY-PROBE-CORRECTION-01 — the capability probe,
// executed rather than merely grepped.
//
// The original probe was structurally correct and behaviourally broken: it
// piped the deployed CLI straight into `grep -q` while the remote script had
// `set -o pipefail`. The CLI deliberately prints its command list and exits 1
// when invoked with no command, so the pipeline inherited that 1 even when
// grep had matched, and the workflow reported CANCEL_CAPABILITY_NOT_DEPLOYED
// on every host. It was caught only in production (run 33327365097), against
// a checkout that demonstrably contained cancel-job.
//
// The tests above could not have caught it: they assert what the YAML SAYS.
// These run the real extracted shell, with `sudo` replaced by a shell
// function so the probed command's output and exit status can be varied
// independently — the exact axis the defect lived on.
// ---------------------------------------------------------------------------

/** The heredoc actually shipped to production, dedented, with the run-step wrapper removed. */
function extractRemoteScript(yaml, namePrefix) {
  const lines = extractStepBody(yaml, namePrefix).split("\n");
  const start = lines.findIndex((line) => line.includes("<<'REMOTE_SCRIPT'"));
  assert.ok(start >= 0, `expected a REMOTE_SCRIPT heredoc in the "${namePrefix}" step`);
  const end = lines.findIndex((line, index) => index > start && line.trim() === "REMOTE_SCRIPT");
  assert.ok(end > start, "expected the REMOTE_SCRIPT heredoc to be terminated");
  const body = lines.slice(start + 1, end);
  const indent = Math.min(...body.filter((line) => line.trim()).map((line) => line.match(/^ */)[0].length));
  return body.map((line) => line.slice(indent)).join("\n");
}

/**
 * Runs the real remote preflight script with `sudo` stubbed, so the probed
 * CLI's OUTPUT and EXIT STATUS can be set independently. Nothing here touches
 * a network, a host, or systemd.
 */
async function runPreflightRemoteScript({
  usageOutput = "Unknown command: (none)\nAvailable: enqueue-city, city-jobs-status, cancel-job, run-worker, health",
  usageExit = 1,
  shaExit = 0,
} = {}) {
  const remote = extractRemoteScript(await readWorkflow(), "Preflight the job");
  const script = [
    // Stand in for `sudo -u botm <command>` without needing an executable on
    // PATH: a shell function takes precedence over any real sudo.
    "sudo() {",
    '  while [ "${1:-}" = "-u" ]; do shift 2; done',
    '  case "$*" in',
    '    *rev-parse*) [ "$STUB_SHA_EXIT" -eq 0 ] || return "$STUB_SHA_EXIT"; printf \'%s\\n\' "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"; return 0 ;;',
    "    *city-jobs-status*) printf '%s\\n' '{\"jobs\":[]}'; return 0 ;;",
    '    *cli.mjs*) [ -n "$STUB_USAGE_OUTPUT" ] && printf \'%s\\n\' "$STUB_USAGE_OUTPUT"; return "$STUB_USAGE_EXIT" ;;',
    "  esac",
    "  return 0",
    "}",
    remote,
  ].join("\n");

  return new Promise((resolvePromise) => {
    const child = spawn("bash", ["-s", "--", "/opt/band-on-the-map", "a3352663-ba07-44cc-b221-92ab1bd3adaa"], {
      env: {
        ...process.env,
        STUB_USAGE_OUTPUT: usageOutput,
        STUB_USAGE_EXIT: String(usageExit),
        STUB_SHA_EXIT: String(shaExit),
      },
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", () => {});
    child.on("close", (code) => resolvePromise({ status: code, stdout }));
    child.stdin.write(script);
    child.stdin.end();
  });
}

const capabilityOf = (stdout) => stdout.match(/^CANCEL_CAPABILITY_AVAILABLE=(\S+)$/m)?.[1];

// The stub above is only honest if the REAL CLI still behaves this way. If a
// future change makes `cli.mjs` with no command exit 0, or stop listing its
// commands, this test fails and the probe must be revisited.
test("probe: the real CLI genuinely prints its command list AND exits non-zero when given no command", async () => {
  const cli = fileURLToPath(new URL("../ingestion/city-worker/cli.mjs", import.meta.url));
  const result = await new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [cli]);
    let out = "";
    child.stdout.on("data", (chunk) => (out += chunk));
    child.stderr.on("data", (chunk) => (out += chunk));
    child.on("close", (code) => resolvePromise({ code, out }));
  });
  assert.match(result.out, /cancel-job/, "the CLI must still advertise cancel-job in its usage output");
  assert.notEqual(result.code, 0, "the usage banner is expected to exit non-zero — that is exactly why its exit status must not be read as capability evidence");
});

test("A: usage output CONTAINS cancel-job and the command exits 1 → capability AVAILABLE (the exact live failure)", async () => {
  const { stdout } = await runPreflightRemoteScript({ usageExit: 1 });
  assert.equal(
    capabilityOf(stdout),
    "true",
    "a deployed CLI that advertises cancel-job must be recognised even though its usage banner exits 1 — this is the defect proven live in run 33327365097",
  );
});

test("B: a genuinely stale host whose CLI lacks cancel-job → capability NOT AVAILABLE (still fails closed)", async () => {
  const { stdout } = await runPreflightRemoteScript({
    usageOutput: "Unknown command: (none)\nAvailable: enqueue-city, city-jobs-status, run-worker, health",
    usageExit: 1,
  });
  assert.equal(capabilityOf(stdout), "false");
});

test("C: usage output contains cancel-job and the command exits 0 → capability AVAILABLE", async () => {
  const { stdout } = await runPreflightRemoteScript({ usageExit: 0 });
  assert.equal(capabilityOf(stdout), "true", "the probe must not depend on the exit status in either direction");
});

test("D: an unrelated failure can create neither a false positive nor a false negative", async () => {
  // No CLI at all on the host: nothing is printed and the command fails hard.
  const missing = await runPreflightRemoteScript({ usageOutput: "", usageExit: 127 });
  assert.equal(capabilityOf(missing.stdout), "false", "an absent CLI must never be reported as capable");

  // The CLI errors out with a message that does not advertise the command.
  const broken = await runPreflightRemoteScript({
    usageOutput: "node:internal/modules/run_main: Cannot find module 'ingestion/city-worker/cli.mjs'",
    usageExit: 1,
  });
  assert.equal(capabilityOf(broken.stdout), "false");

  // A failure in a DIFFERENT probe line (the deployed-SHA read) must not
  // disturb the capability verdict either way.
  const shaFailed = await runPreflightRemoteScript({ usageExit: 1, shaExit: 3 });
  assert.equal(capabilityOf(shaFailed.stdout), "true", "an unrelated command failure must not mask a capability that is really present");
  assert.match(shaFailed.stdout, /^DEPLOYED_SHA=unknown$/m, "and the unreadable SHA must be reported honestly as unknown");
});

test("the probe must never again read a usage banner's exit status as capability evidence", async () => {
  const preflight = extractStepBody(await readWorkflow(), "Preflight the job");
  assert.doesNotMatch(
    preflight,
    /node ingestion\/city-worker\/cli\.mjs"?\s*(2>&1)?\s*\|\s*grep/,
    "piping the CLI directly into grep re-introduces the pipefail defect — capture the output, then match the capture",
  );
  assert.match(preflight, /CLI_COMMANDS="\$\(/, "the probe must capture the CLI output into a variable first");
  // The rest of the remote script must keep its strict options.
  assert.match(extractRemoteScript(await readWorkflow(), "Preflight the job"), /^set -uo pipefail$/m, "pipefail must not be disabled globally to work around one probe");
});

// ---------------------------------------------------------------------------
// §18 — operator output
// ---------------------------------------------------------------------------

test("18: every documented result code is explained to the operator, and cooperative cancellation is stated plainly", async () => {
  const cancelStep = extractStepBody(await readWorkflow(), "Request cooperative cancellation");
  for (const code of ["CANCELLED_IMMEDIATELY", "CANCELLATION_REQUESTED", "ALREADY_CANCEL_REQUESTED", "ALREADY_CANCELLED", "ALREADY_TERMINAL"]) {
    assert.ok(cancelStep.includes(code), `the operator summary must explain ${code}`);
  }
  assert.match(cancelStep, /COOPERATIVE, not immediate/, "the control must never imply a running job stops instantly");
  assert.match(cancelStep, /checkpoint is retained|checkpoints? .*retained/i);
  assert.match(cancelStep, /State AFTER request/);
  assert.match(cancelStep, /cancel_requested AFTER/);
  assert.match(cancelStep, /unrecognised result/, "an unknown result code must fail rather than be reported as success");
  // Not a raw JSON dump.
  assert.doesNotMatch(cancelStep, /JSON\.stringify\(r,/, "the operator summary must be a projection, not the raw job record");
});

// ---------------------------------------------------------------------------
// §16 / §24 — publication, deployment and secret boundaries
// ---------------------------------------------------------------------------

test("16: cancellation never publishes, never deploys, and never touches the publication service", async () => {
  const executable = stripCommentLines(await readWorkflow());
  assert.doesNotMatch(executable, /botm-publication/);
  assert.doesNotMatch(executable, /publish:map-data|publish-map-data|map-data/);
  assert.doesNotMatch(executable, /install\.sh/);
  assert.doesNotMatch(executable, /botm-unattended/);
  assert.doesNotMatch(executable, /enqueue-city/, "cancellation must never enqueue work");
});

test("24: workflow_dispatch only, protected Environment, read-only repo permissions, pinned host key", async () => {
  const yaml = await readWorkflow();
  const triggers = yaml.slice(yaml.indexOf("\non:"), yaml.indexOf("permissions:"));
  assert.match(triggers, /workflow_dispatch:/);
  assert.doesNotMatch(triggers, /schedule:|cron:|push:|pull_request:|repository_dispatch:|workflow_run:/);
  assert.match(yaml, /environment: beatmapped-collector-production/);
  assert.match(yaml, /permissions:\n {2}contents: read/);
  assert.match(yaml, /StrictHostKeyChecking=yes/);
  assert.match(yaml, /rm -rf ~\/\.ssh\/deploy_key ~\/\.ssh\/known_hosts/);
});

test("24: secrets are only written to the pinned SSH files or used as the ssh destination — never printed", async () => {
  const yaml = await readWorkflow();
  for (const line of yaml.split("\n")) {
    if (!line.includes("secrets.")) continue;
    const permitted =
      /printf '%s\\n' "\$\{\{ secrets\.BEATMAPPED_PROD_(SSH_KEY|SSH_HOST_KEY) \}\}" > ~\/\.ssh\//.test(line) ||
      /"\$\{\{ secrets\.BEATMAPPED_PROD_USER \}\}@\$\{\{ secrets\.BEATMAPPED_PROD_HOST \}\}"/.test(line);
    assert.ok(permitted, `unexpected use of a secret: ${line.trim()}`);
    assert.ok(!/GITHUB_STEP_SUMMARY|GITHUB_OUTPUT|^\s*(echo|cat)\b/.test(line), `a secret must never be printed: ${line.trim()}`);
  }
});

test("the cancel control has its own concurrency group — a safety control must never queue behind a deployment", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /group: cancel-beatmapped-city-job/);
  assert.doesNotMatch(yaml, /group: deploy-beatmapped-collector/);
});

// ---------------------------------------------------------------------------
// §13 — the other two controls are untouched by this package
// ---------------------------------------------------------------------------

test("13: the status control remains read-only and gained no mutation capability", async () => {
  const executable = stripCommentLines(await readWorkflow(STATUS_WORKFLOW));
  assert.doesNotMatch(executable, /systemctl/);
  assert.doesNotMatch(executable, /cancel-job|enqueue-city|resume-job|run-worker/);
  const commands = [...executable.matchAll(/cli\.mjs\s+([a-z-]+)/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(commands)], ["city-jobs-status"]);
});

test("the enqueue control is unchanged in shape: still no cancel, still never enables", async () => {
  const executable = stripCommentLines(await readWorkflow(ENQUEUE_WORKFLOW));
  assert.doesNotMatch(executable, /cancel-job/);
  assert.doesNotMatch(executable, /systemctl\s+(--now\s+)?enable/);
  assert.doesNotMatch(executable, /systemctl\s+restart/);
});
