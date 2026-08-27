import { execFileSync } from "node:child_process";
import { access, readFile } from "node:fs/promises";
import { constants } from "node:fs";
import os from "node:os";
import { classifyBrowserRuntime, sanitizeText } from "./contract.mjs";

function command(file, args = []) {
  try { return execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 10_000 }).trim(); }
  catch { return ""; }
}

function disk(path) {
  const fields = command("df", ["-Pk", path]).split(/\r?\n/).at(-1)?.trim().split(/\s+/) ?? [];
  return { path, available_mb: fields.length >= 4 ? Math.floor(Number(fields[3]) / 1024) : null };
}

async function findChromium() {
  for (const name of ["chromium", "chromium-browser", "google-chrome", "google-chrome-stable"]) {
    const executable = command("sh", ["-c", `command -v ${name}`]);
    if (!executable) continue;
    const resolvedExecutable = command("readlink", ["-f", executable]) || executable;
    const version = command(executable, ["--version"]);
    const ldd = command("ldd", [resolvedExecutable]);
    const missing = ldd.split(/\r?\n/).filter((line) => /not found/i.test(line)).map((line) => sanitizeText(line.trim()));
    return { executable_path: executable, resolved_executable_path: resolvedExecutable, version, missing_libraries: missing };
  }
  return { executable_path: null, version: null, missing_libraries: [] };
}

let osRelease = "";
try { osRelease = await readFile("/etc/os-release", "utf8"); } catch {}
const productionPath = process.argv[2] ?? "/opt/band-on-the-map";
let productionPathWritable = true;
try { await access(productionPath, constants.W_OK); } catch { productionPathWritable = false; }
const audit = {
  schema_version: "BEATMAPPED-REMOTE-RUNTIME-AUDIT-v1",
  captured_at: new Date().toISOString(),
  os_release: Object.fromEntries(osRelease.split(/\r?\n/).filter((line) => /^[A-Z_]+=/.test(line)).map((line) => { const i = line.indexOf("="); return [line.slice(0, i).toLowerCase(), line.slice(i + 1).replace(/^"|"$/g, "")]; })),
  architecture: os.arch(),
  kernel: os.release(),
  node_version: process.version,
  memory: { total_mb: Math.floor(os.totalmem() / 1048576), available_mb: Math.floor(os.freemem() / 1048576) },
  load_average: os.loadavg(),
  root_disk: disk("/"),
  temporary_disk: disk("/tmp"),
  chromium: await findChromium(),
  process_observation: sanitizeText(command("sh", ["-c", "ps -eo comm= | sort | uniq -c | sort -nr | head -20"])),
  production_path: productionPath,
  production_path_writable: productionPathWritable,
};
audit.classification = classifyBrowserRuntime(audit);
process.stdout.write(`${JSON.stringify(audit, null, 2)}\n`);
