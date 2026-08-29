// BEATMAPPED-COLLECTOR-ONE-CLICK-DEPLOY-02 — offline proof for the manual
// "Deploy BeatMapped Collector" GitHub Actions workflow. Two layers,
// matching this repository's existing dependency-free testing convention
// (see tests/digitalocean-deployment.test.mjs, which treats install.sh and
// the systemd units as plain text rather than depending on a YAML parser
// dependency this repo doesn't otherwise need):
//
//   1. Content-level assertions on the raw workflow YAML text — proves the
//      trigger shape, the main-history safety gate, the SSH host-key
//      handling, and that install.sh remains the sole deployment
//      authority (never duplicated in YAML).
//   2. A genuine BEHAVIOURAL proof for the real logic embedded in the
//      workflow — extracted byte-for-byte from the workflow file and
//      actually executed via real `node` subprocesses against real
//      fixtures and a real local HTTP server (the SAME
//      ingestion/publication-server/run.mjs the production host runs —
//      never a second, hand-rolled mock server), proving it reuses
//      ingestion/map/publication.mjs's real validatePublicationArtifact()
//      rather than a second, parallel schema.
//
// BEATMAPPED-DEPLOYMENT-WORKFLOW-ASYNC-PUBLICATION-VERIFICATION-01 —
// publication is now triggered asynchronously: SSH performs only short,
// bounded control operations, and completion is verified afterwards
// entirely over the public, read-only runtime endpoint. This file's
// behavioural layer now covers TWO extracted scripts (previously one):
// the pre-trigger baseline capture, and the bounded poll-then-validate
// script that proves a genuinely NEWER publication cycle was observed —
// never merely the pre-existing artifact.

import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { startServer } from "../ingestion/publication-server/run.mjs";

const WORKFLOW_PATH = fileURLToPath(new URL("../.github/workflows/deploy-beatmapped-collector.yml", import.meta.url));
const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

async function readWorkflow() {
  // Normalize CRLF -> LF: the blob committed to git is LF-only (verified
  // separately), but a LOCAL checkout's line endings depend on that
  // worktree's own core.autocrlf setting, which varies machine-to-machine
  // and even worktree-to-worktree on the same machine. This suite's
  // regexes assume LF; the real GitHub Actions runner (Linux) always
  // checks out LF regardless, so this normalization only affects local
  // test portability, never what actually runs in CI.
  const raw = await readFile(WORKFLOW_PATH, "utf8");
  return raw.replace(/\r\n/g, "\n");
}

// Strips `#`-comment lines before doesNotMatch-style checks, matching the
// existing tests/digitalocean-deployment.test.mjs convention — this
// file's OWN doc comments legitimately explain, in prose, things this
// workflow must never actually DO (e.g. "never fetched via ssh-keyscan",
// "never reimplements ... npm ci"); only literal executed lines count.
function stripCommentLines(yaml) {
  return yaml
    .split("\n")
    .filter((line) => !line.trim().startsWith("#"))
    .join("\n");
}

// Extracts one step's full body — from its own `- name: <prefix>...` line
// up to (but excluding) the next 6-space-indented `- name:` line, or to the
// end of the file if it's the last step. Plain string slicing rather than a
// single regex with an end-of-string lookahead: this workflow's own body
// text is full of literal "Z"-suffixed ISO timestamps, which makes a naive
// `\Z`-as-end-of-string lookahead (JS regex has no \Z metacharacter — an
// unescaped `\Z` simply matches a literal "Z" character) stop at the FIRST
// such timestamp instead of the real step boundary.
function extractStepBody(yaml, namePrefix) {
  const startMarker = `- name: ${namePrefix}`;
  const startIdx = yaml.indexOf(startMarker);
  assert.ok(startIdx >= 0, `expected to find a step starting with "${startMarker}"`);
  const nextIdx = yaml.indexOf("\n      - name:", startIdx + startMarker.length);
  return nextIdx === -1 ? yaml.slice(startIdx) : yaml.slice(startIdx, nextIdx);
}

