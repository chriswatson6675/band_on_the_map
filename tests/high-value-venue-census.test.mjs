import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  HIGH_VALUE_CAPACITY_THRESHOLD,
  VENUE_CLASSES,
  validateCensus,
  validateCensusRow,
} from "../ingestion/high-value-venue-census/contract.mjs";
import {
  PRIOR_TYPE_TO_VENUE_CLASS,
  buildCanonicalIndex,
  computeQualityInvariants,
  computeClassificationUpdates,
  computeReusableIntegrations,
  coreName,
  dedupeAgainstPrior,
  findCanonicalNearDuplicates,
  normaliseName,
  reconcileAgainstCanon,
} from "../ingestion/high-value-venue-census/build.mjs";
import {
  CENSUS_DIR,
  REQUIRED_ARTIFACTS,
  validateCensusDirectory,
} from "../ingestion/high-value-venue-census/validate.mjs";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function evidence(url = "https://example.org/", note = "what this showed") {
  return [{ url, kind: "FETCHED_URL", note }];
}

/**
 * A minimal row that validates. Every test below starts from this and
 * changes exactly one thing, so a failure names the rule it broke.
 */
function baseRow(overrides = {}) {
  return {
    research_id: "hv05-a-example-venue-example-town",
    canonical_venue_id: null,
    canonical_match_state: "UNASSESSED",
    name: "Example Venue",
    aliases: [],
    venue_class: "ARENA",
    locality: "Example Town",
    nation: "England",
    postcode: null,
    operator_name: null,
    capacity_max: 0,
    capacity_kind: null,
    capacity_context: null,
    capacity_source_url: null,
    capacity_source_kind: null,
    capacity_confidence: "UNKNOWN",
    high_value_state: "UNRESOLVED",
    official_website_url: null,
    general_programme_url: null,
    conference_calendar_url: null,
    sports_calendar_url: null,
    ticketing_url: null,
    calendar_scope: "UNKNOWN",
    calendar_source_kind: "UNKNOWN",
    calendar_state: "UNKNOWN",
    platform_family: null,
    platform_evidence: null,
    acquisition_shape: null,
    acquisition_readiness: "NOT_YET_RESEARCHED",
    identity_evidence: evidence(),
    capacity_evidence: [],
    calendar_evidence: [],
    research_status: "NOT_YET_RESEARCHED",
    notes: "",
    ...overrides,
  };
}

function confirmedRow(overrides = {}) {
  return baseRow({
    capacity_max: 2500,
    capacity_kind: "STANDING",
    capacity_source_url: "https://venue.example/capacity",
    capacity_source_kind: "OFFICIAL_VENUE",
    capacity_confidence: "HIGH",
    high_value_state: "CONFIRMED_1000_PLUS",
    capacity_evidence: evidence("https://venue.example/capacity", "states capacity 2,500"),
    research_status: "COMPLETE",
    ...overrides,
  });
}

// ---------------------------------------------------------------------
// Contract: malformed records
// ---------------------------------------------------------------------
test("a well-formed row validates", () => {
  assert.deepEqual(validateCensusRow(baseRow()), []);
});

test("a non-object is rejected", () => {
  assert.equal(validateCensusRow(null).length, 1);
  assert.equal(validateCensusRow("venue").length, 1);
  assert.equal(validateCensusRow([]).length, 1);
});

test("a missing required key is reported by name", () => {
  const row = baseRow();
  delete row.capacity_max;
  const errors = validateCensusRow(row);
  assert.ok(errors.some((e) => e.includes('missing required key "capacity_max"')));
});

test("an unknown venue_class is rejected", () => {
  const errors = validateCensusRow(baseRow({ venue_class: "PUB" }));
  assert.ok(errors.some((e) => e.includes("not a known venue class")));
});

test("a malformed URL is rejected", () => {
  const errors = validateCensusRow(baseRow({ official_website_url: "not-a-url" }));
  assert.ok(errors.some((e) => e.includes("official_website_url")));
});

test("a non-http(s) URL scheme is rejected", () => {
  const errors = validateCensusRow(baseRow({ official_website_url: "ftp://example.org/" }));
  assert.ok(errors.some((e) => e.includes("official_website_url")));
});

test("a malformed evidence item cannot satisfy an evidence requirement", () => {
  const errors = validateCensusRow(
    confirmedRow({ capacity_evidence: [{ url: "nope", kind: "MADE_UP", note: "" }] }),
  );
  assert.ok(errors.some((e) => e.includes("capacity_evidence[0].url")));
  assert.ok(errors.some((e) => e.includes("capacity_evidence[0].kind")));
  assert.ok(errors.some((e) => e.includes("capacity_evidence[0].note")));
});

// ---------------------------------------------------------------------
// Contract: duplicate research identity
// ---------------------------------------------------------------------
test("duplicate research_ids are reported", () => {
  const errors = validateCensus([baseRow(), baseRow()]);
  assert.ok(errors.some((e) => e.includes("duplicate research_id")));
});

