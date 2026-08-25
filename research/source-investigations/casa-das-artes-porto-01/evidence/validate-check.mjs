// Local, throwaway sanity check (not itself governed evidence) — imports
// the real contract validator and runs it against this investigation's
// own investigation.json. Not referenced from investigation.json.
import { validateInvestigationV1_1 } from "../../../../ingestion/source-investigation/contract.mjs";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const record = JSON.parse(readFileSync(join(HERE, "..", "investigation.json"), "utf-8"));
const errors = validateInvestigationV1_1(record);
if (errors.length === 0) {
  console.log("VALID: no errors");
} else {
  console.log(`${errors.length} error(s):`);
  for (const e of errors) console.log(" - " + e);
  process.exitCode = 1;
}
