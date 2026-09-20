// BEATMAPPED-UK-MAJOR-EVENT-VENUE-ATTRIBUTION-01 — Phase 18.
//
// Synthetic fixtures only; the real derived dataset is validated by
// tests/major-event-attribution-artifacts.test.mjs.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { indexVenues, normaliseName, normalisePostcode, stripVenueTypeSuffix } from "../ingestion/major-event-attribution/census-index.mjs";
import { resolveObservation, resolveAll, compareGeography, sourceGeography, nameCandidates, ATTRIBUTION_STATES } from "../ingestion/major-event-attribution/resolve.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AT = "2026-09-20T00:00:00.000Z";

const venue = (o) => ({
  venue_census_id: o.id,
  canonical_name: o.name,
  alternative_names: o.aliases ?? [],
  city: o.city,
  nation: o.nation ?? "England",
  postcode: o.postcode ?? null,
  address: o.address ?? null,
  operator: o.operator ?? null,
  parent_complex: o.parent ?? null,
  latitude: null,
  longitude: null,
});

const observation = (o) => ({
  source_id: o.sourceId ?? "src-1",
  source_record_id: o.recordId ?? "rec-1",
  venue_name: o.venueName ?? null,
  location_text: o.locationText ?? null,
  source_fields: {
    venue_census_id: o.sourceCensusVenueId ?? null,
    census_venue_name: o.sourceCensusVenueName ?? null,
    calendar_source_id: o.sourceId ?? "src-1",
    event_domain: o.domain ?? "SPORT_FIXTURES",
    location_address: o.address ?? null,
  },
});

// ------------------------------------------------------------- EXACT MATCH

test("a source naming the census venue exactly resolves to it", () => {
  const index = indexVenues([venue({ id: "v-arena", name: "Example Arena", city: "Exampleton" })]);
  const result = resolveObservation(observation({ venueName: "Example Arena", sourceCensusVenueId: "v-arena" }), index, { derivedAt: AT });

  assert.equal(result.resolved_venue_census_id, "v-arena");
  assert.equal(result.attribution_state, "SOURCE_VENUE_MATCH");
  assert.ok(ATTRIBUTION_STATES.has(result.attribution_state));
});

test("a governed ALIAS resolves, and an alias is never inferred from similarity", () => {
  const index = indexVenues([venue({ id: "v-showground", name: "Staffordshire County Showground", aliases: ["Bingley Hall", "Stafford Showground"], city: "Stafford" })]);

  const viaAlias = resolveObservation(observation({ venueName: "Bingley Hall", sourceCensusVenueId: "v-showground" }), index, { derivedAt: AT });
  assert.equal(viaAlias.resolved_venue_census_id, "v-showground");
  assert.match(viaAlias.attribution_method, /GOVERNED_NAME_OR_ALIAS/);

  // A merely SIMILAR name is not an alias and must not resolve.
  const similar = resolveObservation(observation({ venueName: "Bingley Arts Centre", sourceCensusVenueId: "v-showground" }), index, { derivedAt: AT });
  assert.equal(similar.resolved_venue_census_id, null, "string similarity must never create an alias");
  assert.equal(similar.attribution_state, "UNRESOLVED_NO_CENSUS_MATCH");
});

// ------------------------------------------------------- CROSS-SOURCE VENUE

test("THE CORE INVARIANT: an operator calendar for Venue A returning Venue B resolves to B", () => {
  // This is the defect the whole package exists for. A source registered
  // under Carlisle returns an event whose own source says Kempton Park.
  const index = indexVenues([
    venue({ id: "v-carlisle", name: "Carlisle Racecourse", city: "Carlisle", operator: "Jockey Club Racecourses" }),
    venue({ id: "v-kempton", name: "Kempton Park Racecourse", aliases: ["Kempton"], city: "Sunbury-on-Thames", operator: "Jockey Club Racecourses" }),
  ]);
  const result = resolveObservation(observation({
    venueName: "Kempton Park",
    sourceCensusVenueId: "v-carlisle",
    sourceCensusVenueName: "Carlisle Racecourse",
    address: { addressLocality: "Sunbury on Thames", postalCode: "TW16 5AQ" },
  }), index, { derivedAt: AT });

  assert.equal(result.resolved_venue_census_id, "v-kempton", "must resolve to the venue the SOURCE named");
  assert.notEqual(result.resolved_venue_census_id, "v-carlisle", "must NOT inherit the census venue the source was researched under");
  assert.equal(result.attribution_state, "RESOLVED_TO_DIFFERENT_CENSUS_VENUE");
  assert.equal(result.source_census_venue_id, "v-carlisle", "source provenance is retained, not discarded");
  assert.ok(result.evidence.some((line) => /source provenance is not venue identity/.test(line)));
});

