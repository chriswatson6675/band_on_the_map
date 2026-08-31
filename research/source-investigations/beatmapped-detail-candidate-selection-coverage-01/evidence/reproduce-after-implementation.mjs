// BEATMAPPED-DETAIL-CANDIDATE-SELECTION-COVERAGE-01 — section 23 (full
// local Berlin targeted proof, post-implementation). Runs the REAL,
// unmodified, now-updated acquireSource() end to end for all 8 sources
// this package investigates, exactly as production would (detailLimit
// unchanged at 12, no more than 12 detail GETs per source, real UA,
// bounded timeout, no retries beyond acquireSource's own existing bounded
// retry policy, no browser, no AI interpretation). Compares against
// candidate-selection-results-before-implementation.json (captured before
// orchestrator.mjs's discoverDetailCandidates()/collectAndProve() change
// in this same package) for an honest before/after count.

import { acquireSource } from "../../../../ingestion/programme-acquisition/source-execution.mjs";
import { fetchText } from "../../../../ingestion/http/fetch.mjs";
import fs from "node:fs";

const DETAIL_LIMIT = 12;

async function fetchDocument(url) {
  const response = await fetchText(url, { timeoutMs: 20000 });
  return { requested_url: url, url: response.url, at: response.retrievedAt, status: response.status, content_type: response.contentType, body: response.text };
}

const SOURCES = [
  { source_id: "tempodrom-berlin", venue: "Tempodrom", website: "https://www.tempodrom.de/", programme_url: "https://www.tempodrom.de/programm-und-tickets/" },
  { source_id: "waldbuehne-berlin", venue: "Waldbühne", website: "https://www.waldbuehne-berlin.de/", programme_url: "https://www.waldbuehne-berlin.de/programm-und-tickets/" },
  { source_id: "a-trane-berlin", venue: "A-Trane", website: "https://a-trane.de/", programme_url: "https://a-trane.de/programm/" },
  { source_id: "privatclub-berlin", venue: "Privatclub", website: "https://privatclub-berlin.de/", programme_url: "https://privatclub-berlin.de/" },
  { source_id: "b-flat-berlin", venue: "b-flat", website: "https://b-flat-berlin.de/", programme_url: "https://b-flat-berlin.de/programm" },
  { source_id: "huxleys-neue-welt-berlin", venue: "Huxleys Neue Welt", website: "https://huxleysneuewelt.de/", programme_url: "https://huxleysneuewelt.de/en/events" },
  { source_id: "radialsystem-berlin", venue: "Radialsystem", website: "https://www.radialsystem.de/en/", programme_url: "https://www.radialsystem.de/en/programm/programm/" },
  { source_id: "konzerthaus-berlin", venue: "Konzerthaus Berlin", website: "https://www.konzerthaus.de/en/", programme_url: "https://www.konzerthaus.de/en/programm/26-08-2026" },
];

const before = JSON.parse(fs.readFileSync(new URL("./candidate-selection-results-before-implementation.json", import.meta.url)));

const report = { generated_at: new Date().toISOString(), detail_limit: DETAIL_LIMIT, note: "Real acquireSource() runs AFTER orchestrator.mjs's discoverDetailCandidates()/collectAndProve() change. Compared against the pre-implementation old_selection captured in candidate-selection-results-before-implementation.json.", sources: {} };

for (const source of SOURCES) {
  process.stderr.write(`=== ${source.source_id} ===\n`);
  const run = await acquireSource(source, { fetchDocument, detailLimit: DETAIL_LIMIT });
  const detailDocs = (run.evidence ?? []).slice(1);
  const candidateUrls = detailDocs.map((d) => d.url ?? d.requested_url).filter(Boolean);
  const beforeEntry = before.sources[source.source_id];
  const beforeProven = beforeEntry?.old_selection?.final_proven_count ?? null;
  const beforeNormalized = beforeEntry?.normalized?.normalized_record_count ?? null;
  report.sources[source.source_id] = {
    state: run.state,
    detail_fetch_count: candidateUrls.length,
    detail_fetch_count_within_limit: candidateUrls.length <= DETAIL_LIMIT,
    candidate_urls: candidateUrls,
    normalized_event_count_after: run.normalized_event_count,
    proven_event_count_after: run.proven_event_count,
    normalized_event_count_before: beforeNormalized,
    proven_event_count_before: beforeProven,
    delta_proven: beforeProven === null ? null : run.proven_event_count - beforeProven,
  };
  process.stderr.write(`${source.source_id}: state=${run.state} fetches=${candidateUrls.length} proven_before=${beforeProven} proven_after=${run.proven_event_count}\n`);
}

fs.writeFileSync(new URL("./after-implementation-results.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
console.log("done — wrote after-implementation-results.json");
