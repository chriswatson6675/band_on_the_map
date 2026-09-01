// BEATMAPPED-LONDON-ALL-VENUE-RECOVERY-AND-FIRST-LIVE-TRANCHE-01
//
// Mechanical, scripted RECOVERY extraction over already-retained governed
// research evidence. This script performs NO live network access, invents
// NO facts, and edits NOTHING outside this worktree. Its only job is to
// read the 270 already-committed/staged investigation.json records (and
// their aggregate acquisition-run evidence files) checked out at
// `.worktrees/london-autonomous-pass-01/research/source-investigations/`
// (branch `work/beatmapped-london-autonomous-pass-01`) and mechanically
// derive one venue-estate row per unique venue.
//
// Read-only inputs (never written to):
//   - <LONDON_SRC>/research/source-investigations/triage-osm-*-london-01/investigation.json  (227)
//   - <LONDON_SRC>/research/source-investigations/london-cand-osm-*-level2-01/investigation.json (32)
//   - <LONDON_SRC>/research/source-investigations/london-*/evidence/*.json (7 aggregate/cohort runs)
//
// Output (written only inside THIS worktree):
//   - research/venue-estate/london-venue-estate-01.json
//   - docs/LONDON_VENUE_ESTATE_01.md (written separately, not by this script)
//   - this script + its own investigation.json (this directory)
//
// Every field that cannot be mechanically derived from the retained JSON is
// recorded as the literal string "UNKNOWN" -- never guessed.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// This worktree (output target).
const THIS_ROOT = path.resolve(__dirname, "..", "..", "..", "..");
// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01: this
// worktree is checked out directly from origin/main (48dd57a), which
// already carries the full 227-triage + 32-Level2 London research corpus
// (it was merged to main independently of the donor branch this package
// otherwise salvages from) -- so the read-only source IS this worktree's
// own research/source-investigations/, not a separate worktree.
const SRC_INV_DIR = path.join(
  THIS_ROOT,
  "research",
  "source-investigations"
);
// Retained for the few spots below that resolve a retained evidence path
// relative to the worktree root rather than SRC_INV_DIR directly.
const LONDON_SRC_ROOT = THIS_ROOT;

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function slugify(name) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// --- 1. Load all 227 Level-1 triage records + 32 Level-2 cand records ----

const allDirs = fs.readdirSync(SRC_INV_DIR);
const triageDirs = allDirs.filter((d) => /^triage-osm-.*-london-01$/.test(d));
const candDirs = allDirs.filter((d) => /^london-cand-osm-.*-level2-01$/.test(d));

const triageById = {};
for (const d of triageDirs) {
  const p = path.join(SRC_INV_DIR, d, "investigation.json");
  const j = readJson(p);
  triageById[j.investigation_id] = j;
}

const candBySupersededId = {};
for (const d of candDirs) {
  const p = path.join(SRC_INV_DIR, d, "investigation.json");
  const j = readJson(p);
  if (!j.supersedes) {
    throw new Error(`Level-2 record ${j.investigation_id} has no supersedes field`);
  }
  candBySupersededId[j.supersedes] = j;
}

const triageIds = Object.keys(triageById);
if (triageIds.length !== 227) {
  throw new Error(`Expected 227 triage records, found ${triageIds.length}`);
}
if (Object.keys(candBySupersededId).length !== 32) {
  throw new Error(
    `Expected 32 Level-2 cand records, found ${Object.keys(candBySupersededId).length}`
  );
}

// One row per unique venue: { level1, level2 (maybe null), current } -- 227 total.
const venues = triageIds.map((tid) => {
  const level1 = triageById[tid];
  const level2 = candBySupersededId[tid] || null;
  const current = level2 || level1;
  return { level1, level2, current };
});

// --- 2. Load aggregate/cohort acquisition-run evidence -------------------