test("a shared operator is NEVER sufficient to resolve a venue", () => {
  // Two venues share an operator and the source names neither of them.
  const index = indexVenues([
    venue({ id: "v-a", name: "Alpha Racecourse", city: "Alphaton", operator: "Shared Operator Ltd" }),
    venue({ id: "v-b", name: "Beta Racecourse", city: "Betaville", operator: "Shared Operator Ltd" }),
  ]);
  const result = resolveObservation(observation({ venueName: "Some Other Place", sourceCensusVenueId: "v-a" }), index, { derivedAt: AT });

  assert.equal(result.resolved_venue_census_id, null, "operator membership is provenance, not venue proof");
  assert.equal(result.attribution_state, "UNRESOLVED_NO_CENSUS_MATCH");
});

// ------------------------------------------------------------------ GEOGRAPHY

test("the same name in different places stays ambiguous without location evidence", () => {
  const index = indexVenues([
    venue({ id: "v-exeter", name: "St James Park", city: "Exeter" }),
    venue({ id: "v-newcastle", name: "St James' Park", city: "Newcastle upon Tyne" }),
  ]);
  const ambiguous = resolveObservation(observation({ venueName: "St James Park" }), index, { derivedAt: AT });

  assert.equal(ambiguous.resolved_venue_census_id, null);
  assert.equal(ambiguous.attribution_state, "AMBIGUOUS_MULTIPLE_CENSUS_MATCHES");
  assert.equal(ambiguous.confidence, "REVIEW");
  assert.equal(ambiguous.ambiguity_candidates.length, 2, "both candidates must be named, not silently narrowed to one");

  // Location evidence separates them.
  const resolved = resolveObservation(observation({ venueName: "St James Park", address: { addressLocality: "Exeter" } }), index, { derivedAt: AT });
  assert.equal(resolved.resolved_venue_census_id, "v-exeter");
});

test("location evidence that contradicts every name match is reported, not overridden", () => {
  const index = indexVenues([venue({ id: "v-greyhound", name: "Newcastle Greyhound Stadium", aliases: ["Utilita Arena Newcastle"], city: "Newcastle upon Tyne", postcode: "NE6 2XJ" })]);
  const result = resolveObservation(observation({
    venueName: "Utilita Arena Newcastle",
    address: { postalCode: "NE4 7NA", addressLocality: "Newcastle Upon Tyne" },
  }), index, { derivedAt: AT });

  assert.equal(result.resolved_venue_census_id, null);
  assert.equal(result.attribution_state, "CONFLICTING_LOCATION_EVIDENCE");
  assert.equal(result.confidence, "REVIEW");
});

test("geography comparison distinguishes confirm, compatible, conflict and no evidence", () => {
  const target = venue({ id: "v", name: "Example Showground", city: "Stafford", postcode: "ST18 0BD" });

  assert.equal(compareGeography(sourceGeography(observation({ address: { postalCode: "ST18 0BD" } })), target), "CONFIRMS");
  assert.equal(compareGeography(sourceGeography(observation({ address: { postalCode: "NE4 7NA", addressLocality: "Newcastle" } })), target), "CONFLICTS");
  assert.equal(compareGeography(sourceGeography(observation({ locationText: "Weston Road, Stafford" })), target), "COMPATIBLE");
  assert.equal(compareGeography(sourceGeography(observation({})), target), "NO_EVIDENCE");
  // The source's address naming the venue itself is positive confirmation.
  assert.equal(compareGeography(sourceGeography(observation({ locationText: "Weston Road, Example Showground" })), venue({ id: "v", name: "Example Showground", city: "Stafford" })), "CONFIRMS");
});

// ------------------------------------------------------------ SPONSOR NAMING

test("a sponsor/trading variation resolves only when governed evidence supports it", () => {
  // WITH a retained alias: resolves.
  const governed = indexVenues([venue({ id: "v-ground", name: "Example Stadium", aliases: ["The Rock sponsored by Example Coaches"], city: "Dumbarton" })]);
  const withAlias = resolveObservation(observation({ venueName: "The Rock sponsored by Example Coaches", sourceCensusVenueId: "v-ground" }), governed, { derivedAt: AT });
  assert.equal(withAlias.resolved_venue_census_id, "v-ground");

  // WITHOUT it: honestly unresolved rather than assumed from the source's
  // own census provenance.
  const ungoverned = indexVenues([venue({ id: "v-ground", name: "Example Stadium", city: "Dumbarton" })]);
  const withoutAlias = resolveObservation(observation({ venueName: "The Rock sponsored by Example Coaches", sourceCensusVenueId: "v-ground" }), ungoverned, { derivedAt: AT });
  assert.equal(withoutAlias.resolved_venue_census_id, null, "a sponsor name with no governed evidence must not inherit the source venue");
});

