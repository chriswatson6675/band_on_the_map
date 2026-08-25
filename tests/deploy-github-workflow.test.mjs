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
//   2. A genuine BEHAVIOURAL proof for the one piece of real logic
//      embedded in the workflow (the runtime-endpoint verification
//      script): it is extracted byte-for-byte from the workflow file and
//      actually executed via a real `node` subprocess against real
//      fixtures — including the REAL, unmodified data/public/
//      lisbon-porto-map.json this repository already ships, proving it
//      reuses ingestion/map/publication.mjs's real
//      validatePublicationArtifact() rather than a second, parallel
//      schema.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

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

test("workflow: resolves the input to a full commit SHA before deploying", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /git rev-parse "\$\{REQUESTED\}\^\{commit\}"/);
});

test("workflow: validates the resolved commit is reachable from origin/main via merge-base --is-ancestor", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /git merge-base --is-ancestor "\$\{RESOLVED_SHA\}" origin\/main/);
});

test("workflow: the deploy job needs (depends on) the resolve-and-validate job — cannot skip the safety gate", async () => {
  const yaml = await readWorkflow();
  const deployJobMatch = /^\s{2}deploy:\n([\s\S]*?)(?=^\s{2}\S|\Z)/m.exec(yaml);
  assert.ok(deployJobMatch, "expected a top-level `deploy:` job");
  assert.match(deployJobMatch[1], /needs:\s*resolve-and-validate/);
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
  assert.match(yaml, /\$\{BEATMAPPED_APP_DIR\}\/deploy\/install\.sh --ref=\$\{RESOLVED_SHA\}/);
  assert.doesNotMatch(executableLines, /npm ci/, "dependency installation must remain install.sh's job, not YAML's");
  assert.doesNotMatch(executableLines, /git clone/, "cloning must remain install.sh's job, not YAML's");
});

test("workflow: never overrides check-deploy-tree.sh's dirty-tree protection (no ad-hoc git stash/reset/checkout of the artifact in YAML)", async () => {
  const yaml = await readWorkflow();
  const executableLines = stripCommentLines(yaml);
  assert.doesNotMatch(executableLines, /git stash/);
  assert.doesNotMatch(executableLines, /git reset/);
});

// --- content-level: publication uses the existing service, never a duplicate/manual process ---

test("workflow: publication step starts the SAME existing systemd oneshot unit the timer already uses", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /systemctl start botm-unattended\.service/);
  assert.doesNotMatch(yaml, /systemctl (start|enable).*botm-unattended\.timer/, "the workflow must never alter the timer/cadence itself");
});

test("workflow: verification step reuses ingestion/map/publication.mjs's validatePublicationArtifact — never a second schema", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /import \{ validatePublicationArtifact \} from "\.\/ingestion\/map\/publication\.mjs"/);
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
  assert.ok(summaryWrites >= 4, `expected several distinct summary writes, found ${summaryWrites}`);
});

test("workflow: a failed main-history validation uses ::error:: and exits non-zero — never merely a warning", async () => {
  const yaml = await readWorkflow();
  assert.match(yaml, /::error::Refusing to deploy[\s\S]*?exit 1/);
});

// --- behavioural: the actual embedded runtime-verification script really works ---

function extractRuntimeVerifyScript(yaml) {
  // Read from the RAW YAML file text (this test never parses YAML), so
  // both the heredoc body and its closing delimiter still carry the
  // literal indentation of the `run: |` block scalar as written in the
  // file — that indentation is exactly what YAML's own block-scalar
  // parsing strips away when GitHub Actions actually executes this
  // workflow (proven separately: the closing delimiter lands at true
  // column 0 once YAML-parsed, which is what makes the real heredoc work
  // at all). Tolerate that same leading whitespace here.
  const m = /<<'VERIFY_EOF'\n([\s\S]*?)\n[ \t]*VERIFY_EOF/.exec(yaml);
  assert.ok(m, "expected to find the VERIFY_EOF heredoc in the workflow");
  return m[1];
}

async function withTempDir(fn) {
  const dir = await mkdtemp(join(tmpdir(), "botm-workflow-runtime-verify-"));
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

async function runExtractedVerifyScript(scriptSource, artifactPath) {
  // The real script imports "./ingestion/map/publication.mjs" (relative
  // to the GitHub Actions workspace root) and reads a fixed "/tmp/map-data.json"
  // path -- both rewritten here ONLY for local test portability, the
  // logic itself is untouched, byte-for-byte from the workflow file.
  const rewritten = scriptSource
    // A proper file:// URL is required here (not a bare filesystem path)
    // -- Node's ESM loader rejects a raw "C:/..." import specifier on
    // Windows as an unsupported URL scheme; .href always produces a
    // correct, platform-appropriate URL string.
    .replace("./ingestion/map/publication.mjs", new URL("../ingestion/map/publication.mjs", import.meta.url).href)
    .replace("/tmp/map-data.json", artifactPath.replace(/\\/g, "/"));

  const dir = await mkdtemp(join(tmpdir(), "botm-workflow-verify-script-"));
  const scriptPath = join(dir, "verify.mjs");
  await writeFile(scriptPath, rewritten);
  try {
    const stdout = execFileSync("node", [scriptPath], { encoding: "utf8" });
    return { status: 0, stdout };
  } catch (err) {
    return { status: err.status ?? 1, stdout: err.stdout?.toString() ?? "", stderr: err.stderr?.toString() ?? "" };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test("runtime-verify script: accepts the REAL, currently-committed data/public/lisbon-porto-map.json", async () => {
  const yaml = await readWorkflow();
  const script = extractRuntimeVerifyScript(yaml);
  const realArtifactPath = join(REPO_ROOT, "data", "public", "lisbon-porto-map.json");

  const result = await runExtractedVerifyScript(script, realArtifactPath);
  assert.equal(result.status, 0, `expected success, got stderr: ${result.stderr}`);
  assert.match(result.stdout, /RUNTIME_GENERATED_AT=/);
  assert.match(result.stdout, /RUNTIME_MARKER_COUNT=\d+/);
});

test("runtime-verify script: rejects malformed JSON", async () => {
  const yaml = await readWorkflow();
  const script = extractRuntimeVerifyScript(yaml);
  await withTempDir(async (dir) => {
    const path = join(dir, "map-data.json");
    await writeFile(path, "{not valid json");
    const result = await runExtractedVerifyScript(script, path);
    assert.equal(result.status, 1);
  });
});

test("runtime-verify script: rejects a payload that fails publication schema validation", async () => {
  const yaml = await readWorkflow();
  const script = extractRuntimeVerifyScript(yaml);
  await withTempDir(async (dir) => {
    const path = join(dir, "map-data.json");
    await writeFile(path, JSON.stringify({ not: "a publication artifact" }));
    const result = await runExtractedVerifyScript(script, path);
    assert.equal(result.status, 1);
  });
});

test("runtime-verify script: rejects a structurally-valid but EMPTY (zero-marker) artifact — never treats an empty map as success", async () => {
  const yaml = await readWorkflow();
  const script = extractRuntimeVerifyScript(yaml);
  const realArtifact = JSON.parse(await readFile(join(REPO_ROOT, "data", "public", "lisbon-porto-map.json"), "utf8"));
  realArtifact.countries.Portugal.markers = [];
  realArtifact.counts.map_marker_count = 0;
  realArtifact.counts.display_listing_count = 0;

  await withTempDir(async (dir) => {
    const path = join(dir, "map-data.json");
    await writeFile(path, JSON.stringify(realArtifact));
    const result = await runExtractedVerifyScript(script, path);
    assert.equal(result.status, 1);
  });
});
