// BEATMAPPED-CITY-WORKER-BOUNDED-TRIAL-ACTION-01 — proof for the new,
// dedicated .github/workflows/run-beatmapped-city-worker-trial.yml.
// Two layers, matching this repository's existing dependency-free
// deployment-workflow testing convention (tests/deploy-workflow-structure.test.mjs,
// tests/deploy-github-workflow.test.mjs) — never a YAML-parsing library
// as a declared dependency:
//
//   1. Content-level assertions on the raw workflow YAML text.
//   2. Genuine BEHAVIOURAL proof of the embedded `node -e` scripts —
//      extracted byte-for-byte and actually executed via real `node`
//      subprocesses against real/synthetic fixtures.
//
// This workflow never contacts GitHub Actions or production; nothing
// here dispatches anything.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const WORKFLOW_PATH = fileURLToPath(new URL("../.github/workflows/run-beatmapped-city-worker-trial.yml", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

async function readWorkflow() {
  const raw = await readFile(WORKFLOW_PATH, "utf8");
  return raw.replace(/\r\n/g, "\n");
}

function stripCommentLines(yaml) {
  return yaml
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

/** Extracts one step's full body — from its own `- name: <prefix>...` line up to the next 6-space-indented `- name:`, or EOF. */
function extractStepBody(yaml, namePrefix) {
  const startMarker = `- name: ${namePrefix}`;
  const startIdx = yaml.indexOf(startMarker);
  assert.ok(startIdx >= 0, `expected to find a step starting with "${startMarker}"`);
  const nextIdx = yaml.indexOf("\n      - name:", startIdx + startMarker.length);
  return nextIdx === -1 ? yaml.slice(startIdx) : yaml.slice(startIdx, nextIdx);
}

let rawText;
test.before(async () => {
  rawText = await readWorkflow();
});

// --- A: manual only ---

test("A: workflow triggers ONLY on workflow_dispatch — never push/PR", () => {
  assert.match(rawText, /^on:\s*\n\s+workflow_dispatch:/m);
  assert.doesNotMatch(rawText, /\n\s{2}push:\s*\n/);
  assert.doesNotMatch(rawText, /\n\s{2}pull_request:\s*\n/);
});

// --- B: protected Environment ---

test("B: the trial job uses the beatmapped-collector-production Environment — no separate/weaker one", () => {
  const occurrences = [...rawText.matchAll(/^\s*environment:\s*(\S+)/gm)];
  assert.equal(occurrences.length, 1, "exactly one job-level `environment:` declaration must exist");
  assert.equal(occurrences[0][1], "beatmapped-collector-production");
});

// --- C/D/E: candidate authorisation reused, never duplicated/weakened ---

test("C: the exact APPROVED_CANDIDATE + DEPLOY_ONLY authorisation is reused from the shared script — never reimplemented inline", () => {
  assert.match(rawText, /bash deploy\/ci\/resolve-and-validate-deployment\.sh APPROVED_CANDIDATE "\$REQUESTED" DEPLOY_ONLY/);
});

test("D/E: no duplicate/weaker validation logic exists in this workflow — no inline merge-base/tip-equality checks; candidate/deploy/* is still fetched for the shared script to use", () => {
  const executableLines = stripCommentLines(rawText);
  assert.doesNotMatch(executableLines, /git merge-base/, "this workflow must delegate ALL SHA validation to the shared script, never reimplement it");
  assert.doesNotMatch(executableLines, /git rev-parse.*\^\{commit\}/, "SHA resolution must live only in the shared script");
  assert.match(rawText, /git fetch origin '\+refs\/heads\/candidate\/deploy\/\*:refs\/remotes\/origin\/candidate\/deploy\/\*' --prune/);
});

test("only one workflow_dispatch input exists (ref) — mode/post_deploy_action are fixed, never operator-selectable here", () => {
  const inputsBlock = /inputs:\n([\s\S]*?)\n(?:permissions:|jobs:)/.exec(rawText);
  assert.ok(inputsBlock, "expected an inputs: block");
  const inputNames = [...inputsBlock[1].matchAll(/^ {6}([a-z_]+):\n/gm)].map((m) => m[1]);
  assert.deepEqual(inputNames, ["ref"]);
});

// --- F/G: DEPLOY_ONLY installation, publication restart skipped ---

test("F: the candidate is deployed via the sanctioned DEPLOY_ONLY path (--skip-publication-restart)", () => {
  assert.match(rawText, /deploy\/install\.sh --ref=\$\{RESOLVED_SHA\} --skip-publication-restart/);
});

test("G/O: botm-publication.service is NEVER restarted anywhere in this workflow", () => {
  assert.doesNotMatch(rawText, /systemctl restart botm-publication/, "this workflow must never restart the publication service — DEPLOY_ONLY forbids it structurally, not just by convention");
});

// --- H: no acquisition/publication trigger ---

test("H: no acquisition or publication cycle is triggered anywhere in this workflow", () => {
  assert.doesNotMatch(rawText, /systemctl start[^\n]*botm-unattended\.service/);
  assert.doesNotMatch(rawText, /RUNTIME_BASE_URL/);
  assert.doesNotMatch(rawText, /validatePublicationArtifact/);
  assert.doesNotMatch(rawText, /workflow_call/, "must never be invoked as a reusable workflow by the deploy workflow either");
});

// --- I/S: hard-bound five-source estate, no arbitrary estate input ---

test("I: the trial estate constants are fixed env values — exactly the five approved Berlin sources", () => {
  assert.match(rawText, /TRIAL_COUNTRY:\s*DE/);
  assert.match(rawText, /TRIAL_CITY:\s*Berlin/);
  assert.match(rawText, /TRIAL_ESTATE_REF:\s*fixtures\/city-worker\/real-estates\/berlin-sample-01\.json/);
  const idsMatch = /TRIAL_EXPECTED_SOURCE_IDS:\s*"([^"]+)"/.exec(rawText);
  assert.ok(idsMatch);
  assert.deepEqual(
    idsMatch[1].split(",").sort(),
    ["tempodrom-berlin", "a-trane-berlin", "b-flat-berlin", "uber-arena-berlin", "columbiahalle-berlin"].sort(),
  );
});