test("distinct research_ids do not collide", () => {
  const errors = validateCensus([
    baseRow(),
    baseRow({ research_id: "hv05-a-second-venue-example-town" }),
  ]);
  assert.deepEqual(errors, []);
});

test("a research_id not matching the package prefix is rejected", () => {
  const errors = validateCensusRow(baseRow({ research_id: "venue-123" }));
  assert.ok(errors.some((e) => e.includes("research_id")));
});

// ---------------------------------------------------------------------
// Contract: impossible capacity state
// ---------------------------------------------------------------------
test("CONFIRMED_1000_PLUS below the threshold is rejected", () => {
  const errors = validateCensusRow(
    confirmedRow({
      capacity_max: 400,
      capacity_evidence: evidence("https://venue.example/capacity", "states 400"),
    }),
  );
  assert.ok(errors.some((e) => e.includes(`capacity_max >= ${HIGH_VALUE_CAPACITY_THRESHOLD}`)));
});

test("CONFIRMED_1000_PLUS without capacity evidence is rejected", () => {
  const errors = validateCensusRow(confirmedRow({ capacity_evidence: [] }));
  assert.ok(errors.some((e) => e.includes("requires non-empty capacity_evidence")));
});

test("CONFIRMED_1000_PLUS without a capacity source URL is rejected", () => {
  const errors = validateCensusRow(confirmedRow({ capacity_source_url: null }));
  assert.ok(errors.some((e) => e.includes("requires a capacity_source_url")));
});

test("CONFIRMED_1000_PLUS with UNKNOWN confidence is rejected", () => {
  const errors = validateCensusRow(confirmedRow({ capacity_confidence: "UNKNOWN" }));
  assert.ok(errors.some((e) => e.includes("capacity_confidence UNKNOWN")));
});

test("a capacity figure with no evidence is rejected", () => {
  const errors = validateCensusRow(
    baseRow({
      capacity_max: 5000,
      capacity_source_url: "https://venue.example/c",
      capacity_confidence: "LOW",
    }),
  );
  assert.ok(errors.some((e) => e.includes("claimed with no capacity_evidence")));
});

test("a capacity source for an unestablished capacity is rejected", () => {
  const errors = validateCensusRow(
    baseRow({ capacity_source_url: "https://venue.example/c" }),
  );
  assert.ok(errors.some((e) => e.includes("an unestablished capacity cannot have a source")));
});

test("BELOW_THRESHOLD contradicting its own capacity is rejected", () => {
  const errors = validateCensusRow(
    baseRow({
      high_value_state: "BELOW_THRESHOLD",
      capacity_max: 4000,
      capacity_source_url: "https://venue.example/c",
      capacity_confidence: "HIGH",
      capacity_evidence: evidence("https://venue.example/c", "states 4,000"),
      research_status: "COMPLETE",
    }),
  );
  assert.ok(errors.some((e) => e.includes("BELOW_THRESHOLD contradicts capacity_max")));
});

test("a negative capacity is rejected", () => {
  const errors = validateCensusRow(baseRow({ capacity_max: -1 }));
  assert.ok(errors.some((e) => e.includes("non-negative integer")));
});

test("CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE is valid with no capacity evidence", () => {
  const errors = validateCensusRow(
    baseRow({
      high_value_state: "CAPACITY_UNVERIFIED_HIGH_VALUE_CANDIDATE",
      research_status: "REVIEW_REQUIRED",
    }),
  );
  assert.deepEqual(errors, []);
});

// ---------------------------------------------------------------------
// Contract: negative claims need evidence
// ---------------------------------------------------------------------
test("NO_PUBLIC_CALENDAR_FOUND without calendar evidence is rejected", () => {
  const errors = validateCensusRow(
    baseRow({ calendar_state: "NO_PUBLIC_CALENDAR_FOUND", research_status: "COMPLETE" }),
  );
  assert.ok(errors.some((e) => e.includes("is a negative claim and requires non-empty calendar_evidence")));
});

test("PRIVATE_BOOKINGS_ONLY without calendar evidence is rejected", () => {
  const errors = validateCensusRow(
    baseRow({ calendar_state: "PRIVATE_BOOKINGS_ONLY", research_status: "COMPLETE" }),
  );
  assert.ok(errors.some((e) => e.includes("is a negative claim")));
});

test("NO_PUBLIC_CALENDAR_FOUND with evidence that somebody looked is accepted", () => {
  const errors = validateCensusRow(
    baseRow({
      calendar_state: "NO_PUBLIC_CALENDAR_FOUND",
      calendar_evidence: evidence("https://venue.example/", "official site has no what's-on section"),
      acquisition_readiness: "PUBLIC_CALENDAR_NOT_FOUND",
      research_status: "COMPLETE",
    }),
  );
  assert.deepEqual(errors, []);
});

test("PUBLIC_CALENDAR_NOT_FOUND readiness without evidence is rejected", () => {
  const errors = validateCensusRow(
    baseRow({ acquisition_readiness: "PUBLIC_CALENDAR_NOT_FOUND", research_status: "COMPLETE" }),
  );
  assert.ok(errors.some((e) => e.includes("PUBLIC_CALENDAR_NOT_FOUND is a negative claim")));
});

