import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createVenueDiscoveryCandidate, validateVenueDiscoveryCandidate } from "../ingestion/venue-discovery/contract.mjs";
import { normaliseCandidate, normaliseDomain, normaliseText, extractPostcode } from "../ingestion/venue-discovery/normalise.mjs";
import { reconcileCandidates } from "../ingestion/venue-discovery/reconcile.mjs";
import { reconcileWithExistingRegistry } from "../ingestion/venue-discovery/existing-registry.mjs";
import { runProviderAdapter } from "../ingestion/venue-discovery/adapters.mjs";
import { parseOverpassCandidates } from "../ingestion/venue-discovery/providers/overpass.mjs";
import { importCuratedDirectory } from "../ingestion/venue-discovery/providers/curated-directory.mjs";
import { buildDiscoveryCensus } from "../ingestion/venue-discovery/run.mjs";

const context = { city: "Testville", country_code: "GB", retrieved_at: "2026-08-27T00:00:00.000Z" };
const candidate = (overrides = {}) => createVenueDiscoveryCandidate({
  candidate_id: "cand-a-1", city: "Testville", country_code: "GB", reported_name: "Café Hall",
  reported_address: "1 High Street, AB1 2CD", reported_latitude: 51, reported_longitude: -1,
  reported_website: "https://www.cafehall.example/events", reported_category: "music_venue",
  discovery_provider: "PROVIDER_A", provider_record_id: "1", provider_url: "https://provider.example/1",
  retrieved_at: "2026-08-27T00:00:00.000Z",
  discovery_evidence: [{ kind: "RECORD", value: "1" }], ...overrides,
});

test("candidate contract validates leads without promoting canonical facts", () => {
  assert.deepEqual(validateVenueDiscoveryCandidate(candidate()), []);
  assert.throws(() => createVenueDiscoveryCandidate({}), /candidate_id/);
  assert.equal(candidate().canonical_name, undefined);
});

test("normalisation is deterministic and preserves the reported values", () => {
  const input = candidate();
  const one = normaliseCandidate(input);
  const two = normaliseCandidate(input);
  assert.deepEqual(one, two);
  assert.equal(one.reported_name, "Café Hall");
  assert.equal(normaliseText("  CAFÉ   Hall  "), "cafe hall");
  assert.equal(normaliseDomain("https://www.CafeHall.example/path"), "cafehall.example");
});

test("strong domain match merges providers and retains every observation", () => {
  const other = candidate({ candidate_id: "cand-b-9", discovery_provider: "PROVIDER_B", provider_record_id: "9", reported_name: "Cafe Hall London", reported_address: null });
  const [group] = reconcileCandidates([candidate(), other]);
  assert.equal(group.reconciliation_status, "SAME_CANDIDATE_CONFIDENT");
  assert.equal(group.provider_count, 2);
  assert.deepEqual(group.providers, ["PROVIDER_A", "PROVIDER_B"]);
  assert.equal(group.observations.length, 2);
  assert.deepEqual(group.observations.map((item) => item.discovery_evidence[0].value), ["1", "1"]);
});

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-02 — regression tests
// for a real bug found in a live Manchester run: a shared operator domain
// (e.g. a theatre group or multi-venue promoter's one booking site) must
// NOT be trusted as a strong match when there is real conflicting
// evidence that the two candidates are actually different physical
// venues, in either shape that evidence can arrive.

test("shared domain does NOT merge two candidates with real, distant coordinates (different physical venues under one operator's shared booking domain)", () => {
  const a = candidate({ reported_name: "Manchester Opera House", reported_website: "https://www.manchestertheatres.com/operahouse.htm", reported_address: "Quay Street, Manchester M3 3HP", reported_latitude: 53.4788967, reported_longitude: -2.2513533 });
  const b = candidate({ candidate_id: "cand-b-palace", discovery_provider: "PROVIDER_B", provider_record_id: "palace", reported_name: "Palace Theatre", reported_website: "https://www.manchestertheatres.com/palacetheatre.htm", reported_address: "Oxford Street, Manchester M1 6FT", reported_latitude: 53.4750736, reported_longitude: -2.2409311 });
  const groups = reconcileCandidates([a, b]);
  assert.equal(groups.length, 2, "two ~800m-apart real venues sharing one operator domain must remain distinct candidates");
});