function loadJsonIfExists(...parts) {
  const p = path.join(SRC_INV_DIR, ...parts);
  return fs.existsSync(p) ? readJson(p) : null;
}

const networkRetryCohort = loadJsonIfExists(
  "london-network-retry-cohort-01",
  "evidence",
  "network-retry-cohort.json"
);
const networkCohortIds = new Set(
  (networkRetryCohort?.results || []).map((r) => r.source_id)
);

const cityRun = loadJsonIfExists(
  "london-deterministic-city-batch-01",
  "evidence",
  "city-run.json"
);
const cityRerun = loadJsonIfExists(
  "london-programme-resolution-rerun-01",
  "evidence",
  "city-rerun.json"
);
// city-rerun.json is the later, more complete acquisition run (it is the
// only one whose NETWORK_FAILURE bucket, 20, exactly matches the retained
// network-retry-cohort). Prefer it; fall back to city-run.json per source_id
// only if a source_id is somehow absent from the rerun.
const volumeBySourceId = {};
for (const r of cityRun?.results || []) volumeBySourceId[r.source_id] = r;
for (const r of cityRerun?.results || []) volumeBySourceId[r.source_id] = r;

const detailBackfillAudit = loadJsonIfExists(
  "london-jsonld-detail-backfill-01",
  "evidence",
  "detail-backfill-audit.json"
);
const cohortAudit = loadJsonIfExists(
  "london-stable-identity-offline-proof-01",
  "evidence",
  "cohort-audit.json"
);
const genericBaseline = loadJsonIfExists(
  "london-stable-identity-offline-proof-01",
  "evidence",
  "generic-baseline.json"
);
const secondTranche = loadJsonIfExists(
  "london-stable-identity-offline-proof-01",
  "evidence",
  "second-tranche.json"
);
const remainingProgrammeProven = loadJsonIfExists(
  "london-stable-identity-offline-proof-01",
  "evidence",
  "remaining-programme-proven.json"
);
const configBatch01 = loadJsonIfExists(
  "london-level2-configuration-batch-01",
  "evidence",
  "configuration-batch-01.json"
);
const configBatch02 = loadJsonIfExists(
  "london-level2-configuration-batch-02",
  "evidence",
  "configuration-batch-02.json"
);

// Index the "candidate"-shaped batch files by candidate_id / investigation_id.
const candidateShapedFiles = [
  genericBaseline,
  secondTranche,
  remainingProgrammeProven,
  configBatch01,
  configBatch02,
];
const candidateBySourceId = {};
const candidateByInvestigationId = {};
for (const file of candidateShapedFiles) {
  for (const r of file?.results || []) {
    if (r.candidate?.candidate_id) candidateBySourceId[r.candidate.candidate_id] = r;
    if (r.candidate?.investigation_id)
      candidateByInvestigationId[r.candidate.investigation_id] = r;
  }
}

// detail-backfill-audit.json rows have a real per-event `event_url` --
// direct, retained proof of an individual event page. Index by venue name.
const detailBackfillByVenueName = {};
for (const r of detailBackfillAudit?.results || []) {
  if (r.venue) {
    const key = r.venue.trim().toLowerCase();
    (detailBackfillByVenueName[key] ||= []).push(r);
  }
}

// cohort-audit.json rows also carry a per-event detail_url/original_event_url
// with an explicit decision -- also direct proof. Index by venue name.
const cohortAuditByVenueName = {};
for (const r of cohortAudit?.rows || []) {
  if (r.venue) {
    const key = r.venue.trim().toLowerCase();
    (cohortAuditByVenueName[key] ||= []).push(r);
  }
}

// --- 3. Dead/expired/repurposed-domain detection (mechanical, evidence-based)

function evidencePath(inv, evidenceId) {
  const item = (inv.evidence || []).find((e) => e.evidence_id === evidenceId);
  return item ? path.join(SRC_INV_DIR, "..", "..", item.path) : null;
}

