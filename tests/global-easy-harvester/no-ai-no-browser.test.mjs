// BEATMAPPED-GLOBAL-EASY-VENUE-HARVESTER-01 — a static regression guard:
// no module under ingestion/global-easy-harvester/ may import an LLM
// resolver or browser-automation module. This is checked at the import
// level (source text), not just by behavioural test coverage, so a future
// edit that adds such an import fails immediately and explicitly rather
// than only showing up as an unexplained slow/flaky test later.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const HARVESTER_DIR = resolve(ROOT, "ingestion/global-easy-harvester");

const FORBIDDEN_IMPORT_PATTERNS = [
  /ai-onboarding/i,
  /playwright/i,
  /browser-resolution\/playwright-session/i,
  /anthropic/i,
  /openai/i,
  /\bhaiku\b/i,
  /\bsonnet\b/i,
];

async function listMjsFilesRecursive(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await listMjsFilesRecursive(full)));
    else if (entry.name.endsWith(".mjs")) files.push(full);
  }
  return files;
}

test("no module under ingestion/global-easy-harvester/ imports an AI/LLM or browser-automation module", async () => {
  const files = await listMjsFilesRecursive(HARVESTER_DIR);
  assert.ok(files.length > 0, "sanity: the harvester directory must contain at least one module");

  const offenders = [];
  for (const file of files) {
    const text = await readFile(file, "utf8");
    const importLines = text.split("\n").filter((line) => /^\s*import\b/.test(line));
    for (const line of importLines) {
      for (const pattern of FORBIDDEN_IMPORT_PATTERNS) {
        if (pattern.test(line)) offenders.push(`${file}: ${line.trim()}`);
      }
    }
  }

  assert.deepEqual(offenders, [], `Tier-1 harvester code must never import an AI/LLM or browser-automation module:\n${offenders.join("\n")}`);
});
