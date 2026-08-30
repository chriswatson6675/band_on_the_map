// BEATMAPPED-UNATTENDED-CITY-WORKER-FOUNDATION-01 — best-effort runner/
// candidate SHA provenance, so a job record and a health snapshot can
// always answer "what code produced this". Never fatal: an environment
// without git available (or not a checkout at all) yields `null`, never
// a thrown error.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function resolveRunnerVersionSha({ root, env = process.env } = {}) {
  if (env.BEATMAPPED_RUNNER_SHA) return env.BEATMAPPED_RUNNER_SHA;
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
    return stdout.trim() || null;
  } catch {
    return null;
  }
}