// --------------------------------------------------------- PARENT/SUB-VENUE

test("a separately represented sub-venue is preserved, not collapsed into its parent", () => {
  const index = indexVenues([
    venue({ id: "v-parent", name: "Example Racecourse", city: "Cheltenham", postcode: "GL50 4SH" }),
    venue({ id: "v-child", name: "The Centaur", city: "Cheltenham", postcode: "GL50 4SH", parent: "Example Racecourse" }),
  ]);
  const child = resolveObservation(observation({ venueName: "The Centaur", sourceCensusVenueId: "v-parent" }), index, { derivedAt: AT });
  assert.equal(child.resolved_venue_census_id, "v-child", "naming the sub-venue must resolve to the sub-venue");

  // Naming only the parent must NOT guess a room inside it.
  const parent = resolveObservation(observation({ venueName: "Example Racecourse", sourceCensusVenueId: "v-parent" }), index, { derivedAt: AT });
  assert.equal(parent.resolved_venue_census_id, "v-parent");
});

// -------------------------------------------------------------- NO EVIDENCE

test("no venue evidence at all is unresolved, never guessed from provenance", () => {
  const index = indexVenues([venue({ id: "v-a", name: "Example Arena", city: "Exampleton" })]);
  for (const name of [null, "", "  "]) {
    const result = resolveObservation(observation({ venueName: name, sourceCensusVenueId: "v-a" }), index, { derivedAt: AT });
    assert.equal(result.resolved_venue_census_id, null);
    assert.equal(result.attribution_state, "UNRESOLVED_NO_VENUE_EVIDENCE");
  }
});

// ------------------------------------------------------------ NORMALISATION

test("normalisation never strips venue-type words that distinguish real venues", () => {
  // Removing "park"/"stadium" would collapse genuinely different venues.
  assert.notEqual(normaliseName("Meadow Park"), normaliseName("Meadow Stadium"));
  assert.equal(normaliseName("St James' Park"), normaliseName("St James Park"));
  assert.equal(normaliseName("Café  Arena"), normaliseName("Cafe Arena"));

  // Suffix stripping is explicit and separate, and never leaves a stub.
  assert.equal(stripVenueTypeSuffix("kempton park racecourse"), "kempton park");
  assert.equal(stripVenueTypeSuffix("mallory park racing circuit"), "mallory park");
  assert.equal(stripVenueTypeSuffix("the arena"), null, "stripping must not reduce a name to a stub");

  assert.equal(normalisePostcode("ne4 7na"), "NE47NA");
  assert.equal(normalisePostcode("not a postcode"), null);
});

test("a name match is only accepted when it is unique after geography", () => {
  const index = indexVenues([
    venue({ id: "v-1", name: "Meadow Park", city: "Borehamwood" }),
    venue({ id: "v-2", name: "Meadow Park", city: "Irvine", nation: "Scotland" }),
    venue({ id: "v-3", name: "Meadow Park", city: "Castle Douglas", nation: "Scotland" }),
  ]);
  const { candidates } = nameCandidates("Meadow Park", index);
  assert.equal(candidates.length, 3, "all claimants must surface, never just the first");

  const result = resolveObservation(observation({ venueName: "Meadow Park" }), index, { derivedAt: AT });
  assert.equal(result.attribution_state, "AMBIGUOUS_MULTIPLE_CENSUS_MATCHES");
  assert.equal(result.ambiguity_candidates.length, 3);
});

// -------------------------------------------------------------- ACCOUNTING