const DEAD_DOMAIN_TITLE_RE =
  /connectyourdomain|website expired|domain (has )?expired|domain for sale|this domain (is )?for sale|parked (domain|free|by)|account (has been )?suspended|page not found - number 90 corporate/i;

function passiveStaticEvidenceFor(inv) {
  // Level-1 triage records name their bounded passive capture "ev-passive-static".
  const ref = (inv.evidence || []).find(
    (e) => e.evidence_id === "ev-passive-static"
  );
  if (!ref) return null;
  const abs = path.resolve(LONDON_SRC_ROOT, ref.path);
  if (!fs.existsSync(abs)) return null;
  try {
    return readJson(abs);
  } catch {
    return null;
  }
}

function looksLikeDeadOrRepurposedDomain(level1) {
  const capture = passiveStaticEvidenceFor(level1);
  if (!capture) return false;
  const resp = (capture.responses || [])[0];
  if (!resp) return false;
  const title = resp.title || "";
  if (DEAD_DOMAIN_TITLE_RE.test(title)) return true;
  // Repurposed domain: final_url resolves to a completely different,
  // unrelated registrable domain than the one requested, and the response
  // is a 404 (e.g. Studio 9294 -> number90corporate.co.uk).
  try {
    const TWO_LABEL_UK_SUFFIXES = new Set([
      "co.uk",
      "org.uk",
      "ac.uk",
      "gov.uk",
      "net.uk",
      "me.uk",
      "ltd.uk",
      "plc.uk",
    ]);
    const registrableRoot = (hostname) => {
      const labels = hostname.split(".");
      const lastTwo = labels.slice(-2).join(".");
      if (labels.length >= 3 && TWO_LABEL_UK_SUFFIXES.has(lastTwo)) {
        return labels.slice(-3).join(".");
      }
      return lastTwo;
    };
    const reqHost = new URL(resp.requested_url.split(";")[0]).hostname.replace(
      /^www\./,
      ""
    );
    const finalHost = new URL(resp.final_url.split(";")[0]).hostname.replace(
      /^www\./,
      ""
    );
    const reqRoot = registrableRoot(reqHost);
    const finalRoot = registrableRoot(finalHost);
    // Only treat as "repurposed" when the registrable *name* itself changes
    // (e.g. studio9294.co.uk -> number90corporate.co.uk) -- not merely the
    // TLD/suffix (e.g. dominiontheatrelondon.org.uk -> dominiontheatrelondon.com,
    // the same brand name under a different suffix, which is not evidence of
    // a dead/repurposed domain).
    const reqName = reqRoot.split(".")[0];
    const finalName = finalRoot.split(".")[0];
    if (reqName !== finalName && resp.status === 404) return true;
  } catch {
    // malformed URL -- not evidence of a repurposed domain, just skip.
  }
  return false;
}

// --- 4. Classification (mechanical, from investigation.json fields only) -

function classify(v) {
  const { current, level1 } = v;
  const blocked = current.probe_history.some((p) => p.outcome === "BLOCKED");
  const acqClass = current.site_classification.acquisition_class;
  const hasDataPaths = (current.data_paths || []).length > 0;

  if (blocked) return "BROWSER_FIRST";
  if (acqClass === "CLIENT_RENDERED" && !hasDataPaths) return "BROWSER_FIRST";

  if (networkCohortIds.has(current.source_candidate_id)) {
    return "NETWORK_NOT_AI_ACTIONABLE";
  }

  if (current.identity.status === "UNKNOWN") {
    if (looksLikeDeadOrRepurposedDomain(level1)) return "NOT_AI_ACTIONABLE";
    return "AI_IDENTITY_RESOLUTION_ELIGIBLE";
  }

  if (
    acqClass === "UNKNOWN" ||
    acqClass === "AMBIGUOUS" ||
    (acqClass === "CLIENT_RENDERED" && hasDataPaths)
  ) {
    return "AI_COLLECTOR_RESOLUTION_ELIGIBLE";
  }

  return "AI_PROGRAMME_RESOLUTION_ELIGIBLE";
}

