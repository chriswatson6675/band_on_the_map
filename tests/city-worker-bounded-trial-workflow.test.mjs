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
  // BEATMAPPED-CITY-WORKER-LIVE-TRIAL-BLOCKER-CORRECTION-01 hoisted the
  // unit name into a $UNIT variable and split the single CLEANUP_CONFIRMED
  // verdict into two distinctly-named ones. The guarantee this test exists
  // to protect is unchanged and is asserted in exactly the same strength:
  // cleanup is always-run, it stops AND disables, and an unconfirmed
  // cleanup fails the run. (The behavioural proof that it actually does so
  // under every partial-failure ordering is further down this file.)
  const cleanupBody = extractStepBody(rawText, "Stop and disable the city-worker service");
  assert.match(cleanupBody, /if:\s*always\(\)/);
  assert.match(cleanupBody, /UNIT="beatmapped-city-worker\.service"/, "the unit under cleanup must still be exactly beatmapped-city-worker.service");
  assert.match(cleanupBody, /systemctl stop "\$UNIT"/);
  assert.match(cleanupBody, /systemctl disable "\$UNIT"/);
  assert.match(cleanupBody, /CITY_WORKER_CLEANUP_CONFIRMED=false/);
  assert.match(rawText, /::error::CITY_WORKER_CLEANUP_CONFIRMED=false/);
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

// ===================================================================
// BEATMAPPED-CITY-WORKER-LIVE-TRIAL-BLOCKER-CORRECTION-01
//
// The first live run (33266172218) failed closed before any production
// mutation and exposed two control defects. These tests reproduce the
// exact live conditions.
// ===================================================================

// --- installer capability preflight (Finding A) ---

test("preflight: a READ-ONLY host installer capability check runs AFTER ssh setup but BEFORE any deployment mutation", () => {
  const preflightIdx = rawText.indexOf("- name: Preflight the production host's installed deploy/install.sh");
  const sshSetupIdx = rawText.indexOf("- name: Configure pinned SSH access");
  const deployIdx = rawText.indexOf("- name: Deploy the exact candidate via the sanctioned DEPLOY_ONLY path");
  assert.ok(preflightIdx > 0, "the preflight step must exist");
  assert.ok(preflightIdx > sshSetupIdx, "preflight needs SSH configured, so it must follow SSH setup");
  assert.ok(deployIdx > preflightIdx, "preflight MUST precede the deploy step -- its whole purpose is to stop before mutation");
});

test("preflight: is genuinely read-only -- it reads the installer and HEAD, and mutates nothing", () => {
  const body = extractStepBody(rawText, "Preflight the production host's installed deploy/install.sh");
  // Permitted read-only operations only.
  assert.match(body, /grep -q -- '--skip-publication-restart\)'/, "must detect support via the installer's own case arm");
  assert.match(body, /\[ ! -f "\$INSTALLER" \]/, "must handle a missing installer file");
  // Explicitly forbidden: anything that changes host state.
  assert.doesNotMatch(body, /install\.sh --ref=/, "preflight must never invoke the installer");
  assert.doesNotMatch(body, /systemctl (start|stop|restart|enable|disable)/, "preflight must never change any service");
  assert.doesNotMatch(body, /git checkout|git fetch|git pull/, "preflight must never move the host checkout");
  assert.doesNotMatch(body, /enqueue-city/, "preflight must never enqueue work");
});

test("preflight: matching the flag's own `case` arm distinguishes a supporting installer from one that only MENTIONS the flag in comments", async () => {
  // The real current-main installer is the positive control; a stale
  // installer that documents the flag without implementing its case arm
  // is the negative control this pattern must reject.
  const realInstaller = await readFile(join(REPO_ROOT, "deploy", "install.sh"), "utf8");
  const casePattern = /--skip-publication-restart\)/;
  assert.match(realInstaller, casePattern, "current main's install.sh must be detected as supporting the flag");

  const staleInstallerWithCommentsOnly = [
    "#   sudo deploy/install.sh --ref=<sha> [--skip-publication-restart]",
    "# --skip-publication-restart (some future note)",
    'case "$arg" in',
    "  --ref=*) REF=1 ;;",
    "esac",
  ].join("\n");
  assert.doesNotMatch(staleInstallerWithCommentsOnly, casePattern, "an installer that only mentions the flag in prose must NOT be treated as supporting it");
});