test("every observation receives exactly one attribution record, deterministically", () => {
  const index = indexVenues([
    venue({ id: "v-a", name: "Alpha Arena", city: "Alphaton" }),
    venue({ id: "v-b", name: "Beta Stadium", city: "Betaville" }),
  ]);
  const input = [
    observation({ recordId: "r1", venueName: "Alpha Arena", sourceCensusVenueId: "v-a" }),
    observation({ recordId: "r2", venueName: "Beta Stadium", sourceCensusVenueId: "v-a" }),
    observation({ recordId: "r3", venueName: "Unknown Place", sourceCensusVenueId: "v-a" }),
  ];
  const first = resolveAll(input, index, { derivedAt: AT });
  assert.equal(first.length, input.length, "one record per observation, including unresolved ones");
  assert.equal(new Set(first.map((r) => `${r.source_id}||${r.source_record_id}`)).size, input.length);

  const second = resolveAll(input, index, { derivedAt: AT });
  assert.deepEqual(second, first, "resolution must be deterministic for fixed inputs");
});

test("both the source census venue and the resolved venue are retained as separate fields", () => {
  const index = indexVenues([
    venue({ id: "v-a", name: "Alpha Racecourse", city: "Alphaton" }),
    venue({ id: "v-b", name: "Beta Racecourse", city: "Betaville" }),
  ]);
  const result = resolveObservation(observation({ venueName: "Beta Racecourse", sourceCensusVenueId: "v-a", sourceCensusVenueName: "Alpha Racecourse" }), index, { derivedAt: AT });

  assert.equal(result.source_census_venue_id, "v-a", "where it was FETCHED from");
  assert.equal(result.resolved_venue_census_id, "v-b", "where the event actually IS");
  assert.notEqual(result.source_census_venue_id, result.resolved_venue_census_id);
  assert.ok(result.observation_ref.source_id && result.observation_ref.source_record_id, "and it points back to its exact observation");
});

// ------------------------------------------------------------ IMMUTABILITY

test("resolution never mutates the Observation it reads", () => {
  const index = indexVenues([venue({ id: "v-b", name: "Beta Racecourse", city: "Betaville" })]);
  const input = observation({ venueName: "Beta Racecourse", sourceCensusVenueId: "v-a", locationText: "Somewhere" });
  const before = JSON.stringify(input);
  resolveObservation(input, index, { derivedAt: AT });
  assert.equal(JSON.stringify(input), before, "the source Observation must be byte-identical after resolution");
});

// ----------------------------------------------------------------- SAFETY

test("SAFETY: attribution creates no Event identity and performs no deduplication", async () => {
  const index = indexVenues([venue({ id: "v-a", name: "Alpha Arena", city: "Alphaton" })]);
  // Two different sources reporting the SAME venue and title must remain
  // two separate attribution records — reconciliation is a later package.
  const records = resolveAll([
    observation({ sourceId: "s1", recordId: "r1", venueName: "Alpha Arena" }),
    observation({ sourceId: "s2", recordId: "r2", venueName: "Alpha Arena" }),
  ], index, { derivedAt: AT });

  assert.equal(records.length, 2, "no cross-source merge may occur");
  for (const record of records) {
    assert.ok(!("event_id" in record), "attribution must not create canonical Event identity");
    assert.ok(!("canonical_event_id" in record));
  }
});

test("SAFETY: the attribution modules never import a registry, publication or deployment path", async () => {
  const stripComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*/gm, "$1 ");
  const forbidden = [
    /from\s+["'][^"']*publish-map-data/,
    /from\s+["'][^"']*publication-server/,
    /from\s+["'][^"']*venue-onboarding/,
    /from\s+["'][^"']*source-registry/,
    /from\s+["'][^"']*deploy/,
  ];
  for (const file of [
    "ingestion/major-event-attribution/census-index.mjs",
    "ingestion/major-event-attribution/resolve.mjs",
    "ingestion/major-event-attribution/run-attribution.mjs",
  ]) {
    const body = stripComments(await readFile(resolve(ROOT, file), "utf8"));
    for (const pattern of forbidden) assert.ok(!pattern.test(body), `${file} must not import a production path (${pattern})`);
    assert.ok(!/venues\/[a-z-]+\.json/.test(body), `${file} must not touch a production venue registry`);
  }
});

test("SAFETY: no hand-maintained operator or venue mapping exists in the resolver", async () => {
  const stripComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*/gm, "$1 ");
  for (const file of ["ingestion/major-event-attribution/census-index.mjs", "ingestion/major-event-attribution/resolve.mjs"]) {
    const body = stripComments(await readFile(resolve(ROOT, file), "utf8"));
    // The resolver must be generic. A named operator or racecourse in the
    // CODE would mean the estate was special-cased rather than resolved.
    for (const banned of ["jockey club", "aintree", "kempton", "cheltenham", "racecourses ltd", "arena racing"]) {
      assert.ok(!body.toLowerCase().includes(banned), `${file} must not hardcode ${banned}`);
    }
  }
});
