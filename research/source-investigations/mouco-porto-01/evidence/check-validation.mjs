// Ad-hoc sanity-check script (not part of the governed evidence set) that
// imports the real contract validator and runs it against this
// investigation's investigation.json. Not itself retained as evidence —
// just used once, interactively, to confirm the record validates.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { validateInvestigationV1_1 } from "../../../../ingestion/source-investigation/contract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const record = JSON.parse(readFileSync(join(HERE, "..", "investigation.json"), "utf-8"));

const errors = validateInvestigationV1_1(record);
if (errors.length === 0) {
  console.log("VALID: no errors reported by validateInvestigationV1_1.");
} else {
  console.log(`${errors.length} error(s):`);
  for (const e of errors) console.log(` - ${e}`);
  process.exitCode = 1;
}
