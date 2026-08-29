import fs from "node:fs";
import { extractProgrammeLinks, proveJsonLdEvents } from "../../../../ingestion/programme-acquisition/discovery.mjs";

const out = new URL("./configuration-batch-02.json", import.meta.url);
const triageFiles = ["../../../../research/venue-discovery/london-01/passive-triage.json", "../../../../research/venue-discovery/london-01/remaining-passive-triage.json"];
const priorFiles = ["../../../../research/venue-discovery/london-01/level2/generic-baseline.json", "../../../../research/venue-discovery/london-01/level2/second-tranche.json", "../../../../research/venue-discovery/london-01/level2/remaining-programme-proven.json"];
const prior = new Set(priorFiles.flatMap((file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url))).results).map((result) => result.candidate.candidate_id));
const batchOne = new Set(JSON.parse(fs.readFileSync(new URL("../../london-level2-configuration-batch-01/evidence/configuration-batch-01.json", import.meta.url))).results.map((result) => result.candidate.candidate_id));
const musicSignal = /\b(arena|club|concert|dance|dj|jazz|live|music|night|venue)\b/i;
const mechanismScore = { JSON_LD_EVENT: 30, LIST_TO_DETAIL_HTML: 25, WORDPRESS_TRIBE_API: 20, WORDPRESS_OTHER_API: 15, ICS_OR_ICAL: 10, SQUARESPACE_CALENDAR: 10 };
const candidates = triageFiles.flatMap((file) => JSON.parse(fs.readFileSync(new URL(file, import.meta.url))).results)
  .filter((candidate) => candidate.fit === "CONFIGURATION_ONLY" && candidate.programme_url && !candidate.blocked && !prior.has(candidate.candidate_id) && !batchOne.has(candidate.candidate_id))
  .map((candidate) => ({ ...candidate, score: (candidate.futureDate ? 100 : 0) + (mechanismScore[candidate.mechanism] ?? 0) + (musicSignal.test(candidate.reported_name) ? 20 : 0) }))
  .sort((left, right) => right.score - left.score || left.candidate_id.localeCompare(right.candidate_id)).slice(0, 25);

async function capture(url) {
  const response = await fetch(url, { headers: { "user-agent": "BandOnTheMap research/1.0 (+offline retained evidence)" }, redirect: "follow", signal: AbortSignal.timeout(20000) });
  return { requested_url: url, url: response.url, at: new Date().toISOString(), status: response.status, content_type: response.headers.get("content-type"), body: await response.text() };
}

const results = [];
for (const candidate of candidates) {
  let programme;
  try { programme = await capture(candidate.programme_url); } catch (error) { results.push({ candidate, error: String(error) }); continue; }
  const links = programme.status >= 200 && programme.status < 300 ? extractProgrammeLinks(programme.body, { baseUrl: programme.url, limit: 6 }) : [];
  const detail_documents = [];
  for (const link of links) {
    try { detail_documents.push(await capture(link.url)); } catch (error) { detail_documents.push({ requested_url: link.url, error: String(error) }); }
  }
  const documents = [programme, ...detail_documents.filter((document) => typeof document.body === "string")];
  const json_ld = proveJsonLdEvents(documents, { sourceId: candidate.candidate_id, venueName: candidate.reported_name, retrievedAt: programme.at, cutoffDate: programme.at.slice(0, 10) });
  results.push({ candidate, programme, links, detail_documents, json_ld });
}
fs.writeFileSync(out, `${JSON.stringify({ artifact_type: "LONDON_CONFIGURATION_ONLY_LEVEL2_BATCH_02", capability_origin: "MIXED", request_bound: "25 next-ranked deterministic candidates selected from retained Level-1 triage; one programme GET plus at most six same-origin generic detail GETs, no retry, browser, credential, or state change.", selected_count: candidates.length, results }, null, 2)}\n`);
console.log(JSON.stringify({ selected_count: candidates.length, completed: results.filter((result) => result.programme).length, observations: results.reduce((sum, result) => sum + (result.json_ld?.records?.length ?? 0), 0) }));