test("S: no estate/city/country/sources input exists — an operator cannot supply an arbitrary or full-city estate", () => {
  assert.doesNotMatch(rawText, /^\s+estate:/m);
  assert.doesNotMatch(rawText, /^\s+sources:/m);
  assert.doesNotMatch(rawText, /^\s+city:/m);
  assert.doesNotMatch(rawText, /^\s+country:/m);
});

// --- J/T: systemd-owned, never a foreground/backgrounded SSH process, no AI/browser ---

test("J: the worker is started via systemctl, never as a foreground/backgrounded SSH process", () => {
  assert.match(rawText, /sudo systemctl start beatmapped-city-worker\.service/);
  const executableLines = stripCommentLines(rawText);
  assert.doesNotMatch(executableLines, /\bnohup\b/i);
  assert.doesNotMatch(executableLines, /\btmux\b/i);
  assert.doesNotMatch(executableLines, /\bscreen\b/i);
  assert.doesNotMatch(executableLines, /node ingestion\/city-worker\/worker-loop-main\.mjs/, "the daemon entry point must only ever be started via the systemd unit's own ExecStart, never invoked directly by this workflow");
});

test("T: no AI/browser execution is introduced by this workflow", () => {
  const forbidden = ["playwright", "puppeteer", "anthropic", "openai", " claude"];
  for (const term of forbidden) {
    assert.doesNotMatch(rawText.toLowerCase(), new RegExp(term.trim().toLowerCase()));
  }
});

// --- K/L: independent polling, bounded ---

test("K: polling happens through a genuinely NEW ssh invocation each iteration (a while-loop wrapping the ssh call), in a step separate from the start step", () => {
  const pollBody = extractStepBody(rawText, "Poll job status through fresh, independent SSH connections");
  assert.match(pollBody, /while \[.*\]; do/);
  // The ssh call must be textually INSIDE the while loop body.
  const whileIdx = pollBody.indexOf("while [");
  const sshIdx = pollBody.indexOf("ssh -o StrictHostKeyChecking", whileIdx);
  const doneIdx = pollBody.indexOf("\n          done", whileIdx);
  assert.ok(whileIdx >= 0 && sshIdx > whileIdx && doneIdx > sshIdx, "the ssh invocation must be inside the while loop, proving a fresh connection every iteration");
});

test("L: polling is bounded by both a script-level MAX_WAIT_SECONDS and a step-level timeout-minutes", () => {
  const pollBody = extractStepBody(rawText, "Poll job status through fresh, independent SSH connections");
  assert.match(pollBody, /timeout-minutes:\s*\d+/);
  assert.match(pollBody, /MAX_WAIT_SECONDS:\s*"?\d+"?/);
  assert.doesNotMatch(pollBody, /while true/, "must never be an unbounded loop");
});