test("preflight: an unsupported host installer fails with PRODUCTION_INSTALLER_BOOTSTRAP_REQUIRED and names the sanctioned MAIN recovery", () => {
  const body = extractStepBody(rawText, "Preflight the production host's installed deploy/install.sh");
  assert.match(body, /PRODUCTION_INSTALLER_BOOTSTRAP_REQUIRED/);
  assert.match(body, /mode=MAIN/);
  assert.match(body, /post_deploy_action=NORMAL_PUBLICATION/);
  assert.match(body, /exit 1/, "an unsupported installer must fail the run, never merely warn");
  // It must NOT quietly perform that MAIN deployment itself.
  assert.doesNotMatch(body, /workflow run|gh workflow|dispatches/, "the trial workflow must never auto-dispatch the MAIN bootstrap deployment");
});

// --- cleanup robustness (Finding B), proven behaviourally ---

/**
 * Extracts the cleanup step's REMOTE_SCRIPT heredoc exactly as shipped.
 * Note the heredoc marker line carries a trailing `| tee ...`, so the
 * pattern must tolerate content after the marker.
 */
function extractCleanupRemoteScript(yaml) {
  const body = extractStepBody(yaml, "Stop and disable the city-worker service");
  const m = /<<'REMOTE_SCRIPT'[^\n]*\n([\s\S]*?)\n\s*REMOTE_SCRIPT/.exec(body);
  assert.ok(m, "expected the cleanup step to embed a REMOTE_SCRIPT heredoc");
  return m[1];
}

/**
 * Models what ssh ACTUALLY does with a remote command: it joins the argv
 * with spaces into one string and the REMOTE shell re-parses it. That is
 * precisely why empty-string arguments vanish in transit — the defect
 * that killed run 33266172218's cleanup at `$1: unbound variable`.
 */
function sshSerializeArgs(args) {
  return args.join(" ");
}

/**
 * Runs the real, shipped cleanup script under stubbed systemd. `sudo` and
 * `systemctl` are overridden as SHELL FUNCTIONS rather than PATH stubs —
 * portable, and immune to this platform's PATH-resolution quirks.
 */
function runCleanupScript(cleanupScript, { args = [], stubs = {} } = {}) {
  const harness = [
    'sudo() { "$@"; }',
    "systemctl() {",
    '  local cmd="$1" unit="${2:-}"',
    '  case "$cmd" in',
    "    stop|disable|daemon-reload) return 0 ;;",
    "    is-active)",
    '      case "$unit" in',
    '        beatmapped-city-worker.service) [ -n "${STUB_CW_ACTIVE:-}" ] && echo "$STUB_CW_ACTIVE"; [ "${STUB_CW_ACTIVE:-inactive}" = active ] && return 0 || return 3 ;;',
    '        botm-unattended.timer) [ -n "${STUB_TIMER_ACTIVE:-}" ] && echo "$STUB_TIMER_ACTIVE"; return 0 ;;',
    '        botm-publication.service) [ -n "${STUB_PUB_ACTIVE:-}" ] && echo "$STUB_PUB_ACTIVE"; return 0 ;;',
    "      esac ;;",
    "    is-enabled)",
    '      case "$unit" in',
    '        beatmapped-city-worker.service) [ -n "${STUB_CW_ENABLED:-}" ] && echo "$STUB_CW_ENABLED"; return 0 ;;',
    '        botm-unattended.timer) [ -n "${STUB_TIMER_ENABLED:-}" ] && echo "$STUB_TIMER_ENABLED"; return 0 ;;',
    "      esac ;;",
    "  esac",
    "  return 1",
    "}",
    `set -- ${sshSerializeArgs(args)}`,
    cleanupScript,
  ].join("\n");

  return new Promise((resolvePromise) => {
    const child = spawn("bash", [], { env: { ...process.env, ...stubs } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolvePromise({ status: code, stdout, stderr }));
    child.stdin.write(harness);
    child.stdin.end();
  });
}

/** Parses the cleanup script's own KEY=VALUE verdict lines. */
function parseVerdicts(stdout) {
  const out = {};
  for (const line of stdout.split("\n")) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]] = m[2];
  }
  return out;
}

const HEALTHY_BASELINE_ARGS = ["true", "enabled", "active", "active"];
const HEALTHY_STUBS = { STUB_TIMER_ENABLED: "enabled", STUB_TIMER_ACTIVE: "active", STUB_PUB_ACTIVE: "active" };

test("F/A: THE LIVE FAILURE — with the baseline step skipped, ssh drops the empty args entirely and cleanup must still run (never `$1: unbound variable`)", async () => {
  const script = extractCleanupRemoteScript(rawText);
  // Exactly what run 33266172218 sent: three empty strings, which ssh
  // serialises to nothing at all, leaving ZERO positional parameters.
  const result = await runCleanupScript(script, { args: ["", "", "", ""], stubs: HEALTHY_STUBS });
  assert.doesNotMatch(result.stderr, /unbound variable/, "the exact live-run crash must not recur");
  assert.equal(result.status, 0, `cleanup must complete, stderr: ${result.stderr}`);
  const v = parseVerdicts(result.stdout);
  assert.equal(v.CITY_WORKER_CLEANUP_CONFIRMED, "true", "with nothing running, the worker verdict is legitimately clean");
  assert.equal(v.BASELINE_RECONCILIATION, "NOT_AVAILABLE");
  assert.match(result.stdout, /EXISTING_SERVICE_BASELINE_NOT_CAPTURED/);
});

