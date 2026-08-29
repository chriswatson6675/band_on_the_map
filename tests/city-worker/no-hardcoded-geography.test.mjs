// Proves item J: the worker contains no London/Berlin (or any other
// specific city/hostname) logic anywhere in its own source tree. This is
// a literal source scan, not a behavioural test — the whole point of
// this package is that ingestion/city-worker/ never needs to know what
// city it is running.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const CITY_WORKER_DIR = resolve(REPO_ROOT, "ingestion/city-worker");

// Deliberately broad — any of this project's own known city/area names,
// case-insensitive, anywhere in the module tree's source text (comments
// included — a "for London" comment would be just as much a violation of
// geography-neutrality as a hardcoded conditional).
const FORBIDDEN_TERMS = [
  "london",
  "berlin",
  "lisbon",
  "porto",
  "barcelona",
  "manchester",
  "liverpool",
  "paris",
  "hackney",
  "shoreditch",
];

async function collectSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectSourceFiles(full)));
    } else if (entry.name.endsWith(".mjs")) {
      files.push(full);
    }
  }
  return files;
}

test("J: no London/Berlin/other-city hostname or name logic anywhere in ingestion/city-worker/", async () => {
  const files = await collectSourceFiles(CITY_WORKER_DIR);
  assert.ok(files.length > 0, "sanity check: the module tree must actually be found");

  for (const file of files) {
    const contents = (await readFile(file, "utf8")).toLowerCase();
    for (const term of FORBIDDEN_TERMS) {
      assert.ok(!contents.includes(term), `${file} must not reference "${term}" — collectors remain geography-neutral`);
    }
  }
});