// --- M/N: cleanup always stops+disables ---

test("M/N: cleanup always stops AND disables the city-worker service, and fails closed if that cannot be confirmed", () => {
  const cleanupBody = extractStepBody(rawText, "Stop and disable the city-worker service");
  assert.match(cleanupBody, /if:\s*always\(\)/);
  assert.match(cleanupBody, /systemctl stop beatmapped-city-worker\.service/);
  assert.match(cleanupBody, /systemctl disable beatmapped-city-worker\.service/);
  assert.match(cleanupBody, /CLEANUP_CONFIRMED=false/);
  assert.match(rawText, /::error::Cleanup could not be fully confirmed/);
});

test("existing-service baseline is captured before the trial and re-checked identically after cleanup", () => {
  assert.match(rawText, /BASELINE_UNATTENDED_TIMER_ENABLED=/);
  assert.match(rawText, /BASELINE_PUBLICATION_ACTIVE=/);
  assert.match(rawText, /NOW_TIMER_ENABLED.*!=.*BASELINE_TIMER_ENABLED/);
  assert.match(rawText, /NOW_PUBLICATION_ACTIVE.*!=.*BASELINE_PUBLICATION_ACTIVE/);
});

// --- P: durable state inspected ---

test("P: durable job/source checkpoint state is read directly — never only journal output", () => {
  assert.match(rawText, /cat runtime\/city-jobs\/\$\{JOB_ID\}\/job\.json/);
  assert.match(rawText, /runtime\/city-jobs\/\$\{JOB_ID\}\/sources\/\*\.json/);
});

// --- Q: secrets never echoed ---

test("Q: no line combining echo and a secrets. reference — no secret value is ever printed", () => {
  const offendingLines = rawText.split("\n").filter((l) => /\becho\b/.test(l) && /secrets\./.test(l));
  assert.deepEqual(offendingLines, []);
});

test("references the expected named secrets for production SSH access, and no others", () => {
  const referenced = new Set([...rawText.matchAll(/secrets\.(BEATMAPPED_[A-Z0-9_]+)/g)].map((m) => m[1]));
  assert.deepEqual(
    [...referenced].sort(),
    ["BEATMAPPED_PROD_HOST", "BEATMAPPED_PROD_SSH_HOST_KEY", "BEATMAPPED_PROD_SSH_KEY", "BEATMAPPED_PROD_USER"].sort(),
  );
});

// --- R: runner SHA verified/reported ---

test("R: the deployed SHA is verified to exactly match the resolved candidate, and runner_version_sha is reported in the evidence", () => {
  assert.match(rawText, /DEPLOYED_SHA="\$\(sudo -u botm git -C "\$APP_DIR" rev-parse HEAD\)"/);
  assert.match(rawText, /if \[ "\$DEPLOYED_SHA" != "\$RESOLVED_SHA" \]; then/);
  assert.match(rawText, /runner_version_sha/);
});

// --- misc integrity checks ---

test("never disables host-key verification, and every ssh invocation is StrictHostKeyChecking=yes", () => {
  const executableLines = stripCommentLines(rawText);
  assert.doesNotMatch(executableLines, /StrictHostKeyChecking=no/i);
  assert.doesNotMatch(executableLines, /ssh-keyscan/i);
  const sshInvocations = [...rawText.matchAll(/ssh -o StrictHostKeyChecking=(\S+)/g)];
  assert.ok(sshInvocations.length >= 6, "expected several distinct ssh invocations across the trial's steps");
  for (const m of sshInvocations) assert.equal(m[1], "yes");
});

test("shares the SAME concurrency group as deploy-beatmapped-collector.yml — a real deploy and this trial can never run concurrently", () => {
  assert.match(rawText, /group: deploy-beatmapped-collector/);
  assert.match(rawText, /cancel-in-progress: false/);
});

