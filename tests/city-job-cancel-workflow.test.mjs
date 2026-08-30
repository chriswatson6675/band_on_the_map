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