test("A: a missing baseline never silently implies existing services were verified unchanged", async () => {
  const script = extractCleanupRemoteScript(rawText);
  const result = await runCleanupScript(script, { args: ["", "", "", ""], stubs: HEALTHY_STUBS });
  const v = parseVerdicts(result.stdout);
  assert.notEqual(v.BASELINE_RECONCILIATION, "CONFIRMED", "never claim verification that did not happen");
  assert.equal(v.BASELINE_RECONCILIATION, "NOT_AVAILABLE");
});

test("F: a missing baseline STILL fails the worker verdict if a worker is genuinely left running — absent baseline never masks real cleanup failure", async () => {
  const script = extractCleanupRemoteScript(rawText);
  const result = await runCleanupScript(script, { args: ["", "", "", ""], stubs: { ...HEALTHY_STUBS, STUB_CW_ACTIVE: "active" } });
  const v = parseVerdicts(result.stdout);
  assert.equal(v.CITY_WORKER_CLEANUP_CONFIRMED, "false");
  assert.equal(v.BASELINE_RECONCILIATION, "NOT_AVAILABLE");
  assert.match(result.stderr, /still active after stop/);
});

test("B: baseline captured and everything matches — both verdicts CONFIRMED", async () => {
  const script = extractCleanupRemoteScript(rawText);
  const result = await runCleanupScript(script, { args: HEALTHY_BASELINE_ARGS, stubs: HEALTHY_STUBS });
  assert.equal(result.status, 0);
  const v = parseVerdicts(result.stdout);
  assert.equal(v.CITY_WORKER_CLEANUP_CONFIRMED, "true");
  assert.equal(v.BASELINE_RECONCILIATION, "CONFIRMED");
});

test("D: a worker left ACTIVE after stop fails the city-worker verdict, independently of a healthy baseline reconciliation", async () => {
  const script = extractCleanupRemoteScript(rawText);
  const result = await runCleanupScript(script, { args: HEALTHY_BASELINE_ARGS, stubs: { ...HEALTHY_STUBS, STUB_CW_ACTIVE: "active" } });
  const v = parseVerdicts(result.stdout);
  assert.equal(v.FINAL_ACTIVE, "active");
  assert.equal(v.CITY_WORKER_CLEANUP_CONFIRMED, "false");
  assert.equal(v.BASELINE_RECONCILIATION, "CONFIRMED", "the two verdicts are independent — a worker failure must not be blamed on the baseline");
});

test("C/N: a worker left ENABLED after disable fails the city-worker verdict", async () => {
  const script = extractCleanupRemoteScript(rawText);
  const result = await runCleanupScript(script, { args: HEALTHY_BASELINE_ARGS, stubs: { ...HEALTHY_STUBS, STUB_CW_ENABLED: "enabled" } });
  const v = parseVerdicts(result.stdout);
  assert.equal(v.FINAL_ENABLED, "enabled");
  assert.equal(v.CITY_WORKER_CLEANUP_CONFIRMED, "false");
  assert.match(result.stderr, /still enabled after disable/);
});

test("G: a systemd unit that was never installed yields NO false active/enabled result — 'unit not found' is a clean terminal state", async () => {
  const script = extractCleanupRemoteScript(rawText);
  // systemctl prints NOTHING and exits non-zero for an unknown unit.
  const result = await runCleanupScript(script, { args: HEALTHY_BASELINE_ARGS, stubs: HEALTHY_STUBS });
  const v = parseVerdicts(result.stdout);
  assert.equal(v.FINAL_ACTIVE, "inactive", "empty systemctl output must normalise to inactive, never to a doubled/blank value");
  assert.equal(v.FINAL_ENABLED, "disabled");
  assert.equal(v.CITY_WORKER_CLEANUP_CONFIRMED, "true", "a never-installed unit must not be reported as a cleanup failure");
});

test("H: a REAL existing-service mismatch fails reconciliation visibly, while the city-worker verdict stays independently true", async () => {
  const script = extractCleanupRemoteScript(rawText);
  const result = await runCleanupScript(script, {
    args: HEALTHY_BASELINE_ARGS,
    stubs: { ...HEALTHY_STUBS, STUB_PUB_ACTIVE: "inactive" },
  });
  const v = parseVerdicts(result.stdout);
  assert.equal(v.BASELINE_RECONCILIATION, "FAILED");
  assert.equal(v.CITY_WORKER_CLEANUP_CONFIRMED, "true");
  assert.match(result.stderr, /botm-publication\.service active-state changed/);
});

