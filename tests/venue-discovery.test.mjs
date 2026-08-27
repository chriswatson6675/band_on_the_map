import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { createVenueDiscoveryCandidate, validateVenueDiscoveryCandidate } from "../ingestion/venue-discovery/contract.mjs";
import { normaliseCandidate, normaliseDomain, normaliseText } from "../ingestion/venue-discovery/normalise.mjs";
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
