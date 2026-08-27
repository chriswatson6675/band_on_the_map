// One-off local sanity check (not part of the governed evidence record
// itself) — imports the real v1.2 validator from contract.mjs and runs it
// against this investigation's own investigation.json, printing any
// validation errors so they can be fixed before the investigation is
// considered complete. Dependency-free, no network.
//
// Run with: node evidence/validate-mine.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateInvestigationV1_2 } from "../../../../ingestion/source-investigation/contract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const record = JSON.parse(readFileSync(join(HERE, "..", "investigation.json"), "utf-8"));

const errors = validateInvestigationV1_2(record);

if (errors.length === 0) {
  console.log("VALID: teatro-sao-carlos-lisbon-01/investigation.json passes validateInvestigationV1_2 with zero errors.");
} else {
  console.log(`INVALID: ${errors.length} error(s):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exitCode = 1;
}