// --- 5. collector_family_candidate mapping (existing families only) ------

function collectorFamilyCandidate(v) {
  const { current } = v;
  const acqClass = current.site_classification.acquisition_class;
  const recFamily = current.collector_assessment.recommended_family;
  const mechMatch = (current.site_classification.platform || "").match(
    /as ([A-Z_]+)\.?$/
  );
  const mechanism = mechMatch ? mechMatch[1] : null;

  if (acqClass === "ICS") return "ics";
  if (acqClass === "JSON_LD_EVENT") return "json-ld";
  if (acqClass === "KNOWN_CALENDAR_PLUGIN" && mechanism === "WORDPRESS_TRIBE_API") {
    return "events-calendar-api";
  }
  if (acqClass === "STATIC_HTML" && recFamily === "STATIC_EVENT_LIST") {
    return "html-link-discovery";
  }
  if (acqClass === "WORDPRESS") {
    // WORDPRESS_OTHER_API: a WordPress calendar plugin is present but not
    // confirmed as "The Events Calendar" Tribe REST API -- no existing
    // family matches this mechanism with confidence.
    return "SMALL_BESPOKE_REQUIRED";
  }
  if (acqClass === "CLIENT_RENDERED" && mechanism && /EMBEDDED_(NEXT_DATA|NUXT_STATE)/.test(mechanism)) {
    // Framework-embedded state exists (found statically, no browser needed
    // to fetch the bytes) but neither Next.js's __NEXT_DATA__ nor Nuxt's
    // window.__NUXT__ encoding matches ingestion/sveltekit-data/decode.mjs,
    // which is documented as specific to SvelteKit's own devalue-encoded
    // __data.json route-data convention. No existing family fits.
    return "SMALL_BESPOKE_REQUIRED";
  }
  return "UNKNOWN";
}

// --- 6. Per-venue extraction ----------------------------------------------

const STATUS_PRIORITY = { CONFIRMED: 3, CANDIDATE: 2, REJECTED: 1, UNKNOWN: 0 };

function bestDataPath(dataPaths) {
  if (!dataPaths || dataPaths.length === 0) return null;
  return [...dataPaths].sort(
    (a, b) => (STATUS_PRIORITY[b.status] || 0) - (STATUS_PRIORITY[a.status] || 0)
  )[0];
}

function osmRefFromSourceCandidateId(id) {
  // "reconciled-cand-osm-node-10046185259" -> "osm-node-10046185259"
  const m = id.match(/^reconciled-cand-(osm-(?:node|way|relation)-\d+)$/);
  return m ? m[1] : "UNKNOWN";
}

function splitVenueReference(ref) {
  const idx = ref.indexOf(" — ");
  if (idx === -1) return { name: ref.trim(), address: "UNKNOWN" };
  return {
    name: ref.slice(0, idx).trim(),
    address: ref.slice(idx + 3).trim(),
  };
}

function individualEventUrlsAvailableSource(v) {
  // Returns { value: true|false|"UNKNOWN", citation: string|null }
  const nameKey = splitVenueReference(v.level1.venue_reference).name.toLowerCase();
  if (detailBackfillByVenueName[nameKey]) {
    return { value: true, citation: "london-jsonld-detail-backfill-01/evidence/detail-backfill-audit.json" };
  }
  if (cohortAuditByVenueName[nameKey]) {
    return { value: true, citation: "london-stable-identity-offline-proof-01/evidence/cohort-audit.json" };
  }
  // Candidate-shaped batch files: a proven programme (list) page is
  // evidenced by candidate.programmeState === "FUTURE_PROGRAMME_PROVEN",
  // but that alone does not prove a distinct per-event detail URL was
  // retained -- kept honestly UNKNOWN rather than inferred true.
  const cs =
    candidateBySourceId[v.current.source_candidate_id] ||
    candidateByInvestigationId[v.current.investigation_id] ||
    candidateByInvestigationId[v.level1.investigation_id];
  if (cs?.candidate?.programmeState === "FUTURE_PROGRAMME_PROVEN") {
    return {
      value: "UNKNOWN",
      citation:
        "programme list page proven (candidate.programmeState=FUTURE_PROGRAMME_PROVEN) but no distinct per-event URL retained in aggregate evidence",
    };
  }
  return { value: "UNKNOWN", citation: null };
}

