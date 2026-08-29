// BEATMAPPED-APPROVED-CANDIDATE-SHA-DEPLOYMENT-PATH-01 — proves the exact
// SHA-resolution/authorisation logic
// .github/workflows/deploy-beatmapped-collector.yml's "resolve-and-validate"
// job runs, against a REAL local git repository (never GitHub Actions,
// never production). deploy/ci/resolve-and-validate-deployment.sh is the
// SAME script the real workflow calls — these tests exercise that exact
// file, not a reimplementation of its logic.
//
// BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01 added a third
// positional argument, post_deploy_action (NORMAL_PUBLICATION |
// DEPLOY_ONLY), and a fail-closed rule enforced BEFORE any git lookup:
// only MODE=MAIN+NORMAL_PUBLICATION and MODE=APPROVED_CANDIDATE+DEPLOY_ONLY
// are ever valid combinations. Every pre-existing test below now passes
// the one combination that was always implicitly true for it; new tests
// cover the two invalid combinations and the invalid-value case.

import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_PATH = resolve(REPO_ROOT, "deploy/ci/resolve-and-validate-deployment.sh");

async function git(cwd, args) {
  const { stdout } = await execFileAsync("git", args, { cwd });
  return stdout.trim();
}

async function runScript(cwd, mode, ref, postDeployAction) {
  try {
    const { stdout } = await execFileAsync("bash", [SCRIPT_PATH, mode, ref, postDeployAction], { cwd });
    const match = /RESOLVED_SHA=([0-9a-f]{40})/.exec(stdout);
    return { ok: true, resolvedSha: match?.[1] ?? null };
  } catch (error) {
    return { ok: false, stderr: error.stderr ?? "", code: error.code };
  }
}

/**
 * Builds a fixture repo shaped like the real deployment scenario:
 *
 *   main:  m1 -- m2                 (origin/main)
 *   feature: m1 -- f1                (an arbitrary, unrelated feature branch — no origin/* ref at all, simulating a branch never pushed under candidate/deploy/)
 *   candidate/deploy/test-01: m1 -- c1 -- c2  (origin/candidate/deploy/test-01, tip = c2)
 *
 * Returns the sha of every named commit plus the repo path.
 */
async function buildFixtureRepo() {
  const dir = await mkdtemp(join(tmpdir(), "deploy-workflow-auth-test-"));
  await git(dir, ["init", "--initial-branch=main", "-q"]);
  await git(dir, ["config", "user.email", "test@example.com"]);
  await git(dir, ["config", "user.name", "Test"]);

  await git(dir, ["commit", "--allow-empty", "-m", "m1", "-q"]);
  const m1 = await git(dir, ["rev-parse", "HEAD"]);
  await git(dir, ["commit", "--allow-empty", "-m", "m2", "-q"]);
  const m2 = await git(dir, ["rev-parse", "HEAD"]);

  await git(dir, ["checkout", "-q", "-b", "feature", m1]);
  await git(dir, ["commit", "--allow-empty", "-m", "f1", "-q"]);
  const f1 = await git(dir, ["rev-parse", "HEAD"]);

  await git(dir, ["checkout", "-q", "-b", "candidate/deploy/test-01", m1]);
  await git(dir, ["commit", "--allow-empty", "-m", "c1", "-q"]);
  const c1 = await git(dir, ["rev-parse", "HEAD"]);
  await git(dir, ["commit", "--allow-empty", "-m", "c2", "-q"]);
  const c2 = await git(dir, ["rev-parse", "HEAD"]);

  await git(dir, ["checkout", "-q", "main"]);

  // Simulate exactly what the workflow's own fetch steps populate:
  // refs/remotes/origin/main and refs/remotes/origin/candidate/deploy/*
  // — never a second, parallel remote clone.
  await git(dir, ["update-ref", "refs/remotes/origin/main", m2]);
  await git(dir, ["update-ref", "refs/remotes/origin/candidate/deploy/test-01", c2]);

  return { dir, m1, m2, f1, c1, c2 };
}

let fixture;
test.before(async () => {
  fixture = await buildFixtureRepo();
});
test.after(async () => {
  if (fixture) await rm(fixture.dir, { recursive: true, force: true });
});

test("A: an existing main SHA is accepted in MAIN mode", async () => {
  const result = await runScript(fixture.dir, "MAIN", fixture.m2, "NORMAL_PUBLICATION");
  assert.equal(result.ok, true);
  assert.equal(result.resolvedSha, fixture.m2);
});

test("A2: an ancestor of main (not just its tip) is also accepted in MAIN mode — matches unchanged pre-existing behaviour", async () => {
  const result = await runScript(fixture.dir, "MAIN", fixture.m1, "NORMAL_PUBLICATION");
  assert.equal(result.ok, true);
  assert.equal(result.resolvedSha, fixture.m1);
});

test("A3: MAIN mode still accepts a short/abbreviated SHA — normal deployment behaviour is not weakened", async () => {
  const short = fixture.m2.slice(0, 10);
  const result = await runScript(fixture.dir, "MAIN", short, "NORMAL_PUBLICATION");
  assert.equal(result.ok, true);
  assert.equal(result.resolvedSha, fixture.m2);
});

test("B: a non-main SHA (an unrelated feature branch commit) is rejected in MAIN mode", async () => {
  const result = await runScript(fixture.dir, "MAIN", fixture.f1, "NORMAL_PUBLICATION");
  assert.equal(result.ok, false);
  assert.match(result.stderr, /NOT reachable from origin\/main/);
});

