#!/usr/bin/env node
// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 — the one manual
// entry point this package adds: `npm run acquire:uk-programme`.
//
// EXTRACT CANDIDATE URLS (venues/uk.json's own already-retained evidence,
// zero new network) -> BUILD sources/uk.json (docs/SOURCE_REGISTRY.md
// shape) -> ACQUIRE (ingestion/programme-acquisition/source-execution.mjs's
// acquireSource(), reused completely unchanged — the same generic,
// family-routed engine already driving this repository's other live UK
// acquisition) -> INVESTIGATE (ingestion/uk-programme-acquisition/
// investigation-writer.mjs mechanically derives a real, policy-compliant
// docs/SOURCE_INVESTIGATION_POLICY.md record from each real outcome) ->
// MAP (ingestion/uk-programme-acquisition/build-venue-mapping.mjs, a
// direct 1:1 source->venue mapping, never a fuzzy match) -> CHECKPOINT
// (resumable, durable, one file per source).
//
// Publication is a SEPARATE concern — see acquire-uk-observations.mjs,
// wired into ingestion/publish-map-data/run.mjs and
// ingestion/unattended-runner/run.mjs, which re-runs acquisition live at
// publish time (matching this repository's own existing precedent for
// its other UK acquisition path) rather than reading a stale cache.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildCandidateUrlEstate } from "./extract-candidate-urls.mjs";
import { buildInitialEntry, updateEntryFromAcquisition, deriveSourceId } from "./registry-entries.mjs";
import { selectEvidenceDocuments, checkIdentityMatch, buildInvestigationRecord } from "./investigation-writer.mjs";
import { writeEvidenceFiles, writeAttemptLog } from "./write-evidence.mjs";
import { buildVenueMappingEntry } from "./build-venue-mapping.mjs";
import { runBoundedWithCallback } from "./bounded-runner.mjs";
import { recordSourceCheckpoint, loadSourceCheckpoints, saveRunCheckpoint, TERMINAL_SOURCE_STATUSES } from "./checkpoint.mjs";
import { acquireSource, DEFAULT_DETAIL_LIMIT } from "../programme-acquisition/source-execution.mjs";
import { fetchText } from "../http/fetch.mjs";
import { validateRegistry } from "../../sources/registry/validate.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RESEARCH_DIR = "research/programme-acquisition/uk-national-01";
const UK_VENUES_PATH = "venues/uk.json";
const UK_SOURCES_PATH = "sources/uk.json";
const MAPPINGS_PATH = "venues/source-venue-mappings.json";

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv) {
  const args = { runId: "uk-national-01", concurrency: 12, perHost: 1, limit: null, detailLimit: DEFAULT_DETAIL_LIMIT };
  for (const arg of argv) {
    const m = (flag) => new RegExp(`^--${flag}=(.+)$`).exec(arg)?.[1];
    args.runId = m("run-id") ?? args.runId;
    const concurrency = m("concurrency");
    if (concurrency) args.concurrency = Number(concurrency);
    const perHost = m("per-host");
    if (perHost) args.perHost = Number(perHost);
    const limit = m("limit");
    if (limit) args.limit = Number(limit);
    const detailLimit = m("detail-limit");
    if (detailLimit) args.detailLimit = Number(detailLimit);
  }
  return args;
}

async function loadJson(relativePath) {
  return JSON.parse(await readFile(resolve(ROOT, relativePath), "utf8"));
}

