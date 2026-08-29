import { collectAndProve, discoverDetailCandidates, routeProgrammeSource } from "./orchestrator.mjs";
import { resolveProgrammeSource } from "./programme-resolver.mjs";

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
  return results;
}

/** Generic city-neutral bounded acquisition batch. Fetching/evidence retention is injected. */
export async function runCityAcquisition({ sources, fetchDocument, concurrency = 4, perHost = 1, detailLimit = 12 } = {}) {
  if (!Array.isArray(sources)) throw new Error("sources must be an array");
  if (typeof fetchDocument !== "function") throw new Error("fetchDocument is required");
  const results = await mapBounded(sources, async (source) => {
    const base = { source_id: source.source_id, venue: source.venue, website: source.website ?? null, programme_url: source.programme_url ?? null, routes_attempted: [], retry_count: 0, started_at: new Date().toISOString() };
    let programmeUrl = source.programme_url;
    let discovery = null;
    const discoveryEvidence = [];
    if (!programmeUrl) {
      if (!source.website) return { ...base, state: "PROGRAMME_SOURCE_UNRESOLVED", residue: true, normalized_event_count: 0, proven_event_count: 0, evidence: [] };
      let homepage; try { homepage = await fetchDocument(source.website); } catch (error) { return { ...base, state: "NETWORK_FAILURE", residue: true, error: String(error), normalized_event_count: 0, proven_event_count: 0, evidence: [] }; }
      discovery = await resolveProgrammeSource({ homepage, fetchDocument });
      discoveryEvidence.push(homepage);
      if (!discovery.selected) return { ...base, state: "PROGRAMME_SOURCE_UNRESOLVED", residue: true, programme_discovery: discovery, normalized_event_count: 0, proven_event_count: 0, evidence: discoveryEvidence };
      programmeUrl = discovery.selected.url;
    }
    let programme;
    try { programme = await fetchDocument(programmeUrl); } catch (error) { return { ...base, state: "NETWORK_FAILURE", residue: true, error: String(error), normalized_event_count: 0, proven_event_count: 0, evidence: discoveryEvidence }; }
    const preliminary = routeProgrammeSource(programme);
    if (!preliminary.selected || preliminary.residue_state) {
      return { ...base, programme_url: programme.url, programme_discovery: discovery, fingerprint: preliminary.fingerprint, candidate_routes: preliminary.routes, routes_attempted: preliminary.selected ? [preliminary.selected] : [], collector: preliminary.selected?.mechanism ?? null, state: preliminary.residue_state ?? "SOURCE_FINGERPRINT_UNSUPPORTED", residue: true, normalized_event_count: 0, proven_event_count: 0, observations: [], proofs: [], evidence: [...discoveryEvidence, programme], completed_at: new Date().toISOString() };
    }
    const links = programme.status >= 200 && programme.status < 300 ? discoverDetailCandidates(programme, { limit: detailLimit }) : [];
    const details = [];
    for (const link of links) { try { details.push(await fetchDocument(link.url)); } catch (error) { details.push({ requested_url: link.url, error: String(error) }); } }
    const outcome = collectAndProve({ source_id: source.source_id, venue_name: source.venue, programme, detail_documents: details });
    return { ...base, programme_url: programme.url, programme_discovery: discovery, fingerprint: outcome.fingerprint, candidate_routes: outcome.routes, routes_attempted: outcome.selected ? [outcome.selected] : [], collector: outcome.selected?.mechanism ?? null, state: outcome.state, residue: outcome.residue, normalized_event_count: outcome.records?.length ?? 0, proven_event_count: outcome.observations.length, observations: outcome.observations, proofs: outcome.proofs, evidence: [...discoveryEvidence, programme, ...details], completed_at: new Date().toISOString() };
  }, { concurrency, perHost });
  return results;
}
