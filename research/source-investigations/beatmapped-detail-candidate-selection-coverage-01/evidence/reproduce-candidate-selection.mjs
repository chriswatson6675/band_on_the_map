// BEATMAPPED-DETAIL-CANDIDATE-SELECTION-COVERAGE-01 — bounded, live,
// deterministic reproduction of CURRENT detail-candidate selection
// (production's exact acquireSource() path) versus a PROPOSED
// normalized-record-driven selection, for the 8 Berlin sources this
// package investigates.
//
// Network shape: for each source, one programme GET, then up to
// detailLimit (12) detail GETs for the CURRENT selection (via the real,
// unmodified acquireSource()) and up to detailLimit (12) further detail
// GETs for the PROPOSED selection (computed here, not wired into any
// production module). No more than 12 additional detail GETs per source
// per run, exactly matching production's own configured detailLimit.
// Real UA string, 20s timeout, no retries beyond acquireSource's own
// existing bounded retry policy, no browser, no AI interpretation of page
// content — every judgement below is mechanical (URL resolution,
// same-origin check, date comparison).
//
// This script imports and calls ONLY existing, unmodified repository
// code for the CURRENT path (acquireSource, collectAndProve). The
// PROPOSED candidate selection is a pure, local function
// (proposedCandidatesFromRecords) that reuses the exact same URL
// resolution/same-origin semantics discovery.mjs already applies
// (extractJsonLdEventLinks) — it invents no new dedupe/equivalence rule.

import { acquireSource } from "../../../../ingestion/programme-acquisition/source-execution.mjs";
import { collectAndProve } from "../../../../ingestion/programme-acquisition/orchestrator.mjs";
import { extractProgrammeLinks, extractJsonLdEventLinks } from "../../../../ingestion/programme-acquisition/discovery.mjs";
import { discoverEmbeddedStateDetailLinks } from "../../../../ingestion/embedded-state/collector.mjs";
import { proofDateFromStartDate } from "../../../../ingestion/programme-acquisition/proof-date.mjs";
import { fetchText, USER_AGENT } from "../../../../ingestion/http/fetch.mjs";
import fs from "node:fs";

const DETAIL_LIMIT = 12;

