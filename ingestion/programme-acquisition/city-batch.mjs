import { collectAndProve, discoverDetailCandidates, routeProgrammeSource } from "./orchestrator.mjs";
import { resolveProgrammeSource } from "./programme-resolver.mjs";
import { withRetries } from "../unattended-runner/retry.mjs";

async function mapBounded(items, worker, { concurrency = 4, perHost = 1 } = {}) {
  const results = new Array(items.length);
  const hostLocks = new Map();
  let cursor = 0;
  async function take() {
    while (cursor < items.length) {
      const index = cursor++;
      const item = items[index];
      const host = item.programme_url ? new URL(item.programme_url).host : "none";
      const active = hostLocks.get(host) ?? 0;
      if (active >= perHost) { cursor--; await new Promise((resolve) => setTimeout(resolve, 10)); continue; }
      hostLocks.set(host, active + 1);
      try { results[index] = await worker(item); } finally { hostLocks.set(host, (hostLocks.get(host) ?? 1) - 1); }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, take));
  return results.map((result) => ({ ...result, retry_count: (result.retry_provenance ?? []).filter((attempt) => attempt.attempt > 1).length }));
}

/** Generic city-neutral bounded acquisition batch. Fetching/evidence retention is injected. */
export async function runCityAcquisition({ sources, fetchDocument, concurrency = 4, perHost = 1, detailLimit = 12 } = {}) {
  if (!Array.isArray(sources)) throw new Error("sources must be an array");
  if (typeof fetchDocument !== "function") throw new Error("fetchDocument is required");
  const results = await mapBounded(sources, async (source) => {
    const base = { source_id: source.source_id, venue: source.venue, website: source.website ?? null, programme_url: source.programme_url ?? null, routes_attempted: [], retry_count: 0, started_at: new Date().toISOString() };
    let programmeUrl = source.programme_url;
    const retry_provenance = [];
    const fetchBounded = async (url, stage) => {
      const outcome = await withRetries(() => fetchDocument(url), { maxAttempts: 3, onAttempt: ({ attempt, error, willRetry }) => retry_provenance.push({ stage, attempt, error: error ? String(error) : null, will_retry: willRetry }) });
      if (!outcome.ok) { const error = new Error(String(outcome.error)); error.stage = stage; throw error; }
      return outcome.result;
    };
    let discovery = null;
    const discoveryEvidence = [];
    if (!programmeUrl) {
      if (!source.website) return { ...base, state: "PROGRAMME_SOURCE_UNRESOLVED", residue: true, normalized_event_count: 0, proven_event_count: 0, evidence: [] };
      let homepage; try { homepage = await fetchBounded(source.website, "HOMEPAGE_FETCH"); } catch (error) { return { ...base, state: "NETWORK_FAILURE", residue: true, error: String(error), network_stage: error.stage, retry_provenance, normalized_event_count: 0, proven_event_count: 0, evidence: [] }; }
      discovery = await resolveProgrammeSource({ homepage, fetchDocument: (url) => fetchBounded(url, "PROGRAMME_CANDIDATE_FETCH") });
      discoveryEvidence.push(homepage);
      if (!discovery.selected) return { ...base, state: "PROGRAMME_SOURCE_UNRESOLVED", residue: true, programme_discovery: discovery, normalized_event_count: 0, proven_event_count: 0, evidence: discoveryEvidence };
      programmeUrl = discovery.selected.url;
    }
    let programme;
    try { programme = await fetchBounded(programmeUrl, "SELECTED_PROGRAMME_FETCH"); } catch (error) { return { ...base, state: "NETWORK_FAILURE", residue: true, error: String(error), network_stage: error.stage, retry_provenance, normalized_event_count: 0, proven_event_count: 0, evidence: discoveryEvidence }; }
    const preliminary = routeProgrammeSource(programme);
    if (!preliminary.selected || preliminary.residue_state) {
      return { ...base, programme_url: programme.url, programme_discovery: discovery, fingerprint: preliminary.fingerprint, candidate_routes: preliminary.routes, routes_attempted: preliminary.selected ? [preliminary.selected] : [], collector: preliminary.selected?.mechanism ?? null, state: preliminary.residue_state ?? "SOURCE_FINGERPRINT_UNSUPPORTED", residue: true, normalized_event_count: 0, proven_event_count: 0, observations: [], proofs: [], evidence: [...discoveryEvidence, programme], completed_at: new Date().toISOString() };
    }
    const links = programme.status >= 200 && programme.status < 300 ? discoverDetailCandidates(programme, { limit: detailLimit }) : [];
    const details = [];
    for (const link of links) { try { details.push(await fetchBounded(link.url, "EVENT_DETAIL_FETCH")); } catch (error) { details.push({ requested_url: link.url, error: String(error), network_stage: error.stage }); } }
    const outcome = collectAndProve({ source_id: source.source_id, venue_name: source.venue, programme, detail_documents: details });
    return { ...base, programme_url: programme.url, programme_discovery: discovery, fingerprint: outcome.fingerprint, candidate_routes: outcome.routes, routes_attempted: outcome.selected ? [outcome.selected] : [], collector: outcome.selected?.mechanism ?? null, collector_provenance: outcome.collector_provenance, state: outcome.state, residue: outcome.residue, retry_provenance, normalized_event_count: outcome.records?.length ?? 0, proven_event_count: outcome.observations.length, observations: outcome.observations, proofs: outcome.proofs, evidence: [...discoveryEvidence, programme, ...details], completed_at: new Date().toISOString() };
  }, { concurrency, perHost });
  return results;
}