// Same idea, one level up: extracts a top-level (2-space-indented) job's
// full body, from `  <jobName>:` up to the next 2-space-indented job key,
// or to the end of the file if it's the last job.
function extractJobBody(yaml, jobName) {
  const startMarker = `\n  ${jobName}:\n`;
  const startIdx = yaml.indexOf(startMarker);
  assert.ok(startIdx >= 0, `expected to find a top-level "${jobName}:" job`);
  // The next line indented at EXACTLY 2 spaces followed by a non-space
  // character is the next job key — a 4+ space line (this job's own
  // fields/steps) must not be mistaken for that boundary.
  const nextJobKey = /\n {2}\S/.exec(yaml.slice(startIdx + startMarker.length));
  return nextJobKey ? yaml.slice(startIdx, startIdx + startMarker.length + nextJobKey.index) : yaml.slice(startIdx);
}

// --- content-level: trigger shape ---

test("workflow: display name is exactly 'Deploy BeatMapped Collector'", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /^name:\s*Deploy BeatMapped Collector\s*$/m);
});

test("workflow: triggers ONLY on workflow_dispatch — never automatically on push", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /^on:\s*$/m);
  assert.match(yaml, /^\s+workflow_dispatch:/m);
  // The literal YAML key `push:` must never appear as a trigger for this
  // workflow — this file has exactly one `on:` block.
  const onBlockMatch = /^on:\n([\s\S]*?)^permissions:/m.exec(yaml);
  assert.ok(onBlockMatch, "expected an `on:` block terminated by `permissions:`");
  assert.doesNotMatch(onBlockMatch[1], /^\s*push:/m, "this workflow must never trigger automatically on push");
});

test("workflow: accepts a required 'ref' input", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /inputs:\s*\n\s*ref:/);
  assert.match(yaml, /ref:[\s\S]*?required:\s*true/);
});

// --- content-level: main-history safety ---
//
// BEATMAPPED-APPROVED-CANDIDATE-SHA-DEPLOYMENT-PATH-01 extracted the
// resolve/validate logic these next two tests originally checked inline
// into deploy/ci/resolve-and-validate-deployment.sh — the SAME script the
// workflow now calls (see tests/deploy-workflow-authorisation.test.mjs for
// the full behavioural proof, run against a real git repo). These two
// tests now check the workflow correctly delegates to that exact script,
// plus that the script itself still contains the real logic.

test("workflow: delegates SHA resolution/validation to the shared, independently-tested script — never re-inlines the logic", async () => {
  const yaml = await readWorkflow();
  // BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01 added a third
  // argument, post_deploy_action, to this exact call.
  assert.match(yaml, /bash deploy\/ci\/resolve-and-validate-deployment\.sh "\$MODE" "\$REQUESTED" "\$POST_DEPLOY_ACTION"/);
});

test("resolve-and-validate-deployment.sh: resolves the input to a full commit SHA, and validates MAIN-mode ancestry via merge-base --is-ancestor", async () => {
  const script = await readFile(fileURLToPath(new URL("../deploy/ci/resolve-and-validate-deployment.sh", import.meta.url)), "utf8");
  assert.match(script, /git rev-parse "\$\{REQUESTED\}\^\{commit\}"/);
  assert.match(script, /git merge-base --is-ancestor "\$\{RESOLVED_SHA\}" origin\/main/);
});

test("workflow: the deploy job needs (depends on) the resolve-and-validate job — cannot skip the safety gate", async () => {
  const yaml = await readWorkflow();
  const deployJob = extractJobBody(yaml, "deploy");
  assert.match(deployJob, /needs:\s*resolve-and-validate/);
});

test("workflow: deploy job still verifies deployed HEAD matches the exact resolved SHA — no 'deploy whatever is on main' regression", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /DEPLOYED_SHA="\$\(sudo -u botm git -C "\$APP_DIR" rev-parse HEAD\)"/);
  assert.match(yaml, /if \[ "\$DEPLOYED_SHA" != "\$RESOLVED_SHA" \]; then/);
});

// --- content-level: SSH / secrets handling ---

test("workflow: never disables host-key verification (no StrictHostKeyChecking=no, no ssh-keyscan TOFU)", async () => {
  const yaml = await readWorkflow();
  const executableLines = stripCommentLines(yaml);
  assert.doesNotMatch(executableLines, /StrictHostKeyChecking=no/i);
  assert.doesNotMatch(executableLines, /ssh-keyscan/i);
  // Every ssh invocation must explicitly request strict checking.
  const sshInvocations = [...yaml.matchAll(/ssh -o StrictHostKeyChecking=(\S+)/g)];
  assert.ok(sshInvocations.length > 0, "expected at least one explicit ssh invocation");
  for (const m of sshInvocations) {
    assert.equal(m[1], "yes", `every ssh invocation must use StrictHostKeyChecking=yes, found: ${m[0]}`);
  }
});