// Reuses (never duplicates) this repository's own production fetch helper,
// ingestion/http/fetch.mjs's fetchText() — the SAME function
// ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs's
// defaultFetchDocument() wraps for real, live production acquisition. In
// particular this never truncates the response body — an earlier draft of
// this script truncated bodies to 300000 chars, which silently discarded
// Tempodrom's own JSON-LD block (full page ~712000 chars) and produced a
// false BROWSER_REQUIRED residue; using the real production fetch path
// avoids reproducing that measurement bug.
async function fetchDocument(url) {
  const response = await fetchText(url, { timeoutMs: 20000 });
  return {
    requested_url: url,
    url: response.url,
    at: response.retrievedAt,
    status: response.status,
    content_type: response.contentType,
    body: response.text,
  };
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

/** Resolve a normalized record's own event_url to an absolute URL, exactly
 * the same resolution discovery.mjs's own eventUrl()/extractJsonLdEventLinks
 * already perform (relative-to-document-url, hash stripped). Returns null
 * when the record carries no usable URL. */
function resolveCandidateUrl(record) {
  if (typeof record?.event_url !== "string" || !record.event_url.trim()) return null;
  try {
    const url = new URL(record.event_url, record.source_document_url ?? record.event_url);
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}

/**
 * PROPOSED (not yet wired into production): derive bounded detail
 * candidates from already-normalized event records rather than from raw
 * page links. Applies the SAME first-party restriction discovery.mjs's
 * extractJsonLdEventLinks already applies (same-origin, http(s) only),
 * excludes the "no url published at all" fallback case (where the record's
 * resolved URL degenerates to the programme page itself), dedupes by exact
 * resolved URL (first occurrence wins — the same Map-based semantics
 * orchestrator.mjs's uniqueLinks() already uses), then orders
 * deterministically by the record's own proven cutoff-date ascending
 * (soonest first), tie-broken by original discovery order — never by
 * runtime randomness, network timing, insertion accident beyond original
 * document order, or the machine clock.
 */
function proposedCandidatesFromRecords(records, programmeUrl, limit) {
  const origin = new URL(programmeUrl).origin;
  const eligible = [];
  records.forEach((record, index) => {
    const abs = resolveCandidateUrl(record);
    if (!abs) return;
    let parsed;
    try {
      parsed = new URL(abs);
    } catch {
      return;
    }
    if (!/^https?:$/.test(parsed.protocol)) return;
    if (parsed.origin !== origin) return; // first-party / same-origin only
    if (abs === programmeUrl) return; // degenerate fallback (node published no url at all)
    const date = proofDateFromStartDate(record.start_raw);
    eligible.push({ url: abs, title: record.title ?? null, date, index, source_record_id: record.source_record_id ?? null });
  });
  const byUrl = new Map();
  for (const item of eligible) if (!byUrl.has(item.url)) byUrl.set(item.url, item);
  const deduped = [...byUrl.values()];
  deduped.sort((a, b) => {
    if (a.date !== b.date) {
      if (!a.date) return 1;
      if (!b.date) return -1;
      return a.date < b.date ? -1 : 1;
    }
    return a.index - b.index;
  });
  return {
    eligible_unique_total: deduped.length,
    eligible_records_total: eligible.length,
    ordered: deduped,
    selected: deduped.slice(0, limit).map((item) => ({ url: item.url, text: item.title, role: "NORMALIZED_RECORD_EVENT_URL_CANDIDATE" })),
  };
}

async function sourceUrls(list) {
  return list.map((d) => d.url ?? d.requested_url).filter(Boolean);
}

async function run() {
  const report = { generated_at: new Date().toISOString(), detail_limit: DETAIL_LIMIT, sources: {} };

  for (const source of SOURCES) {
    process.stderr.write(`=== ${source.source_id} ===\n`);

    // --- CURRENT production path, unmodified, real network calls ---
    const oldRun = await acquireSource(source, { fetchDocument, detailLimit: DETAIL_LIMIT });
    const programmeDoc = oldRun.evidence?.[0] ?? null;
    const oldDetailDocs = (oldRun.evidence ?? []).slice(1);
    const oldCandidateUrls = await sourceUrls(oldDetailDocs);

    if (!programmeDoc || typeof programmeDoc.body !== "string") {
      report.sources[source.source_id] = {
        source, old_run_state: oldRun.state, error: "programme document unavailable/non-text; skipping candidate analysis",
      };
      continue;
    }

    // Pure, zero-network baseline: normalized records from the programme
    // document ALONE (independent of which 12 detail docs happened to be
    // fetched), via the exact same collectAndProve() production uses.
    const baseline = collectAndProve({ source_id: source.source_id, venue_name: source.venue, programme: programmeDoc, detail_documents: [] });
    if (!Array.isArray(baseline.records)) {
      report.sources[source.source_id] = {
        source, old_run_state: oldRun.state, baseline_state: baseline.state, baseline_selected: baseline.selected,
        error: "routing/collector residue on programme-only baseline; no normalized records to analyze",
      };
      process.stderr.write(`${source.source_id}: RESIDUE at baseline (${baseline.state}) — skipping candidate analysis\n`);
      continue;
    }

    const rawAnchorLinks = extractProgrammeLinks(programmeDoc.body, { baseUrl: programmeDoc.url, limit: 1000 });
    const rawJsonLdLinks = extractJsonLdEventLinks(programmeDoc.body, { baseUrl: programmeDoc.url, limit: 1000 });
    const rawEmbeddedLinks = discoverEmbeddedStateDetailLinks(programmeDoc, { limit: 1000 });

    const proposed = proposedCandidatesFromRecords(baseline.records, programmeDoc.url, DETAIL_LIMIT);
    const oldSet = new Set(oldCandidateUrls);
    const eligibleUrls = new Set(proposed.ordered.map((item) => item.url));

    const recordsWithUsableUrl = proposed.eligible_records_total; // count of records (pre-dedup) with a usable first-party url
    const uniqueUsableUrls = proposed.eligible_unique_total;
    const usableAmongOldCandidates = [...eligibleUrls].filter((url) => oldSet.has(url)).length;
    const missedDespiteUsable = uniqueUsableUrls - usableAmongOldCandidates;

    // --- PROPOSED path: fetch the (<=12) normalized-record-driven
    // candidates live, then run the SAME unmodified proof engine
    // (collectAndProve) against them. Nothing about proof logic changes.
    const newDetailDocs = [];
    for (const candidate of proposed.selected) {
      try {
        newDetailDocs.push(await fetchDocument(candidate.url));
      } catch (error) {
        newDetailDocs.push({ requested_url: candidate.url, error: String(error) });
      }
    }
    const newResult = collectAndProve({ source_id: source.source_id, venue_name: source.venue, programme: programmeDoc, detail_documents: newDetailDocs });

    const oldProvenIds = new Set((oldRun.observations ?? []).map((o) => o.source_record_id));
    const newProvenIds = new Set((newResult.observations ?? []).map((o) => o.source_record_id));
    const additionalIds = [...newProvenIds].filter((id) => !oldProvenIds.has(id));
    const lostIds = [...oldProvenIds].filter((id) => !newProvenIds.has(id));
    const unionIds = new Set([...oldProvenIds, ...newProvenIds]);

    const newCandidateUrls = proposed.selected.map((c) => c.url);
    const candidateOverlap = newCandidateUrls.filter((url) => oldSet.has(url));

    report.sources[source.source_id] = {
      source,
      routing_mechanism: baseline.selected?.mechanism ?? null,
      programme_url: programmeDoc.url,
      raw_discovery: {
        anchor_links_found: rawAnchorLinks.length,
        json_ld_event_links_found: rawJsonLdLinks.length,
        embedded_state_links_found: rawEmbeddedLinks.length,
      },
      normalized: {
        normalized_record_count: baseline.records.length,
        records_with_usable_first_party_url: recordsWithUsableUrl,
        unique_usable_first_party_urls: uniqueUsableUrls,
      },
      old_selection: {
        candidate_count: oldCandidateUrls.length,
        candidate_urls: oldCandidateUrls,
        usable_normalized_urls_among_old_candidates: usableAmongOldCandidates,
        usable_normalized_urls_missed: missedDespiteUsable,
        proof_count: oldRun.proofs?.length ?? 0,
        final_proven_count: oldRun.proven_event_count,
        state: oldRun.state,
      },
      proposed_selection: {
        candidate_count: newCandidateUrls.length,
        candidate_urls: newCandidateUrls,
        overlap_with_old_candidates: candidateOverlap.length,
        proof_count: newResult.proofs?.length ?? 0,
        final_proven_count: newResult.observations.length,
        state: newResult.state,
      },
      comparison: {
        old_final_proven_ids: [...oldProvenIds],
        new_final_proven_ids: [...newProvenIds],
        additional_ids_gained: additionalIds,
        ids_lost: lostIds,
        union_proven_count: unionIds.size,
        net_additional_proofs: additionalIds.length - lostIds.length,
      },
    };
    process.stderr.write(`${source.source_id}: normalized=${baseline.records.length} old_proven=${oldRun.proven_event_count} new_proven=${newResult.observations.length} gained=${additionalIds.length} lost=${lostIds.length}\n`);
  }

  fs.writeFileSync(new URL("./candidate-selection-results.json", import.meta.url), `${JSON.stringify(report, null, 2)}\n`);
  console.log("done — wrote candidate-selection-results.json");
}

await run();
