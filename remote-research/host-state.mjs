import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { compareProductionBaselines, hashStableStrings, sanitizeText } from "./contract.mjs";

function command(file, args = [], cwd) {
  try {
    const result = spawnSync(file, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 15_000 });
    const stdout = result.stdout?.trim();
    if (stdout) return sanitizeText(stdout);
    return result.status === 0 ? "" : `UNAVAILABLE:${sanitizeText(result.status ?? result.error?.message ?? "unknown")}`;
  } catch (error) { return `UNAVAILABLE:${sanitizeText(error?.message ?? "unknown")}`; }
}

async function sha256File(path) {
  try { return createHash("sha256").update(await readFile(path)).digest("hex"); }
  catch { return null; }
}

async function treeHash(root, relativeDirectories) {
  const entries = [];
  async function walk(relative) {
    const absolute = join(root, relative);
    let children;
    try { children = await readdir(absolute, { withFileTypes: true }); } catch { return; }
    for (const child of children.sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(relative, child.name);
      if (child.isDirectory()) await walk(path);
      else if (child.isFile() && /\.json$/i.test(child.name)) entries.push(`${path.replaceAll("\\", "/")}:${await sha256File(join(root, path))}`);
    }
  }
  for (const directory of relativeDirectories) await walk(directory);
  return hashStableStrings(entries);
}

export async function captureProductionState(productionPath) {
  const root = resolve(productionPath);
  const publicationPath = join(root, "data/public/lisbon-porto-map.json");
  let publicationStat = null;
  try { const value = await stat(publicationPath); publicationStat = { mtime_ms: value.mtimeMs, size: value.size }; } catch {}
  const services = {};
  for (const unit of ["botm-unattended.service", "botm-unattended.timer", "botm-publication.service"]) {
    services[unit] = {
      active: command("systemctl", ["is-active", unit]),
      enabled: command("systemctl", ["is-enabled", unit]),
    };
  }
  return {
    schema_version: "BEATMAPPED-PRODUCTION-BASELINE-v1",
    captured_at: new Date().toISOString(),
    production_path: root,
    head: command("git", ["-c", `safe.directory=${root}`, "rev-parse", "HEAD"], root),
    git_status: command("git", ["-c", `safe.directory=${root}`, "status", "--porcelain=v1", "--untracked-files=all"], root),
    services,
    publication: { path: publicationPath, sha256: await sha256File(publicationPath), ...publicationStat },
    registry_tree_sha256: await treeHash(root, ["sources", "venues"]),
  };
}

const [action, first, second] = process.argv.slice(2);
if (action === "capture") {
  if (!first || !second) throw new Error("usage: host-state.mjs capture <production-path> <output.json>");
  await writeFile(second, `${JSON.stringify(await captureProductionState(first), null, 2)}\n`, "utf8");
} else if (action === "compare") {
  if (!first || !second) throw new Error("usage: host-state.mjs compare <before.json> <after.json>");
  const before = JSON.parse(await readFile(first, "utf8"));
  const after = JSON.parse(await readFile(second, "utf8"));
  const result = compareProductionBaselines(before, after);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.unchanged) process.exitCode = 1;
} else {
  throw new Error("host-state action must be capture or compare");
}
