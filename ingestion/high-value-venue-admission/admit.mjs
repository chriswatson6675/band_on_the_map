#!/usr/bin/env node
// BEATMAPPED-UK-HIGH-VALUE-VENUE-CANONICAL-ADMISSION-09 — admit the
// governed high-value venue population into the canonical UK registry.
//
// THE ONE INPUT
// -------------
// research/high-value-venue-estate/uk-1000plus-08-identity/admission-ready.json
//
// That file is the product of a four-package research programme
// (coverage in 05/06/07, identity in 08). Every row in it was proven
// confirmed >=1,000, permanent, a unique real-world identity, and absent
// from the canonical estate. Nothing else may be admitted here: not the
// four identity holds, not the 114 capacity-unverified candidates.
//
// THIS PACKAGE ADDS NO NEW ADMISSION ARCHITECTURE
// ------------------------------------------------
// The repository already has a governed venue-admission path, proven by
// the 249 venues admitted from the earlier major-event census. This
// module reuses all three of its primitives unchanged:
//
//   ingestion/venue/contract.mjs         createVenueId(), validateVenue()
//   ingestion/uk-venue-onboarding/dedupe.mjs   findExistingMatch()
//   venues/uk.json                       append-only source of truth
//
// All this module adds is the adapter between the Package 08 row shape
// and those primitives, plus the audit trail. venues/uk.json is SOURCE OF
// TRUTH, not generated output: every existing entry is carried through
// untouched and only genuinely new venue_ids are appended, exactly as
// ingestion/uk-venue-onboarding/run.mjs does.
//
// WHAT IS DELIBERATELY *NOT* WRITTEN INTO CANON
// ----------------------------------------------
// Coordinates. None of the 536 rows carries one, so every admitted venue
// is UNRESOLVED or ADDRESS_ONLY and a later, evidence-checked geocoding
// pass (ingestion/geocoding/run-uk.mjs) may promote it. Capacity: the
// canonical Venue contract has no capacity semantics and this package
// does not invent any — the qualifying evidence stays in the research
// corpus and is referenced from the admission evidence note.
//
// Pure and dependency-free apart from those imports. No network calls.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createVenueId, validateVenue } from "../venue/contract.mjs";
import { findExistingMatch, domainOf } from "../uk-venue-onboarding/dedupe.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export const ADMISSION_INPUT_PATH =
  "research/high-value-venue-estate/uk-1000plus-08-identity/admission-ready.json";
export const UK_REGISTRY_PATH = "venues/uk.json";
export const AUDIT_DIR = "research/high-value-venue-estate/uk-1000plus-09-admission";

export const PREDECESSOR_PACKAGE = "BEATMAPPED-UK-HIGH-VALUE-VENUE-IDENTITY-GATE-08";
export const PREDECESSOR_MAIN_SHA = "3cb2a4c5f70ce7b042235dffc09dfbb66d77aba5";

// The exact admission population Package 08 handed over. If the input
// does not hold exactly this, the run stops before any canonical write —
// a silently different population is the one thing that must never reach
// the registry.
export const EXPECTED_ADMISSION_ROWS = 536;

// Every canonical registry an admission row must be deduped against, not
// just the UK one. Hardcoded and explicit, mirroring
// ingestion/uk-venue-onboarding/run.mjs's own precedent rather than a
// directory glob that could pick up venues/manual-coordinates.json or
// venues/source-venue-mappings.json (neither of which is a registry).
export const EXISTING_REGISTRY_PATHS = Object.freeze([
  "venues/uk.json",
  "venues/london.json",
  "venues/barcelona.json",
  "venues/berlin.json",
  "venues/lisbon.json",
  "venues/paris.json",
  "venues/porto.json",
]);

// The four Package 08 identity holds. Named here as data so the
// exclusion is mechanically checkable rather than a matter of trusting
// that they were filtered out upstream.
export const IDENTITY_HOLD_NAMES = Object.freeze([
  "AMT Headingley Rugby Stadium",
  "Liverpool Experience Campus",
  "Newcastle Greyhound Stadium",
  "Owlerton Greyhound Stadium",
]);

