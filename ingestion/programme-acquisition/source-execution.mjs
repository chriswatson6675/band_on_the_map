// BEATMAPPED-GENERIC-PER-SOURCE-ACQUISITION-BRIDGE-01 — the generic
// single-source execution boundary this package exists to expose.
//
// `acquireSource()` is the EXACT per-source logic city-batch.mjs's
// `runCityAcquisition()` already ran internally — extracted verbatim (see
// this package's own FINAL REPORT for the git history), not reimplemented.
// city-batch.mjs's `mapBounded()` scheduling wrapper (bounded concurrency,
// per-host throttling) now calls this function once per source instead of
// containing its own copy of this logic — see that file. This is the
// ONLY change either file's own acquisition behaviour makes: this
// function was previously an anonymous closure inline in
// `runCityAcquisition`; it is now a named, independently callable,
// independently testable export. No collector, parser, proof generator,
// or retry policy is duplicated — every one of those is still the exact
// same import this file re-exposes from orchestrator.mjs,
// programme-resolver.mjs, and ../unattended-runner/retry.mjs.
//
// CONTRACT (deliberately city/venue/collector-family-neutral — this
// function never branches on `source.venue`'s or `source.source_id`'s
// value, only threads them through as opaque labels other layers already
// use them as):
//
//   acquireSource(source, { fetchDocument, detailLimit? })
//     source: { source_id, venue, website?, programme_url? }
//     fetchDocument: (url) => Promise<{ url, at, status, content_type, body, ... }>
//                     — the SAME document-fetch contract city-batch.mjs's
//                     callers already inject (see tests/city-batch.test.mjs)
//   -> Promise<SourceAcquisitionResult>  (see this file's own JSDoc below)
//
// TERMINAL STATES are this repository's OWN existing, canonical
// vocabulary — nothing here invents a parallel one:
//   ACQUISITION_PROVEN                success (see orchestrator.mjs's
//                                      collectAndProve()).
//   NETWORK_FAILURE                    a fetch exhausted its retry
//                                      budget or hit a non-transient
//                                      network error (see
//                                      ../unattended-runner/retry.mjs).
//   PROGRAMME_SOURCE_UNRESOLVED        no programme_url was given/found
//                                      and bounded homepage discovery
//                                      (programme-resolver.mjs) could not
//                                      resolve one.
//   ACCESS_BLOCKED / BROWSER_REQUIRED / SOCIAL_FIRST_PROGRAMME /
//   IMAGE_OR_POSTER_ONLY / PROGRAMME_EMPTY
//                                      structural residue, classified by
//                                      routeProgrammeSource()'s
//                                      RESIDUE_BY_MECHANISM (orchestrator.mjs)
//                                      from the retained programme
//                                      document's own fingerprint — never
//                                      guessed, never resolved by AI or a
//                                      browser here.
//   SOURCE_FINGERPRINT_UNSUPPORTED     the fingerprinted mechanism has no
//                                      existing collector route at all
//                                      (this repository's own equivalent
//                                      of "unsupported collector family").
//   STABLE_IDENTITY_PROOF_FAILED /
//   SUPPORTED_COLLECTOR_NO_VALID_EVENTS
//                                      a supported collector ran but
//                                      produced nothing provable — see
//                                      collectAndProve()'s own doc
//                                      comment.
//
// No AI. No browser automation. This path (transitively, via
// orchestrator.mjs -> embedded-state/collector.mjs) reuses ONE pure,
// deterministic parsing helper that happens to live under
// ingestion/browser-resolution/ (classify.mjs's extractEmbeddedState() —
// text/JSON structure inspection only, no network, no Playwright, no
// model call; that directory's actual browser-driving code,
// playwright-session.mjs, is never imported anywhere in this file's own
// dependency tree). A source this function cannot handle deterministically
// always terminates in one of the residue states above, for a separate,
// later worker to pick up — nothing here ever launches a browser or
// calls a model itself.

import { collectAndProve, discoverDetailCandidates, routeProgrammeSource } from "./orchestrator.mjs";
import { resolveProgrammeSource } from "./programme-resolver.mjs";
import { withRetries } from "../unattended-runner/retry.mjs";

/**
 * @typedef {Object} SourceAcquisitionResult
 * @property {string} source_id
 * @property {string} venue
 * @property {string|null} website
 * @property {string|null} programme_url  the ORIGINALLY-configured programme_url (see also the top-level `programme_url` a resolved run overwrites below with the actual document fetched — matching city-batch.mjs's existing, unchanged field semantics)
 * @property {string} state               one of the canonical states documented above
 * @property {boolean} residue            true for every state except ACQUISITION_PROVEN
 * @property {string} started_at          ISO timestamp, set before any network I/O
 * @property {string} completed_at        ISO timestamp, set once this source reaches its terminal result
 * @property {number} retry_count         number of this source's own fetches that needed a retry (attempt > 1)
 * @property {Array}  retry_provenance    every fetch attempt's own outcome, always present (possibly empty) — see this package's own FINAL REPORT, "small compatibility adjustment"
 * @property {number} normalized_event_count
 * @property {number} proven_event_count
 * @property {Array}  evidence            every retained document this run fetched, in fetch order — the same retained-evidence objects collectAndProve()/proveCanonicalDetailEvents() already produce, never summarised or discarded
 */