test("workflow: uses a pinned known_hosts file sourced from a secret, not an auto-generated one", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /secrets\.BEATMAPPED_PROD_SSH_HOST_KEY/);
  assert.match(yaml, /UserKnownHostsFile="\$HOME\/\.ssh\/known_hosts"/);
});

test("workflow: references the expected named secrets for production SSH access, and no others", async () => {
  const yaml = await readWorkflow();
  const referenced = new Set([...yaml.matchAll(/secrets\.(BEATMAPPED_[A-Z0-9_]+)/g)].map((m) => m[1]));
  assert.deepEqual(
    [...referenced].sort(),
    ["BEATMAPPED_PROD_HOST", "BEATMAPPED_PROD_SSH_HOST_KEY", "BEATMAPPED_PROD_SSH_KEY", "BEATMAPPED_PROD_USER"].sort(),
  );
});

test("workflow: never prints a secret value directly (no bare ${{ secrets.* }} inside an echo of its own name)", async () => {
  const yaml = await readWorkflow();
  // A crude but effective guard: no line combining `echo` and `secrets.`
  // on the same line (the private key/host key are only ever written to
  // files via printf, never echoed).
  const offendingLines = yaml.split("\n").filter((l) => /\becho\b/.test(l) && /secrets\./.test(l));
  assert.deepEqual(offendingLines, []);
});

test("workflow: uses a dedicated Environment, not the pre-existing Vercel-managed Production/Preview pair", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /environment:\s*beatmapped-collector-production/);
  assert.doesNotMatch(yaml, /environment:\s*Production\s*$/m);
  assert.doesNotMatch(yaml, /environment:\s*Preview\s*$/m);
});

test("workflow: no credential-shaped literal or hardcoded IP anywhere in the file", async () => {
  const yaml = await readWorkflow();
  const CREDENTIAL_LIKE_PATTERNS = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bpassword\s*=\s*["'][^"']+["']/i,
    /ssh-(rsa|ed25519|dss)\s+AAAA/,
  ];
  for (const pattern of CREDENTIAL_LIKE_PATTERNS) {
    assert.doesNotMatch(yaml, pattern);
  }
  assert.doesNotMatch(yaml, /\b(?:\d{1,3}\.){3}\d{1,3}\b/, "must never hardcode a literal server IP");
});

// --- content-level: deploy/install.sh remains the sole deployment authority ---

test("workflow: invokes the EXISTING deploy/install.sh --ref=<resolved sha> — never reimplements clone/checkout/npm-ci in YAML", async () => {
  const yaml = await readWorkflow();
  const executableLines = stripCommentLines(yaml);
  // BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01 extracted the
  // installer's arguments into an INSTALL_ARGS variable (so DEPLOY_ONLY can
  // conditionally append --skip-publication-restart without duplicating
  // the ssh invocation) — the exact, unresolved `--ref=${RESOLVED_SHA}`
  // text still appears, just one line earlier, building that variable.
  assert.match(yaml, /INSTALL_ARGS="--ref=\$\{RESOLVED_SHA\}"/);
  assert.match(yaml, /\$\{BEATMAPPED_APP_DIR\}\/deploy\/install\.sh \$\{INSTALL_ARGS\}/);
  assert.doesNotMatch(executableLines, /npm ci/, "dependency installation must remain install.sh's job, not YAML's");
  assert.doesNotMatch(executableLines, /git clone/, "cloning must remain install.sh's job, not YAML's");
});

test("workflow: never overrides check-deploy-tree.sh's dirty-tree protection (no ad-hoc git stash/reset/checkout of the artifact in YAML)", async () => {
  const yaml = await readWorkflow();
  const executableLines = stripCommentLines(yaml);
  assert.doesNotMatch(executableLines, /git stash/);
  assert.doesNotMatch(executableLines, /git reset/);
});

// --- content-level: publication trigger is NON-BLOCKING (async model) ---