export const ADMISSION_EVIDENCE_KIND = "UK_HIGH_VALUE_VENUE_ADMISSION_09";
export const OFFICIAL_WEBSITE_EVIDENCE_KIND = "OFFICIAL_VENUE_WEBSITE";

const SPORT_CLASSES = ["STADIUM", "RACECOURSE", "FOOTBALL_GROUND", "RUGBY_UNION_GROUND", "RUGBY_LEAGUE_GROUND", "CRICKET_GROUND", "ATHLETICS_STADIUM", "MOTORSPORT_VENUE", "ICE_HOCKEY_ARENA", "BASKETBALL_ARENA", "MULTI_SPORT_ARENA", "OTHER_PERMANENT_SPECTATOR_SPORT"];
const CONFERENCE_CLASSES = ["CONFERENCE_CENTRE", "CONVENTION_CENTRE", "EXHIBITION_CENTRE", "MAJOR_HOTEL_EVENT_VENUE", "UNIVERSITY_EVENT_VENUE"];

export function segmentFor(venueClass) {
  if (SPORT_CLASSES.includes(venueClass)) return "SPORT";
  if (CONFERENCE_CLASSES.includes(venueClass)) return "CONFERENCE_EXHIBITION";
  return "ARTS_MUSIC_GENERAL";
}

function loadJson(repoRoot, relativePath) {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), "utf8"));
}

/**
 * Adapt one Package 08 admission row into the shape the EXISTING
 * governed dedupe (ingestion/uk-venue-onboarding/dedupe.mjs) expects.
 *
 * This is the whole of the "new capability" this package adds: a field
 * mapping. The matching logic itself is reused unchanged, so a venue that
 * the earlier census admission would have recognised as already canonical
 * is recognised here too, by exactly the same rules.
 */
export function toDedupeShape(row) {
  return {
    venue_census_id: row.unique_entity_id,
    canonical_name: row.canonical_name_candidate,
    city: row.locality,
    official_url: row.official_website_url ?? null,
    // Package 08 rows carry no street address — see buildAdmissionEvidence().
    address: null,
  };
}

/**
 * Guard against a SHARED OPERATOR DOMAIN false positive.
 *
 * The existing dedupe treats an official-domain match as the strongest
 * possible signal, which is right for a venue with its own domain. It is
 * wrong when one operator hosts many DISTINCT venues on one domain,
 * separated only by path — and this corpus contains exactly that case.
 *
 * All Jockey Club racecourses live on thejockeyclub.co.uk. The canonical
 * estate holds Newmarket Racecourses at /newmarket/. Without this guard,
 * Cheltenham (/cheltenham/), Epsom (/epsom/) and Aintree (/aintree/) each
 * "match" Newmarket on hostname alone — which would silently suppress
 * three legitimate admissions AND assert that Cheltenham is Newmarket.
 * Package 08 diagnosed this same artifact and resolved it by the path;
 * this applies the same discrimination at admission time.
 *
 * The rule is narrow and fails towards KEEPING the match: it only rejects
 * when BOTH sides carry a specific, non-trivial path and those paths
 * differ. A venue whose official URL is the domain root (path "/") is
 * unaffected — which is why the genuine Eventim Apollo match, whose
 * admission URL is a bare root, is correctly preserved.
 *
 * Implemented here rather than in ingestion/uk-venue-onboarding/dedupe.mjs
 * because that module is shared with an already-merged package; this
 * package narrows the decision for its own input without changing
 * matching behaviour for anyone else.
 */
function specificPathOf(url) {
  try {
    let path = new URL(url).pathname;
    while (path.endsWith("/")) path = path.slice(0, -1);
    return path === "" || path === "/" ? null : path.toLowerCase();
  } catch {
    return null;
  }
}

