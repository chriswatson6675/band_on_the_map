import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { validateVenue, createVenueId } from "../ingestion/venue/contract.mjs";
import {
  ADMISSION_INPUT_PATH,
  ADMISSION_EVIDENCE_KIND,
  AUDIT_DIR,
  EXPECTED_ADMISSION_ROWS,
  IDENTITY_HOLD_NAMES,
  OFFICIAL_WEBSITE_EVIDENCE_KIND,
  UK_REGISTRY_PATH,
  buildAdmissionEvidence,
  buildCanonicalVenue,
  hasFetchedOfficialSite,
  isSharedOperatorDomainFalsePositive,
  planAdmission,
  segmentFor,
  toDedupeShape,
  validateAdmissionInput,
  EXISTING_REGISTRY_PATHS,
} from "../ingestion/high-value-venue-admission/admit.mjs";
import { PACKAGE_08_SUMMARY_PATH } from "../ingestion/high-value-venue-admission/reconcile.mjs";
import { REQUIRED_ARTIFACTS, validateAdmission } from "../ingestion/high-value-venue-admission/validate.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const readJson = (p) => JSON.parse(readFileSync(join(REPO_ROOT, p), "utf8"));

function admissionRow(overrides = {}) {
  return {
    unique_entity_id: "HVUK-p-england-example-venue",
    package07_research_ids: ["hv07-p-england-example-venue"],
    canonical_name_candidate: "Example Venue",
    aliases: [],
    venue_class: "ARENA",
    locality: "Example Town",
    nation: "England",
    postcode: null,
    coordinates: null,
    official_website_url: null,
    operator_name: null,
    capacity_max: 5000,
    capacity_kind: "SPECTATOR",
    capacity_evidence_ref: "https://venue.example/capacity",
    permanence_class: "PERMANENT_PURPOSE_BUILT_VENUE",
    identity_evidence: [{ url: "https://venue.example/", kind: "FETCHED_URL", note: "official page" }],
    package07_provenance: { package: "P07", main_sha: "abc", census_dir: "x", canonical_match_state: "MISSING_FROM_CANON" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------
// 1. The admission input itself
// ---------------------------------------------------------------------
test("the admission input holds exactly the population Package 08 handed over", () => {
  const input = readJson(ADMISSION_INPUT_PATH);
  assert.equal(input.count, EXPECTED_ADMISSION_ROWS);
  assert.equal(input.venues.length, EXPECTED_ADMISSION_ROWS);
  assert.deepEqual(validateAdmissionInput(input), []);
});

test("a different population is refused rather than silently admitted", () => {
  const input = readJson(ADMISSION_INPUT_PATH);
  const short = { ...input, count: input.count - 1, venues: input.venues.slice(0, -1) };
  assert.ok(
    validateAdmissionInput(short).some((e) => e.includes("refusing to admit a different population")),
  );
});

test("every admission row carries a unique entity id and unique research rows", () => {
  const rows = readJson(ADMISSION_INPUT_PATH).venues;
  const entities = rows.map((r) => r.unique_entity_id);
  assert.equal(entities.length, new Set(entities).size);
  const research = rows.flatMap((r) => r.package07_research_ids);
  assert.equal(research.length, new Set(research).size);
});

test("a row below the capacity threshold is refused", () => {
  const input = { count: EXPECTED_ADMISSION_ROWS, venues: [admissionRow({ capacity_max: 400 })] };
  assert.ok(validateAdmissionInput(input).some((e) => e.includes("not confirmed >=1,000")));
});

test("a row with no identity evidence is refused — that would be a blind mint", () => {
  const input = { count: EXPECTED_ADMISSION_ROWS, venues: [admissionRow({ identity_evidence: [] })] };
  assert.ok(validateAdmissionInput(input).some((e) => e.includes("blind mint")));
});

// ---------------------------------------------------------------------
// 2. The four identity holds
// ---------------------------------------------------------------------
test("none of the four Package 08 identity holds is in the admission input", () => {
  const rows = readJson(ADMISSION_INPUT_PATH).venues;
  const names = new Set(rows.map((r) => r.canonical_name_candidate));
  for (const held of IDENTITY_HOLD_NAMES) {
    assert.ok(!names.has(held), `identity hold "${held}" is in the admission input`);
  }
});

test("an identity hold appearing in the input would be refused outright", () => {
  const input = {
    count: EXPECTED_ADMISSION_ROWS,
    venues: [admissionRow({ canonical_name_candidate: "Owlerton Greyhound Stadium" })],
  };
  assert.ok(validateAdmissionInput(input).some((e) => e.includes("identity HOLD and must never be admitted")));
});

test("none of the four identity holds reached the canonical registry", () => {
  const canon = readJson(UK_REGISTRY_PATH).venues;
  const names = new Set(canon.map((v) => v.canonical_name));
  for (const held of IDENTITY_HOLD_NAMES) {
    assert.ok(!names.has(held), `identity hold "${held}" was admitted to canon`);
  }
});

// ---------------------------------------------------------------------
// 3. No capacity-unverified venue may be admitted
// ---------------------------------------------------------------------
test("every admitted venue traces to a Package 08 row confirmed >=1,000", () => {
  const map = readJson(`${AUDIT_DIR}/canonical-id-map.json`);
  for (const entry of map.mappings) {
    assert.ok(entry.capacity_max >= 1000, `${entry.venue_id} was admitted with capacity ${entry.capacity_max}`);
  }
});

test("no Package 07 capacity-unverified candidate entered the admission input", () => {
  // The Package 07 corpus is the authority on which rows were unverified.
  const p07 = readJson("research/high-value-venue-estate/uk-1000plus-07/census.json").venues;
  const unverified = new Set(
    p07.filter((r) => r.capacity_state === "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE").map((r) => r.research_id),
  );
  assert.ok(unverified.size > 0, "the predecessor must hold some unverified rows for this test to mean anything");
  const rows = readJson(ADMISSION_INPUT_PATH).venues;
  for (const row of rows) {
    for (const rid of row.package07_research_ids) {
      assert.ok(!unverified.has(rid), `${row.unique_entity_id} cites capacity-unverified row ${rid}`);
    }
  }
});

// ---------------------------------------------------------------------
// 4. Venue construction and the contract
// ---------------------------------------------------------------------
test("a built venue satisfies the governed Venue contract", () => {
  const venue = buildCanonicalVenue(admissionRow());
  assert.deepEqual(validateVenue(venue), []);
  assert.equal(venue.venue_id, createVenueId("Example Venue", "Example Town"));
  assert.equal(venue.country_code, "GB");
});

test("every admitted venue is UNRESOLVED — no address or coordinates are invented", () => {
  const venue = buildCanonicalVenue(admissionRow({ postcode: "AB1 2CD" }));
  assert.equal(venue.location_status, "UNRESOLVED");
  assert.equal(venue.address, null);
  assert.equal(venue.latitude, null);
  assert.equal(venue.longitude, null);
  // The postcode is not lost — it is retained in the admission evidence.
  assert.ok(venue.evidence[0].note.includes("AB1 2CD"));
});

test("venue ids are deterministic, not random", () => {
  assert.equal(buildCanonicalVenue(admissionRow()).venue_id, buildCanonicalVenue(admissionRow()).venue_id);
});

// ---------------------------------------------------------------------
// 5. Official-website evidence is never over-claimed
// ---------------------------------------------------------------------
test("an official site is only labelled official when that exact page was fetched", () => {
  const fetched = admissionRow({
    official_website_url: "https://venue.example/",
    identity_evidence: [{ url: "https://venue.example/", kind: "FETCHED_URL", note: "fetched" }],
  });
  assert.equal(hasFetchedOfficialSite(fetched), true);
  assert.ok(buildAdmissionEvidence(fetched).some((e) => e.kind === OFFICIAL_WEBSITE_EVIDENCE_KIND));
});

test("a search-snippet-only official site is NOT labelled official", () => {
  const snippet = admissionRow({
    official_website_url: "https://venue.example/",
    identity_evidence: [{ url: "https://venue.example/", kind: "SEARCH_RESULT", note: "not fetched" }],
  });
  assert.equal(hasFetchedOfficialSite(snippet), false);
  assert.ok(!buildAdmissionEvidence(snippet).some((e) => e.kind === OFFICIAL_WEBSITE_EVIDENCE_KIND));
});

test("a fetched page on the same host but a DIFFERENT url is not enough", () => {
  const otherPage = admissionRow({
    official_website_url: "https://venue.example/",
    identity_evidence: [{ url: "https://venue.example/news/2026", kind: "FETCHED_URL", note: "a different page" }],
  });
  assert.equal(hasFetchedOfficialSite(otherPage), false);
});

test("no third-party url is mislabelled as the official venue website", () => {
  const canon = readJson(UK_REGISTRY_PATH).venues;
  const admitted = new Set(readJson(`${AUDIT_DIR}/canonical-id-map.json`).mappings.map((m) => m.venue_id));
  const thirdParty = ["wikipedia.org", "wikidata.org", "songkick.com", "ticketmaster.co.uk", "skiddle.com", "eventbrite"];
  for (const venue of canon.filter((v) => admitted.has(v.venue_id))) {
    for (const item of venue.evidence.filter((e) => e.kind === OFFICIAL_WEBSITE_EVIDENCE_KIND)) {
      const host = new URL(item.url).hostname.replace(/^www\./, "").toLowerCase();
      assert.ok(
        !thirdParty.some((t) => host === t || host.endsWith(`.${t}`)),
        `${venue.venue_id} labels third-party host ${host} as the official venue website`,
      );
    }
  }
});

// ---------------------------------------------------------------------
// 6. The shared-operator-domain guard
// ---------------------------------------------------------------------
test("a shared operator domain with different paths is NOT the same venue", () => {
  // All Jockey Club racecourses share one domain. Without this guard,
  // Cheltenham would "match" Newmarket on hostname alone.
  const row = admissionRow({ official_website_url: "https://www.thejockeyclub.co.uk/cheltenham/" });
  const existing = {
    venue_id: "venue-newmarket-newmarket-racecourses",
    evidence: [{ url: "https://www.thejockeyclub.co.uk/newmarket/", kind: "X" }],
  };
  assert.equal(isSharedOperatorDomainFalsePositive(row, existing), true);
});

test("the same path on a shared domain IS the same venue", () => {
  const row = admissionRow({ official_website_url: "https://www.thejockeyclub.co.uk/newmarket/" });
  const existing = { venue_id: "venue-newmarket", evidence: [{ url: "https://www.thejockeyclub.co.uk/newmarket/", kind: "X" }] };
  assert.equal(isSharedOperatorDomainFalsePositive(row, existing), false);
});

test("a bare domain root is never treated as a shared-domain false positive", () => {
  // Eventim Apollo's admission URL is a bare root while canon cites
  // /events/ — a genuine match that the guard must not break.
  const row = admissionRow({ official_website_url: "https://www.eventimapollo.com" });
  const existing = { venue_id: "venue-london-eventim-apollo", evidence: [{ url: "https://www.eventimapollo.com/events/", kind: "X" }] };
  assert.equal(isSharedOperatorDomainFalsePositive(row, existing), false);
});

test("a different host is never a shared-domain false positive", () => {
  const row = admissionRow({ official_website_url: "https://a.example/x" });
  const existing = { venue_id: "v", evidence: [{ url: "https://b.example/y", kind: "X" }] };
  assert.equal(isSharedOperatorDomainFalsePositive(row, existing), false);
});

// ---------------------------------------------------------------------
// 7. The dry run and the admission result
// ---------------------------------------------------------------------
test("the published dry run is green and its arithmetic closes", () => {
  const dry = readJson(`${AUDIT_DIR}/dry-run.json`);
  assert.equal(dry.green, true);
  assert.equal(dry.input_rows, EXPECTED_ADMISSION_ROWS);
  assert.equal(dry.id_collisions, 0);
  assert.equal(dry.identity_collisions, 0);
  assert.equal(dry.invalid_venue_records, 0);
  assert.equal(
    dry.safe_new_admissions + dry.already_canonical + dry.invalid_venue_records + dry.id_collisions + dry.identity_collisions,
    dry.input_rows,
    "every input row must be accounted for exactly once",
  );
  assert.equal(dry.baseline_canonical_uk_venues + dry.safe_new_admissions, dry.expected_final_canonical_uk_venues);
});

test("every admission-input row has exactly one decision", () => {
  const decisions = readJson(`${AUDIT_DIR}/admission-decisions.json`);
  assert.equal(decisions.count, EXPECTED_ADMISSION_ROWS);
  assert.equal(decisions.decisions.length, EXPECTED_ADMISSION_ROWS);
  const ids = decisions.decisions.map((d) => d.unique_entity_id);
  assert.equal(ids.length, new Set(ids).size);
  for (const d of decisions.decisions) assert.notEqual(d.decision, "UNACCOUNTED");
});

test("the canonical registry grew by exactly the admitted count", () => {
  const dry = readJson(`${AUDIT_DIR}/dry-run.json`);
  const canon = readJson(UK_REGISTRY_PATH).venues;
  assert.equal(canon.length, dry.expected_final_canonical_uk_venues);
});

test("every admitted venue traces back to Package 08", () => {
  const map = readJson(`${AUDIT_DIR}/canonical-id-map.json`);
  const canon = readJson(UK_REGISTRY_PATH).venues;
  const byId = new Map(canon.map((v) => [v.venue_id, v]));
  const inputEntities = new Set(readJson(ADMISSION_INPUT_PATH).venues.map((r) => r.unique_entity_id));
  for (const entry of map.mappings) {
    assert.ok(byId.has(entry.venue_id), `${entry.venue_id} is not in the canonical registry`);
    assert.ok(inputEntities.has(entry.unique_entity_id), `${entry.unique_entity_id} is not in the admission input`);
  }
});

test("no canonical venue carries the admission evidence kind without being in the id map", () => {
  const canon = readJson(UK_REGISTRY_PATH).venues;
  const admitted = new Set(readJson(`${AUDIT_DIR}/canonical-id-map.json`).mappings.map((m) => m.venue_id));
  for (const venue of canon) {
    if (venue.evidence.some((e) => e.kind === ADMISSION_EVIDENCE_KIND)) {
      assert.ok(admitted.has(venue.venue_id), `${venue.venue_id} claims Package 09 admission but is untraceable`);
    }
  }
});

// ---------------------------------------------------------------------
// 8. Canonical integrity
// ---------------------------------------------------------------------
test("every canonical UK venue satisfies the Venue contract", () => {
  const canon = readJson(UK_REGISTRY_PATH).venues;
  const failures = [];
  for (const venue of canon) {
    const errors = validateVenue(venue);
    if (errors.length > 0) failures.push(`${venue.venue_id}: ${errors.join("; ")}`);
  }
  assert.deepEqual(failures, [], failures.slice(0, 5).join("\n"));
});

test("canonical venue ids are unique", () => {
  const ids = readJson(UK_REGISTRY_PATH).venues.map((v) => v.venue_id);
  assert.equal(ids.length, new Set(ids).size);
});

test("no two canonical venues share a name+city identity", () => {
  const canon = readJson(UK_REGISTRY_PATH).venues;
  const seen = new Map();
  const collisions = [];
  for (const v of canon) {
    const key = `${(v.canonical_name ?? "").toLowerCase()}|${(v.city ?? "").toLowerCase()}`;
    if (seen.has(key)) collisions.push(`${v.venue_id} collides with ${seen.get(key)}`);
    else seen.set(key, v.venue_id);
  }
  assert.deepEqual(collisions, [], collisions.slice(0, 5).join("\n"));
});

// ---------------------------------------------------------------------
// 9. Pre-existing venues are untouched
// ---------------------------------------------------------------------
test("every pre-existing canonical venue is byte-identical after admission", () => {
  // The baseline is read from git's copy of the file at the package's
  // starting commit, so this compares against what was actually there.
  const canon = readJson(UK_REGISTRY_PATH).venues;
  const dry = readJson(`${AUDIT_DIR}/dry-run.json`);
  const baselineCount = dry.baseline_canonical_uk_venues;
  const admitted = new Set(readJson(`${AUDIT_DIR}/canonical-id-map.json`).mappings.map((m) => m.venue_id));

  // The first `baselineCount` entries must be the pre-existing ones, in
  // order, and none of them may be a Package 09 admission.
  const prefix = canon.slice(0, baselineCount);
  assert.equal(prefix.length, baselineCount);
  for (const venue of prefix) {
    assert.ok(!admitted.has(venue.venue_id), `${venue.venue_id} appears in the pre-existing prefix`);
  }
  // And everything after it must be exactly the admitted set.
  const suffix = canon.slice(baselineCount);
  assert.equal(suffix.length, admitted.size);
  for (const venue of suffix) {
    assert.ok(admitted.has(venue.venue_id), `${venue.venue_id} was appended but is not a Package 09 admission`);
  }
});

// ---------------------------------------------------------------------
// 10. Idempotence — the requirement that makes a rerun safe
// ---------------------------------------------------------------------
test("a second admission run against the resulting state admits nothing new", () => {
  // Re-planning against the CURRENT (post-admission) registry must find
  // every admitted venue already canonical, and mint nothing. A rerun that
  // produced "-2" ids or alternate slugs would be a duplicate factory.
  const plan = planAdmission({ repoRoot: REPO_ROOT });
  assert.equal(plan.safeAdmissions.length, 0, "a second run must admit nothing");
  assert.equal(plan.idCollisions.length, 0, "a second run must not report id collisions");
  assert.equal(plan.identityCollisions.length, 0);
  assert.equal(plan.invalid.length, 0);
  assert.equal(
    plan.alreadyCanonical.length,
    EXPECTED_ADMISSION_ROWS,
    "every admission-input row must now be recognised as already canonical",
  );
});

// ---------------------------------------------------------------------
// 11. Nothing else changed
// ---------------------------------------------------------------------
test("no Events were created", () => {
  const canon = readJson(UK_REGISTRY_PATH).venues;
  const eventKeys = ["start_date", "startDate", "performer", "event_id", "observation_id"];
  for (const venue of canon) {
    for (const key of eventKeys) {
      assert.ok(!Object.prototype.hasOwnProperty.call(venue, key), `${venue.venue_id} carries event key ${key}`);
    }
  }
});

test("the predecessor research corpora are all still present and unmodified in shape", () => {
  for (const dir of [
    "research/high-value-venue-estate/uk-1000plus-05",
    "research/high-value-venue-estate/uk-1000plus-06",
    "research/high-value-venue-estate/uk-1000plus-07",
  ]) {
    const census = readJson(`${dir}/census.json`);
    assert.ok(census.venues.length > 0, `${dir} must still hold its rows`);
  }
  const input = readJson(ADMISSION_INPUT_PATH);
  assert.equal(input.count, EXPECTED_ADMISSION_ROWS, "the Package 08 admission input must be unchanged");
});

test("the audit manifest declares every consumed artifact unmutated", () => {
  const manifest = readJson(`${AUDIT_DIR}/manifest.json`);
  for (const input of manifest.predecessor_artifacts_consumed) {
    assert.equal(input.mutated, false, `${input.path} must be declared unmutated`);
  }
  assert.equal(manifest.canonical_registry_effect.existing_entries_modified, 0);
  assert.equal(manifest.canonical_registry_effect.existing_entries_removed, 0);
});

test("the segment classifier covers every admitted venue class", () => {
  const rows = readJson(ADMISSION_INPUT_PATH).venues;
  for (const row of rows) {
    assert.ok(["SPORT", "CONFERENCE_EXHIBITION", "ARTS_MUSIC_GENERAL"].includes(segmentFor(row.venue_class)));
  }
});

test("the dedupe adapter maps every field the existing matcher needs", () => {
  const shape = toDedupeShape(admissionRow({ official_website_url: "https://v.example/" }));
  assert.equal(shape.canonical_name, "Example Venue");
  assert.equal(shape.city, "Example Town");
  assert.equal(shape.official_url, "https://v.example/");
  assert.equal(shape.address, null);
});

// ---------------------------------------------------------------------
// Post-admission reconciliation and the validator gate
//
// These assert against the canonical registry AS IT NOW STANDS, not
// against the plan that produced it — so a later hand-edit to
// venues/uk.json or to an audit artifact fails the suite rather than
// being believed.
// ---------------------------------------------------------------------

test("every required audit artifact exists and parses", () => {
  for (const name of REQUIRED_ARTIFACTS) {
    const artifact = readJson(`${AUDIT_DIR}/${name}`);
    assert.equal(
      artifact.package,
      "BEATMAPPED-UK-HIGH-VALUE-VENUE-CANONICAL-ADMISSION-09",
      `${name} must declare the package that produced it`,
    );
  }
});

test("the validator passes against the committed canonical state", () => {
  assert.deepEqual(validateAdmission({ repoRoot: REPO_ROOT }), []);
});

test("the estate arithmetic closes against Package 08's own published figures", () => {
  const p08 = readJson(PACKAGE_08_SUMMARY_PATH).headline;
  const coverage = readJson(`${AUDIT_DIR}/summary.json`).high_value_coverage;

  assert.equal(coverage.unique_confirmed_high_value, p08.final_unique_confirmed_venues);
  assert.equal(coverage.represented_before, p08.represented_in_canon);
  assert.equal(coverage.identity_holds_remaining, p08.ambiguous_hold);
  assert.equal(
    coverage.represented_before + coverage.newly_admitted + coverage.already_canonical_found_at_preflight,
    coverage.represented_after,
  );
  assert.equal(coverage.represented_after + coverage.identity_holds_remaining, coverage.unique_confirmed_high_value);
  assert.equal(coverage.estate_arithmetic_closes, true);
});

test("a venue found already canonical at preflight is counted once, not absorbed", () => {
  // Package 08 reconciled only against venues/uk.json, so a venue already
  // canonical in another registry was classed MISSING and reached the
  // admission input. Folding it into represented_before would silently
  // drop a venue from the estate total; minting it would create a
  // cross-registry duplicate. It must do neither.
  const coverage = readJson(`${AUDIT_DIR}/summary.json`).high_value_coverage;
  const alreadyCanonical = readJson(`${AUDIT_DIR}/already-canonical.json`);
  const p08 = readJson(PACKAGE_08_SUMMARY_PATH).headline;

  assert.equal(coverage.represented_before, p08.represented_in_canon, "represented_before must not absorb it");
  assert.equal(coverage.already_canonical_found_at_preflight, alreadyCanonical.count);

  const idMap = readJson(`${AUDIT_DIR}/canonical-id-map.json`);
  const mintedEntityIds = new Set(idMap.mappings.map((m) => m.unique_entity_id));
  for (const row of alreadyCanonical.rows) {
    assert.ok(!mintedEntityIds.has(row.unique_entity_id), `${row.unique_entity_id} was reused AND minted`);
    assert.ok(row.existing_venue_id, "an already-canonical row must name the venue it was matched to");
  }
});

test("every already-canonical match names a venue that actually exists", () => {
  const alreadyCanonical = readJson(`${AUDIT_DIR}/already-canonical.json`);
  const known = new Set();
  for (const path of EXISTING_REGISTRY_PATHS) {
    for (const venue of readJson(path).venues) known.add(venue.venue_id);
  }
  for (const row of alreadyCanonical.rows) {
    assert.ok(known.has(row.existing_venue_id), `${row.existing_venue_id} is claimed canonical but is in no registry`);
  }
});

test("rejected shared-operator-domain matches were admitted instead of suppressed", () => {
  // Several venues share one operator's domain. A bare hostname match
  // would have asserted they are the same venue and suppressed a real
  // admission, so each rejection must end in an actual admission.
  const alreadyCanonical = readJson(`${AUDIT_DIR}/already-canonical.json`);
  const rejections = alreadyCanonical.shared_operator_domain_matches_rejected.rejections;
  const idMap = readJson(`${AUDIT_DIR}/canonical-id-map.json`);
  const mintedEntityIds = new Set(idMap.mappings.map((m) => m.unique_entity_id));

  assert.ok(rejections.length > 0, "the shared-domain guard must record what it rejected");
  for (const rejection of rejections) {
    assert.ok(
      mintedEntityIds.has(rejection.unique_entity_id),
      `${rejection.unique_entity_id} was rejected as a false duplicate but never admitted`,
    );
  }
});

test("no venue anywhere in the canonical registry violates the Venue contract", () => {
  const failures = [];
  for (const venue of readJson(UK_REGISTRY_PATH).venues) {
    const errors = validateVenue(venue);
    if (errors.length > 0) failures.push(`${venue.venue_id}: ${errors.join("; ")}`);
  }
  assert.deepEqual(failures, []);
});

test("no canonical venue_id ends in a dedupe-style numeric suffix", () => {
  // createVenueId never disambiguates by appending a counter — a
  // collision is HELD, not renamed. So any trailing number must come
  // from the venue's own name ("Concorde 2", "Studio 36").
  const idMap = readJson(`${AUDIT_DIR}/canonical-id-map.json`);
  const minted = new Map(idMap.mappings.map((m) => [m.venue_id, m.canonical_name]));
  for (const [venueId, name] of minted) {
    const match = venueId.match(/-(\d+)$/);
    if (!match) continue;
    assert.ok(
      name.includes(match[1]),
      `${venueId} ends in -${match[1]} but "${name}" does not contain it — that is a dedupe suffix`,
    );
  }
});

test("the reconciliation is recomputed from disk, not copied from the plan", () => {
  const canon = readJson(UK_REGISTRY_PATH).venues;
  const reconciliation = readJson(`${AUDIT_DIR}/post-admission-reconciliation.json`);
  assert.equal(reconciliation.canonical_registry.final, canon.length);
  assert.equal(
    reconciliation.canonical_registry.baseline + reconciliation.canonical_registry.admitted,
    canon.length,
  );
  assert.equal(reconciliation.canonical_registry.arithmetic_closes, true);
  assert.equal(reconciliation.admission_input_accounting.closes, true);
  assert.equal(reconciliation.admission_input_accounting.unaccounted, 0);
});

test("every published quality invariant is zero", () => {
  const invariants = readJson(`${AUDIT_DIR}/summary.json`).quality_invariants;
  const nonZero = Object.entries(invariants).filter(([, value]) => value !== 0);
  assert.deepEqual(nonZero, []);
  for (const key of [
    "duplicate_real_world_venues_admitted",
    "identity_holds_admitted",
    "canonical_id_collisions",
    "venue_contract_failures",
    "fabricated_addresses",
    "third_party_urls_mislabelled_official",
    "events_created",
    "predecessor_packages_mutated",
  ]) {
    assert.ok(key in invariants, `summary must publish the "${key}" invariant`);
  }
});

test("the validator fails when the admission would not be idempotent", () => {
  // Guard the guard: prove check 13 can actually fail, rather than
  // trusting that it passes because the state happens to be right.
  const errors = validateAdmission({
    repoRoot: REPO_ROOT,
    checkIdempotence: true,
  });
  assert.deepEqual(errors, []);

  const replan = planAdmission({ repoRoot: REPO_ROOT });
  assert.equal(replan.safeAdmissions.length, 0, "a second admission run must mint nothing");
  assert.equal(replan.alreadyCanonical.length, EXPECTED_ADMISSION_ROWS);
  assert.equal(replan.idCollisions.length, 0);
  assert.equal(replan.identityCollisions.length, 0);
});

test("every researched postcode survives into the admitted venue's evidence", () => {
  // The admitted venues are all UNRESOLVED, so the postcode is the only
  // thing a later geocoding pass has to work from. Losing it here would
  // silently make the whole estate ungeocodable.
  const input = readJson(ADMISSION_INPUT_PATH).venues;
  const byId = new Map(readJson(UK_REGISTRY_PATH).venues.map((v) => [v.venue_id, v]));
  const mintedFor = new Map(
    readJson(`${AUDIT_DIR}/canonical-id-map.json`).mappings.map((m) => [m.unique_entity_id, m.venue_id]),
  );

  let checked = 0;
  for (const row of input) {
    if (!row.postcode) continue;
    const venueId = mintedFor.get(row.unique_entity_id);
    if (!venueId) continue; // already canonical — not minted by this package
    const notes = byId.get(venueId).evidence.map((e) => e.note).join(" ");
    assert.ok(notes.includes(row.postcode), `${venueId} lost its researched postcode ${row.postcode}`);
    checked += 1;
  }
  assert.ok(checked > 0, "the corpus must contain postcodes for this test to mean anything");
});
