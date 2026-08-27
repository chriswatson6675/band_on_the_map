import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../../..");
const base = process.argv[2];
if (!base) throw new Error("Usage: node audit-retained-secrets.mjs <base-ref>");

const rules = [
  ["PRIVATE_KEY", /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ["GITHUB_TOKEN", /\b(?:gh[oprsu]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/g],
  ["AWS_ACCESS_KEY", /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g],
  ["GOOGLE_API_KEY", /\bAIza[A-Za-z0-9_-]{30,}\b/g],
  ["SLACK_TOKEN", /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g],
  ["STRIPE_LIVE_SECRET", /\bsk_live_[A-Za-z0-9]{16,}\b/g],
  ["MAPBOX_TOKEN", /\b(?:pk|sk)\.[A-Za-z0-9._-]{20,}\b/g],
  ["JWT", /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}(?:\.[A-Za-z0-9_-]{10,})?\b/g],
  ["NAMED_CREDENTIAL", /(?:api[_-]?key|access[_-]?token|client[_-]?secret|authorization|password)["']?\s*[:=]\s*["'](?!\[REDACTED_)[^"'\s<&]{16,}/gi],
  ["QUERY_CREDENTIAL", /(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)=[^&"'\s<>\[]+/gi],
];

const names = execFileSync("git", ["diff", "--name-only", `${base}...HEAD`], { cwd: ROOT, encoding: "utf8" })
  .split(/\r?\n/)
  .filter(Boolean);
const findings = [];

for (const name of names) {
  let text;
  try {
    text = await readFile(resolve(ROOT, name), "utf8");
  } catch {
    continue;
  }
  if (text.includes("\u0000")) continue;
  for (const [rule, pattern] of rules) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) {
      findings.push({
        rule,
        path: name,
        line: text.slice(0, match.index).split("\n").length,
      });
    }
  }
}

console.log(JSON.stringify({ files_scanned: names.length, findings }, null, 2));
if (findings.length) process.exitCode = 1;
