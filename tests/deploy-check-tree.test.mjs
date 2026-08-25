// BOTM-COLLECTOR-DEPLOY-HARDENING-01 — behavioural proof for
// deploy/check-deploy-tree.sh: the one, small, named, auditable mechanism
// that lets a pinned-SHA deployment tolerate EXACTLY the known,
// deterministic, collector-regenerated runtime publication artifact
// (data/public/lisbon-porto-map.json) while still failing closed for
// every other kind of dirty/staged/untracked working-tree state.
//
// This genuinely EXECUTES the real deploy/check-deploy-tree.sh (via a
// real `bash` subprocess) against real, isolated, throwaway git
// repositories under an isolated tmpdir — never the real repository,
// never a live server. Content-level regex assertions belong in
// tests/digitalocean-deployment.test.mjs; this suite proves the actual
// pass/fail *behaviour* the coordinator's brief requires.

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const SCRIPT_PATH = fileURLToPath(new URL("../deploy/check-deploy-tree.sh", import.meta.url));
const GENERATED_ARTIFACT_PATH = "data/public/lisbon-porto-map.json";

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8" });
}

async function makeFixtureRepo() {
  const dir = await mkdtemp(join(tmpdir(), "botm-deploy-check-tree-test-"));
  git(dir, "init", "--quiet");
  git(dir, "config", "user.email", "test@example.invalid");
  git(dir, "config", "user.name", "Deploy Hardening Test");

  await mkdir(join(dir, "data", "public"), { recursive: true });
  await mkdir(join(dir, "app"), { recursive: true });
  await writeFile(join(dir, "data", "public", "lisbon-porto-map.json"), JSON.stringify({ generated_at: "2026-01-01T00:00:00.000Z", counts: { map_marker_count: 1 } }));
  await writeFile(join(dir, "app", "page.tsx"), "export default function Page() { return null; }\n");
  git(dir, "add", "-A");
  git(dir, "commit", "--quiet", "-m", "initial fixture commit");

  return dir;
}