test("shared domain does NOT merge two coordinate-less candidates that report conflicting addresses (a distance guard alone cannot see this shape)", () => {
  const a = candidate({ reported_name: "O2 Ritz Manchester", reported_website: "https://www.academymusicgroup.com/o2ritzmanchester", reported_address: "Whitworth Street West, Manchester M1 5NQ", reported_latitude: null, reported_longitude: null });
  const b = candidate({ candidate_id: "cand-b-apollo", discovery_provider: "PROVIDER_B", provider_record_id: "apollo", reported_name: "O2 Apollo Manchester", reported_website: "https://www.academymusicgroup.com/o2apollomanchester", reported_address: "Stockport Road, Ardwick, Manchester M12 6AP", reported_latitude: null, reported_longitude: null });
  const groups = reconcileCandidates([a, b]);
  assert.equal(groups.length, 2, "two coordinate-less venues sharing one operator domain but reporting different addresses must remain distinct candidates");
});

test("shared domain still merges when neither side's evidence conflicts (no coordinates, no conflicting address) — the legitimate cross-provider case is preserved", () => {
  const a = candidate({ reported_website: "https://www.samevenue.example/", reported_latitude: null, reported_longitude: null });
  const b = candidate({ candidate_id: "cand-b-same", discovery_provider: "PROVIDER_B", provider_record_id: "same", reported_website: "https://www.samevenue.example/", reported_address: null, reported_latitude: null, reported_longitude: null });
  const [group] = reconcileCandidates([a, b]);
  assert.equal(group.reconciliation_status, "SAME_CANDIDATE_CONFIDENT");
  assert.equal(group.provider_count, 2);
});

// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-03 — postcode
// extraction and postcode-based reconciliation. A real Manchester
// retest found two further real duplicate-representation pairs
// (Islington Mill / Islington Mill Arts Club; Stockport Plaza / The
// Plaza) that Correction-02's full-address-TEXT comparison still could
// not merge, because one provider's structured OSM addr:* tags and the
// other's free-text curated-directory address assemble into genuinely
// different text for the exact same real building. extractPostcode()
// was also found to be silently US-ZIP-only (never matched a UK
// postcode at all) — both are fixed together here.

test("extractPostcode finds a UK postcode and is tolerant of case/whitespace formatting", () => {
  assert.equal(extractPostcode("James Street, Salford M3 5HW", "GB"), "M35HW");
  assert.equal(extractPostcode("James Street, Salford m3 5hw", "gb"), "M35HW", "case must not matter");
  assert.equal(extractPostcode("James Street, Salford M3  5HW", "GB"), "M35HW", "extra whitespace must not matter");
  assert.equal(extractPostcode("James Street, Salford M35HW", "GB"), "M35HW", "a postcode written with no space at all must still be found");
  assert.equal(extractPostcode("No postcode here", "GB"), null);
});

test("extractPostcode without a UK country code falls back to the original 5-digit pattern (unchanged behaviour for every other existing caller)", () => {
  assert.equal(extractPostcode("123 Main St, Springfield 62704", "US"), "62704");
  assert.equal(extractPostcode("James Street, Salford M3 5HW"), null, "no country code given: the UK pattern must not apply");
});