// ---------------------------------------------------------------------
// Contract: absence of research is never evidence of absence
// ---------------------------------------------------------------------
test("a NOT_YET_RESEARCHED row cannot claim no public calendar", () => {
  const errors = validateCensusRow(
    baseRow({
      calendar_state: "NO_PUBLIC_CALENDAR_FOUND",
      calendar_evidence: evidence(),
      research_status: "NOT_YET_RESEARCHED",
    }),
  );
  assert.ok(errors.some((e) => e.includes("absence of research is not evidence of absence")));
});

test("a RESEARCH_BLOCKED row cannot claim BELOW_THRESHOLD", () => {
  const errors = validateCensusRow(
    baseRow({
      high_value_state: "BELOW_THRESHOLD",
      capacity_max: 200,
      capacity_source_url: "https://venue.example/c",
      capacity_confidence: "LOW",
      capacity_evidence: evidence(),
      research_status: "RESEARCH_BLOCKED",
    }),
  );
  assert.ok(errors.some((e) => e.includes("absence of research is not evidence of absence")));
});

test("a RESEARCH_BLOCKED row cannot assert MISSING_FROM_CANON", () => {
  const errors = validateCensusRow(
    baseRow({ canonical_match_state: "MISSING_FROM_CANON", research_status: "RESEARCH_BLOCKED" }),
  );
  assert.ok(errors.some((e) => e.includes("the venue's identity was never established")));
});

test("a NOT_YET_RESEARCHED row cannot claim a usable source", () => {
  const errors = validateCensusRow(
    baseRow({
      acquisition_readiness: "READY_FIRST_PARTY",
      calendar_source_kind: "VENUE",
      general_programme_url: "https://venue.example/whats-on",
      calendar_evidence: evidence(),
      research_status: "NOT_YET_RESEARCHED",
    }),
  );
  assert.ok(errors.some((e) => e.includes("cannot carry acquisition_readiness")));
});

// ---------------------------------------------------------------------
// Contract: missing-from-canon needs identity evidence
// ---------------------------------------------------------------------
test("MISSING_FROM_CANON without identity evidence is rejected", () => {
  const errors = validateCensusRow(
    baseRow({
      canonical_match_state: "MISSING_FROM_CANON",
      identity_evidence: [],
      research_status: "COMPLETE",
    }),
  );
  assert.ok(errors.some((e) => e.includes("identity_evidence")));
});

test("MISSING_FROM_CANON cannot also name a canonical venue", () => {
  const errors = validateCensusRow(
    baseRow({
      canonical_match_state: "MISSING_FROM_CANON",
      canonical_venue_id: "venue-x",
      research_status: "COMPLETE",
    }),
  );
  assert.ok(errors.some((e) => e.includes("cannot carry a canonical_venue_id")));
});

test("EXISTING_CANONICAL must name the canonical venue it matched", () => {
  const errors = validateCensusRow(
    baseRow({ canonical_match_state: "EXISTING_CANONICAL", research_status: "COMPLETE" }),
  );
  assert.ok(errors.some((e) => e.includes("requires a canonical_venue_id")));
});

test("every row needs identity evidence", () => {
  const errors = validateCensusRow(baseRow({ identity_evidence: [] }));
  assert.ok(errors.some((e) => e.includes("asserting a venue exists is a claim")));
});

// ---------------------------------------------------------------------
// Contract: URL / type consistency
// ---------------------------------------------------------------------
test("a claimed calendar with no calendar URL is rejected", () => {
  const errors = validateCensusRow(
    baseRow({
      calendar_state: "HAS_PUBLIC_EVENT_CALENDAR",
      calendar_scope: "MUSIC",
      calendar_evidence: evidence(),
      research_status: "COMPLETE",
    }),
  );
  assert.ok(errors.some((e) => e.includes("no calendar URL is recorded")));
});

test("a claimed calendar contradicting calendar_scope NONE is rejected", () => {
  const errors = validateCensusRow(
    baseRow({
      calendar_state: "HAS_PUBLIC_EVENT_CALENDAR",
      calendar_scope: "NONE",
      general_programme_url: "https://venue.example/whats-on",
      calendar_evidence: evidence(),
      research_status: "COMPLETE",
    }),
  );
  assert.ok(errors.some((e) => e.includes("contradicts calendar_scope NONE")));
});

test("a ready state with no source URL is rejected", () => {
  const errors = validateCensusRow(
    baseRow({
      acquisition_readiness: "SOURCE_FOUND_NEEDS_ADAPTER_RESEARCH",
      calendar_evidence: evidence(),
      research_status: "COMPLETE",
    }),
  );
  assert.ok(errors.some((e) => e.includes("records no source URL")));
});

