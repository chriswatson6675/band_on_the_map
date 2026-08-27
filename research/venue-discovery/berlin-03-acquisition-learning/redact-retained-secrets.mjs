import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { redactSensitiveText } from "../../../ingestion/source-investigation/redact-sensitive-text.mjs";

const ROOT = resolve(import.meta.dirname, "../../../research/source-investigations");
const relativePaths = process.argv.slice(2);
let changed = 0;

function redactValue(value) {
  if (typeof value === "string") return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map(redactValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, redactValue(child)]));
  }
  return value;
}

function refreshBodyHashes(value) {
  if (Array.isArray(value)) {
    value.forEach(refreshBodyHashes);
    return;
  }
  if (!value || typeof value !== "object") return;
  if (typeof value.body === "string" && "body_sha256" in value) {
    value.body_sha256 = createHash("sha256").update(value.body).digest("hex");
  }
  Object.values(value).forEach(refreshBodyHashes);
}

for (const relativePath of relativePaths) {
  const path = resolve(ROOT, relativePath);
  const before = await readFile(path, "utf8");
  const evidence = redactValue(JSON.parse(before));
  refreshBodyHashes(evidence);
  const after = `${JSON.stringify(evidence, null, 2)}\n`;
  if (after !== before) {
    await writeFile(path, after, "utf8");
    changed += 1;
  }
}

console.log(JSON.stringify({ inspected: relativePaths.length, changed }));
