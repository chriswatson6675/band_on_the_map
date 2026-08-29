import fs from "node:fs";
import { proveCanonicalDetailEvents } from "../../../../ingestion/programme-acquisition/offline-proof.mjs";

const input = JSON.parse(fs.readFileSync(new URL("./configuration-batch-02.json", import.meta.url)));
const rows = [];
for (const result of input.results) {
  const proofs = new Map(proveCanonicalDetailEvents(result.detail_documents ?? []).map((proof) => [proof.source_record_id, proof]));
  for (const record of result.json_ld?.records ?? []) {
    const proof = proofs.get(record.source_record_id) ?? null;
    rows.push({ venue: result.candidate.reported_name, candidate_id: result.candidate.candidate_id, programme_url: result.candidate.programme_url, mechanism: result.candidate.mechanism, title: record.title, start_raw: record.start_raw, original_source_record_id: record.source_record_id, original_event_url: record.event_url, decision: proof ? "ACQUISITION_PROVEN_NOT_ACTIVATED" : "DEFER", proof: proof ?? null, gap: proof ? null : "No retained first-party detail document with a matching source-published canonical URL." });
  }
}
const decision_counts = Object.fromEntries(Object.entries(Object.groupBy(rows, (row) => row.decision)).map(([key, value]) => [key, value.length]));
fs.writeFileSync(new URL("./offline-proof-audit.json", import.meta.url), `${JSON.stringify({ artifact_type: "LONDON_CONFIGURATION_BATCH_02_OFFLINE_PROOF", input: "configuration-batch-02.json", rule: "Retained first-party detail canonical URL must equal retrieved document URL and supplied JSON-LD event URL where present.", rows, decision_counts }, null, 2)}\n`);
console.log(JSON.stringify({ events: rows.length, decision_counts }));
