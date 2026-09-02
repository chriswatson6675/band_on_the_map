import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";

const WORKFLOW = fileURLToPath(new URL("../.github/workflows/run-beatmapped-research-proof.yml", import.meta.url));
const REMOTE_RUN = fileURLToPath(new URL("../remote-research/remote-run.sh", import.meta.url));
const CLEANUP = fileURLToPath(new URL("../remote-research/remote-cleanup.sh", import.meta.url));
const read = async (path) => (await readFile(path, "utf8")).replace(/\r\n/g, "\n");
const executable = (source) => source.split("\n").filter((line) => !line.trim().startsWith("#")).join("\n");

test("research workflow is manual-only with a full SHA input and enumerated job choice", async () => {
  const yaml = await read(WORKFLOW);
  assert.match(yaml, /^name: Run BeatMapped Research Proof$/m);
  const onBlock = /^on:\n([\s\S]*?)^permissions:/m.exec(yaml)?.[1] ?? "";
  assert.match(onBlock, /^  workflow_dispatch:/m);
  assert.doesNotMatch(onBlock, /^  (?:push|pull_request|schedule|repository_dispatch):/m);
  assert.match(onBlock, /candidate_sha:[\s\S]*?required: true/);
  assert.match(onBlock, /research_job:[\s\S]*?type: choice[\s\S]*?- berlin-browser-proof/);
  assert.doesNotMatch(onBlock, /^\s+(?:command|script|shell):/m);
  assert.match(yaml, /git for-each-ref --format='\%\(refname\)' --contains "\$CANDIDATE_SHA" refs\/remotes\/origin/);
});

test("workflow targets only the protected dedicated research worker", async () => {
  const yaml = await read(WORKFLOW);
  assert.match(yaml, /runs-on: \[self-hosted, linux, x64, beatmapped-research-worker\]/);
  assert.match(yaml, /environment: beatmapped-research-worker/);
  const secrets = [...yaml.matchAll(/secrets\.(BEATMAPPED_[A-Z0-9_]+)/g)].map((match) => match[1]);
  assert.deepEqual(secrets, []);
  assert.doesNotMatch(executable(yaml), /\b(?:ssh|scp|ssh-keyscan)\b/i);
  assert.match(yaml, /persist-credentials: false/);
  assert.match(yaml, /ref: \$\{\{ needs\.validate-request\.outputs\.controller_sha \}\}/);
});

test("workflow never invokes deployment, publication, activation, scheduler or service mutation", async () => {
  const source = executable(`${await read(WORKFLOW)}\n${await read(REMOTE_RUN)}`);
  assert.doesNotMatch(source, /deploy\/install\.sh|npm run (?:unattended|publish:map-data)|systemctl (?:start|restart|stop|enable|disable)|git -C [^\n]*\/opt\/band-on-the-map[^\n]*(?:checkout|reset|pull|fetch)|activate/i);
  assert.doesNotMatch(source, /ssh[^\n]*\$\{\{\s*inputs\./, "workflow inputs must never become the remote command itself");
});

test("candidate checkout and output stay under the isolated run root", async () => {
  const script = await read(REMOTE_RUN);
  assert.match(script, /CHECKOUT_ROOT="\$\{RESEARCH_ROOT\}\/candidate"/);
  assert.match(script, /ARTIFACT_ROOT="\$\{RESEARCH_ROOT\}\/artifacts"/);
  assert.match(script, /git clone --filter=blob:none --no-checkout/);
  assert.match(script, /checkout --detach "\$\{CANDIDATE_SHA\}"/);
  assert.match(script, /npm ci --omit=dev --ignore-scripts/);
  assert.doesNotMatch(script, /cd "?\$\{?PRODUCTION_PATH/);
});

test("cleanup targets only the exact run-owned session and never uses broad pkill", async () => {
  const script = executable(await read(CLEANUP));
  assert.doesNotMatch(script, /pkill|killall/);
  assert.match(script, /\[\[ ! "\$\{RUN_TOKEN\}" =~ \^gh-\[1-9\]\[0-9\]\*-\[1-9\]\[0-9\]\*\$ \]\]/);
  assert.match(script, /SESSION_ID.*PROOF_PID/);
  assert.match(script, /COMMAND.*RESEARCH_ROOT/);
  assert.match(script, /kill -TERM -- "-\$\{PROOF_PID\}"/);
  assert.match(script, /rm -rf -- "\$\{RESEARCH_ROOT\}"/);
});

test("workflow always retrieves, audits, uploads and cleans up artifacts", async () => {
  const yaml = await read(WORKFLOW);
  assert.match(yaml, /Retrieve bounded sanitized research artifacts[\s\S]*?if: always\(\)/);
  assert.match(yaml, /sanitize-artifacts\.mjs research-artifacts/);
  assert.match(yaml, /actions\/upload-artifact@v4/);
  assert.match(yaml, /Remove only this workflow-owned process tree[\s\S]*?if: always\(\)/);
  assert.match(yaml, /worker_isolation!=='PASS'/);
  assert.match(yaml, /artifact_sanitization!=='PASS'/);
});

test("worker execution proves the stable marker and production checkout absence", async () => {
  const script = await read(REMOTE_RUN);
  const workerState = await read(fileURLToPath(new URL("../remote-research/worker-state.mjs", import.meta.url)));
  assert.match(script, /WORKER_MARKER="\/etc\/beatmapped-research-worker\.json"/);
  assert.match(workerState, /BEATMAPPED-RESEARCH-WORKER-v1/);
  assert.match(workerState, /identity === "botm-research"/);
  assert.match(workerState, /production_path_present === false/);
  assert.match(workerState, /production_host_addressed: false/);
});
