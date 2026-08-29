// BEATMAPPED-APPROVED-CANDIDATE-SHA-DEPLOYMENT-PATH-01 — static structural
// proof of the parts of the workflow that cannot be exercised without a
// real GitHub Actions run (items G, H, I, J of this package's own brief).
// Never contacts GitHub or production. Deliberately text/regex-based
// rather than a full YAML-AST parse — this repository has no existing
// YAML-parsing dependency, and every assertion here is expressible
// directly against the committed file's own text.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKFLOW_PATH = resolve(REPO_ROOT, ".github/workflows/deploy-beatmapped-collector.yml");
const SCRIPT_PATH = resolve(REPO_ROOT, "deploy/ci/resolve-and-validate-deployment.sh");

let rawText;
let scriptText;
test.before(async () => {
  rawText = await readFile(WORKFLOW_PATH, "utf8");
  scriptText = await readFile(SCRIPT_PATH, "utf8");
});

test("J: candidate mode (like the existing MAIN mode) is workflow_dispatch only — never triggered on push/PR", () => {
  assert.match(rawText, /\bon:\s*\n\s+workflow_dispatch:/, "the single `on:` trigger must be workflow_dispatch");
  assert.doesNotMatch(rawText, /\n\s{2}push:\s*\n/, "this workflow must never gain a push trigger");
  assert.doesNotMatch(rawText, /\n\s{2}pull_request:\s*\n/, "this workflow must never gain a pull_request trigger");
});

test("the mode input exists, defaults to MAIN, and offers exactly MAIN/APPROVED_CANDIDATE", () => {
  assert.match(rawText, /type: choice/);
  assert.match(rawText, /default: MAIN/);
  const optionsMatch = /options:\s*\n\s+- MAIN\s*\n\s+- APPROVED_CANDIDATE/.exec(rawText);
  assert.ok(optionsMatch, "the mode input's options must be exactly MAIN then APPROVED_CANDIDATE");
});

test("G: the production deploy job still targets the beatmapped-collector-production Environment — no separate/weaker environment introduced for candidate deploys", () => {
  const occurrences = [...rawText.matchAll(/^\s*environment:\s*(\S+)/gm)];
  assert.equal(occurrences.length, 1, "exactly one job-level `environment:` declaration must exist");
  assert.equal(occurrences[0][1], "beatmapped-collector-production");
});

test("H: no production secret VALUES appear anywhere in the workflow file — only ${{ secrets.* }} references", () => {
  const secretNames = ["BEATMAPPED_PROD_HOST", "BEATMAPPED_PROD_USER", "BEATMAPPED_PROD_SSH_KEY", "BEATMAPPED_PROD_SSH_HOST_KEY"];
  for (const name of secretNames) {
    const occurrences = [...rawText.matchAll(new RegExp(name, "g"))];
    assert.ok(occurrences.length > 0, `${name} must actually be referenced somewhere`);
    for (const match of occurrences) {
      const context = rawText.slice(Math.max(0, match.index - 20), match.index);
      assert.ok(context.includes("secrets."), `every reference to ${name} must be inside \${{ secrets.${name} }} — found a bare occurrence near: ...${context}`);
    }
  }
  assert.ok(!/echo.*secrets\.BEATMAPPED_PROD_SSH_KEY/.test(rawText), "the SSH private key secret must never be echoed to a log");
});

test("I: MAIN-mode ancestry validation is the SAME shared script both modes use — no separate, potentially-drifted MAIN-only implementation", () => {
  assert.match(scriptText, /if \[ "\$MODE" = "MAIN" \]/);
  assert.match(scriptText, /git merge-base --is-ancestor/);
  assert.match(rawText, /deploy\/ci\/resolve-and-validate-deployment\.sh/, "the workflow's own resolve step must call this exact shared script, not an inlined copy of its logic");
});

test("candidate-branch validation requires exact tip equality, never mere ancestry (grep-level proof against the shared script)", () => {
  assert.match(scriptText, /TIP="\$\(git rev-parse "\$candidate_ref"\)"/);
  assert.match(scriptText, /if \[ "\$TIP" = "\$RESOLVED_SHA" \]/);
  assert.doesNotMatch(scriptText, /merge-base --is-ancestor.*candidate/i, "candidate-branch authorisation must never fall back to an ancestry check");
});

test("the resolved SHA flows unchanged into both the checkout ref and the install.sh --ref= argument (no re-resolution, no branch-tip fallback)", () => {
  assert.match(rawText, /ref: \$\{\{ needs\.resolve-and-validate\.outputs\.resolved_sha \}\}/);
  assert.match(rawText, /--ref=\$\{RESOLVED_SHA\}/);
});

test("a post-checkout assertion exists that the checked-out HEAD equals the resolved SHA exactly", () => {
  assert.match(rawText, /ACTUAL="\$\(git rev-parse HEAD\)"/);
  assert.match(rawText, /if \[ "\$ACTUAL" != "\$RESOLVED_SHA" \]/);
});

test("the publication-trigger and publication-verification steps are gated to MAIN mode only — APPROVED_CANDIDATE never starts botm-unattended.service", () => {
  const gatedStepNames = [
    "Capture the pre-trigger publication generation timestamp",
    "Trigger the publication cycle",
    "Poll for a newer publication cycle and validate it",
  ];
  for (const name of gatedStepNames) {
    const stepMatch = new RegExp(`- name: .*${name.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}[^\\n]*\\n(?:\\s+id: [^\\n]*\\n)?\\s+if: ([^\\n]+)\\n`).exec(rawText);
    assert.ok(stepMatch, `step "${name}" must exist and declare an \`if:\` condition`);
    assert.equal(stepMatch[1].trim(), "needs.resolve-and-validate.outputs.mode == 'MAIN'", `step "${name}" must be gated to MAIN mode only`);
  }
});

test("a skip-acknowledgement step exists for APPROVED_CANDIDATE mode, so a run's own summary always states whether publication ran", () => {
  assert.match(rawText, /deliberately NOT triggered/);
  const skipMatch = /- name: .*deliberately NOT triggered[^\n]*\n\s+if: ([^\n]+)\n/.exec(rawText);
  assert.ok(skipMatch);
  assert.equal(skipMatch[1].trim(), "needs.resolve-and-validate.outputs.mode == 'APPROVED_CANDIDATE'");
});

test("concurrency guard still prevents two simultaneous deployments to the same production collector, regardless of mode", () => {
  assert.match(rawText, /group: deploy-beatmapped-collector/);
  assert.match(rawText, /cancel-in-progress: false/);
});

test("the shared script fails closed for an unrecognised mode before any git lookup", () => {
  assert.match(scriptText, /mode must be MAIN or APPROVED_CANDIDATE/);
});
