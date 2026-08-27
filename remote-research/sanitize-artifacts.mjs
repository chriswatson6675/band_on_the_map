import { readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { findCredentialLeaks, sanitizeArtifact, sanitizeText } from "./contract.mjs";

const root = process.argv[2];
if (!root) throw new Error("artifact directory is required");
for (const entry of await readdir(root, { withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const path = join(root, entry.name);
  if (!entry.name.endsWith(".json")) {
    if (/\.(?:log|txt)$/i.test(entry.name)) await writeFile(path, sanitizeText(await readFile(path, "utf8")), "utf8");
    continue;
  }
  const sanitized = sanitizeArtifact(JSON.parse(await readFile(path, "utf8")));
  const leaks = findCredentialLeaks(sanitized);
  if (leaks.length) throw new Error(`${entry.name} contains credential-shaped values at ${leaks.join(", ")}`);
  await writeFile(path, `${JSON.stringify(sanitized, null, 2)}\n`, "utf8");
}
console.log("ARTIFACT_CREDENTIAL_AUDIT=PASS");