/**
 * Acquire exactly one governed source, end to end, and return one exact
 * structured terminal result. Never throws for an ordinary acquisition
 * failure (network, unresolved programme, unsupported/residue mechanism)
 * — those are always a normal return value; only a genuine programming
 * error (a missing required argument) throws synchronously before any
 * work begins. Safe to call repeatedly, independently, for source A, then
 * source B, then source C — nothing here holds state across calls, and
 * nothing here acquires any source other than the one given.
 *
 * @param {{source_id: string, venue: string, website?: string|null, programme_url?: string|null}} source
 * @param {{fetchDocument: (url: string) => Promise<object>, detailLimit?: number}} options
 * @returns {Promise<SourceAcquisitionResult>}
 */
export async function acquireSource(source, { fetchDocument, detailLimit = 12 } = {}) {
  if (!source?.source_id) throw new Error("acquireSource: source.source_id is required");
  if (typeof fetchDocument !== "function") throw new Error("acquireSource: fetchDocument is required");

  const base = {
    source_id: source.source_id,
    venue: source.venue,
    website: source.website ?? null,
    programme_url: source.programme_url ?? null,
    routes_attempted: [],
    started_at: new Date().toISOString(),
  };
  let programmeUrl = source.programme_url;
  const retryProvenance = [];

  const fetchBounded = async (url, stage) => {
    const outcome = await withRetries(() => fetchDocument(url), {
      maxAttempts: 3,
      onAttempt: ({ attempt, error, willRetry }) => retryProvenance.push({ stage, attempt, error: error ? String(error) : null, will_retry: willRetry }),
    });
    if (!outcome.ok) {
      const error = new Error(String(outcome.error));
      error.stage = stage;
      throw error;
    }
    return outcome.result;
  };

  // Every branch below returns through this — a single place computing
  // retry_count/completed_at/retry_provenance uniformly, so no branch can
  // silently omit them (city-batch.mjs's own prior inline version had two
  // early-return branches that omitted retry_provenance entirely; every
  // branch now always carries it, even when empty — see this package's
  // FINAL REPORT).
  const finalize = (result) => ({
    ...result,
    retry_provenance: retryProvenance,
    retry_count: retryProvenance.filter((attempt) => attempt.attempt > 1).length,
    completed_at: new Date().toISOString(),
  });

  let discovery = null;
  const discoveryEvidence = [];
  if (!programmeUrl) {
    if (!source.website) {
      return finalize({ ...base, state: "PROGRAMME_SOURCE_UNRESOLVED", residue: true, normalized_event_count: 0, proven_event_count: 0, evidence: [] });
    }
    let homepage;
    try {
      homepage = await fetchBounded(source.website, "HOMEPAGE_FETCH");
    } catch (error) {
      return finalize({ ...base, state: "NETWORK_FAILURE", residue: true, error: String(error), network_stage: error.stage, normalized_event_count: 0, proven_event_count: 0, evidence: [] });
    }
    discovery = await resolveProgrammeSource({ homepage, fetchDocument: (url) => fetchBounded(url, "PROGRAMME_CANDIDATE_FETCH") });
    discoveryEvidence.push(homepage);
    if (!discovery.selected) {
      return finalize({ ...base, state: "PROGRAMME_SOURCE_UNRESOLVED", residue: true, programme_discovery: discovery, normalized_event_count: 0, proven_event_count: 0, evidence: discoveryEvidence });
    }
    programmeUrl = discovery.selected.url;
  }

  let programme;
  try {
    programme = await fetchBounded(programmeUrl, "SELECTED_PROGRAMME_FETCH");
  } catch (error) {
    return finalize({ ...base, state: "NETWORK_FAILURE", residue: true, error: String(error), network_stage: error.stage, programme_discovery: discovery, normalized_event_count: 0, proven_event_count: 0, evidence: discoveryEvidence });
  }

  const preliminary = routeProgrammeSource(programme);
  if (!preliminary.selected || preliminary.residue_state) {
    return finalize({
      ...base,
      programme_url: programme.url,
      programme_discovery: discovery,
      fingerprint: preliminary.fingerprint,
      candidate_routes: preliminary.routes,
      routes_attempted: preliminary.selected ? [preliminary.selected] : [],
      collector: preliminary.selected?.mechanism ?? null,
      state: preliminary.residue_state ?? "SOURCE_FINGERPRINT_UNSUPPORTED",
      residue: true,
      normalized_event_count: 0,
      proven_event_count: 0,
      observations: [],
      proofs: [],
      evidence: [...discoveryEvidence, programme],
    });
  }

  const links = programme.status >= 200 && programme.status < 300 ? discoverDetailCandidates(programme, { limit: detailLimit }) : [];
  const details = [];
  for (const link of links) {
    try {
      details.push(await fetchBounded(link.url, "EVENT_DETAIL_FETCH"));
    } catch (error) {
      details.push({ requested_url: link.url, error: String(error), network_stage: error.stage });
    }
  }

  const outcome = collectAndProve({ source_id: source.source_id, venue_name: source.venue, programme, detail_documents: details });
  return finalize({
    ...base,
    programme_url: programme.url,
    programme_discovery: discovery,
    fingerprint: outcome.fingerprint,
    candidate_routes: outcome.routes,
    routes_attempted: outcome.selected ? [outcome.selected] : [],
    collector: outcome.selected?.mechanism ?? null,
    collector_provenance: outcome.collector_provenance,
    state: outcome.state,
    residue: outcome.residue,
    normalized_event_count: outcome.records?.length ?? 0,
    proven_event_count: outcome.observations.length,
    observations: outcome.observations,
    proofs: outcome.proofs,
    evidence: [...discoveryEvidence, programme, ...details],
  });
}