test("workflow: publication is triggered via the SAME existing systemd oneshot unit the timer already uses, NON-BLOCKING (--no-block)", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /systemctl start --no-block botm-unattended\.service/);
  assert.doesNotMatch(yaml, /systemctl (start|enable).*botm-unattended\.timer/, "the workflow must never alter the timer/cadence itself");
});

test("workflow: the SSH step that triggers publication does not itself wait for completion (no systemctl show/is-active polling loop inside the trigger step)", async () => {
  const yaml = await readWorkflow();
  const body = extractStepBody(yaml, "Trigger the publication cycle");
  assert.doesNotMatch(body, /systemctl show/, "the trigger step must not block waiting for the unit's Result");
  assert.doesNotMatch(body, /\bsleep\b/, "the trigger step must not sleep/wait inside the SSH session");
});

test("workflow: SSH material is cleaned up immediately after the last SSH-touching step, before the long external polling phase begins", async () => {
  const yaml = await readWorkflow();
  const stepNames = [...yaml.matchAll(/^\s{6}- name: (.+)$/gm)].map((m) => m[1]);
  const triggerIdx = stepNames.findIndex((n) => n.startsWith("Trigger the publication cycle"));
  const cleanupIdx = stepNames.findIndex((n) => n === "Clean up local SSH material");
  const pollIdx = stepNames.findIndex((n) => n.startsWith("Poll for a newer publication cycle"));
  assert.ok(triggerIdx >= 0 && cleanupIdx >= 0 && pollIdx >= 0, "expected all three steps to be present");
  // BEATMAPPED-APPROVED-CANDIDATE-SHA-DEPLOYMENT-PATH-01 added one
  // intervening step directly after the trigger step — a pure
  // step-summary write for APPROVED_CANDIDATE mode's own "publication was
  // not triggered" record, which never touches SSH/network. Cleanup must
  // therefore follow the trigger step by at most that one non-SSH step,
  // never by anything that itself performs SSH/network I/O.
  const between = stepNames.slice(triggerIdx + 1, cleanupIdx);
  assert.ok(between.length <= 1, `expected at most one non-SSH step between the trigger step and SSH cleanup, found: ${JSON.stringify(between)}`);
  for (const name of between) {
    assert.match(name, /deliberately NOT triggered/, `the only step allowed between trigger and cleanup is the APPROVED_CANDIDATE skip-acknowledgement, found: "${name}"`);
  }
  assert.ok(pollIdx > cleanupIdx, "the bounded external poll must come after SSH material is already cleaned up");
});

test("workflow: no SSH invocation anywhere waits on/polls the runtime endpoint or sleeps for the publication cycle", async () => {
  const yaml = await readWorkflow();
  // Every `ssh ... <<'REMOTE_SCRIPT'` or single-line ssh command block must
  // stay short and bounded — none of them may itself loop/poll waiting for
  // the acquisition cycle to finish.
  const sshBlocks = [...yaml.matchAll(/ssh -o StrictHostKeyChecking[\s\S]*?(?=\n\n|\Z)/g)].map((m) => m[0]);
  assert.ok(sshBlocks.length >= 3, "expected at least 3 distinct ssh invocations (deploy, verify, trigger)");
  for (const block of sshBlocks) {
    assert.doesNotMatch(block, /RUNTIME_BASE_URL/, "an SSH block must never itself poll the public runtime endpoint");
    assert.doesNotMatch(block, /while \[/, "an SSH block must never contain its own polling loop");
  }
});

test("workflow: the bounded poll step has both a script-level MAX_WAIT_SECONDS and a GitHub Actions step-level timeout-minutes outer bound", async () => {
  const yaml = await readWorkflow();
  const pollStep = extractStepBody(yaml, "Poll for a newer publication cycle");
  assert.match(pollStep, /timeout-minutes:\s*\d+/);
  assert.match(pollStep, /MAX_WAIT_SECONDS:\s*"?\d+"?/);
});

test("workflow: the deploy job itself has an outer job-level timeout-minutes safety net", async () => {
  const yaml = await readWorkflow();
  const deployJob = extractJobBody(yaml, "deploy");
  assert.match(deployJob, /^\s+timeout-minutes:\s*\d+/m);
});

test("workflow: verification reuses ingestion/map/publication.mjs's validatePublicationArtifact — never a second schema", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /import \{ validatePublicationArtifact \} from "\.\/ingestion\/map\/publication\.mjs"/);
});