test("deployment-asset presence is verified BEFORE any SSH connection is configured", () => {
  // Use the literal `- name: ` step marker, not a bare substring search —
  // this workflow's own env-block comment also mentions the estate-check
  // step BY NAME (to point operators at it), earlier in the file than the
  // step itself, which a bare indexOf would wrongly match instead.
  const assetCheckIdx = rawText.indexOf("- name: Confirm the candidate provides the city-worker deployment assets");
  const estateCheckIdx = rawText.indexOf("- name: Validate the bounded trial estate");
  const sshConfigIdx = rawText.indexOf("- name: Configure pinned SSH access");
  assert.ok(assetCheckIdx > 0 && estateCheckIdx > assetCheckIdx && sshConfigIdx > estateCheckIdx, "asset/estate validation must precede any SSH configuration");
});

test("no credential-shaped literal or hardcoded IP anywhere in the file", () => {
  const CREDENTIAL_LIKE_PATTERNS = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bpassword\s*=\s*["'][^"']+["']/i,
    /ssh-(rsa|ed25519|dss)\s+AAAA/,
  ];
  for (const pattern of CREDENTIAL_LIKE_PATTERNS) assert.doesNotMatch(rawText, pattern);
  assert.doesNotMatch(rawText, /\b(?:\d{1,3}\.){3}\d{1,3}\b/);
});

// --- behavioural: the embedded node -e scripts actually work ---

function extractNodeDashE(yaml, occurrenceIndex) {
  const matches = [...yaml.matchAll(/node -e '([\s\S]*?)'/g)];
  assert.ok(matches.length > occurrenceIndex, `expected at least ${occurrenceIndex + 1} node -e invocations`);
  return matches[occurrenceIndex][1];
}

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "botm-city-worker-trial-script-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** Runs `node -e <script>` as a real child process, optionally piping `stdin` in — matching how the poll step pipes ssh's stdout into its own `node -e`. */
function runNode(script, env, stdin) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, ["-e", script], { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolvePromise({ status: code, stdout, stderr }));
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });
}

test("behavioural: the estate-validation script accepts the REAL fa64002 fixture (exactly the five approved sources)", async () => {
  const script = extractNodeDashE(rawText, 0);
  await withTempDir(async (dir) => {
    const estatePath = join(dir, "berlin-sample-01.json");
    await writeFile(
      estatePath,
      JSON.stringify({
        registry: "sources/berlin.json",
        source_ids: ["tempodrom-berlin", "a-trane-berlin", "b-flat-berlin", "uber-arena-berlin", "columbiahalle-berlin"],
      }),
    );
    const result = await runNode(script, {
      TRIAL_ESTATE_REF: estatePath,
      TRIAL_EXPECTED_SOURCE_IDS: "tempodrom-berlin,a-trane-berlin,b-flat-berlin,uber-arena-berlin,columbiahalle-berlin",
    });
    assert.equal(result.status, 0, `expected success, stderr: ${result.stderr}`);
    assert.match(result.stdout, /Trial estate validated: exactly 5 approved sources/);
  });
});