test("READY_SPORTS_FIXTURE_SOURCE on a non-sports venue is rejected", () => {
  const errors = validateCensusRow(
    baseRow({
      venue_class: "CONFERENCE_CENTRE",
      acquisition_readiness: "READY_SPORTS_FIXTURE_SOURCE",
      calendar_source_kind: "CLUB",
      sports_calendar_url: "https://club.example/fixtures",
      calendar_evidence: evidence(),
      research_status: "COMPLETE",
    }),
  );
  assert.ok(errors.some((e) => e.includes("not valid for venue_class")));
});

test("ACCESS_RESTRICTED readiness must be reflected in the row", () => {
  const errors = validateCensusRow(
    baseRow({ acquisition_readiness: "ACCESS_RESTRICTED", research_status: "COMPLETE" }),
  );
  assert.ok(errors.some((e) => e.includes("must be reflected in calendar_state or acquisition_shape")));
});

// ---------------------------------------------------------------------
// Contract: a third-party source may never be labelled official
// ---------------------------------------------------------------------
test("a first-party readiness claim cannot rest on a third-party source", () => {
  const errors = validateCensusRow(
    confirmedRow({
      acquisition_readiness: "READY_FIRST_PARTY",
      calendar_source_kind: "THIRD_PARTY",
      general_programme_url: "https://aggregator.example/venue",
      calendar_evidence: evidence(),
    }),
  );
  assert.ok(errors.some((e) => e.includes("requires a first-party calendar_source_kind")));
});

test("a first-party readiness claim cannot rest on a ticketing storefront", () => {
  const errors = validateCensusRow(
    confirmedRow({
      acquisition_readiness: "READY_OPERATOR_LEVEL",
      calendar_source_kind: "TICKETING",
      ticketing_url: "https://tickets.example/venue",
      calendar_evidence: evidence(),
    }),
  );
  assert.ok(errors.some((e) => e.includes("requires a first-party calendar_source_kind")));
});

test("READY_THIRD_PARTY_ONLY contradicting a first-party source is rejected", () => {
  const errors = validateCensusRow(
    confirmedRow({
      acquisition_readiness: "READY_THIRD_PARTY_ONLY",
      calendar_source_kind: "VENUE",
      general_programme_url: "https://venue.example/whats-on",
      calendar_evidence: evidence(),
    }),
  );
  assert.ok(errors.some((e) => e.includes("contradicts first-party calendar_source_kind")));
});

test("an official capacity authority with no capacity evidence is rejected", () => {
  const errors = validateCensusRow(
    baseRow({
      capacity_source_kind: "OFFICIAL_GOVERNING_BODY",
      research_status: "COMPLETE",
    }),
  );
  assert.ok(errors.some((e) => e.includes("claims official authority with no capacity_evidence")));
});

// ---------------------------------------------------------------------
// Contract: platform family must not be guessed
// ---------------------------------------------------------------------
test("a platform_family with no supporting evidence is rejected", () => {
  const errors = validateCensusRow(baseRow({ platform_family: "WORDPRESS" }));
  assert.ok(errors.some((e) => e.includes("do not guess platform family")));
});

test("a platform_family with evidence is accepted", () => {
  const errors = validateCensusRow(
    baseRow({
      platform_family: "WORDPRESS",
      platform_evidence: "response exposed /wp-json/tribe/events/v1/events",
    }),
  );
  assert.deepEqual(errors, []);
});

// ---------------------------------------------------------------------
// Canonical reconciliation
// ---------------------------------------------------------------------
function canonicalFixture() {
  return [
    {
      venue_id: "venue-exampletown-example-arena",
      canonical_name: "Example Arena",
      city: "Example Town",
      municipality: "Example Town",
      evidence: [{ url: "https://example-arena.co.uk/", kind: "X", note: "official site" }],
    },
    {
      venue_id: "venue-othertown-linked-hall",
      canonical_name: "Linked Hall",
      city: "Other Town",
      municipality: "Other Town",
      evidence: [{ url: "https://linked.example/", kind: "X", note: 'venue_census_id="ukmec-x-linked-hall"' }],
    },
    {
      venue_id: "venue-a-shared-name",
      canonical_name: "Shared Name",
      city: "Town A",
      municipality: "Town A",
      evidence: [],
    },
    {
      venue_id: "venue-b-shared-name",
      canonical_name: "Shared Name",
      city: "Town B",
      municipality: "Town B",
      evidence: [],
    },
  ];
}

test("an explicit census id link resolves to EXISTING_CANONICAL", () => {
  const index = buildCanonicalIndex(canonicalFixture());
  const result = reconcileAgainstCanon(
    { name: "Anything At All", locality: "Nowhere", priorCensusId: "ukmec-x-linked-hall", officialUrl: null },
    index,
  );
  assert.equal(result.state, "EXISTING_CANONICAL");
  assert.equal(result.canonical_venue_id, "venue-othertown-linked-hall");
});

test("an exact name in the same locality resolves to EXISTING_CANONICAL", () => {
  const index = buildCanonicalIndex(canonicalFixture());
  const result = reconcileAgainstCanon(
    { name: "Example Arena", locality: "Example Town", priorCensusId: null, officialUrl: null },
    index,
  );
  assert.equal(result.state, "EXISTING_CANONICAL");
  assert.equal(result.canonical_venue_id, "venue-exampletown-example-arena");
});