export function isSharedOperatorDomainFalsePositive(row, existingVenue) {
  const rowPath = specificPathOf(row.official_website_url);
  if (rowPath === null) return false;

  const rowHost = domainOf(row.official_website_url);
  if (!rowHost) return false;

  // Only consider the existing venue's evidence URLs on the SAME host.
  const sameHostPaths = (existingVenue.evidence ?? [])
    .filter((item) => domainOf(item?.url) === rowHost)
    .map((item) => specificPathOf(item.url))
    .filter((path) => path !== null);

  if (sameHostPaths.length === 0) return false;

  // If any same-host evidence URL shares this row's path, it is the same
  // venue. Otherwise every one of them points somewhere else on a shared
  // operator domain, and this is a different venue.
  return !sameHostPaths.includes(rowPath);
}

/**
 * Does this row's official website have a page that was actually FETCHED
 * during identity research?
 *
 * Only an exact URL match counts. A same-host match is not enough: the
 * fetched page might be a different page on the same domain, and
 * labelling that OFFICIAL_VENUE_WEBSITE would overstate what was
 * verified. Of the 536 rows, 405 carry an official URL but only a small
 * minority clear this bar — the rest keep their URL in the admission
 * evidence note instead, which claims nothing about verification.
 */
export function hasFetchedOfficialSite(row) {
  const official = row.official_website_url;
  if (typeof official !== "string" || official.trim() === "") return false;
  return (row.identity_evidence ?? []).some(
    (item) => item?.kind === "FETCHED_URL" && item.url === official,
  );
}

/**
 * Build the evidence array for one admitted venue.
 *
 * Always exactly one admission-provenance entry, naming the Package 08
 * entity and the Package 07 lineage, so every canonical venue this
 * package mints is traceable back to the research that justified it —
 * even though the Venue contract itself stores no research lineage field.
 *
 * Plus, only where genuinely earned, one OFFICIAL_VENUE_WEBSITE entry.
 * Third-party fixture, league, ticketing and social pages are never
 * promoted to that kind.
 */
export function buildAdmissionEvidence(row) {
  const capacity = Number.isFinite(row.capacity_max) ? row.capacity_max : null;
  const postcodeNote = row.postcode ? ` Postcode evidenced in research: ${row.postcode}.` : "";
  const operatorNote = row.operator_name ? ` Operator: ${row.operator_name}.` : "";

  const evidence = [
    {
      url: row.official_website_url ?? null,
      kind: ADMISSION_EVIDENCE_KIND,
      note:
        `Admitted from the governed UK high-value venue estate ` +
        `(${ADMISSION_INPUT_PATH}), unique_entity_id="${row.unique_entity_id}", ` +
        `package07_research_ids=${JSON.stringify(row.package07_research_ids ?? [])}, ` +
        `venue_class=${row.venue_class}, permanence=${row.permanence_class}.` +
        (capacity !== null
          ? ` Qualified on confirmed capacity ${capacity}${row.capacity_kind ? ` (${row.capacity_kind})` : ""}, evidenced at ${row.capacity_evidence_ref ?? "reference not recorded"} — capacity itself is retained in the research corpus, not in the Venue contract.`
          : "") +
        operatorNote +
        postcodeNote,
    },
  ];

  if (hasFetchedOfficialSite(row)) {
    const fetched = (row.identity_evidence ?? []).find(
      (item) => item?.kind === "FETCHED_URL" && item.url === row.official_website_url,
    );
    evidence.push({
      url: row.official_website_url,
      kind: OFFICIAL_WEBSITE_EVIDENCE_KIND,
      note:
        `This venue's own official page, fetched during Package 08 identity research: ` +
        `${fetched?.note ?? "no note recorded"}`,
    });
  }

  return evidence;
}

/**
 * Build one canonical Venue from one admission row.
 *
 * Every admitted venue is UNRESOLVED: Package 08 carries no coordinates
 * and no street addresses, so claiming ADDRESS_ONLY would require an
 * address this package does not have and must not invent. UNRESOLVED is
 * the contract's honest state for exactly this case, and a later
 * geocoding pass can promote it. Throws via validateVenue() rather than
 * ever emitting a contract violation.
 */
