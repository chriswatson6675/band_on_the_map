// BEATMAPPED-DETAIL-LIMIT-36-IMPLEMENTATION-01 — section 11 targeted local
// validation. Sequential, bounded, real live GETs (no added concurrency,
// same pacing this repository's prior packages already used). For each of
// the 8 Berlin sources named in the brief:
//
//   1. Fetch the source's real, configured programme_url ONCE (fetchText).
//   2. Call acquireSource() (the real, unmodified-except-for-the-default
//      production function) with detailLimit=36 explicitly — this performs
//      AT MOST 36 real detail-page GETs, using the SAME deterministic
//      discoverDetailCandidates() ordering production uses. Never more
//      than 36 detail fetches per source, per the new production cap.
//   3. Derive (NOT re-fetch) the proof@12 checkpoint from the SAME
//      already-fetched detail documents by re-running collectAndProve()
//      over just the first 12 of them (candidate order == fetch order) —
//      this is the exact "fetch once, derive every checkpoint" technique
//      the prior bounded experiment package already used, and it means
//      this validation run makes ZERO extra network calls beyond the
//      single real production run at the new limit.
//
// No browser automation, no AI page interpretation. Retained here as
// governed evidence per docs/SOURCE_INVESTIGATION_POLICY.md.

import { writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { acquireSource } from "../../../../ingestion/programme-acquisition/source-execution.mjs";
import { collectAndProve } from "../../../../ingestion/programme-acquisition/orchestrator.mjs";
import { fetchText } from "../../../../ingestion/http/fetch.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function defaultFetchDocument(url) {
  const response = await fetchText(url);
  return { url: response.url, at: response.retrievedAt, status: response.status, content_type: response.contentType, body: response.text };
}

async function validateOne(source) {
  const startedAt = new Date().toISOString();
  const result = await acquireSource(source, { fetchDocument: defaultFetchDocument, detailLimit: 36 });
  const completedAt = new Date().toISOString();

  // evidence = [...discoveryEvidence(empty, programme_url was explicit), programme, ...details]
  const programmeDoc = result.evidence?.[0] ?? null;
  const detailDocs = (result.evidence ?? []).slice(1); // in candidate/fetch order, <=36

  // Derive proof@12 from the SAME already-fetched detail documents — zero
  // extra network calls. Only meaningful once a programme document was
  // actually retained (i.e. the SELECTED_PROGRAMME_FETCH stage succeeded);
  // for a residue reached before that (network failure, unresolved source)
  // there is no programme document to re-run collectAndProve() against.
  let proof12 = null;
  if (programmeDoc) {
    try {
      const derived = collectAndProve({
        source_id: source.source_id,
        venue_name: source.venue,
        programme: programmeDoc,
        detail_documents: detailDocs.slice(0, 12),
      });
      proof12 = { state: derived.state, proven_event_count: derived.observations.length, normalized_event_count: derived.records?.length ?? 0 };
    } catch (error) {
      proof12 = { error: String(error) };
    }
  }

  return {
    source_id: source.source_id,
    venue: source.venue,
    programme_url: source.programme_url,
    started_at: startedAt,
    completed_at: completedAt,
    state_at_36: result.state,
    residue_at_36: result.residue,
    normalized_event_count_at_36: result.normalized_event_count,
    proven_event_count_at_36: result.proven_event_count,
    detail_fetch_attempts: detailDocs.length,
    detail_fetch_attempts_hard_cap_respected: detailDocs.length <= 36,
    derived_proof_at_12: proof12,
    collector: result.collector ?? null,
    fingerprint_mechanisms: (result.candidate_routes ?? []).map((r) => r.mechanism),
    network_stage: result.network_stage ?? null,
    error: result.error ?? null,
    retry_count: result.retry_count,
  };
}

async function main() {
  const rows = [];
  for (const source of SOURCES) {
    process.stderr.write(`validating ${source.source_id} ...\n`);
    try {
      const row = await validateOne(source);
      rows.push(row);
      process.stderr.write(
        `  state@36=${row.state_at_36} proven@36=${row.proven_event_count_at_36} detail_fetches=${row.detail_fetch_attempts} ` +
        `derived_proven@12=${row.derived_proof_at_12?.proven_event_count ?? "n/a"}\n`,
      );
    } catch (error) {
      rows.push({ source_id: source.source_id, venue: source.venue, error: String(error) });
      process.stderr.write(`  ERROR: ${String(error)}\n`);
    }
    // Respectful sequential pacing between distinct sources/hosts.
    await sleep(1500);
  }

  const outPath = resolve(HERE, "berlin-8-source-validation-results.json");
  await writeFile(outPath, JSON.stringify({ generated_at: new Date().toISOString(), detail_limit_validated: 36, results: rows }, null, 2));
  process.stderr.write(`\nwrote ${outPath}\n`);
}

main();