test("a name shared across localities is AMBIGUOUS_IDENTITY, not missing", () => {
  const index = buildCanonicalIndex(canonicalFixture());
  const result = reconcileAgainstCanon(
    { name: "Shared Name", locality: "Town C", priorCensusId: null, officialUrl: null },
    index,
  );
  assert.equal(result.state, "AMBIGUOUS_IDENTITY");
  assert.equal(result.canonical_venue_id, null);
});

test("a genuinely absent venue resolves to MISSING_FROM_CANON with a stated basis", () => {
  const index = buildCanonicalIndex(canonicalFixture());
  const result = reconcileAgainstCanon(
    { name: "Wholly Unknown Stadium", locality: "Elsewhere", priorCensusId: null, officialUrl: null },
    index,
  );
  assert.equal(result.state, "MISSING_FROM_CANON");
  assert.equal(result.canonical_venue_id, null);
  assert.ok(result.basis.length > 0);
});

test("a bare website host match without locality corroboration is not treated as identity", () => {
  const index = buildCanonicalIndex(canonicalFixture());
  const result = reconcileAgainstCanon(
    {
      name: "Some Other Ground",
      locality: "Far Away",
      priorCensusId: null,
      officialUrl: "https://example-arena.co.uk/fixtures",
    },
    index,
  );
  assert.equal(result.state, "AMBIGUOUS_IDENTITY");
  assert.equal(result.canonical_venue_id, null);
});

test("name normalisation is accent- and punctuation-insensitive", () => {
  assert.equal(normaliseName("The Queen’s Club"), "the queen s club");
  assert.equal(normaliseName("Café & Bar"), "cafe and bar");
  assert.equal(coreName("The Example Stadium"), "example");
});

// ---------------------------------------------------------------------
// Deduplication against the prior census
// ---------------------------------------------------------------------
test("a researcher row duplicating a prior-census venue is dropped", () => {
  const prior = [baseRow({ research_id: "hv05-p-x", name: "Example Arena", locality: "Example Town" })];
  const researcher = [
    baseRow({ research_id: "hv05-a-example-arena-example-town", name: "Example Arena", locality: "Example Town" }),
    baseRow({ research_id: "hv05-a-new-venue-new-town", name: "New Venue", locality: "New Town" }),
  ];
  const { kept, dropped } = dedupeAgainstPrior(prior, researcher);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].name, "New Venue");
  assert.equal(dropped.length, 1);
  assert.ok(dropped[0].reason.includes("already carried"));
});

test("deduplication matches on website host in the same locality", () => {
  const prior = [
    baseRow({
      research_id: "hv05-p-y",
      name: "Officially Named Differently",
      locality: "Example Town",
      official_website_url: "https://example-arena.co.uk/",
    }),
  ];
  const researcher = [
    baseRow({
      research_id: "hv05-a-example-arena-example-town",
      name: "Example Arena",
      locality: "Example Town",
      official_website_url: "https://www.example-arena.co.uk/whats-on",
    }),
  ];
  const { kept, dropped } = dedupeAgainstPrior(prior, researcher);
  assert.equal(kept.length, 0);
  assert.equal(dropped.length, 1);
});

// ---------------------------------------------------------------------
// Quality invariants
// ---------------------------------------------------------------------
test("quality invariants detect an unevidenced confirmed capacity", () => {
  const rows = [confirmedRow({ capacity_evidence: [] })];
  const invariants = computeQualityInvariants(rows);
  assert.equal(invariants.confirmed_1000_plus_without_capacity_evidence, 1);
});

test("quality invariants detect a third-party source labelled official", () => {
  const rows = [
    confirmedRow({
      capacity_source_url: "https://en.wikipedia.org/wiki/Example_Arena",
      capacity_source_kind: "OFFICIAL_VENUE",
      capacity_evidence: evidence("https://en.wikipedia.org/wiki/Example_Arena", "infobox capacity"),
    }),
  ];
  assert.equal(computeQualityInvariants(rows).third_party_sources_labelled_official, 1);
});

test("quality invariants detect a negative claim on an unresearched row", () => {
  const rows = [
    baseRow({ calendar_state: "NO_PUBLIC_CALENDAR_FOUND", research_status: "NOT_YET_RESEARCHED" }),
  ];
  assert.equal(computeQualityInvariants(rows).negative_claims_on_unresearched_rows, 1);
});

test("quality invariants report zero for a clean census", () => {
  const invariants = computeQualityInvariants([confirmedRow({ notes: "explained" })]);
  for (const [key, value] of Object.entries(invariants)) {
    assert.equal(value, 0, `${key} should be 0`);
  }
});

test("quality invariants always report zero events created and zero canonical mutations", () => {
  const invariants = computeQualityInvariants([]);
  assert.equal(invariants.events_created, 0);
  assert.equal(invariants.canonical_venues_mutated, 0);
});