export function buildCanonicalVenue(row) {
  const venue = {
    venue_id: createVenueId(row.canonical_name_candidate, row.locality),
    canonical_name: row.canonical_name_candidate,
    country_code: "GB",
    city: row.locality,
    municipality: row.locality,
    address: null,
    latitude: null,
    longitude: null,
    location_status: "UNRESOLVED",
    evidence: buildAdmissionEvidence(row),
  };

  const errors = validateVenue(venue);
  if (errors.length > 0) {
    throw new Error(
      `buildCanonicalVenue produced an invalid Venue for ${row.unique_entity_id}: ${errors.join("; ")}`,
    );
  }
  return venue;
}

/**
 * Validate the admission input before anything else happens.
 *
 * The brief's hard input rule: if the population is not exactly what
 * Package 08 handed over, stop before any canonical write rather than
 * silently admitting a different set.
 */
export function validateAdmissionInput(input) {
  const errors = [];
  const rows = Array.isArray(input?.venues) ? input.venues : null;

  if (rows === null) return ["admission-ready.json has no venues array"];
  if (input.count !== rows.length) {
    errors.push(`admission-ready.json declares count=${input.count} but holds ${rows.length} rows`);
  }
  if (rows.length !== EXPECTED_ADMISSION_ROWS) {
    errors.push(
      `admission input holds ${rows.length} rows but Package 08 handed over ${EXPECTED_ADMISSION_ROWS} — refusing to admit a different population`,
    );
  }

  const seenEntity = new Set();
  const seenResearch = new Set();
  for (const row of rows) {
    if (!row.unique_entity_id) {
      errors.push("an admission row has no unique_entity_id");
      continue;
    }
    if (seenEntity.has(row.unique_entity_id)) {
      errors.push(`duplicate unique_entity_id "${row.unique_entity_id}" in the admission input`);
    }
    seenEntity.add(row.unique_entity_id);

    for (const rid of row.package07_research_ids ?? []) {
      if (seenResearch.has(rid)) {
        errors.push(`Package 07 research row "${rid}" appears in more than one admission row`);
      }
      seenResearch.add(rid);
    }

    if (!row.canonical_name_candidate) errors.push(`${row.unique_entity_id} has no canonical_name_candidate`);
    if (!row.locality) errors.push(`${row.unique_entity_id} has no locality`);
    if (!Number.isInteger(row.capacity_max) || row.capacity_max < 1000) {
      errors.push(`${row.unique_entity_id} is not confirmed >=1,000 (capacity_max=${row.capacity_max})`);
    }
    if (!row.permanence_class) errors.push(`${row.unique_entity_id} has no permanence_class`);
    if (!Array.isArray(row.identity_evidence) || row.identity_evidence.length === 0) {
      errors.push(`${row.unique_entity_id} has no identity evidence — admitting it would be a blind mint`);
    }
    if (row.canonical_venue_id) {
      errors.push(`${row.unique_entity_id} already carries a canonical_venue_id — it is not missing from canon`);
    }
    if (IDENTITY_HOLD_NAMES.includes(row.canonical_name_candidate)) {
      errors.push(
        `${row.unique_entity_id} ("${row.canonical_name_candidate}") is a Package 08 identity HOLD and must never be admitted`,
      );
    }
  }

  return errors;
}

/**
 * The deterministic dry run. Produces the full admission plan without
 * writing anything, so the decision to mutate the canonical registry is
 * made against a reviewed plan rather than discovered mid-write.
 */
