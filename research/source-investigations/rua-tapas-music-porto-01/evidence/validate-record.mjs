// Local, throwaway sanity check (not itself part of the governed record):
// imports the real v1.1 validator and runs it against investigation.json.
// Run with: node evidence/validate-record.mjs
import { validateInvestigationV1_1 } from "../../../../ingestion/source-investigation/contract.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const record = JSON.parse(readFileSync(join(HERE, "..", "investigation.json"), "utf-8"));
const errors = validateInvestigationV1_1(record);

if (errors.length === 0) {
  console.log("VALID: 0 errors");
} else {
  console.log(`INVALID: ${errors.length} error(s)`);
  for (const e of errors) console.log(" - " + e);
  process.exitCode = 1;
}
