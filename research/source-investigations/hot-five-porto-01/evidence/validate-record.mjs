// One-off sanity check (not itself governed evidence): imports the real
// v1.1 validator from ingestion/source-investigation/contract.mjs and runs
// it against this directory's own investigation.json. No network, no
// mutation. Run with: node evidence/validate-record.mjs
import { readFileSync } from "node:fs";
import { validateInvestigationV1_1 } from "../../../../ingestion/source-investigation/contract.mjs";

const record = JSON.parse(readFileSync(new URL("../investigation.json", import.meta.url), "utf-8"));

const errors = validateInvestigationV1_1(record);
if (errors.length === 0) {
  console.log("VALID: 0 errors");
} else {
  console.log(`INVALID: ${errors.length} error(s):`);
  for (const e of errors) console.log(" - " + e);
  process.exitCode = 1;
}