export function planAdmission({ repoRoot = ROOT } = {}) {
  const input = loadJson(repoRoot, ADMISSION_INPUT_PATH);
  const inputErrors = validateAdmissionInput(input);
  const rows = Array.isArray(input?.venues) ? input.venues : [];

  const registries = {};
  for (const path of EXISTING_REGISTRY_PATHS) {
    registries[path] = existsSync(join(repoRoot, path)) ? loadJson(repoRoot, path) : { venues: [] };
  }
  const ukRegistry = registries[UK_REGISTRY_PATH];
  const baselineUkCount = ukRegistry.venues.length;
  const allExisting = Object.values(registries).flatMap((r) => r.venues ?? []);
  const existingUkIds = new Set(ukRegistry.venues.map((v) => v.venue_id));

  const alreadyCanonical = [];
  const sharedDomainRejections = [];
  const invalid = [];
  const idCollisions = [];
  const identityCollisions = [];
  const safeAdmissions = [];

  // Track the ids this plan would mint, so two admission rows that would
  // collapse onto one venue_id are caught here rather than silently
  // overwriting each other at write time.
  const plannedIds = new Map();
  const plannedIdentities = new Map();

  for (const row of rows) {
    // 1. is it already canonical, by the EXISTING governed dedupe rules?
    let match = findExistingMatch(toDedupeShape(row), allExisting);
    // A domain match on a shared operator domain is not an identity match.
    // Reject it and re-run WITHOUT the official URL, so the name+city and
    // address rules still get their chance to find a genuine match.
    if (match && match.method === "OFFICIAL_DOMAIN_MATCH" && isSharedOperatorDomainFalsePositive(row, match.existing)) {
      sharedDomainRejections.push({
        unique_entity_id: row.unique_entity_id,
        canonical_name_candidate: row.canonical_name_candidate,
        official_website_url: row.official_website_url,
        would_have_matched: match.existing.venue_id,
        reason:
          "hostname matched but the paths identify different venues on a shared operator domain — not the same real-world venue",
      });
      match = findExistingMatch({ ...toDedupeShape(row), official_url: null }, allExisting);
    }
    if (match) {
      alreadyCanonical.push({
        unique_entity_id: row.unique_entity_id,
        canonical_name_candidate: row.canonical_name_candidate,
        locality: row.locality,
        existing_venue_id: match.existing.venue_id,
        existing_canonical_name: match.existing.canonical_name,
        method: match.method,
        effect: "NOT admitted — the existing canonical venue is reused, never duplicated",
      });
      continue;
    }

    // 2. can it be represented truthfully under the Venue contract?
    let venue;
    try {
      venue = buildCanonicalVenue(row);
    } catch (error) {
      invalid.push({
        unique_entity_id: row.unique_entity_id,
        canonical_name_candidate: row.canonical_name_candidate,
        problem: error.message,
        effect: "HELD — cannot be represented truthfully under the Venue contract",
      });
      continue;
    }

    // 3. would its id collide with an existing canonical venue?
    if (existingUkIds.has(venue.venue_id)) {
      idCollisions.push({
        unique_entity_id: row.unique_entity_id,
        venue_id: venue.venue_id,
        collides_with: "an existing venues/uk.json entry",
        effect: "HELD — minting would overwrite or duplicate an existing canonical id",
      });
      continue;
    }

    // 4. would it collide with another row in this same plan?
    if (plannedIds.has(venue.venue_id)) {
      idCollisions.push({
        unique_entity_id: row.unique_entity_id,
        venue_id: venue.venue_id,
        collides_with: plannedIds.get(venue.venue_id),
        effect: "HELD — two admission rows derive the same canonical id",
      });
      continue;
    }

    const identityKey = `${(row.canonical_name_candidate ?? "").toLowerCase()}|${(row.locality ?? "").toLowerCase()}`;
    if (plannedIdentities.has(identityKey)) {
      identityCollisions.push({
        unique_entity_id: row.unique_entity_id,
        identity_key: identityKey,
        collides_with: plannedIdentities.get(identityKey),
        effect: "HELD — two admission rows describe the same real-world identity",
      });
      continue;
    }

    plannedIds.set(venue.venue_id, row.unique_entity_id);
    plannedIdentities.set(identityKey, row.unique_entity_id);
    safeAdmissions.push({ row, venue });
  }

  return {
    input,
    inputErrors,
    rows,
    registries,
    baselineUkCount,
    safeAdmissions,
    alreadyCanonical,
    sharedDomainRejections,
    invalid,
    idCollisions,
    identityCollisions,
    expectedFinalUkCount: baselineUkCount + safeAdmissions.length,
    green:
      inputErrors.length === 0 &&
      invalid.length === 0 &&
      idCollisions.length === 0 &&
      identityCollisions.length === 0,
  };
}