test("behavioural: the estate-validation script REJECTS an over-broad (six-source) estate", async () => {
  const script = extractNodeDashE(rawText, 0);
  await withTempDir(async (dir) => {
    const estatePath = join(dir, "berlin-sample-01.json");
    await writeFile(
      estatePath,
      JSON.stringify({
        registry: "sources/berlin.json",
        source_ids: ["tempodrom-berlin", "a-trane-berlin", "b-flat-berlin", "uber-arena-berlin", "columbiahalle-berlin", "extra-venue-berlin"],
      }),
    );
    const result = await runNode(script, {
      TRIAL_ESTATE_REF: estatePath,
      TRIAL_EXPECTED_SOURCE_IDS: "tempodrom-berlin,a-trane-berlin,b-flat-berlin,uber-arena-berlin,columbiahalle-berlin",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /do not exactly match the five approved Berlin sources/);
  });
});

test("behavioural: the estate-validation script REJECTS the right five sources under the wrong registry", async () => {
  const script = extractNodeDashE(rawText, 0);
  await withTempDir(async (dir) => {
    const estatePath = join(dir, "berlin-sample-01.json");
    await writeFile(
      estatePath,
      JSON.stringify({
        registry: "sources/london.json",
        source_ids: ["tempodrom-berlin", "a-trane-berlin", "b-flat-berlin", "uber-arena-berlin", "columbiahalle-berlin"],
      }),
    );
    const result = await runNode(script, {
      TRIAL_ESTATE_REF: estatePath,
      TRIAL_EXPECTED_SOURCE_IDS: "tempodrom-berlin,a-trane-berlin,b-flat-berlin,uber-arena-berlin,columbiahalle-berlin",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /expected exactly "sources\/berlin\.json"/);
  });
});

test("behavioural: the evidence-collection script separates worker attempts from collector retry_count per source, and reports runner_version_sha", async () => {
  const script = extractNodeDashE(rawText, 3);
  await withTempDir(async (dir) => {
    const evidencePath = join(dir, "evidence-raw.txt");
    const summaryPath = join(dir, "summary.md");
    await writeFile(summaryPath, "");
    const job = {
      job_id: "abc-123",
      country: "DE",
      city: "Berlin",
      state: "COMPLETE_WITH_RESIDUE",
      total_sources: 5,
      completed_sources: 5,
      successful_sources: 1,
      residue_sources: 2,
      failed_sources: 2,
      created_at: "2026-08-29T18:00:00.000Z",
      started_at: "2026-08-29T18:00:05.000Z",
      completed_at: "2026-08-29T18:04:12.000Z",
      last_checkpoint: "2026-08-29T18:04:12.000Z",
      runner_version_sha: "fa64002efdc9c0a1297b1e6a02ce9c0cba56737a",
    };
    const source1 = { source_id: "tempodrom-berlin", status: "SUCCESS", attempts: 1, retry_count: 0, source_state: "ACQUISITION_PROVEN" };
    const source2 = { source_id: "a-trane-berlin", status: "FAILED", attempts: 1, retry_count: 3, source_state: "NETWORK_FAILURE", error: "NETWORK_FAILURE" };
    const raw = [
      JSON.stringify(job),
      "---SOURCES---",
      "==sources/tempodrom-berlin.json==",
      JSON.stringify(source1),
      "==sources/a-trane-berlin.json==",
      JSON.stringify(source2),
    ].join("\n");
    await writeFile(evidencePath, raw);

    // The script reads a hardcoded /tmp path and writes to $GITHUB_STEP_SUMMARY
    // in the real workflow -- substitute both via env/rewrite for this test,
    // exercising the exact same logic byte-for-byte.
    const rewritten = script
      .replace('fs.readFileSync("/tmp/evidence-raw.txt", "utf8")', "fs.readFileSync(process.env.EVIDENCE_PATH, \"utf8\")")
      .replace("fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY,", "fs.appendFileSync(process.env.SUMMARY_PATH,");
    const result = await runNode(rewritten, { EVIDENCE_PATH: evidencePath, SUMMARY_PATH: summaryPath });
    assert.equal(result.status, 0, `expected success, stderr: ${result.stderr}`);

    const summary = await readFile(summaryPath, "utf8");
    assert.match(summary, /runner_version_sha \| `fa64002efdc9c0a1297b1e6a02ce9c0cba56737a`/);
    assert.match(summary, /\| tempodrom-berlin \| SUCCESS \| 1 \| 0 \| ACQUISITION_PROVEN \|/);
    assert.match(summary, /\| a-trane-berlin \| FAILED \| 1 \| 3 \| NETWORK_FAILURE \| error=NETWORK_FAILURE \|/);
  });
});

test("behavioural: the poll step's state-extraction one-liner reads a real show-job JSON response off stdin and prints just its state", async () => {
  const script = extractNodeDashE(rawText, 2);
  const result = await runNode(script, {}, JSON.stringify({ job_id: "abc-123", state: "RUNNING", total_sources: 5 }));
  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "RUNNING");
});

test("behavioural: the poll step's state-extraction one-liner degrades safely (empty string, never a crash) on malformed/unavailable stdin", async () => {
  const script = extractNodeDashE(rawText, 2);
  const result = await runNode(script, {}, "not json at all, e.g. an SSH connection hiccup");
  assert.equal(result.status, 0, "a malformed response must never crash the poll loop");
  assert.equal(result.stdout.trim(), "");
});

test("behavioural: the job_id-extraction one-liner (enqueue step) reads a real enqueue-city JSON response from a file", async () => {
  const script = extractNodeDashE(rawText, 1);
  await withTempDir(async (dir) => {
    const outputPath = join(dir, "enqueue-output.json");
    await writeFile(outputPath, JSON.stringify({ job_id: "abc-123", state: "QUEUED" }));
    const rewritten = script.replace("/tmp/enqueue-output.json", outputPath.replace(/\\/g, "\\\\"));
    const result = await runNode(rewritten, {});
    assert.equal(result.status, 0, `expected success, stderr: ${result.stderr}`);
    assert.equal(result.stdout.trim(), "abc-123");
  });
});
