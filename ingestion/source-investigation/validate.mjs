#!/usr/bin/env node
// Repository-level validator for governed source-investigation records
// (BOTM-SOURCE-INVESTIGATION-GOVERNANCE-01). Builds on the pure
// structural/business-rule contract in ./contract.mjs and adds the one
// thing that needs real filesystem access: does every evidence.path an
// investigation cites actually resolve to a real, retained file?
//
// Read-only. Makes no network requests. Never writes to, mutates, or
// deletes anything — including the investigation.json files it reads.
//
// `npm run validate:source-investigations` runs this as a CLI, walking
// every research/source-investigations/<id>/investigation.json in the
// repository so a record can never silently go unchecked. Every export
// here is also directly usable from tests against an arbitrary repoRoot
// (e.g. a fixtures directory), so tests never need to shell out.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isGovernedEvidencePath, validateInvestigation } from "./contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const INVESTIGATIONS_ROOT = "research/source-investigations";

/**
 * Check that every evidence.path cited by an already-structurally-valid
 * investigation record resolves to a real file on disk under `repoRoot`.
 * A path that fails ./contract.mjs's isGovernedEvidencePath() naming
 * check is skipped here — validateInvestigation() already reports that as
 * a structural error, so it is not double-reported as "missing".
 * Returns an array of human-readable error strings; empty means valid.
 */
export function validateEvidenceFilesExist(record, repoRoot = ROOT) {
  const errors = [];
  const evidence = Array.isArray(record?.evidence) ? record.evidence : [];

  for (const item of evidence) {
    if (item?.path == null) continue;
    if (!isGovernedEvidencePath(item.path)) continue;

    const full = join(repoRoot, item.path);
    let isFile = false;
    try {
      isFile = existsSync(full) && statSync(full).isFile();
    } catch {
      isFile = false;
    }
    if (!isFile) {
      errors.push(
        `evidence "${item.evidence_id ?? "(no id)"}" path "${item.path}" does not resolve to a real retained file`,
      );
    }
  }

  return errors;
}

/**
 * Full validation of one investigation.json file: structural/business-rule
 * validation (contract.mjs's validateInvestigation) plus the fs-level
 * evidence-file-exists check above. `filePath` is repo-relative.
 * Returns { path, errors } — errors is empty when the record is fully
 * valid.
 */
export function validateInvestigationFile(filePath, repoRoot = ROOT) {
  const full = resolve(repoRoot, filePath);

  let record;
  try {
    record = JSON.parse(readFileSync(full, "utf8"));
  } catch (error) {
    return { path: filePath, errors: [`could not read/parse ${filePath}: ${error.message}`] };
  }

  const errors = [...validateInvestigation(record), ...validateEvidenceFilesExist(record, repoRoot)];
  return { path: filePath, errors };
}

/**
 * Discover every governed investigation record in the repository:
 * research/source-investigations/<investigation-id>/investigation.json.
 * Returns repo-relative, forward-slash paths, sorted for determinism.
 */
export function discoverInvestigationFiles(repoRoot = ROOT) {
  const root = join(repoRoot, INVESTIGATIONS_ROOT);
  if (!existsSync(root)) return [];

  const found = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = join(INVESTIGATIONS_ROOT, entry.name, "investigation.json");
    if (existsSync(join(repoRoot, candidate))) {
      found.push(candidate.split("\\").join("/"));
    }
  }
  return found.sort();
}

/**
 * Validate every governed investigation record under repoRoot.
 * Returns { results, ok } — ok is true only if every discovered file has
 * zero errors. A repository with no investigations yet is trivially ok.
 */
export function validateAllInvestigations(repoRoot = ROOT) {
  const files = discoverInvestigationFiles(repoRoot);
  const results = files.map((file) => validateInvestigationFile(file, repoRoot));
  const ok = results.every((result) => result.errors.length === 0);
  return { results, ok };
}

function main() {
  const { results, ok } = validateAllInvestigations(ROOT);

  if (results.length === 0) {
    console.log(`No governed source-investigation records found under ${INVESTIGATIONS_ROOT}/.`);
  }

  for (const result of results) {
    if (result.errors.length === 0) {
      console.log(`OK   ${result.path}`);
    } else {
      console.log(`FAIL ${result.path}`);
      for (const error of result.errors) {
        console.log(`     - ${error}`);
      }
    }
  }

  if (!ok) {
    process.exitCode = 1;
  }
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