// ---------------------------------------------------------------------
// The published census itself
// ---------------------------------------------------------------------
test("the published census directory validates", () => {
  const errors = validateCensusDirectory(REPO_ROOT);
  assert.deepEqual(errors, [], errors.slice(0, 10).join("\n"));
});

test("every promised artifact is published", () => {
  for (const name of REQUIRED_ARTIFACTS) {
    const path = join(REPO_ROOT, CENSUS_DIR, name);
    assert.ok(readFileSync(path, "utf8").length > 0, `${name} is empty`);
  }
});

test("the published census contains no event records", () => {
  const census = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_DIR, "census.json"), "utf8"));
  for (const row of census.venues) {
    assert.equal(row.start_date, undefined);
    assert.equal(row.performer, undefined);
    assert.equal(row.event_id, undefined);
  }
});

test("the published census mutates no canonical venue", () => {
  // The census may only ever REFERENCE a canonical venue_id, never define
  // or alter one. Every id it cites must already exist in venues/uk.json.
  const census = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_DIR, "census.json"), "utf8"));
  const canonical = JSON.parse(readFileSync(join(REPO_ROOT, "venues/uk.json"), "utf8")).venues;
  const ids = new Set(canonical.map((v) => v.venue_id));
  for (const row of census.venues) {
    if (row.canonical_venue_id === null) continue;
    assert.ok(ids.has(row.canonical_venue_id), `${row.research_id} cites unknown ${row.canonical_venue_id}`);
  }
});

test("the manifest states that venues/uk.json was not mutated", () => {
  const manifest = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_DIR, "manifest.json"), "utf8"));
  const canonicalInput = manifest.inputs.find((i) => i.path === "venues/uk.json");
  assert.ok(canonicalInput, "manifest must declare venues/uk.json as an input");
  assert.equal(canonicalInput.mutated, false);
  for (const input of manifest.inputs) {
    assert.equal(input.mutated, false, `${input.path} must be declared unmutated`);
  }
});

test("every venue_class used by the census is in the controlled vocabulary", () => {
  const census = JSON.parse(readFileSync(join(REPO_ROOT, CENSUS_DIR, "census.json"), "utf8"));
  for (const row of census.venues) {
    assert.ok(VENUE_CLASSES.includes(row.venue_class), `unknown class ${row.venue_class}`);
  }
});

test("the prior-census venue_type mapping covers every type the prior census uses", () => {
  const prior = JSON.parse(
    readFileSync(
      join(REPO_ROOT, "research/major-event-venues/uk-major-event-census-01/venues.json"),
      "utf8",
    ),
  ).venues;
  const types = new Set(prior.map((v) => v.venue_type));
  for (const type of types) {
    // RUGBY_STADIUM is deliberately excluded: its class is derived from
    // retained calendar-source sport values, not from a static mapping.
    if (type === "RUGBY_STADIUM") continue;
    assert.ok(
      Object.prototype.hasOwnProperty.call(PRIOR_TYPE_TO_VENUE_CLASS, type),
      `prior venue_type "${type}" has no venue_class mapping`,
    );
  }
});

// ---------------------------------------------------------------------
// Canonical near-duplicate surfacing (never repaired here)
// ---------------------------------------------------------------------
test("canonical near-duplicates are surfaced as pairs, not merged", () => {
  const pairs = findCanonicalNearDuplicates([
    { venue_id: "venue-a", canonical_name: "Battersea Arts Center", city: "London" },
    { venue_id: "venue-b", canonical_name: "Battersea Arts Centre", city: "London" },
    { venue_id: "venue-c", canonical_name: "Somewhere Else", city: "London" },
  ]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].count, 2);
  assert.equal(pairs[0].signal_strength, "NAME_DIFFERS_ONLY_BY_ARTICLE_OR_PUNCTUATION");
  assert.ok(pairs[0].note.includes("does not merge"));
});

test("a leading-article-only difference is a STRONG duplicate signal", () => {
  const pairs = findCanonicalNearDuplicates([
    { venue_id: "venue-a", canonical_name: "Bridgewater Hall", city: "Manchester" },
    { venue_id: "venue-b", canonical_name: "The Bridgewater Hall", city: "Manchester" },
  ]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].signal_strength, "NAME_DIFFERS_ONLY_BY_ARTICLE_OR_PUNCTUATION");
});

test("two venues sharing a name core but differing by type word are only a WEAK signal", () => {
  // Barbican Hall and Barbican Theatre are genuinely different venues in
  // one complex. Reporting them as duplicates would be a false positive.
  const pairs = findCanonicalNearDuplicates([
    { venue_id: "venue-a", canonical_name: "Barbican Hall", city: "London" },
    { venue_id: "venue-b", canonical_name: "Barbican Theatre", city: "London" },
  ]);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0].signal_strength, "SHARES_NAME_CORE_ONLY_DIFFERENT_TYPE_WORD");
  assert.ok(pairs[0].note.includes("not asserted as duplicates"));
});

