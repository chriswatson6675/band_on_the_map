import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { proveMicrodataEvents } from "../../../ingestion/microdata/parse.mjs";
import { emptyFieldAssessmentV1_2, POLICY_VERSION_V1_2, validateInvestigation } from "../../../ingestion/source-investigation/contract.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "../../..");
const priorId = "deep-osm-node-4523367790-berlin-02";
const investigationId = "deep-osm-node-4523367790-berlin-03";
const prior = JSON.parse(await readFile(resolve(ROOT, `research/source-investigations/${priorId}/investigation.json`), "utf8"));
const sourcePath = `research/source-investigations/${priorId}/evidence/level-1.json`;
const evidence = JSON.parse(await readFile(resolve(ROOT, sourcePath), "utf8"));
const page = evidence.captures.find((capture) => capture.role === "PROGRAMME_OR_OFFICIAL");
const proof = proveMicrodataEvents(page.body, { documentUrl: page.final_url, sourceId: "research-loci-loft", venueName: "Loci Loft", retrievedAt: page.acquired_at, cutoffDate: "2026-08-27" });
if (!proof.observations.length) throw new Error("generic microdata capability did not reproduce the retained Loci Loft event");
const sample = proof.observations[0];
const outputDir = resolve(ROOT, `research/source-investigations/${investigationId}`);
await mkdir(resolve(outputDir, "evidence"), { recursive: true });
const proofPath = `research/source-investigations/${investigationId}/evidence/acquisition-proof.json`;
await writeFile(resolve(ROOT, proofPath), `${JSON.stringify({ collector_family: "MICRODATA", source_evidence: sourcePath, observations: proof.observations }, null, 2)}\n`, "utf8");
const fields = emptyFieldAssessmentV1_2();
fields.title = { state: "PROVEN", value: sample.title, basis: "DIRECT_SOURCE", derivation: null, notes: "Generic schema.org microdata extraction reproduced the retained first-party title.", evidence_refs: ["ev-level1", "ev-proof"] };
fields.start_date = { state: "PROVEN", value: sample.start.date, basis: "DIRECT_SOURCE", derivation: null, notes: "The retained startDate content attribute directly exposes this date.", evidence_refs: ["ev-level1", "ev-proof"] };
fields.event_url = { state: "PROVEN", value: sample.event_url, basis: "DIRECT_SOURCE", derivation: null, notes: "The retained first-party event detail URL is the acquisition surface.", evidence_refs: ["ev-level1", "ev-proof"] };
fields.source_record_id = { state: "PARTIAL", value: null, basis: null, derivation: null, notes: "The event permalink is used for this proof, but one retained acquisition does not establish long-term stability independently.", evidence_refs: ["ev-proof"] };
const record = {
  investigation_id: investigationId,
  policy_version: POLICY_VERSION_V1_2,
  investigated_at: new Date().toISOString(),
  investigator: { type: "AI", method: "Offline re-proof of retained first-party Level 1 evidence after adding a generic schema.org microdata collector family." },
  probe_history: [{ level: 1, method: "PASSIVE_STATIC", outcome: "SUFFICIENT", reason: "The retained passive first-party event page now passes through the generic microdata parser and existing Observation adapter without another network request.", evidence_refs: ["ev-level1", "ev-proof"] }],
  source_candidate_id: prior.source_candidate_id,
  source_id: null,
  venue_reference: prior.venue_reference,
  official_url: prior.official_url,
  identity: { ...prior.identity, evidence_refs: ["ev-level1"] },
  site_classification: { acquisition_class: "STATIC_HTML", platform: "schema.org Event microdata", confidence: "HIGH", evidence_refs: ["ev-level1", "ev-proof"] },
  data_paths: [{ kind: "MICRODATA", url: page.final_url, access: "PUBLIC", status: "CONFIRMED", confidence: "HIGH", evidence_refs: ["ev-level1", "ev-proof"] }],
  field_assessment: fields,
  collector_assessment: { recommended_family: "STABLE_EVENT_PAGE", confidence: "HIGH", evidence_refs: ["ev-level1", "ev-proof"], blockers: [] },
  decision: { status: "READY_FOR_OFFLINE_PROOF", reasons: ["A real future event passed through the generic microdata parser and existing normalized Observation path; no activation occurred."], evidence_refs: ["ev-level1", "ev-proof"] },
  evidence: [
    { evidence_id: "ev-level1", evidence_class: "DIRECT_EVIDENCE", description: "Previously retained bounded first-party Level 1 capture, reused without mutation.", acquired_from: page.requested_url, acquired_at: page.acquired_at, method: "Node fetch; unauthenticated bounded GET", content_type: "application/json", byte_faithful: false, path: sourcePath },
    { evidence_id: "ev-proof", evidence_class: "DETERMINISTIC_DERIVATION", description: "Generic microdata parser and existing Observation adapter reproduced the event from retained evidence.", acquired_from: page.final_url, acquired_at: new Date().toISOString(), method: "Offline deterministic parse of retained evidence", content_type: "application/json", byte_faithful: false, path: proofPath },
  ],
  supersedes: priorId,
};
const errors = validateInvestigation(record);
if (errors.length) throw new Error(errors.join("; "));
await writeFile(resolve(outputDir, "investigation.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");
await writeFile(resolve(outputDir, "README.md"), "# Loci Loft — generic microdata re-proof\n\nThis supersedes the Level 1/2 defer record after a reusable schema.org microdata capability was implemented. No source was activated.\n", "utf8");
const result = {
  candidate_id: prior.source_candidate_id,
  venue: "Loci Loft",
  programme_url: page.final_url,
  official_source_confidence: "HIGH",
  future_programme_state: "FUTURE_PROGRAMME_PROVEN",
  technical_mechanism: "MICRODATA",
  collector_fit: "EXISTING_COLLECTOR_ZERO_CODE",
  acquisition_result: "ACQUISITION_PROVEN_NOT_ACTIVATED",
  generic_capability_dependency: null,
  next_action: "NO_FURTHER_ACTION",
  evidence_refs: [`research/source-investigations/${investigationId}/investigation.json`],
  read_only_proof: { collector_family: "MICRODATA", future_events_observed: proof.observations.length, normalized_event_sample: proof.observations.slice(0, 3), validation_failures: [] },
  last_investigation_state: "SUFFICIENT",
};
await writeFile(resolve(HERE, "generic-improvement-results.json"), `${JSON.stringify({ artifact_type: "GENERIC_IMPROVEMENT_REPROOF_RESULTS", generated_at: new Date().toISOString(), results: [result] }, null, 2)}\n`, "utf8");
console.log(JSON.stringify({ venue: result.venue, acquisition_result: result.acquisition_result, future_events_observed: proof.observations.length }, null, 2));
