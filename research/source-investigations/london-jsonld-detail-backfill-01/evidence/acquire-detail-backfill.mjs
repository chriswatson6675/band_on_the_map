import fs from "node:fs";
import { proveCanonicalDetailEvents } from "../../../../ingestion/programme-acquisition/offline-proof.mjs";

const prior = JSON.parse(fs.readFileSync(new URL("../../london-stable-identity-offline-proof-01/evidence/cohort-audit.json", import.meta.url)));
const deferred = prior.rows.filter((row) => row.decision === "DEFER");

async function capture(url) {
  const response = await fetch(url, { headers: { "user-agent": "BandOnTheMap research/1.0 (+offline retained evidence)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  return { requested_url: url, url: response.url, at: new Date().toISOString(), status: response.status, content_type: response.headers.get("content-type"), body: await response.text() };
}

const results = [];
for (const row of deferred) {
  try {
    const document = await capture(row.original_event_url);
    const proof = proveCanonicalDetailEvents([document]).find((candidate) => candidate.source_record_id === row.original_source_record_id) ?? null;
    results.push({ venue: row.venue, title: row.title.value, source_record_id: row.original_source_record_id, event_url: row.original_event_url, document, decision: proof ? "ACQUISITION_PROVEN_NOT_ACTIVATED" : "DEFER", proof, gap: proof ? null : "Current retained detail response does not meet canonical-detail proof rule." });
  } catch (error) {
    results.push({ venue: row.venue, title: row.title.value, source_record_id: row.original_source_record_id, event_url: row.original_event_url, decision: "DEFER", proof: null, gap: `Detail GET failed: ${String(error)}` });
  }
}
const decision_counts = Object.fromEntries(Object.entries(Object.groupBy(results, (result) => result.decision)).map(([key, value]) => [key, value.length]));
fs.writeFileSync(new URL("./detail-backfill-audit.json", import.meta.url), `${JSON.stringify({ artifact_type: "LONDON_JSONLD_DETAIL_DISCOVERY_BACKFILL", capability_origin: "NEW_LONDON", request_bound: "One public GET for each retained JSON-LD Event URL previously not retained as a detail document; no browser, credentials, retry, or state change.", decision_counts, results }, null, 2)}\n`);
console.log(JSON.stringify({ attempted: results.length, decision_counts }));