test("strong duplicate signals are ordered before weak ones", () => {
  const pairs = findCanonicalNearDuplicates([
    { venue_id: "venue-a", canonical_name: "Barbican Hall", city: "London" },
    { venue_id: "venue-b", canonical_name: "Barbican Theatre", city: "London" },
    { venue_id: "venue-c", canonical_name: "Byre Theatre", city: "St Andrews" },
    { venue_id: "venue-d", canonical_name: "The Byre Theatre", city: "St Andrews" },
  ]);
  assert.equal(pairs.length, 2);
  assert.equal(pairs[0].signal_strength, "NAME_DIFFERS_ONLY_BY_ARTICLE_OR_PUNCTUATION");
  assert.equal(pairs[1].signal_strength, "SHARES_NAME_CORE_ONLY_DIFFERENT_TYPE_WORD");
});

// ---------------------------------------------------------------------
// Reusable integrations — a family is not an integration
// ---------------------------------------------------------------------
function sourcedRow(overrides = {}) {
  return confirmedRow({
    general_programme_url: "https://venue.example/whats-on",
    calendar_source_kind: "VENUE",
    calendar_state: "HAS_PUBLIC_EVENT_CALENDAR",
    calendar_scope: "MUSIC",
    calendar_evidence: evidence("https://venue.example/whats-on", "lists upcoming events"),
    platform_family: "JSON_LD_EVENT",
    platform_evidence: "response carried schema.org Event JSON-LD",
    acquisition_shape: "JSON_LD",
    acquisition_readiness: "READY_FIRST_PARTY",
    ...overrides,
  });
}

test("a standards-based family is reported as one generic integration", () => {
  const rows = [1, 2, 3].map((n) =>
    sourcedRow({
      research_id: `hv05-a-standards-${n}`,
      general_programme_url: `https://venue${n}.example/whats-on`,
    }),
  );
  const { integrations } = computeReusableIntegrations(rows);
  const jsonLd = integrations.find((i) => i.platform_family === "JSON_LD_EVENT");
  assert.equal(jsonLd.integration_kind, "STANDARDS_BASED_GENERIC");
  assert.equal(jsonLd.venues_covered, 3);
  assert.equal(jsonLd.distinct_hosts, 3);
});

test("a single operator host with a uniform platform is one integration", () => {
  const rows = [1, 2].map((n) =>
    sourcedRow({
      research_id: `hv05-a-operator-${n}`,
      general_programme_url: `https://operator.example/venue-${n}`,
      platform_family: "EMBEDDED_NEXT_DATA",
      platform_evidence: "__NEXT_DATA__ payload present",
      acquisition_shape: "CLIENT_RENDERED",
      acquisition_readiness: "SOURCE_FOUND_NEEDS_ADAPTER_RESEARCH",
    }),
  );
  const { integrations } = computeReusableIntegrations(rows);
  const operator = integrations.find((i) => i.integration === "operator.example");
  assert.equal(operator.integration_kind, "SINGLE_OPERATOR_PLATFORM");
  assert.equal(operator.venues_covered, 2);
});

test("a host serving a MIXED platform estate is not reported as one integration", () => {
  // The prior census documented exactly this for the Jockey Club estate:
  // one host, three different families, so one adapter will not cover it.
  const rows = [
    sourcedRow({
      research_id: "hv05-a-mixed-1",
      general_programme_url: "https://mixed.example/a",
      platform_family: "STATIC_HTML_CARDS",
      platform_evidence: "server-rendered cards",
    }),
    sourcedRow({
      research_id: "hv05-a-mixed-2",
      general_programme_url: "https://mixed.example/b",
      platform_family: "CLIENT_RENDERED_UNKNOWN",
      platform_evidence: "empty client shell",
    }),
  ];
  const { integrations } = computeReusableIntegrations(rows);
  assert.equal(
    integrations.some((i) => i.integration === "mixed.example"),
    false,
  );
});

test("a shared FRAMEWORK is labelled an upper bound, never a proven integration", () => {
  // Next.js is a framework, not a platform: unrelated operators build on
  // it with different payload shapes. Reporting the total as one adapter
  // would be an over-claim.
  const rows = Array.from({ length: 6 }, (_, n) =>
    sourcedRow({
      research_id: `hv05-a-framework-${n}`,
      general_programme_url: `https://operator-${n}.example/whats-on`,
      platform_family: "EMBEDDED_NEXT_DATA",
      platform_evidence: "__NEXT_DATA__ payload present",
      acquisition_shape: "CLIENT_RENDERED",
      acquisition_readiness: "SOURCE_FOUND_NEEDS_ADAPTER_RESEARCH",
    }),
  );
  const { integrations } = computeReusableIntegrations(rows);
  const framework = integrations.find((i) => i.platform_family === "EMBEDDED_NEXT_DATA");
  assert.equal(framework.integration_kind, "SHARED_FRAMEWORK_UPPER_BOUND");
  assert.equal(framework.verified_uniform, false);
  assert.ok(framework.caveat.includes("UPPER BOUND"));
});