test("workflow: publication verification checks Portugal, Spain, Germany, and France all have markers", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /\["Portugal", "Spain", "Germany", "France"\]/);
  assert.match(yaml, /RUNTIME_FRANCE_MARKERS/);
  assert.match(yaml, /Portugal \$PT \/ Spain \$ES \/ Germany \$DE \/ France \$FR/);
});

test("workflow: verification never hardcodes an exact marker/listing count as a pass/fail threshold", async () => {
  const yaml = await readWorkflow();
  const pollStep = extractStepBody(yaml, "Poll for a newer publication cycle");
  // Only presence/non-empty checks (`length === 0`), never `=== <number>` on a count.
  assert.doesNotMatch(pollStep, /map_marker_count\s*===\s*\d/);
  assert.doesNotMatch(pollStep, /display_listing_count\s*===\s*\d/);
});

test("workflow: runtime verification stays generic — no enrichment-pilot Artist names hardcoded into deployment infrastructure", async () => {
  const yaml = await readWorkflow();
  for (const name of ["Evanescence", "Jungle", "Duran Duran", "Amon Amarth", "Thirty Seconds to Mars"]) {
    assert.doesNotMatch(yaml, new RegExp(name));
  }
});

test("workflow: uses GITHUB_STEP_SUMMARY so a human never has to read raw logs for a normal run", async () => {
  const yaml = await readWorkflow();
  const summaryWrites = (yaml.match(/GITHUB_STEP_SUMMARY/g) ?? []).length;
  assert.ok(summaryWrites >= 5, `expected several distinct summary writes, found ${summaryWrites}`);
});

test("workflow: a failed authorisation validation (either mode) uses ::error:: and exits non-zero — never merely a warning", async () => {
  const yaml = await readWorkflow();
  // The workflow's own step wraps ANY resolve-and-validate-deployment.sh
  // failure (MAIN or APPROVED_CANDIDATE) with ::error:: + exit 1; the
  // script itself (checked in the next test) is where the specific
  // "Refusing to deploy ..." reasons now live.
  assert.match(yaml, /::error::Deployment authorisation failed for mode[\s\S]*?exit 1/);
});

test("resolve-and-validate-deployment.sh: a failed validation in either mode fails closed with a clear, specific reason and a non-zero exit", async () => {
  const script = await readFile(fileURLToPath(new URL("../deploy/ci/resolve-and-validate-deployment.sh", import.meta.url)), "utf8");
  assert.match(script, /ERROR: refusing to deploy[\s\S]*?NOT reachable from origin\/main[\s\S]*?exit 1/);
  assert.match(script, /ERROR: refusing to deploy[\s\S]*?not the exact current tip of any origin candidate\/deploy\/\*[\s\S]*?exit 1/);
});

test("workflow: a verification timeout is explicitly distinguished from a deployment failure in its own error message", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /VERIFICATION TIMEOUT/);
  assert.match(yaml, /does NOT necessarily mean deployment failed/);
});

// --- behavioural: the two real embedded scripts actually work ---

function extractHeredocScript(yaml, delimiter) {
  const re = new RegExp(`<<'${delimiter}'\\n([\\s\\S]*?)\\n[ \\t]*${delimiter}`);
  const m = re.exec(yaml);
  assert.ok(m, `expected to find the ${delimiter} heredoc in the workflow`);
  return m[1];
}

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "botm-workflow-script-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function writeScript(dir, source) {
  // Both extracted scripts import "./ingestion/map/publication.mjs"
  // relative to the GitHub Actions workspace root — rewritten here ONLY
  // for local test portability (a proper file:// URL, since Node's ESM
  // loader rejects a raw "C:/..." specifier on Windows); the logic itself
  // is untouched, byte-for-byte from the workflow file.
  const rewritten = source.replace("./ingestion/map/publication.mjs", new URL("../ingestion/map/publication.mjs", import.meta.url).href);
  const scriptPath = join(dir, "script.mjs");
  await writeFile(scriptPath, rewritten);
  return scriptPath;
}

/** Runs a script as a real child process with the given env, resolving once it exits. */
function runScript(scriptPath, env) {
  return new Promise((resolvePromise) => {
    const child = spawn(process.execPath, [scriptPath], { env: { ...process.env, ...env } });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("close", (code) => resolvePromise({ status: code, stdout, stderr }));
  });
}