test("structured OSM address tags vs. free-text directory address for the SAME real venue (same UK postcode, different address text) still merge", () => {
  const a = candidate({ reported_name: "Islington Mill Arts Club", reported_website: "http://www.islingtonmill.com/", reported_address: "Islington Mill, James Street, Salford, M3 5HW", reported_latitude: 53.484, reported_longitude: -2.264 });
  const b = candidate({ candidate_id: "cand-b-islington", discovery_provider: "PROVIDER_B", provider_record_id: "islington", reported_name: "Islington Mill", reported_website: "https://islingtonmill.com/", reported_address: "James Street, Salford M3 5HW", reported_latitude: null, reported_longitude: null });
  const [group] = reconcileCandidates([a, b]);
  assert.equal(group.reconciliation_status, "SAME_CANDIDATE_CONFIDENT", "differently-formatted address text for the same real UK postcode must not block a real match");
  assert.equal(group.provider_count, 2);
});

test("same postcode + compatible (substring) name merges even with no shared domain at all", () => {
  const a = candidate({ reported_name: "The Deaf Institute", reported_website: "https://www.thedeafinstitute.co.uk/", reported_address: "135 Grosvenor Street, Manchester M1 7HE", reported_latitude: null, reported_longitude: null });
  const b = candidate({ candidate_id: "cand-b-deaf", discovery_provider: "PROVIDER_B", provider_record_id: "deaf", reported_name: "Deaf Institute", reported_website: null, reported_address: "135 Grosvenor St, Manchester, M1 7HE", reported_latitude: null, reported_longitude: null });
  const [group] = reconcileCandidates([a, b]);
  assert.equal(group.reconciliation_status, "SAME_CANDIDATE_CONFIDENT");
  assert.equal(group.provider_count, 2);
});

test("same UK postcode alone does not merge two genuinely unrelated names", () => {
  const a = candidate({ reported_name: "The Deaf Institute", reported_website: null, reported_address: "135 Grosvenor Street, Manchester M1 7HE", reported_latitude: null, reported_longitude: null });
  const b = candidate({ candidate_id: "cand-b-unrelated", discovery_provider: "PROVIDER_B", provider_record_id: "unrelated", reported_name: "Grosvenor Dental Practice", reported_website: null, reported_address: "137 Grosvenor Street, Manchester M1 7HE", reported_latitude: null, reported_longitude: null });
  const groups = reconcileCandidates([a, b]);
  assert.equal(groups.length, 2, "a shared postcode alone, with genuinely incompatible names, must not force a merge");
});

// A genuinely name-INCOMPATIBLE real pair (the real Stockport Plaza /
// "The Plaza" OSM tag) is deliberately NOT solved by namesCompatible()'s
// conservative substring rule — "the plaza" is not a substring of
// "stockport plaza" and their token overlap is below possibleMatch()'s
// own 0.6 similarity bar either. This is an honest, real remaining
// limitation (see this package's own FINAL REPORT), not silently forced.
test("a real name-incompatible pair (Stockport Plaza / The Plaza) is honestly NOT auto-merged even with a matching postcode", () => {
  const a = candidate({ reported_name: "Stockport Plaza", reported_website: "https://stockportplaza.co.uk/", reported_address: "Mersey Square, Stockport SK1 1SP", reported_latitude: null, reported_longitude: null });
  const b = candidate({ candidate_id: "cand-b-theplaza", discovery_provider: "PROVIDER_B", provider_record_id: "theplaza", reported_name: "The Plaza", reported_website: null, reported_address: "Mersey Sq, Stockport, SK1 1SP", reported_latitude: null, reported_longitude: null });
  const groups = reconcileCandidates([a, b]);
  assert.equal(groups.length, 2, "conservative substring/token-overlap name compatibility correctly declines to guess this real, harder case");
});