test("C: the exact tip of an authorised candidate/deploy/* branch is accepted in APPROVED_CANDIDATE + DEPLOY_ONLY", async () => {
  const result = await runScript(fixture.dir, "APPROVED_CANDIDATE", fixture.c2, "DEPLOY_ONLY");
  assert.equal(result.ok, true);
  assert.equal(result.resolvedSha, fixture.c2);
});

test("D: an arbitrary feature-branch SHA is rejected in APPROVED_CANDIDATE mode", async () => {
  const result = await runScript(fixture.dir, "APPROVED_CANDIDATE", fixture.f1, "DEPLOY_ONLY");
  assert.equal(result.ok, false);
  assert.match(result.stderr, /not the exact current tip of any/);
});

test("D2: a commit that is merely an ANCESTOR of a candidate branch (superseded, no longer its tip) is rejected — tip equality, not mere reachability", async () => {
  // c1 is reachable from candidate/deploy/test-01 (whose tip is c2), but
  // is not itself the tip — this must NOT be treated as authorised, per
  // this package's own deliberate "no accumulated history" design.
  const result = await runScript(fixture.dir, "APPROVED_CANDIDATE", fixture.c1, "DEPLOY_ONLY");
  assert.equal(result.ok, false);
  assert.match(result.stderr, /not the exact current tip of any/);
});

test("D3: even a main SHA is rejected in APPROVED_CANDIDATE mode unless it is also a candidate branch's exact tip", async () => {
  const result = await runScript(fixture.dir, "APPROVED_CANDIDATE", fixture.m2, "DEPLOY_ONLY");
  assert.equal(result.ok, false);
});

test("E: a nonexistent (well-formed but unknown) SHA is rejected in both modes", async () => {
  const fakeSha = "f".repeat(40);
  const mainResult = await runScript(fixture.dir, "MAIN", fakeSha, "NORMAL_PUBLICATION");
  assert.equal(mainResult.ok, false);
  assert.match(mainResult.stderr, /does not resolve to any commit/);

  const candidateResult = await runScript(fixture.dir, "APPROVED_CANDIDATE", fakeSha, "DEPLOY_ONLY");
  assert.equal(candidateResult.ok, false);
});

test("APPROVED_CANDIDATE mode rejects a short/abbreviated SHA even if it would otherwise resolve correctly — full 40-char identity only", async () => {
  const short = fixture.c2.slice(0, 10);
  const result = await runScript(fixture.dir, "APPROVED_CANDIDATE", short, "DEPLOY_ONLY");
  assert.equal(result.ok, false);
  assert.match(result.stderr, /exact full 40-character commit SHA/);
});

test("a malformed mode argument is rejected before any git lookup", async () => {
  const result = await runScript(fixture.dir, "SOMETHING_ELSE", fixture.m2, "NORMAL_PUBLICATION");
  assert.equal(result.ok, false);
  assert.match(result.stderr, /mode must be MAIN or APPROVED_CANDIDATE/);
});

test("F: the resolved SHA is always the full 40-character form, never abbreviated, regardless of what was requested", async () => {
  const short = fixture.m2.slice(0, 8);
  const result = await runScript(fixture.dir, "MAIN", short, "NORMAL_PUBLICATION");
  assert.equal(result.resolvedSha.length, 40);
  assert.equal(result.resolvedSha, fixture.m2);
});

// --- BEATMAPPED-APPROVED-CANDIDATE-DEPLOY-ONLY-MODE-01: post_deploy_action ---

test("H1: an unrecognised post_deploy_action value is rejected before any git lookup", async () => {
  const result = await runScript(fixture.dir, "MAIN", fixture.m2, "SOMETHING_ELSE");
  assert.equal(result.ok, false);
  assert.match(result.stderr, /post_deploy_action must be NORMAL_PUBLICATION or DEPLOY_ONLY/);
});

test("H2: MAIN mode + DEPLOY_ONLY is rejected fail-closed, even for an otherwise-valid main SHA — MAIN never silently skips normal deployment behaviour", async () => {
  const result = await runScript(fixture.dir, "MAIN", fixture.m2, "DEPLOY_ONLY");
  assert.equal(result.ok, false);
  assert.match(result.stderr, /MAIN mode always performs normal deployment behaviour/);
});

test("H3: APPROVED_CANDIDATE mode + NORMAL_PUBLICATION is rejected fail-closed, even for an otherwise-valid candidate tip — an unmerged commit is never eligible for normal publication", async () => {
  const result = await runScript(fixture.dir, "APPROVED_CANDIDATE", fixture.c2, "NORMAL_PUBLICATION");
  assert.equal(result.ok, false);
  assert.match(result.stderr, /APPROVED_CANDIDATE mode never triggers acquisition\/publication/);
});

test("H4: an invalid mode/post_deploy_action combination is rejected BEFORE the requested ref is even resolved — a nonexistent SHA still fails on the combination reason, not a resolution reason", async () => {
  const fakeSha = "f".repeat(40);
  const result = await runScript(fixture.dir, "MAIN", fakeSha, "DEPLOY_ONLY");
  assert.equal(result.ok, false);
  assert.match(result.stderr, /MAIN mode always performs normal deployment behaviour/);
  assert.doesNotMatch(result.stderr, /does not resolve to any commit/, "the combination check must fail before any git lookup is attempted");
});