/**
 * Apply the plan to venues/uk.json.
 *
 * Append-only: every existing entry is carried through by reference,
 * untouched. Nothing is reordered, rewritten or removed. The caller is
 * expected to have checked plan.green first; this refuses otherwise.
 */
export function applyAdmission(plan, { repoRoot = ROOT } = {}) {
  if (!plan.green) {
    throw new Error("refusing to apply an admission plan that is not green — resolve the dry-run problems first");
  }
  const existing = plan.registries[UK_REGISTRY_PATH].venues;
  const added = plan.safeAdmissions.map((entry) => entry.venue);
  const registry = { venues: [...existing, ...added] };

  writeFileSync(join(repoRoot, UK_REGISTRY_PATH), `${JSON.stringify(registry, null, 2)}\n`, "utf8");
  return { baseline: existing.length, added: added.length, total: registry.venues.length };
}

// ---------------------------------------------------------------------
// Audit artifacts
// ---------------------------------------------------------------------
function tally(rows, keyFn) {
  const out = {};
  for (const row of rows) {
    const key = keyFn(row);
    if (key == null) continue;
    out[key] = (out[key] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function writeArtifact(outDir, filename, payload) {
  writeFileSync(join(outDir, filename), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export function emitAuditArtifacts(plan, applied, { repoRoot = ROOT, generatedAt } = {}) {
  const outDir = join(repoRoot, AUDIT_DIR);
  mkdirSync(outDir, { recursive: true });

  const meta = {
    package: "BEATMAPPED-UK-HIGH-VALUE-VENUE-CANONICAL-ADMISSION-09",
    generated_at: generatedAt,
    predecessor_package: PREDECESSOR_PACKAGE,
    predecessor_main_sha: PREDECESSOR_MAIN_SHA,
  };

  const admittedRows = plan.safeAdmissions.map((e) => e.row);
  const admittedVenues = plan.safeAdmissions.map((e) => e.venue);

  writeArtifact(outDir, "manifest.json", {
    ...meta,
    what_this_is:
      "Canonical admission of the governed UK high-value venue estate. This package admits venue IDENTITY only — " +
      "no events, no programme acquisition, no capacity schema.",
    sole_input: ADMISSION_INPUT_PATH,
    canonical_source_of_truth: UK_REGISTRY_PATH,
    admission_path:
      "Reuses the repository's existing governed primitives unchanged: createVenueId()/validateVenue() from " +
      "ingestion/venue/contract.mjs, findExistingMatch() from ingestion/uk-venue-onboarding/dedupe.mjs, and the " +
      "append-only venues/uk.json write established by ingestion/uk-venue-onboarding/run.mjs. The only new code " +
      "is the field adapter between the Package 08 row shape and those primitives.",
    id_generation_rule: "createVenueId(canonical_name, city) -> venue-<slug(city)>-<slug(name)> — deterministic and readable, never a UUID.",
    location_status_rule:
      "Every admitted venue is UNRESOLVED. Package 08 carries no coordinates and no street addresses, so any other " +
      "status would require data this package does not have and must not invent. A later evidence-checked geocoding " +
      "pass (ingestion/geocoding/run-uk.mjs) may promote them.",
    capacity_rule:
      "The canonical Venue contract has no capacity semantics and this package invents none. The qualifying >=1,000 " +
      "evidence stays in the research corpus and is referenced from each admitted venue's admission evidence note.",
    what_was_not_admitted: {
      identity_holds: IDENTITY_HOLD_NAMES,
      capacity_unverified_candidates: "The 114 Package 07 capacity-unverified high-value candidates are outside this package entirely.",
    },
    predecessor_artifacts_consumed: [
      { path: ADMISSION_INPUT_PATH, role: "The sole admission population.", records: plan.rows.length, mutated: false },
      { path: "research/high-value-venue-estate/uk-1000plus-05", role: "Lineage only.", mutated: false },
      { path: "research/high-value-venue-estate/uk-1000plus-06", role: "Lineage only.", mutated: false },
      { path: "research/high-value-venue-estate/uk-1000plus-07", role: "Lineage only.", mutated: false },
    ],
    canonical_registry_effect: applied
      ? { baseline: applied.baseline, added: applied.added, total: applied.total, existing_entries_modified: 0, existing_entries_removed: 0 }
      : { note: "dry run only — no canonical write performed" },
  });

  writeArtifact(outDir, "input-snapshot.json", {
    ...meta,
    description: "What the admission input declared at the moment this package consumed it.",
    path: ADMISSION_INPUT_PATH,
    declared_count: plan.input.count,
    observed_rows: plan.rows.length,
    expected_rows: EXPECTED_ADMISSION_ROWS,
    input_errors: plan.inputErrors,
    by_nation: tally(plan.rows, (r) => r.nation),
    by_segment: tally(plan.rows, (r) => segmentFor(r.venue_class)),
    by_venue_class: tally(plan.rows, (r) => r.venue_class),
  });

  writeArtifact(outDir, "dry-run.json", {
    ...meta,
    description: "The deterministic admission plan, computed before any canonical write.",
    input_rows: plan.rows.length,
    safe_new_admissions: plan.safeAdmissions.length,
    already_canonical: plan.alreadyCanonical.length,
    id_collisions: plan.idCollisions.length,
    identity_collisions: plan.identityCollisions.length,
    invalid_venue_records: plan.invalid.length,
    held_or_rejected: plan.alreadyCanonical.length + plan.invalid.length + plan.idCollisions.length + plan.identityCollisions.length,
    baseline_canonical_uk_venues: plan.baselineUkCount,
    expected_final_canonical_uk_venues: plan.expectedFinalUkCount,
    green: plan.green,
  });

  writeArtifact(outDir, "admission-decisions.json", {
    ...meta,
    description: "One decision per admission-input row, so every row is accounted for.",
    count: plan.rows.length,
    decisions: plan.rows.map((row) => {
      const admitted = plan.safeAdmissions.find((e) => e.row.unique_entity_id === row.unique_entity_id);
      const existing = plan.alreadyCanonical.find((e) => e.unique_entity_id === row.unique_entity_id);
      const held = [...plan.invalid, ...plan.idCollisions, ...plan.identityCollisions].find(
        (e) => e.unique_entity_id === row.unique_entity_id,
      );
      return {
        unique_entity_id: row.unique_entity_id,
        canonical_name_candidate: row.canonical_name_candidate,
        locality: row.locality,
        nation: row.nation,
        venue_class: row.venue_class,
        decision: admitted ? "ADMITTED" : existing ? "ALREADY_CANONICAL" : held ? "HELD" : "UNACCOUNTED",
        canonical_venue_id: admitted?.venue.venue_id ?? existing?.existing_venue_id ?? null,
        reason: admitted
          ? "No existing canonical match by official domain, name+city or address; minted a new canonical venue."
          : existing?.effect ?? held?.effect ?? "no decision recorded",
      };
    }),
  });

  writeArtifact(outDir, "admitted-venues.json", {
    ...meta,
    description: "The canonical Venue records this package minted, exactly as written to venues/uk.json.",
    count: admittedVenues.length,
    by_nation: tally(admittedRows, (r) => r.nation),
    by_segment: tally(admittedRows, (r) => segmentFor(r.venue_class)),
    by_venue_class: tally(admittedRows, (r) => r.venue_class),
    by_location_status: tally(admittedVenues, (v) => v.location_status),
    with_official_website_evidence: admittedVenues.filter((v) =>
      v.evidence.some((e) => e.kind === OFFICIAL_WEBSITE_EVIDENCE_KIND),
    ).length,
    venues: admittedVenues,
  });

  writeArtifact(outDir, "canonical-id-map.json", {
    ...meta,
    description:
      "The provenance bridge: every minted canonical venue_id mapped back to its Package 08 unique entity and " +
      "Package 07 research rows. The Venue contract stores no research lineage field, so this artifact is where " +
      "that traceability lives.",
    count: plan.safeAdmissions.length,
    mappings: plan.safeAdmissions.map((e) => ({
      venue_id: e.venue.venue_id,
      canonical_name: e.venue.canonical_name,
      unique_entity_id: e.row.unique_entity_id,
      package07_research_ids: e.row.package07_research_ids,
      package07_provenance: e.row.package07_provenance,
      venue_class: e.row.venue_class,
      capacity_max: e.row.capacity_max,
      capacity_evidence_ref: e.row.capacity_evidence_ref,
    })),
  });

  writeArtifact(outDir, "already-canonical.json", {
    ...meta,
    description:
      "Admission rows that turned out to already exist in a canonical registry at this package's fresh-main " +
      "preflight. These are NOT admitted — the existing canonical venue is reused, never duplicated.",
    count: plan.alreadyCanonical.length,
    by_method: tally(plan.alreadyCanonical, (e) => e.method),
    rows: plan.alreadyCanonical,
    shared_operator_domain_matches_rejected: {
      note:
        "Hostname matches that were REJECTED because the paths identify different venues on one operator's domain. " +
        "Accepting them would have suppressed a legitimate admission and asserted two distinct venues were one.",
      count: plan.sharedDomainRejections.length,
      rejections: plan.sharedDomainRejections,
    },
  });

  writeArtifact(outDir, "held-or-rejected.json", {
    ...meta,
    description:
      "Admission rows not minted for any reason other than already being canonical. A hold is the safe direction: " +
      "a venue not admitted can be admitted later, a venue wrongly minted is a canonical duplicate.",
    count: plan.invalid.length + plan.idCollisions.length + plan.identityCollisions.length,
    invalid_venue_records: plan.invalid,
    canonical_id_collisions: plan.idCollisions,
    real_world_identity_collisions: plan.identityCollisions,
    identity_holds_excluded_upstream: {
      note: "These four never entered the admission input at all — Package 08 held them. Listed so the exclusion is visible here too.",
      names: IDENTITY_HOLD_NAMES,
    },
  });

  return { outDir };
}

// ---------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------
function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  let generatedAt = new Date().toISOString();
  const atIndex = args.indexOf("--generated-at");
  if (atIndex !== -1 && args[atIndex + 1]) generatedAt = args[atIndex + 1];

  const plan = planAdmission();

  console.log(`[admit09] input rows ......................... ${plan.rows.length} (expected ${EXPECTED_ADMISSION_ROWS})`);
  console.log(`[admit09] baseline canonical UK venues ....... ${plan.baselineUkCount}`);
  console.log(`[admit09] SAFE NEW ADMISSIONS ................ ${plan.safeAdmissions.length}`);
  console.log(`[admit09] already canonical .................. ${plan.alreadyCanonical.length}`);
  console.log(`[admit09] id collisions ...................... ${plan.idCollisions.length}`);
  console.log(`[admit09] identity collisions ................ ${plan.identityCollisions.length}`);
  console.log(`[admit09] invalid venue records .............. ${plan.invalid.length}`);
  console.log(`[admit09] expected final canonical count ..... ${plan.expectedFinalUkCount}`);
  console.log(`[admit09] dry-run green ...................... ${plan.green}`);

  if (plan.inputErrors.length > 0) {
    console.error(`[admit09] INPUT ERRORS (${plan.inputErrors.length}) — refusing to proceed:`);
    for (const e of plan.inputErrors.slice(0, 20)) console.error(`  - ${e}`);
    process.exitCode = 1;
    return;
  }

  if (!apply) {
    emitAuditArtifacts(plan, null, { generatedAt });
    console.log(`[admit09] dry run only — no canonical write. Audit written to ${AUDIT_DIR}.`);
    if (!plan.green) process.exitCode = 1;
    return;
  }

  if (!plan.green) {
    console.error("[admit09] REFUSING TO WRITE — dry run is not green.");
    process.exitCode = 1;
    return;
  }

  const applied = applyAdmission(plan);
  emitAuditArtifacts(plan, applied, { generatedAt });
  console.log(`[admit09] APPLIED: ${applied.baseline} + ${applied.added} = ${applied.total} canonical UK venues.`);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