async function loadJsonOrDefault(relativePath, fallback) {
  try {
    return await loadJson(relativePath);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function saveJson(relativePath, data) {
  const fullPath = resolve(ROOT, relativePath);
  await mkdir(dirname(fullPath), { recursive: true });
  await writeFile(fullPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function defaultFetchDocument(url) {
  const response = await fetchText(url);
  return { url: response.url, at: response.retrievedAt, status: response.status, content_type: response.contentType, body: response.text };
}

/** Every proven observation with a genuinely future-dated (or at least today-or-later) start — used to honestly classify regular_future_listings. Never assumes "any observation" implies "upcoming"; a source can genuinely only expose past events. */
function hasFutureDatedEvent(observations, todayDate) {
  return (observations ?? []).some((o) => {
    const date = o.start?.date;
    if (!date) return false;
    return date >= todayDate;
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const startedAt = new Date().toISOString();
  const today = todayIso();
  console.log(`BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01 acquire:uk-programme starting (${startedAt}), run_id=${args.runId}`);

  // ---- Phase 1/2: baseline + candidate URL extraction (zero new network) ----
  const ukVenues = await loadJson(UK_VENUES_PATH);
  const { sources: candidates, skippedSharedWebsite, noWebsite } = buildCandidateUrlEstate(ukVenues.venues);
  console.log(`\n  canonical UK venues: ${ukVenues.venues.length}`);
  console.log(`  candidate sources (real website found): ${candidates.length}`);
  console.log(`  skipped (shared website with another venue): ${skippedSharedWebsite.length}`);
  console.log(`  no website found in already-retained evidence: ${noWebsite.length}`);

  const workingSet = args.limit ? candidates.slice(0, args.limit) : candidates;

  // ---- Build/load sources/uk.json — additive; never overwrites an entry a prior run already produced ----
  const existingRegistry = await loadJsonOrDefault(UK_SOURCES_PATH, { entries: [] });
  const registryById = new Map(existingRegistry.entries.map((e) => [e.id, e]));
  for (const { venue, candidate } of workingSet) {
    const id = deriveSourceId(venue.venue_id);
    if (!registryById.has(id)) {
      registryById.set(id, buildInitialEntry({ venue, website: candidate.url, evidenceKind: candidate.evidence_kind, today }));
    }
  }

  // ---- Checkpoint / resume: skip anything already terminal under this runId ----
  const checkpoints = await loadSourceCheckpoints(args.runId, { root: ROOT });
  const toAcquire = workingSet.filter(({ venue }) => {
    const status = checkpoints.get(deriveSourceId(venue.venue_id))?.status;
    return !TERMINAL_SOURCE_STATUSES.has(status);
  });
  console.log(`\n  already checkpointed (skipped on resume): ${workingSet.length - toAcquire.length}`);
  console.log(`  to acquire this run: ${toAcquire.length}`);

  // ---- Phase 5/6/7: acquire, one real, live attempt per source ----
  const newMappings = [];
  const observationsForPublication = [];
  const admissionCounts = {};
  let completedCount = 0;
  let totalMappingsWritten = 0;

  const workerItems = toAcquire.map(({ venue, candidate }) => {
    const id = deriveSourceId(venue.venue_id);
    return { source_id: id, venue: venue.canonical_name, website: candidate.url, __venue: venue, __candidate: candidate };
  });

  // A real production incident (not a code bug): this long-running process
  // was observed dying silently (exit 0, no stack trace — see
  // scripts/run-uk-programme-acquisition-until-done.sh's own header) partway
  // through the full 1,493-source campaign, more than once. Per-source
  // checkpoints (recordSourceCheckpoint, below) are written immediately and
  // survived every death, but sources/uk.json and venues/source-venue-
  // mappings.json were previously written ONLY ONCE, after the entire loop
  // finished — so a mid-run death silently discarded every registry/mapping
  // update from that run, even for sources whose acquisition had already
  // genuinely completed and been checkpointed as ACQUIRED. This was only
  // discovered afterwards by reconciling checkpoint status against the
  // written registry (36 of 1,493 sources were affected). persistProgress()
  // is now called periodically (not just at the very end) so an
  // unexplained death loses at most one batch of already-completed, already
  // real work, never the whole remainder of the run.
  async function persistProgress() {
    const currentEntries = [...registryById.values()];
    const registryErrors = validateRegistry(currentEntries);
    if (registryErrors.length > 0) {
      console.error(`  [persistProgress] REGISTRY VALIDATION ERRORS (not written this pass): ${JSON.stringify(registryErrors.slice(0, 5))}`);
    } else {
      // Top-level metadata matches every other sources/*.json's own
      // established shape (see e.g. sources/paris.json) — required by
      // ingestion/city-worker/city-estate-catalogue.json's own
      // "uk-all-active" entry, whose own test
      // (tests/city-worker/city-estate-catalogue.test.mjs) asserts a
      // catalogue entry's declared country matches its registry's own
      // top-level country_code, not just validateRegistry()'s own
      // entries-only shape.
      await saveJson(UK_SOURCES_PATH, {
        $schema: "./registry.schema.json",
        region: "United Kingdom",
        country_code: "GB",
        cohort: "BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01",
        cohort_note: "National UK venue programme acquisition: every canonical UK venue with a known official website, investigated via the existing generic, family-routed acquisition engine (ingestion/programme-acquisition/) — see research/programme-acquisition/uk-national-01/ for the full campaign artifacts.",
        entries: currentEntries,
      });
    }
    if (newMappings.length > 0) {
      const existingMappings = await loadJson(MAPPINGS_PATH);
      const existingIds = new Set(existingMappings.mappings.map((m) => `${m.source_id}|${m.source_key_type}|${m.source_key}`));
      const genuinelyNew = newMappings.filter((m) => !existingIds.has(`${m.source_id}|${m.source_key_type}|${m.source_key}`));
      if (genuinelyNew.length > 0) {
        existingMappings.mappings.push(...genuinelyNew);
        await saveJson(MAPPINGS_PATH, existingMappings);
        totalMappingsWritten += genuinelyNew.length;
        // Written mappings must never be re-appended on the next periodic
        // flush or the final one — replace the pending list with only what
        // remains genuinely new against the file just written.
        newMappings.length = 0;
      }
    }
  }

  await runBoundedWithCallback(
    workerItems,
    (item) => acquireSource(item, { fetchDocument: defaultFetchDocument, detailLimit: args.detailLimit }),
    {
      concurrency: args.concurrency,
      perHost: args.perHost,
      onItemComplete: async (item, result, index, crashError) => {
        completedCount += 1;
        const venue = item.__venue;
        const entry = registryById.get(item.source_id);
        const investigatedAt = new Date().toISOString();

        if (crashError) {
          // acquireSource() itself threw instead of returning a residue
          // result (a real, observed gap in its own documented "never
          // throws" contract — see bounded-runner.mjs's own doc comment).
          // This ONE source is recorded honestly and skipped; the
          // campaign must never stop for it (this package's brief, Phase
          // 13). No investigation.json is written for a source that never
          // produced a real, inspectable outcome to derive one from.
          console.error(`  [${item.source_id}] acquireSource() THREW (recorded, skipped, campaign continues): ${crashError.message ?? crashError}`);
          await recordSourceCheckpoint(args.runId, item.source_id, { status: "RESIDUE", state: "ACQUIRE_SOURCE_THREW", error: String(crashError.message ?? crashError) }, { root: ROOT });
          return;
        }

        let evidenceMeta;
        const selectedDocs = selectEvidenceDocuments(result);
        if (selectedDocs.length > 0) {
          const labels = selectedDocs.map((doc, i) => (i === 0 && result.programme_discovery != null && doc.url === item.website) ? "homepage" : i === 0 ? "programme" : `detail-${i}`);
          evidenceMeta = await writeEvidenceFiles({ root: ROOT, sourceId: item.source_id, documents: selectedDocs, labels });
        } else {
          evidenceMeta = await writeAttemptLog({ root: ROOT, sourceId: item.source_id, url: item.website, attemptedAt: investigatedAt, error: result.error ?? result.state });
        }

        const identity = checkIdentityMatch(venue.canonical_name, selectedDocs.length > 0 ? selectedDocs : []);
        const { record, errors } = buildInvestigationRecord({ sourceId: item.source_id, venue, entry, result, evidenceMeta, investigatedAt, identity });

        if (errors.length > 0) {
          // A generator defect on this ONE source must never halt the
          // national campaign (this package's brief, Phase 13/25). Record
          // it honestly and move on; every other source still runs.
          console.error(`  [${item.source_id}] INVESTIGATION GENERATOR ERROR (recorded, skipped, campaign continues): ${errors.join("; ")}`);
          await recordSourceCheckpoint(args.runId, item.source_id, { status: "RESIDUE", state: "INVESTIGATION_GENERATOR_ERROR", errors }, { root: ROOT });
          return;
        }

        await mkdir(resolve(ROOT, "research/source-investigations", item.source_id), { recursive: true });
        await writeFile(resolve(ROOT, "research/source-investigations", item.source_id, "investigation.json"), `${JSON.stringify(record, null, 2)}\n`, "utf8");

        const updatedEntry = updateEntryFromAcquisition(entry, { result, today, hasFutureDatedEvent: hasFutureDatedEvent(result.observations, today) });
        registryById.set(item.source_id, updatedEntry);

        admissionCounts[record.decision.status] = (admissionCounts[record.decision.status] ?? 0) + 1;

        if (record.decision.status === "READY_FOR_ACTIVATION") {
          const mapping = buildVenueMappingEntry({ sourceId: item.source_id, venue, observations: result.observations, officialUrl: entry.official_website, today });
          if (mapping) newMappings.push(mapping);
          observationsForPublication.push(...result.observations.map((o) => ({ ...o, source_id: item.source_id })));
        }

        await recordSourceCheckpoint(args.runId, item.source_id, {
          status: result.residue ? "RESIDUE" : "ACQUIRED",
          state: result.state,
          decision_status: record.decision.status,
          proven_event_count: result.proven_event_count ?? 0,
        }, { root: ROOT });

        if (completedCount % 25 === 0 || completedCount === workerItems.length) {
          console.log(`  [${completedCount}/${workerItems.length}] ${item.source_id}: ${result.state} -> ${record.decision.status} (${result.proven_event_count ?? 0} observations)`);
          await persistProgress();
        }
      },
    },
  );

  // ---- Checkpoint the honest terminal state for every venue this run never even attempted a fetch for ----
  for (const { venue } of skippedSharedWebsite.map((s) => ({ venue: { venue_id: s.venue_id } }))) {
    await recordSourceCheckpoint(args.runId, deriveSourceId(venue.venue_id), { status: "SKIPPED_SHARED_WEBSITE" }, { root: ROOT });
  }
  for (const venueId of noWebsite) {
    await recordSourceCheckpoint(args.runId, deriveSourceId(venueId), { status: "NO_SOURCE_FOUND" }, { root: ROOT });
  }

  // ---- Persist registry + mappings (final, guaranteed flush) ----
  await persistProgress();
  console.log(`\n  wrote ${UK_SOURCES_PATH}: ${registryById.size} entries`);
  console.log(`  wrote ${MAPPINGS_PATH}: +${totalMappingsWritten} new mapping(s) this run`);

  // ---- Research artifacts ----
  const completedAt = new Date().toISOString();
  const allCheckpoints = await loadSourceCheckpoints(args.runId, { root: ROOT });
  const coverageCounts = {};
  for (const cp of allCheckpoints.values()) coverageCounts[cp.status] = (coverageCounts[cp.status] ?? 0) + 1;

  const runSummary = {
    artifact_type: "UK_PROGRAMME_ACQUISITION_RUN_SUMMARY",
    run_id: args.runId,
    started_at: startedAt,
    completed_at: completedAt,
    canonical_uk_venues: ukVenues.venues.length,
    candidate_sources: candidates.length,
    skipped_shared_website: skippedSharedWebsite.length,
    no_website_found: noWebsite.length,
    attempted_this_run: workerItems.length,
    admission_status_counts: admissionCounts,
    coverage_status_counts: coverageCounts,
    new_venue_mappings: totalMappingsWritten,
    proven_observations_this_run: observationsForPublication.length,
  };
  await saveJson(`${RESEARCH_DIR}/run.json`, runSummary);
  await saveJson(`${RESEARCH_DIR}/failures.json`, { skipped_shared_website: skippedSharedWebsite, no_website_found_sample: noWebsite.slice(0, 50), no_website_found_count: noWebsite.length });
  await saveRunCheckpoint(args.runId, runSummary, { root: ROOT });

  console.log(`\n=== acquire:uk-programme summary ===`);
  console.log(JSON.stringify(runSummary, null, 2));

  return runSummary;
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export { main, parseArgs, hasFutureDatedEvent };