test("a large heterogeneous bucket is explicitly recorded as NOT one integration", () => {
  const rows = Array.from({ length: 25 }, (_, n) =>
    sourcedRow({
      research_id: `hv05-a-bucket-${n}`,
      general_programme_url: `https://site-${n}.example/events`,
      platform_family: "OTHER_EMBEDDED_APP_STATE",
      platform_evidence: "bespoke embedded application state",
      acquisition_shape: "CLIENT_RENDERED",
      acquisition_readiness: "SOURCE_FOUND_NEEDS_ADAPTER_RESEARCH",
    }),
  );
  const { explicitly_not_single_integrations: notIntegrations } = computeReusableIntegrations(rows);
  const bucket = notIntegrations.find((n) => n.platform_family === "OTHER_EMBEDDED_APP_STATE");
  assert.equal(bucket.integration_kind, "NOT_A_SINGLE_INTEGRATION");
  assert.equal(bucket.venues_covered, 25);
});

test("the published census reports no unproven family as an established integration", () => {
  const published = JSON.parse(
    readFileSync(join(REPO_ROOT, CENSUS_DIR, "platform-families.json"), "utf8"),
  );
  for (const integration of published.reusable_integrations.integrations) {
    if (integration.integration_kind !== "SHARED_FRAMEWORK_UPPER_BOUND") continue;
    assert.equal(integration.verified_uniform, false);
    assert.ok(integration.caveat, "an upper-bound entry must carry its caveat");
  }
});

test("spelling variants are folded so a known venue is not reported as a gap", () => {
  // The canonical estate records "Saint David's Hall"; the census source
  // says "St David's Hall". Without folding, a venue BeatMapped already
  // knows would inflate the missing-from-canon headline.
  assert.equal(normaliseName("St David's Hall"), normaliseName("Saint David's Hall"));
  assert.equal(normaliseName("Battersea Arts Center"), normaliseName("Battersea Arts Centre"));

  const index = buildCanonicalIndex([
    {
      venue_id: "venue-cardiff-saint-davids-hall",
      canonical_name: "Saint David's Hall",
      city: "Cardiff",
      municipality: "Cardiff",
      evidence: [],
    },
  ]);
  const result = reconcileAgainstCanon(
    { name: "St David's Hall", locality: "Cardiff", priorCensusId: null, officialUrl: null },
    index,
  );
  assert.equal(result.state, "EXISTING_CANONICAL");
  assert.equal(result.canonical_venue_id, "venue-cardiff-saint-davids-hall");
});

// ---------------------------------------------------------------------
// Superseding classifications are reported, never silently rewritten
// ---------------------------------------------------------------------
test("a newly-observed acquisition shape is reported against the prior classification", () => {
  const rows = [
    sourcedRow({
      research_id: "hv05-p-league-venue-1",
      sports_calendar_url: "https://league.example/fixtures",
      general_programme_url: null,
      venue_class: "FOOTBALL_GROUND",
      calendar_source_kind: "LEAGUE",
      acquisition_readiness: "READY_SPORTS_FIXTURE_SOURCE",
      platform_family: "CLIENT_RENDERED_UNKNOWN",
      platform_evidence: "prior census fingerprinted an empty client shell",
    }),
  ];
  const updates = computeClassificationUpdates(rows, [
    {
      family: "Example League",
      root_url: "https://league.example/",
      acquisition_shape: "SERVER_RENDERED_HTML",
      researcher: "b",
      evidence: [{ url: "https://league.example/fixtures", note: "plain HTML, no JS needed" }],
      notes: "reclassified after a real fetch",
    },
  ]);
  assert.equal(updates.length, 1);
  assert.equal(updates[0].venues_affected, 1);
  assert.deepEqual(updates[0].prior_census_platform_families, ["CLIENT_RENDERED_UNKNOWN"]);
  assert.equal(updates[0].newly_observed_shape, "SERVER_RENDERED_HTML");
  assert.ok(updates[0].action.includes("did NOT rewrite"));
});

test("the prior census fingerprint is preserved on the row, not overwritten", () => {
  // Both observations must survive, so either can be checked later.
  const row = sourcedRow({
    research_id: "hv05-p-preserved-1",
    platform_family: "CLIENT_RENDERED_UNKNOWN",
    platform_evidence: "prior census fingerprint",
  });
  computeClassificationUpdates([row], [
    {
      family: "Example League",
      root_url: "https://venue.example/",
      acquisition_shape: "SERVER_RENDERED_HTML",
      researcher: "b",
      evidence: [{ url: "https://venue.example/whats-on", note: "plain HTML" }],
    },
  ]);
  assert.equal(row.platform_family, "CLIENT_RENDERED_UNKNOWN");
});

test("a family with an UNKNOWN shape raises no supersession", () => {
  const rows = [sourcedRow({ research_id: "hv05-p-unknown-1" })];
  const updates = computeClassificationUpdates(rows, [
    {
      family: "Unverified family",
      root_url: "https://venue.example/",
      acquisition_shape: "UNKNOWN",
      researcher: "b",
      evidence: [],
    },
  ]);
  assert.deepEqual(updates, []);
});
