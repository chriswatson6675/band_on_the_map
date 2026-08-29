import fs from "node:fs";
import { proveCanonicalDetailEvents } from "../../../../ingestion/programme-acquisition/offline-proof.mjs";

const artifacts = ["generic-baseline.json", "second-tranche.json", "remaining-programme-proven.json"];
const rows = [];
for (const artifact of artifacts) {
  const data = JSON.parse(fs.readFileSync(new URL(`./${artifact}`, import.meta.url)));
  for (const result of data.results) {
    const records = result.json_ld?.records ?? [];
    const proofs = new Map(proveCanonicalDetailEvents(result.detail_documents ?? []).map((proof) => [proof.source_record_id, proof]));
    for (const record of records) {
      const proof = proofs.get(record.source_record_id) ?? null;
      rows.push({
        artifact,
        venue: result.candidate.reported_name,
        programme_url: result.candidate.programme_url ?? result.homepage?.url ?? null,
        mechanism: result.candidate.mechanism ?? result.candidate.family ?? null,
        original_source_record_id: record.source_record_id,
        original_event_url: record.event_url,
        title: { value: record.title, state: record.title ? "PROVEN" : "UNKNOWN", basis: record.title ? "DIRECT_JSON_LD_FIELD" : null },
        start_date: { value: record.start_raw, state: record.start_raw ? "PROVEN" : "UNKNOWN", basis: record.start_raw ? "DIRECT_JSON_LD_FIELD" : null },
        stable_source_record_id: proof
          ? { value: proof.source_record_id, state: "PROVEN", basis: proof.source_record_id_basis }
          : { value: null, state: "UNKNOWN", basis: null },
        detail_url: proof
          ? { value: proof.event_url, state: "PROVEN", basis: "SOURCE_PUBLISHED_CANONICAL_LINK_ON_RETAINED_DETAIL_DOCUMENT" }
          : { value: record.event_url, state: record.event_url ? "PARTIAL" : "UNKNOWN", basis: record.event_url ? "JSON_LD_EVENT_URL_ON_LIST_OR_UNVERIFIED_DOCUMENT" : null },
        offline_source: proof
          ? { state: "PROVEN", proof_kind: proof.proof_kind, document_url: proof.source_document_url, canonical_url: proof.source_document_canonical_url, json_ld_event_url: proof.json_ld_event_url, json_ld_id: proof.json_ld_id }
          : { state: "INSUFFICIENT", gap: "No retained detail document whose source-published canonical link equals the document URL and agrees with the Event URL." },
        decision: proof ? "ACQUISITION_PROVEN_NOT_ACTIVATED" : "DEFER",
        reproducible_gap: proof ? null : "Capture and verify the event's own first-party detail document; listing/category JSON-LD alone is not stable-identity proof.",
      });
    }
  }
}

const byDecision = Object.groupBy(rows, ({ decision }) => decision);
const output = {
  artifact_type: "LONDON_STABLE_IDENTITY_OFFLINE_PROOF_AUDIT",
  policy_version: "BOTM-SOURCE-INVESTIGATION-v1.2",
  generated_by: "verify-offline-proof.mjs",
  input_artifacts: artifacts,
  frozen_event_count: rows.length,
  site_count: new Set(rows.map(({ venue }) => venue)).size,
  decision_counts: Object.fromEntries(Object.entries(byDecision).map(([key, values]) => [key, values.length])),
  rule: "Promote only when retained first-party detail HTML publishes a canonical URL equal to the retrieved detail document and, when JSON-LD supplies an Event URL, equal to that URL. The source-published canonical URL is then the source_record_id; no inferred identity is used.",
  rows,
};
fs.writeFileSync(new URL("./cohort-audit.json", import.meta.url), `${JSON.stringify(output, null, 2)}\n`);
console.log(JSON.stringify({ frozen_event_count: output.frozen_event_count, site_count: output.site_count, decision_counts: output.decision_counts }));