test("E: a timeout path (worker still active, baseline present) is reported as a cleanup failure, not silently tolerated", async () => {
  const script = extractCleanupRemoteScript(rawText);
  const result = await runCleanupScript(script, {
    args: HEALTHY_BASELINE_ARGS,
    stubs: { ...HEALTHY_STUBS, STUB_CW_ACTIVE: "activating" },
  });
  const v = parseVerdicts(result.stdout);
  assert.equal(v.CITY_WORKER_CLEANUP_CONFIRMED, "false", "a still-'activating' worker is not a stopped worker");
});

// --- static guarantees about the corrected cleanup ---

test("cleanup: no unsafe empty-positional-argument assumption remains — every value is sentinel-defaulted before ssh AND defaulted again remotely", () => {
  const body = extractStepBody(rawText, "Stop and disable the city-worker service");
  // Runner side: never hand ssh a possibly-empty string.
  assert.match(body, /BASELINE_CAPTURED="\$\{BASELINE_CAPTURED:-false\}"/);
  assert.match(body, /BASELINE_TIMER_ENABLED="\$\{BASELINE_TIMER_ENABLED:-NOT_CAPTURED\}"/);
  assert.match(body, /BASELINE_TIMER_ACTIVE="\$\{BASELINE_TIMER_ACTIVE:-NOT_CAPTURED\}"/);
  assert.match(body, /BASELINE_PUBLICATION_ACTIVE="\$\{BASELINE_PUBLICATION_ACTIVE:-NOT_CAPTURED\}"/);
  // Remote side: `set -u` can never abort on a missing positional.
  assert.match(body, /BASELINE_CAPTURED="\$\{1:-false\}"/);
  assert.match(body, /BASELINE_TIMER_ENABLED="\$\{2:-NOT_CAPTURED\}"/);
  assert.match(body, /BASELINE_TIMER_ACTIVE="\$\{3:-NOT_CAPTURED\}"/);
  assert.match(body, /BASELINE_PUBLICATION_ACTIVE="\$\{4:-NOT_CAPTURED\}"/);
  // The exact pre-correction pattern must be gone.
  assert.doesNotMatch(body, /BASELINE_TIMER_ENABLED="\$1"/, "the bare positional assignment that crashed run 33266172218 must not return");
});

test("cleanup: remote script deliberately omits `set -e` so it always runs to completion and reports a verdict", () => {
  const script = extractCleanupRemoteScript(rawText);
  assert.match(script, /set -uo pipefail/);
  assert.doesNotMatch(script, /set -euo pipefail/, "an aborting cleanup could stop before stopping the worker");
});

test("cleanup: stop and disable are ALWAYS attempted, never gated on how far the trial progressed", () => {
  const script = extractCleanupRemoteScript(rawText);
  const stopIdx = script.indexOf('sudo systemctl stop "$UNIT"');
  const disableIdx = script.indexOf('sudo systemctl disable "$UNIT"');
  assert.ok(stopIdx > 0 && disableIdx > stopIdx);
  // Neither may sit inside a conditional guarding on baseline/deploy state.
  const before = script.slice(0, stopIdx);
  assert.doesNotMatch(before, /if \[ "\$BASELINE_CAPTURED"/, "stop/disable must not be conditioned on the baseline existing");
});

test("cleanup: the two verdicts are reported as separate, distinctly-named tokens", () => {
  const script = extractCleanupRemoteScript(rawText);
  assert.match(script, /CITY_WORKER_CLEANUP_CONFIRMED=/);
  assert.match(script, /BASELINE_RECONCILIATION=(CONFIRMED|NOT_AVAILABLE|FAILED|\$)/);
  const body = extractStepBody(rawText, "Stop and disable the city-worker service");
  assert.match(body, /NOT_AVAILABLE\)/, "the runner must handle NOT_AVAILABLE explicitly");
  assert.match(body, /FAILED\)/, "the runner must handle FAILED explicitly");
});

test("cleanup: an unreachable host (no verdict at all) is treated as an unconfirmed cleanup, never a silent pass", () => {
  const body = extractStepBody(rawText, "Stop and disable the city-worker service");
  assert.match(body, /if \[ -z "\$CITY_WORKER_CLEANUP_CONFIRMED" \]/);
  assert.match(body, /Cleanup produced no verdict/);
});

test("cleanup remains if: always() after the correction", () => {
  const body = extractStepBody(rawText, "Stop and disable the city-worker service");
  assert.match(body, /if:\s*always\(\)/);
});