test("differing UK postcodes (structured-address conflict) keep two same-domain candidates distinct even with no coordinates at all", () => {
  const a = candidate({ reported_name: "O2 Ritz Manchester", reported_website: "https://www.academymusicgroup.com/o2ritzmanchester", reported_address: "Whitworth St West, Manchester, Greater Manchester, M1 5NQ", reported_latitude: null, reported_longitude: null });
  const b = candidate({ candidate_id: "cand-b-apollo2", discovery_provider: "PROVIDER_B", provider_record_id: "apollo2", reported_name: "O2 Apollo Manchester", reported_website: "https://www.academymusicgroup.com/o2apollomanchester", reported_address: "Stockport Rd, Ardwick, Manchester, M12 6AP", reported_latitude: null, reported_longitude: null });
  const groups = reconcileCandidates([a, b]);
  assert.equal(groups.length, 2, "differing postcodes are real conflicting evidence even when the free-text address strings are formatted differently on each side");
});

test("exact name match + one side with non-conflicting address evidence (but no coordinates) merges, even with no shared domain", () => {
  const a = candidate({ reported_name: "Aatma", reported_website: null, reported_address: "14-16 Faraday Street, Manchester M1 1BE", reported_latitude: null, reported_longitude: null });
  const b = candidate({ candidate_id: "cand-b-aatma", discovery_provider: "PROVIDER_B", provider_record_id: "aatma", reported_name: "Aatma", reported_website: "https://aatmavenue.co.uk/", reported_address: "Faraday Street 14-16", reported_latitude: 53.4826285, reported_longitude: -2.2329323 });
  const [group] = reconcileCandidates([a, b]);
  assert.equal(group.reconciliation_status, "SAME_CANDIDATE_CONFIDENT", "one side's missing postcode precision must not block an exact-name match with real, non-conflicting address evidence");
});

test("exact name match with NO address evidence on either side stays a possible duplicate, never a forced merge", () => {
  const a = candidate({ reported_name: "The Font", reported_address: null, reported_website: null, reported_latitude: null, reported_longitude: null });
  const b = candidate({ candidate_id: "cand-b-font", discovery_provider: "PROVIDER_B", provider_record_id: "font", reported_name: "The Font", reported_address: null, reported_website: null, reported_latitude: null, reported_longitude: null });
  const groups = reconcileCandidates([a, b]);
  assert.equal(groups.length, 2, "an exact name match alone, with no other corroborating evidence at all, must not be forced into a confident merge");
});

test("ambiguous name-only matches do not merge and are flagged", () => {
  const a = candidate({ reported_address: null, reported_website: null, reported_latitude: null, reported_longitude: null });
  const b = candidate({ candidate_id: "cand-b-2", discovery_provider: "PROVIDER_B", provider_record_id: "2", reported_address: null, reported_website: null, reported_latitude: null, reported_longitude: null });
  const groups = reconcileCandidates([a, b]);
  assert.equal(groups.length, 2);
  assert.ok(groups.every((group) => group.reconciliation_status === "POSSIBLE_DUPLICATE_REVIEW"));
});

test("existing BeatMapped reconciliation distinguishes acquired, inactive, venue-only, new, and possible", () => {
  const groups = reconcileCandidates([
    candidate(),
    candidate({ candidate_id: "cand-new", provider_record_id: "new", reported_name: "New Place", reported_address: "9 Elsewhere", reported_website: null }),
    candidate({ candidate_id: "cand-possible", provider_record_id: "possible", reported_name: "Name Only", reported_address: null, reported_website: null }),
  ]);
  const sourceRegistry = { entries: [
    { id: "active", name: "Cafe Hall", city: "Testville", country_code: "GB", physical_address: "1 High Street, AB1 2CD", official_website: "https://cafehall.example", active_status: "ACTIVE" },
    { id: "inactive", name: "Inactive Hall", city: "Testville", country_code: "GB", physical_address: "2 High Street", official_website: "https://inactive.example", active_status: "CLOSED" },
    { id: "possible", name: "Name Only", city: "Testville", country_code: "GB", physical_address: "Unknown", official_website: null, active_status: "ACTIVE" },
  ] };
  const reconciled = reconcileWithExistingRegistry(groups, sourceRegistry, { venues: [] });
  assert.equal(reconciled.find((g) => g.reported_names.includes("Café Hall")).existing_registry_reconciliation.status, "ALREADY_ACQUIRED");
  assert.equal(reconciled.find((g) => g.reported_names.includes("New Place")).existing_registry_reconciliation.status, "NEW_DISCOVERY_CANDIDATE");
  assert.equal(reconciled.find((g) => g.reported_names.includes("Name Only")).existing_registry_reconciliation.status, "POSSIBLE_EXISTING_MATCH_REVIEW");
});