function validArtifact({ generatedAt, portugal = 1, spain = 1, germany = 1, france = 1 }) {
  const marker = (i, country) => ({
    venue_id: `venue-${country}-${i}`,
    canonical_name: `Venue ${country} ${i}`,
    latitude: 38.7,
    longitude: -9.1,
    address: "Test Address",
    display_listings: [{ kind: "SINGLE", source_id: `source-${country}-${i}`, source_record_id: "rec-1" }],
  });
  return {
    generated_at: generatedAt,
    window: { from: null, to: null },
    source_report: { success_count: 1, failure_count: 0, sources: [{ source_id: "test-source", success: true, raw_record_count: 1, observation_count: 1 }] },
    counts: { observation_count: portugal + spain + germany + france, display_listing_count: portugal + spain + germany + france, map_marker_count: portugal + spain + germany + france },
    countries: {
      Portugal: { markers: Array.from({ length: portugal }, (_, i) => marker(i, "pt")) },
      Croatia: { markers: [] },
      Spain: { markers: Array.from({ length: spain }, (_, i) => marker(i, "es")) },
      Germany: { markers: Array.from({ length: germany }, (_, i) => marker(i, "de")) },
      France: { markers: Array.from({ length: france }, (_, i) => marker(i, "fr")) },
    },
  };
}

// --- capture-pretrigger script ---

test("capture-pretrigger script: reads a real running publication server and prints its current generated_at", async () => {
  const yaml = await readWorkflow();
  const script = extractHeredocScript(yaml, "CAPTURE_EOF");
  await withTempDir(async (dir) => {
    const artifactPath = join(dir, "map-data.json");
    await writeFile(artifactPath, JSON.stringify(validArtifact({ generatedAt: "2026-08-26T10:00:00.000Z" })));
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath });
    try {
      const { port } = server.address();
      const scriptPath = await writeScript(dir, script);
      const result = await runScript(scriptPath, { RUNTIME_BASE_URL: `http://127.0.0.1:${port}` });
      assert.equal(result.status, 0);
      assert.match(result.stdout, /^PRE_TRIGGER_GENERATED_AT=2026-08-26T10:00:00\.000Z$/m);
    } finally {
      server.close();
    }
  });
});

test("capture-pretrigger script: an unreachable endpoint is handled safely — prints an empty baseline, never crashes, never fails the step", async () => {
  const yaml = await readWorkflow();
  const script = extractHeredocScript(yaml, "CAPTURE_EOF");
  await withTempDir(async (dir) => {
    const scriptPath = await writeScript(dir, script);
    // Port 1 is never a real listening service — a genuine connection failure.
    const result = await runScript(scriptPath, { RUNTIME_BASE_URL: "http://127.0.0.1:1" });
    assert.equal(result.status, 0, "an unreachable pre-trigger check must never fail the workflow step");
    assert.match(result.stdout, /^PRE_TRIGGER_GENERATED_AT=$/m);
  });
});

// --- poll-and-validate script ---

test("poll-and-validate script: recognizes a newer generation and exits 0 with the new artifact's real totals", async () => {
  const yaml = await readWorkflow();
  const script = extractHeredocScript(yaml, "VERIFY_EOF");
  await withTempDir(async (dir) => {
    const artifactPath = join(dir, "map-data.json");
    // Server starts already serving the NEWER cycle — proves the script
    // correctly recognizes generated_at > preTrigger on the very first poll.
    await writeFile(artifactPath, JSON.stringify(validArtifact({ generatedAt: "2026-08-26T18:41:35.794Z", portugal: 13, spain: 31, germany: 22 })));
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath });
    try {
      const { port } = server.address();
      const scriptPath = await writeScript(dir, script);
      const result = await runScript(scriptPath, {
        RUNTIME_BASE_URL: `http://127.0.0.1:${port}`,
        PRE_TRIGGER_GENERATED_AT: "2026-08-26T18:11:52.772Z",
        POLL_INTERVAL_SECONDS: "0.1",
        MAX_WAIT_SECONDS: "5",
      });
      assert.equal(result.status, 0, `expected success, stderr: ${result.stderr}`);
      assert.match(result.stdout, /RUNTIME_GENERATED_AT=2026-08-26T18:41:35\.794Z/);
      assert.match(result.stdout, /RUNTIME_PORTUGAL_MARKERS=13/);
      assert.match(result.stdout, /RUNTIME_SPAIN_MARKERS=31/);
      assert.match(result.stdout, /RUNTIME_GERMANY_MARKERS=22/);
      assert.match(result.stdout, /RUNTIME_FRANCE_MARKERS=1/);
    } finally {
      server.close();
    }
  });
});