function currentEventVolumeEstimate(v) {
  const rec = volumeBySourceId[v.current.source_candidate_id];
  if (!rec) return "UNKNOWN";
  if (typeof rec.proven_event_count === "number") return rec.proven_event_count;
  if (typeof rec.normalized_event_count === "number") return rec.normalized_event_count;
  return "UNKNOWN";
}

function blockerFor(classification) {
  switch (classification) {
    case "NETWORK_NOT_AI_ACTIONABLE":
      return "NETWORK_BLOCKED";
    case "BROWSER_FIRST":
      return "BROWSER_REQUIRED";
    case "NOT_AI_ACTIONABLE":
    case "AI_IDENTITY_RESOLUTION_ELIGIBLE":
      return "IDENTITY_UNRESOLVED";
    case "AI_COLLECTOR_RESOLUTION_ELIGIBLE":
      return "COLLECTOR_FAMILY_UNRESOLVED";
    default:
      return "NONE";
  }
}

function researchConfidence(current) {
  return `IDENTITY:${current.identity.confidence} / CLASSIFICATION:${current.site_classification.confidence}`;
}

function notesFor(v, classification, eventUrlCitation) {
  const parts = [];
  const lastProbe = v.current.probe_history[v.current.probe_history.length - 1];
  if (lastProbe) parts.push(`probe_history: ${lastProbe.reason}`);
  if (v.current.decision.reasons?.[0]) {
    parts.push(`decision: ${v.current.decision.reasons[0]}`);
  }
  if (v.level2) {
    parts.push(
      `Level-2 record ${v.level2.investigation_id} supersedes Level-1 ${v.level1.investigation_id}.`
    );
  }
  if (eventUrlCitation) parts.push(`individual_event_urls_available: ${eventUrlCitation}`);
  return parts.join(" | ");
}

const outVenues = venues.map((v) => {
  const { level1, level2, current } = v;
  const { name, address } = splitVenueReference(level1.venue_reference);
  const dp = bestDataPath(current.data_paths);
  const classification = classify(v);
  const eventUrls = individualEventUrlsAvailableSource(v);

  const investigationIds = level2
    ? [level2.investigation_id, level1.investigation_id]
    : [level1.investigation_id];

  return {
    venue_name: name,
    venue_slug: slugify(name),
    osm_ref: osmRefFromSourceCandidateId(current.source_candidate_id),
    investigation_ids: investigationIds,
    official_website: current.official_url || level1.official_url || "UNKNOWN",
    official_programme_url: dp ? dp.url : "UNKNOWN",
    programme_url_status: dp ? dp.status : "UNKNOWN",
    address_text_from_evidence: address,
    latitude: "UNKNOWN",
    longitude: "UNKNOWN",
    existing_research_found: true,
    previous_classification: current.site_classification.acquisition_class,
    current_research_classification: classification,
    collector_family_candidate: collectorFamilyCandidate(v),
    existing_collector_reusable:
      collectorFamilyCandidate(v) === "UNKNOWN" ||
      collectorFamilyCandidate(v) === "SMALL_BESPOKE_REQUIRED"
        ? false
        : true,
    detail_pages_available: dp ? (dp.status === "CONFIRMED" ? true : dp.status === "CANDIDATE" ? "UNKNOWN" : false) : "UNKNOWN",
    individual_event_urls_available: eventUrls.value,
    current_event_volume_estimate: currentEventVolumeEstimate(v),
    research_confidence: researchConfidence(current),
    activation_readiness: current.decision.status,
    blocker: blockerFor(classification),
    notes: notesFor(v, classification, eventUrls.citation),
  };
});

