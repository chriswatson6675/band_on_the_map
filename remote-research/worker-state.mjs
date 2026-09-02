import { readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import { resolve } from "node:path";
import { buildTemporaryRoot, sanitizeText } from "./contract.mjs";

const EXPECTED_MARKER = {
  schema_version: "BEATMAPPED-RESEARCH-WORKER-v1",
  worker_name: "beatmapped-research-worker-01",
  role: "read-only-research",
};

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function capture(markerPath, productionPath, researchRoot) {
  let marker = null;
  try { marker = JSON.parse(await readFile(markerPath, "utf8")); } catch {}
  const root = resolve(researchRoot);
  const token = root.split("/").at(-1);
  const rootStat = await stat(root);
  const snapshot = {
    schema_version: "BEATMAPPED-RESEARCH-WORKER-ISOLATION-v1",
    captured_at: new Date().toISOString(),
    marker,
    hostname: sanitizeText(os.hostname()),
    identity: os.userInfo().username,
    production_path: resolve(productionPath),
    production_path_present: await exists(productionPath),
    research_root: root,
    research_root_owner_uid: rootStat.uid,
    research_root_mode: rootStat.mode & 0o777,
    expected_root: buildTemporaryRoot(token),
  };
  snapshot.isolated = JSON.stringify(marker) === JSON.stringify(EXPECTED_MARKER)
    && snapshot.identity === "botm-research"
    && snapshot.production_path_present === false
    && snapshot.research_root === snapshot.expected_root
    && snapshot.research_root_owner_uid === process.getuid()
    && snapshot.research_root_mode === 0o700;
  return snapshot;
}

const [action, first, second, third, fourth] = process.argv.slice(2);
if (action === "capture") {
  if (!first || !second || !third || !fourth) throw new Error("usage: worker-state.mjs capture <marker> <production-path> <research-root> <output.json>");
  const snapshot = await capture(first, second, third);
  await writeFile(fourth, `${JSON.stringify(snapshot, null, 2)}\n`, "utf8");
  if (!snapshot.isolated) process.exitCode = 1;
} else if (action === "compare") {
  if (!first || !second) throw new Error("usage: worker-state.mjs compare <before.json> <after.json>");
  const before = JSON.parse(await readFile(first, "utf8"));
  const after = JSON.parse(await readFile(second, "utf8"));
  const stable = ["marker", "hostname", "identity", "production_path", "production_path_present", "research_root", "research_root_owner_uid", "research_root_mode", "expected_root", "isolated"];
  const differences = stable.filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]));
  const result = { unchanged: before.isolated === true && after.isolated === true && differences.length === 0, differences, production_host_addressed: false };
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.unchanged) process.exitCode = 1;
} else {
  throw new Error("worker-state action must be capture or compare");
}