test("poll-and-validate script: an artifact whose generated_at never advances past the pre-trigger baseline is NEVER accepted as success — times out and exits non-zero", async () => {
  const yaml = await readWorkflow();
  const script = extractHeredocScript(yaml, "VERIFY_EOF");
  await withTempDir(async (dir) => {
    const artifactPath = join(dir, "map-data.json");
    // Server keeps serving the SAME (pre-trigger) generated_at the whole time.
    await writeFile(artifactPath, JSON.stringify(validArtifact({ generatedAt: "2026-08-26T18:11:52.772Z" })));
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath });
    try {
      const { port } = server.address();
      const scriptPath = await writeScript(dir, script);
      const result = await runScript(scriptPath, {
        RUNTIME_BASE_URL: `http://127.0.0.1:${port}`,
        PRE_TRIGGER_GENERATED_AT: "2026-08-26T18:11:52.772Z",
        POLL_INTERVAL_SECONDS: "0.1",
        MAX_WAIT_SECONDS: "0.5",
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /VERIFICATION TIMEOUT/);
      assert.match(result.stderr, /does NOT necessarily mean deployment failed/);
    } finally {
      server.close();
    }
  });
});

test("poll-and-validate script: an unreachable endpoint for the whole window is treated as still-publishing, never crashes, and times out cleanly", async () => {
  const yaml = await readWorkflow();
  const script = extractHeredocScript(yaml, "VERIFY_EOF");
  await withTempDir(async (dir) => {
    const scriptPath = await writeScript(dir, script);
    const result = await runScript(scriptPath, {
      RUNTIME_BASE_URL: "http://127.0.0.1:1",
      PRE_TRIGGER_GENERATED_AT: "",
      POLL_INTERVAL_SECONDS: "0.1",
      MAX_WAIT_SECONDS: "0.5",
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /VERIFICATION TIMEOUT/);
  });
});

test("poll-and-validate script: a malformed (non-JSON) /health response is handled safely, treated as still-publishing, never crashes", async () => {
  const yaml = await readWorkflow();
  const script = extractHeredocScript(yaml, "VERIFY_EOF");
  const { createServer } = await import("node:http");
  const malformedServer = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end("{not valid json");
  });
  await new Promise((r) => malformedServer.listen(0, "127.0.0.1", r));
  try {
    const { port } = malformedServer.address();
    await withTempDir(async (dir) => {
      const scriptPath = await writeScript(dir, script);
      const result = await runScript(scriptPath, {
        RUNTIME_BASE_URL: `http://127.0.0.1:${port}`,
        PRE_TRIGGER_GENERATED_AT: "",
        POLL_INTERVAL_SECONDS: "0.1",
        MAX_WAIT_SECONDS: "0.5",
      });
      assert.equal(result.status, 1, "malformed responses must never crash the process (non-zero from a clean timeout, not an uncaught exception)");
      assert.doesNotMatch(result.stderr, /SyntaxError/, "a JSON parse error must be caught internally, never surfaced as an unhandled exception");
      assert.match(result.stderr, /VERIFICATION TIMEOUT/);
    });
  } finally {
    malformedServer.close();
  }
});

