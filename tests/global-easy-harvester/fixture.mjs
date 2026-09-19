// Shared fixture builder for global-easy-harvester tests. Builds a small,
// isolated temp directory tree mirroring the real repository's shapes
// (venues/<city>.json, sources/<city>.json, research/source-investigations,
// research/venue-estate, research/venue-discovery) — small, inline,
// "arbitrary.example" documents, matching tests/source-execution.test.mjs's
// own convention: never a real venue, never the London/Berlin/Paris estate.

import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export async function makeFixtureRoot() {
  const root = await mkdtemp(join(tmpdir(), "geh-test-"));

  await mkdir(join(root, "sources"), { recursive: true });
  await mkdir(join(root, "venues"), { recursive: true });
  await mkdir(join(root, "data/public"), { recursive: true });
  await mkdir(join(root, "research/source-investigations"), { recursive: true });
  await mkdir(join(root, "research/venue-estate"), { recursive: true });
  await mkdir(join(root, "research/venue-discovery/testcity-01"), { recursive: true });
  await mkdir(join(root, "research/venue-discovery/othercity-01"), { recursive: true });

  const sourceEntry = (overrides) => ({
    id: "placeholder",
    name: "placeholder",
    source_type: "VENUE",
    country_code: "TC",
    city: "Test City",
    municipality: null,
    neighbourhood: null,
    physical_address: null,
    official_website: null,
    events_url: null,
    source_priority: "P3",
    scale: "UNKNOWN",
    genres: null,
    acquisition_method: "UNKNOWN",
    acquisition_path_detail: null,
    monitoring_status: "TECHNICAL_PATH_PROVEN",
    rights_status: "UNKNOWN",
    rights_notes: null,
    rights_evidence_url: null,
    regular_future_listings: "YES",
    active_status: "ACTIVE",
    overlap_notes: null,
    research_notes: null,
    detailed_source_ref: null,
    lifecycle_status: "TECHNICALLY_REVIEWED",
    discovered_at: "2026-01-01",
    last_reviewed_at: "2026-01-01",
    research_provenance: { research_id: "fixture", review_date: "2026-01-01" },
    ...overrides,
  });

  await writeFile(
    join(root, "sources/testcity.json"),
    JSON.stringify(
      {
        $schema: "./registry.schema.json",
        region: "Test City",
        country_code: "TC",
        entries: [
          sourceEntry({
            id: "already-live-src",
            name: "Already Live Venue",
            official_website: "https://already-live.example/",
            events_url: "https://already-live.example/events",
          }),
          sourceEntry({
            id: "broken-registered-src",
            name: "Broken Registered Venue",
            official_website: "https://broken-registered.example/",
            events_url: "https://broken-registered.example/events",
          }),
          sourceEntry({
            id: "paused-src",
            name: "Paused Venue",
            official_website: "https://paused.example/",
            events_url: "https://paused.example/events",
            lifecycle_status: "PAUSED",
          }),
        ],
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(root, "sources/othercity.json"),
    JSON.stringify(
      {
        $schema: "./registry.schema.json",
        region: "Other City",
        country_code: "TC",
        // listKnownCities() derives the known city estate structurally
        // from real registry entries (matching every real sources/<city>.json
        // file, which always has entries) — an empty array would make
        // "Other City" invisible to city derivation, same as it would in
        // the real repository.
        entries: [sourceEntry({ id: "othercity-placeholder-src", name: "Other City Placeholder Source", city: "Other City", municipality: "Other City" })],
      },
      null,
      2,
    ),
  );

  const venueEntry = (overrides) => ({
    venue_id: "placeholder",
    canonical_name: "placeholder",
    country_code: "TC",
    city: "Test City",
    municipality: "Test City",
    address: "1 Test St",
    latitude: 1,
    longitude: 1,
    location_status: "CONFIRMED",
    evidence: [{ url: "https://example.test/", kind: "OFFICIAL_VENUE_WEBSITE", note: "fixture" }],
    retrieved_at: "2026-01-01",
    ...overrides,
  });

  await writeFile(
    join(root, "venues/testcity.json"),
    JSON.stringify(
      {
        region: "Test City",
        venues: [
          venueEntry({ venue_id: "venue-test-city-already-live-venue", canonical_name: "Already Live Venue" }),
          venueEntry({ venue_id: "venue-test-city-broken-registered-venue", canonical_name: "Broken Registered Venue" }),
          venueEntry({ venue_id: "venue-test-city-paused-venue", canonical_name: "Paused Venue" }),
          // Identity already known (an existing canonical Venue) for the
          // investigation fixtures below whose own investigation.json
          // carries no address — investigations prove the SOURCE path,
          // not venue geocoding (see investigations.mjs), so a candidate
          // this provider produces only clears the Tier-1 identity gate
          // when it already resolves to a registered Venue like these.
          venueEntry({ venue_id: "venue-test-city-easy-json-ld-venue", canonical_name: "Easy JSON-LD Venue" }),
          venueEntry({ venue_id: "venue-test-city-easy-json-ld-venue-two", canonical_name: "Easy JSON-LD Venue Two" }),
          venueEntry({ venue_id: "venue-test-city-browser-required-venue", canonical_name: "Browser Required Venue" }),
          venueEntry({ venue_id: "venue-test-city-ics-venue", canonical_name: "Ics Venue" }),
          venueEntry({ venue_id: "venue-test-city-social-only-venue", canonical_name: "Social Only Venue" }),
        ],
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(root, "venues/othercity.json"),
    JSON.stringify(
      {
        region: "Other City",
        venues: [
          venueEntry({ venue_id: "venue-other-city-other-city-success-venue", canonical_name: "Other City Success Venue", city: "Other City", municipality: "Other City" }),
        ],
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(root, "venues/source-venue-mappings.json"),
    JSON.stringify({ $schema_note: "fixture", mappings: [] }, null, 2),
  );

  await writeFile(
    join(root, "data/public/lisbon-porto-map.json"),
    JSON.stringify({ counts: { observation_count: 0, display_listing_count: 0, map_marker_count: 0 } }, null, 2),
  );

  return root;
}

export async function cleanupFixtureRoot(root) {
  await rm(root, { recursive: true, force: true });
}

async function writeInvestigation(root, id, record) {
  const dir = join(root, "research/source-investigations", id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, "investigation.json"), JSON.stringify(record, null, 2));
}

const baseInvestigation = (overrides) => ({
  investigation_id: "placeholder",
  policy_version: "BOTM-SOURCE-INVESTIGATION-v1.2",
  investigated_at: "2026-01-01T00:00:00Z",
  investigator: { type: "AI", method: "fixture" },
  probe_history: [{ level: 1, method: "PASSIVE_STATIC", outcome: "SUFFICIENT", reason: "fixture", evidence_refs: ["ev1"] }],
  source_candidate_id: null,
  source_id: null,
  venue_reference: "placeholder",
  official_url: null,
  identity: { status: "PROVEN", confidence: "HIGH", evidence_refs: ["ev1"], notes: null },
  site_classification: { acquisition_class: "JSON_LD_EVENT", platform: null, confidence: "HIGH", evidence_refs: ["ev1"] },
  data_paths: [],
  field_assessment: {},
  collector_assessment: { recommended_family: "JSON_LD", confidence: "HIGH", evidence_refs: [], blockers: [] },
  decision: { status: "READY_FOR_ACTIVATION", reasons: [], evidence_refs: ["ev1"] },
  supersedes: null,
  evidence: [{ evidence_id: "ev1", evidence_class: "DIRECT_EVIDENCE", description: "fixture", acquired_from: "fixture", acquired_at: "2026-01-01T00:00:00Z", method: "fixture", content_type: null, byte_faithful: true, path: null }],
  ...overrides,
});

export async function writeFixtureInvestigations(root) {
  await writeInvestigation(
    root,
    "easy-jsonld-testcity-01",
    baseInvestigation({
      investigation_id: "easy-jsonld-testcity-01",
      venue_reference: "Easy JSON-LD Venue (Test City)",
      official_url: "https://easy-jsonld.example/",
      site_classification: { acquisition_class: "JSON_LD_EVENT", platform: null, confidence: "HIGH", evidence_refs: [] },
      data_paths: [{ kind: "HTML_EVENT_LIST_PAGE_WITH_JSONLD", url: "https://easy-jsonld.example/events", access: "PUBLIC", status: "CONFIRMED", confidence: "HIGH", evidence_refs: [] }],
    }),
  );

  await writeInvestigation(
    root,
    "browser-required-testcity-01",
    baseInvestigation({
      investigation_id: "browser-required-testcity-01",
      venue_reference: "Browser Required Venue (Test City)",
      official_url: "https://browser-required.example/",
      site_classification: { acquisition_class: "HEADLESS_REQUIRED", platform: null, confidence: "HIGH", evidence_refs: [] },
      data_paths: [{ kind: "CLIENT_RENDERED_APP", url: "https://browser-required.example/events", access: "PUBLIC", status: "CONFIRMED", confidence: "HIGH", evidence_refs: [] }],
    }),
  );

  await writeInvestigation(
    root,
    "requires-adaptation-testcity-01",
    baseInvestigation({
      investigation_id: "requires-adaptation-testcity-01",
      venue_reference: "Ics Venue (Test City)",
      official_url: "https://ics-venue.example/",
      site_classification: { acquisition_class: "ICS", platform: null, confidence: "HIGH", evidence_refs: [] },
      data_paths: [{ kind: "ICS_FEED", url: "https://ics-venue.example/calendar.ics", access: "PUBLIC", status: "CONFIRMED", confidence: "HIGH", evidence_refs: [] }],
    }),
  );

  await writeInvestigation(
    root,
    "social-only-testcity-01",
    baseInvestigation({
      investigation_id: "social-only-testcity-01",
      venue_reference: "Social Only Venue (Test City)",
      official_url: "https://social-only.example/",
      site_classification: { acquisition_class: "SOCIAL_ONLY", platform: null, confidence: "HIGH", evidence_refs: [] },
    }),
  );

  await writeInvestigation(
    root,
    "already-live-testcity-01",
    baseInvestigation({
      investigation_id: "already-live-testcity-01",
      venue_reference: "Already Live Venue (Test City)",
      official_url: "https://already-live.example/",
      data_paths: [{ kind: "HTML_EVENT_LIST_PAGE_WITH_JSONLD", url: "https://already-live.example/events", access: "PUBLIC", status: "CONFIRMED", confidence: "HIGH", evidence_refs: [] }],
    }),
  );

  await writeInvestigation(
    root,
    "broken-registered-testcity-01",
    baseInvestigation({
      investigation_id: "broken-registered-testcity-01",
      venue_reference: "Broken Registered Venue (Test City)",
      official_url: "https://broken-registered.example/",
      data_paths: [{ kind: "HTML_EVENT_LIST_PAGE_WITH_JSONLD", url: "https://broken-registered.example/events", access: "PUBLIC", status: "CONFIRMED", confidence: "HIGH", evidence_refs: [] }],
    }),
  );

  await writeInvestigation(
    root,
    "paused-testcity-01",
    baseInvestigation({
      investigation_id: "paused-testcity-01",
      venue_reference: "Paused Venue (Test City)",
      official_url: "https://paused.example/",
      data_paths: [{ kind: "HTML_EVENT_LIST_PAGE_WITH_JSONLD", url: "https://paused.example/events", access: "PUBLIC", status: "CONFIRMED", confidence: "HIGH", evidence_refs: [] }],
    }),
  );

  await writeInvestigation(
    root,
    "not-ready-testcity-01",
    baseInvestigation({
      investigation_id: "not-ready-testcity-01",
      venue_reference: "Deferred Venue (Test City)",
      decision: { status: "DEFER", reasons: ["stale content"], evidence_refs: ["ev1"] },
    }),
  );
}

export async function writeFixtureVenueEstate(root) {
  await writeFile(
    join(root, "research/venue-estate/testcity-venue-estate-01.json"),
    JSON.stringify(
      {
        region: "Test City",
        venues: [
          {
            venue_name: "Unsupported Shape Venue",
            city: "Test City",
            official_website: "https://unsupported-shape.example/",
            official_programme_url: "https://unsupported-shape.example/events",
            address_text_from_evidence: "3 Test St, Test City",
            classification: "NEW_DISCOVERY",
            admitted_this_package: false,
          },
          {
            venue_name: "No Address Venue",
            city: "Test City",
            official_website: "https://no-address.example/",
            classification: "NEW_DISCOVERY",
            admitted_this_package: false,
          },
        ],
      },
      null,
      2,
    ),
  );
}

export async function writeFixtureCensus(root) {
  await writeFile(
    join(root, "research/venue-discovery/testcity-01/census.json"),
    JSON.stringify(
      {
        city: "Test City",
        country_code: "TC",
        candidates: [
          {
            reconciled_candidate_id: "cand-network-failure",
            existing_registry_reconciliation: { status: "NEW_DISCOVERY_CANDIDATE" },
            observations: [{ reported_name: "Network Failure Venue", reported_website: "https://network-failure.example/" }],
          },
        ],
      },
      null,
      2,
    ),
  );

  await writeFile(
    join(root, "research/venue-discovery/othercity-01/census.json"),
    JSON.stringify(
      {
        city: "Other City",
        country_code: "TC",
        candidates: [
          {
            reconciled_candidate_id: "cand-other-city-success",
            existing_registry_reconciliation: { status: "NEW_DISCOVERY_CANDIDATE" },
            observations: [{ reported_name: "Other City Success Venue", reported_website: "https://othercity-success.example/" }],
          },
        ],
      },
      null,
      2,
    ),
  );
}
