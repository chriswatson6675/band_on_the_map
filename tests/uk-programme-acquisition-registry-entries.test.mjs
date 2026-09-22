import assert from "node:assert/strict";
import test from "node:test";

import { buildInitialEntry, updateEntryFromAcquisition, deriveSourceId } from "../ingestion/uk-programme-acquisition/registry-entries.mjs";
import { validateEntry, validateRegistry } from "../sources/registry/validate.mjs";

function venue(overrides = {}) {
  return {
    venue_id: "venue-london-example-hall",
    canonical_name: "Example Hall",
    city: "London",
    municipality: "London Borough of Camden",
    address: "1 Example Street, London",
    ...overrides,
  };
}

test("deriveSourceId strips the venue- prefix and re-namespaces under uk-prog-", () => {
  assert.equal(deriveSourceId("venue-london-example-hall"), "uk-prog-london-example-hall");
});

test("buildInitialEntry produces a schema-valid entry with honest not-yet-determined defaults", () => {
  const entry = buildInitialEntry({ venue: venue(), website: "https://example-hall.example.com/", evidenceKind: "UK_MAJOR_EVENT_CENSUS", today: "2026-09-23" });
  const errors = validateEntry(entry, 0);
  assert.deepEqual(errors, []);
  assert.equal(entry.lifecycle_status, "DISCOVERED");
  assert.equal(entry.monitoring_status, "READY_FOR_TECHNICAL_PROOF");
  assert.equal(entry.acquisition_method, "UNKNOWN");
  assert.equal(entry.official_website, "https://example-hall.example.com/");
});

test("buildInitialEntry entries pass full registry validation as a set (id uniqueness, no duplicate website)", () => {
  const entries = [
    buildInitialEntry({ venue: venue({ venue_id: "venue-a", canonical_name: "A" }), website: "https://a.example.com/", evidenceKind: "UK_MAJOR_EVENT_CENSUS", today: "2026-09-23" }),
    buildInitialEntry({ venue: venue({ venue_id: "venue-b", canonical_name: "B" }), website: "https://b.example.com/", evidenceKind: "UK_MAJOR_EVENT_CENSUS", today: "2026-09-23" }),
  ];
  const errors = validateRegistry(entries);
  assert.deepEqual(errors, []);
});

test("updateEntryFromAcquisition: ACQUISITION_PROVEN with a future-dated event reaches TECHNICALLY_REVIEWED/TECHNICAL_PATH_PROVEN/YES", () => {
  const initial = buildInitialEntry({ venue: venue(), website: "https://example-hall.example.com/", evidenceKind: "UK_MAJOR_EVENT_CENSUS", today: "2026-09-23" });
  const updated = updateEntryFromAcquisition(initial, {
    result: { state: "ACQUISITION_PROVEN", collector: "JSON_LD_EVENT", programme_url: "https://example-hall.example.com/whats-on", proven_event_count: 5, normalized_event_count: 6 },
    today: "2026-09-24",
    hasFutureDatedEvent: true,
  });
  assert.equal(updated.lifecycle_status, "TECHNICALLY_REVIEWED");
  assert.equal(updated.monitoring_status, "TECHNICAL_PATH_PROVEN");
  assert.equal(updated.acquisition_method, "JSON_LD_EVENT");
  assert.equal(updated.regular_future_listings, "YES");
  assert.equal(updated.events_url, "https://example-hall.example.com/whats-on");
  const errors = validateEntry(updated, 0);
  assert.deepEqual(errors, []);
});

test("updateEntryFromAcquisition: a residue state never advances lifecycle_status past DISCOVERED, and stays schema-valid", () => {
  const initial = buildInitialEntry({ venue: venue(), website: "https://example-hall.example.com/", evidenceKind: "UK_MAJOR_EVENT_CENSUS", today: "2026-09-23" });
  const updated = updateEntryFromAcquisition(initial, {
    result: { state: "ACCESS_BLOCKED", collector: null, programme_url: null, proven_event_count: 0, normalized_event_count: 0 },
    today: "2026-09-24",
    hasFutureDatedEvent: false,
  });
  assert.equal(updated.lifecycle_status, "DISCOVERED");
  assert.equal(updated.monitoring_status, "BLOCKED");
  const errors = validateEntry(updated, 0);
  assert.deepEqual(errors, []);
});

test("updateEntryFromAcquisition: PROGRAMME_EMPTY is honestly recorded as NO regular_future_listings, not UNCLEAR", () => {
  const initial = buildInitialEntry({ venue: venue(), website: "https://example-hall.example.com/", evidenceKind: "UK_MAJOR_EVENT_CENSUS", today: "2026-09-23" });
  const updated = updateEntryFromAcquisition(initial, {
    result: { state: "PROGRAMME_EMPTY", collector: null, programme_url: "https://example-hall.example.com/whats-on", proven_event_count: 0, normalized_event_count: 0 },
    today: "2026-09-24",
    hasFutureDatedEvent: false,
  });
  assert.equal(updated.regular_future_listings, "NO");
  assert.equal(updated.acquisition_method, "NO_USEFUL_PUBLIC_SCHEDULE");
  assert.deepEqual(validateEntry(updated, 0), []);
});

test("updateEntryFromAcquisition: SOCIAL_FIRST_PROGRAMME maps to acquisition_method SOCIAL_ONLY and monitoring_status UNSUITABLE_AUTOMATION", () => {
  const initial = buildInitialEntry({ venue: venue(), website: "https://example-hall.example.com/", evidenceKind: "UK_MAJOR_EVENT_CENSUS", today: "2026-09-23" });
  const updated = updateEntryFromAcquisition(initial, {
    result: { state: "SOCIAL_FIRST_PROGRAMME", collector: null, programme_url: null, proven_event_count: 0, normalized_event_count: 0 },
    today: "2026-09-24",
    hasFutureDatedEvent: false,
  });
  assert.equal(updated.acquisition_method, "SOCIAL_ONLY");
  assert.equal(updated.monitoring_status, "UNSUITABLE_AUTOMATION");
  assert.deepEqual(validateEntry(updated, 0), []);
});