test("poll-and-validate script: rejects a newer-timestamped artifact that fails publication schema validation", async () => {
  const yaml = await readWorkflow();
  const script = extractHeredocScript(yaml, "VERIFY_EOF");
  await withTempDir(async (dir) => {
    const artifactPath = join(dir, "map-data.json");
    await writeFile(artifactPath, JSON.stringify({ generated_at: "2026-08-26T18:41:35.794Z", not: "a valid publication artifact" }));
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath });
    try {
      const { port } = server.address();
      const scriptPath = await writeScript(dir, script);
      const result = await runScript(scriptPath, {
        RUNTIME_BASE_URL: `http://127.0.0.1:${port}`,
        PRE_TRIGGER_GENERATED_AT: "",
        POLL_INTERVAL_SECONDS: "0.1",
        MAX_WAIT_SECONDS: "0.5",
      });
      // publication-server's own loadValidatedArtifact() already refuses to
      // serve an invalid artifact at all (502), so this never reaches the
      // schema-validation branch inside the poll script itself — it stays
      // "inconclusive" and times out honestly, exactly as it should for a
      // host that never has a genuinely valid artifact to serve.
      assert.equal(result.status, 1);
      assert.match(result.stderr, /VERIFICATION TIMEOUT/);
    } finally {
      server.close();
    }
  });
});

test("poll-and-validate script: source/country continuity — rejects a newer artifact missing Germany markers, never accepts it as success", async () => {
  const yaml = await readWorkflow();
  const script = extractHeredocScript(yaml, "VERIFY_EOF");
  await withTempDir(async (dir) => {
    const artifactPath = join(dir, "map-data.json");
    const artifact = validArtifact({ generatedAt: "2026-08-26T18:41:35.794Z", portugal: 13, spain: 31, germany: 0 });
    await writeFile(artifactPath, JSON.stringify(artifact));
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath });
    try {
      const { port } = server.address();
      const scriptPath = await writeScript(dir, script);
      const result = await runScript(scriptPath, {
        RUNTIME_BASE_URL: `http://127.0.0.1:${port}`,
        PRE_TRIGGER_GENERATED_AT: "2026-08-26T18:11:52.772Z",
        POLL_INTERVAL_SECONDS: "0.1",
        MAX_WAIT_SECONDS: "1",
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Germany/);
    } finally {
      server.close();
    }
  });
});

test("poll-and-validate script: source/country continuity — rejects a structurally-valid but wholly EMPTY (zero-marker) newer artifact", async () => {
  const yaml = await readWorkflow();
  const script = extractHeredocScript(yaml, "VERIFY_EOF");
  await withTempDir(async (dir) => {
    const artifactPath = join(dir, "map-data.json");
    const artifact = validArtifact({ generatedAt: "2026-08-26T18:41:35.794Z", portugal: 0, spain: 0, germany: 0, france: 0 });
    artifact.counts.map_marker_count = 0;
    artifact.counts.display_listing_count = 0;
    await writeFile(artifactPath, JSON.stringify(artifact));
    const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath });
    try {
      const { port } = server.address();
      const scriptPath = await writeScript(dir, script);
      const result = await runScript(scriptPath, {
        RUNTIME_BASE_URL: `http://127.0.0.1:${port}`,
        PRE_TRIGGER_GENERATED_AT: "2026-08-26T18:11:52.772Z",
        POLL_INTERVAL_SECONDS: "0.1",
        MAX_WAIT_SECONDS: "1",
      });
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Portugal/);
    } finally {
      server.close();
    }
  });
});

test("poll-and-validate script: real, currently-committed data/public/lisbon-porto-map.json (served fresh) validates successfully end-to-end", async () => {
  const yaml = await readWorkflow();
  const script = extractHeredocScript(yaml, "VERIFY_EOF");
  const realArtifactPath = join(REPO_ROOT, "data", "public", "lisbon-porto-map.json");
  const server = await startServer({ host: "127.0.0.1", port: 0, artifactPath: realArtifactPath });
  try {
    const { port } = server.address();
    await withTempDir(async (dir) => {
      const scriptPath = await writeScript(dir, script);
      const result = await runScript(scriptPath, {
        RUNTIME_BASE_URL: `http://127.0.0.1:${port}`,
        PRE_TRIGGER_GENERATED_AT: "",
        POLL_INTERVAL_SECONDS: "0.1",
        MAX_WAIT_SECONDS: "5",
      });
      assert.equal(result.status, 0, `expected success, stderr: ${result.stderr}`);
      assert.match(result.stdout, /RUNTIME_GENERATED_AT=/);
      assert.match(result.stdout, /RUNTIME_PORTUGAL_MARKERS=\d+/);
      assert.match(result.stdout, /RUNTIME_SPAIN_MARKERS=\d+/);
      assert.match(result.stdout, /RUNTIME_GERMANY_MARKERS=\d+/);
    });
  } finally {
    server.close();
  }
});