// --- 7. Write output -------------------------------------------------------

const output = {
  $schema_note:
    "LONDON-VENUE-ESTATE-01 — mechanical RECOVERY of already-retained " +
    "BOTM-SOURCE-INVESTIGATION-v1.2 evidence produced on branch " +
    "work/beatmapped-london-autonomous-pass-01 " +
    "(.worktrees/london-autonomous-pass-01/research/source-investigations/), " +
    "not new web research. Every field is derived mechanically from that " +
    "retained JSON (270 investigation directories covering 227 unique " +
    "venues, plus 7 aggregate acquisition-run evidence files) by " +
    "research/source-investigations/beatmapped-london-all-venue-recovery-01/" +
    "evidence/extract-london-venue-estate.mjs. No live network request was " +
    "made. 'UNKNOWN' means genuinely not resolvable from the retained JSON " +
    "-- never a guess. See docs/LONDON_VENUE_ESTATE_01.md for methodology.",
  researched_at: new Date().toISOString().slice(0, 10),
  region: "Greater London (227 unique venues recovered from OSM-seeded candidate triage)",
  venues: outVenues,
};

const outPath = path.join(
  THIS_ROOT,
  "research",
  "venue-estate",
  "london-venue-estate-01.json"
);
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(output, null, 2) + "\n");

// Also retain a byte-identical copy under this investigation's own governed
// evidence/ directory (research/source-investigations/.../evidence/), since
// evidence[].path must resolve under research/source-investigations/ per
// docs/SOURCE_INVESTIGATION_POLICY.md's no-scratchpad rule -- the canonical
// research/venue-estate/ path above is the project's normal house-style
// location for this deliverable, not itself a governed-evidence path.
const evidenceCopyPath = path.join(__dirname, "london-venue-estate-01.json");
fs.writeFileSync(evidenceCopyPath, JSON.stringify(output, null, 2) + "\n");

// --- 8. Summary stats (printed for the investigation record / report) ----

const classCounts = {};
for (const ov of outVenues) {
  classCounts[ov.current_research_classification] =
    (classCounts[ov.current_research_classification] || 0) + 1;
}
const familyCounts = {};
for (const ov of outVenues) {
  familyCounts[ov.collector_family_candidate] =
    (familyCounts[ov.collector_family_candidate] || 0) + 1;
}
const withProgrammeUrl = outVenues.filter(
  (ov) => ov.official_programme_url !== "UNKNOWN"
).length;
const withConfirmedProgrammeUrl = outVenues.filter(
  (ov) => ov.programme_url_status === "CONFIRMED"
).length;
const withVolumeEstimate = outVenues.filter(
  (ov) => ov.current_event_volume_estimate !== "UNKNOWN"
).length;
const withNonZeroVolume = outVenues.filter(
  (ov) =>
    typeof ov.current_event_volume_estimate === "number" &&
    ov.current_event_volume_estimate > 0
).length;

console.log("Total unique venues:", outVenues.length);
console.log("Classification counts:", classCounts);
console.log("Collector family candidate counts:", familyCounts);
console.log("Venues with a non-UNKNOWN official_programme_url:", withProgrammeUrl);
console.log("Venues with programme_url_status CONFIRMED:", withConfirmedProgrammeUrl);
console.log("Venues with a numeric current_event_volume_estimate:", withVolumeEstimate);
console.log("Venues with current_event_volume_estimate > 0:", withNonZeroVolume);
console.log(
  "Venues with individual_event_urls_available === true:",
  outVenues.filter((ov) => ov.individual_event_urls_available === true).length
);
console.log("Output written to:", outPath);