test("provider adapter is isolated and rejects mismatched output", async () => {
  let frozen = false;
  const adapter = { providerId: "PROVIDER_A", discover(_input, received) { frozen = Object.isFrozen(received); return [candidate()]; } };
  assert.equal((await runProviderAdapter(adapter, {}, context)).length, 1);
  assert.equal(frozen, true);
  await assert.rejects(() => runProviderAdapter({ providerId: "WRONG", discover: () => [candidate()] }, {}, context), /mismatched/);
});

test("fixture-based Overpass parsing is offline, broad, and city-agnostic", () => {
  const raw = { elements: [
    { type: "node", id: 7, lat: 40, lon: -8, tags: { name: "Clube X", amenity: "bar", live_music: "yes", website: "https://x.example", "addr:city": "Coimbra" } },
    { type: "way", id: 8, center: { lat: 40.1, lon: -8.1 }, tags: { amenity: "nightclub" } },
  ] };
  const parsed = parseOverpassCandidates(raw, { city: "Coimbra", country_code: "PT", retrieved_at: context.retrieved_at });
  assert.equal(parsed.candidates.length, 1);
  assert.equal(parsed.excluded[0].reason, "MISSING_NAME");
  assert.equal(parsed.candidates[0].city, "Coimbra");
  assert.match(parsed.candidates[0].reported_category, /live_music=yes/);
});

test("generic curated-directory importer uses the same candidate contract", () => {
  const [lead] = importCuratedDirectory([{ id: "z", name: "Sala Z", address: "Rua 1" }], {
    provider_id: "CITY_DIRECTORY", provider_url: "https://city.example", city: "Lisboa", country_code: "PT", retrieved_at: context.retrieved_at,
  });
  assert.equal(lead.discovery_provider, "CITY_DIRECTORY");
  assert.deepEqual(validateVenueDiscoveryCandidate(lead), []);
});

test("retained provider fixtures parse without a network dependency", async () => {
  const osm = JSON.parse(await readFile(new URL("../research/venue-discovery/berlin-01/evidence/osm-overpass-berlin.json", import.meta.url)));
  const curated = JSON.parse(await readFile(new URL("../research/venue-discovery/berlin-01/evidence/berlin-open-data-music-relevant.json", import.meta.url), "utf8"));
  assert.equal(parseOverpassCandidates(osm, { city: "Berlin", country_code: "DE", retrieved_at: context.retrieved_at }).candidates.length, 170);
  assert.ok(curated.records.length > 0);
  assert.ok(curated.excluded.length > 0);
});

test("census construction never mutates production registry inputs", async () => {
  const sources = { entries: [{ id: "known", name: "Known", city: "Anywhere", country_code: "US", physical_address: "1 Main St, 12345", official_website: "https://known.example", active_status: "ACTIVE", genres: [] }] };
  const venues = { venues: [] };
  const before = JSON.stringify({ sources, venues });
  const result = await buildDiscoveryCensus({
    city: "Anywhere", country_code: "US", retrieved_at: context.retrieved_at, overpassRaw: { elements: [] },
    curatedInput: { records: [{ id: "1", name: "Known", address: "1 Main St, 12345" }], excluded: [] },
    curatedProviderId: "CITY_DIRECTORY", curatedProviderUrl: "https://directory.example", sourceRegistry: sources, venueRegistry: venues, providerEvidence: [],
  });
  assert.equal(result.city, "Anywhere");
  assert.equal(JSON.stringify({ sources, venues }), before);
});