function runCheckDeployTree(dir) {
  try {
    const stdout = execFileSync("bash", [SCRIPT_PATH, dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { status: 0, stdout, stderr: "" };
  } catch (err) {
    return { status: err.status, stdout: err.stdout?.toString() ?? "", stderr: err.stderr?.toString() ?? "" };
  }
}

function porcelainStatus(dir) {
  // NOTE: deliberately NOT .trim() — the leading character of each
  // porcelain line is meaningful (a literal space means "not staged"),
  // and .trim() would silently eat it, exactly the class of test-harness
  // bug that would falsely hide XY-column classification mistakes here.
  return git(dir, "status", "--porcelain=v1").replace(/\r?\n+$/, "");
}

async function withFixtureRepo(fn) {
  const dir = await makeFixtureRepo();
  try {
    await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// --- 1. clean checkout -> deployment allowed ---

test("clean working tree: exits 0, changes nothing, no stash created", async () => {
  await withFixtureRepo(async (dir) => {
    const before = porcelainStatus(dir);
    assert.equal(before, "");

    const result = runCheckDeployTree(dir);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /clean/i);

    assert.equal(porcelainStatus(dir), "");
    assert.equal(git(dir, "stash", "list").trim(), "");
  });
});

// --- 2. only the generated artifact modified -> allowed via the explicit path ---

test("only the generated artifact modified: exits 0, discards ONLY that file, logs it explicitly", async () => {
  await withFixtureRepo(async (dir) => {
    await writeFile(join(dir, GENERATED_ARTIFACT_PATH), JSON.stringify({ generated_at: "2026-08-25T21:10:43.503Z", counts: { map_marker_count: 12 } }));
    assert.equal(porcelainStatus(dir), ` M ${GENERATED_ARTIFACT_PATH}`);

    const result = runCheckDeployTree(dir);
    assert.equal(result.status, 0, `expected success, got stderr: ${result.stderr}`);
    assert.match(result.stdout, /expected runtime-generated publication artifact/i);
    assert.match(result.stdout, new RegExp(GENERATED_ARTIFACT_PATH.replace(/[/.]/g, "\\$&")));
    assert.match(result.stdout, /Discarded local modification/i);

    // the ONE file was discarded back to the committed version — tree is clean again
    assert.equal(porcelainStatus(dir), "");
  });
});

// --- 6 (checked alongside #2): does not create accumulating Git stashes ---

test("handling the generated artifact never creates a Git stash", async () => {
  await withFixtureRepo(async (dir) => {
    await writeFile(join(dir, GENERATED_ARTIFACT_PATH), JSON.stringify({ generated_at: "2026-08-25T21:10:43.503Z" }));
    const result = runCheckDeployTree(dir);
    assert.equal(result.status, 0);
    assert.equal(git(dir, "stash", "list").trim(), "", "no stash should ever be created by this script");
  });
});

// --- 3. generated artifact + source-code modification -> REFUSED ---

test("generated artifact modified AND a source file modified: exits 1, discards NOTHING", async () => {
  await withFixtureRepo(async (dir) => {
    await writeFile(join(dir, GENERATED_ARTIFACT_PATH), JSON.stringify({ generated_at: "2026-08-25T21:10:43.503Z" }));
    await writeFile(join(dir, "app", "page.tsx"), "export default function Page() { return 'unexpected opportunistic edit'; }\n");
    const before = porcelainStatus(dir);

    const result = runCheckDeployTree(dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /UNEXPECTED working-tree change/i);
    assert.match(result.stderr, /app\/page\.tsx/);

    // nothing was touched — both files remain exactly as they were
    assert.equal(porcelainStatus(dir), before);
  });
});

// --- 4. source-code modification alone -> REFUSED ---

test("only a source file modified (artifact untouched): exits 1, discards nothing", async () => {
  await withFixtureRepo(async (dir) => {
    await writeFile(join(dir, "app", "page.tsx"), "export default function Page() { return 'unexpected opportunistic edit'; }\n");
    const before = porcelainStatus(dir);

    const result = runCheckDeployTree(dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /UNEXPECTED working-tree change/i);

    assert.equal(porcelainStatus(dir), before);
  });
});

// --- 5. staged source/config change -> REFUSED ---

test("a staged change (even to the generated artifact itself) is refused, never silently accepted", async () => {
  await withFixtureRepo(async (dir) => {
    await writeFile(join(dir, GENERATED_ARTIFACT_PATH), JSON.stringify({ generated_at: "2026-08-25T21:10:43.503Z" }));
    git(dir, "add", GENERATED_ARTIFACT_PATH); // stage it — no longer a plain unstaged " M"
    const before = porcelainStatus(dir);
    assert.equal(before, `M  ${GENERATED_ARTIFACT_PATH}`);

    const result = runCheckDeployTree(dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /UNEXPECTED working-tree change/i);

    assert.equal(porcelainStatus(dir), before, "staged state must be left completely untouched");
  });
});

test("a staged config/source change is refused", async () => {
  await withFixtureRepo(async (dir) => {
    await writeFile(join(dir, "app", "page.tsx"), "export default function Page() { return 'staged edit'; }\n");
    git(dir, "add", "app/page.tsx");
    const before = porcelainStatus(dir);

    const result = runCheckDeployTree(dir);
    assert.equal(result.status, 1);
    assert.equal(porcelainStatus(dir), before);
  });
});

// --- an unexpected untracked file is also refused ---

test("an unexpected untracked file is refused, even alongside a harmless artifact modification", async () => {
  await withFixtureRepo(async (dir) => {
    await writeFile(join(dir, GENERATED_ARTIFACT_PATH), JSON.stringify({ generated_at: "2026-08-25T21:10:43.503Z" }));
    await writeFile(join(dir, "app", "unexpected-new-file.ts"), "// should never be silently tolerated\n");
    const before = porcelainStatus(dir);

    const result = runCheckDeployTree(dir);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /UNEXPECTED working-tree change/i);
    assert.equal(porcelainStatus(dir), before);
  });
});

// --- a deletion of the generated artifact itself is refused, not silently tolerated ---

test("the generated artifact being DELETED (not modified) is refused, not treated as the tolerated case", async () => {
  await withFixtureRepo(async (dir) => {
    await rm(join(dir, GENERATED_ARTIFACT_PATH));
    const before = porcelainStatus(dir);
    assert.equal(before, ` D ${GENERATED_ARTIFACT_PATH}`);

    const result = runCheckDeployTree(dir);
    assert.equal(result.status, 1);
    assert.equal(porcelainStatus(dir), before);
  });
});

test("script requires an app-dir argument", () => {
  const result = runCheckDeployTree("");
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Usage: check-deploy-tree\.sh/);
});
