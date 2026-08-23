import assert from "node:assert/strict";
import test from "node:test";
import {
  ACQUISITION_METHODS,
  MONITORING_STATUSES,
  RIGHTS_STATUSES,
  SOURCE_TYPES,
  normaliseWebsite,
  validateEntry,
  validateRegistry,
} from "../sources/registry/validate.mjs";

function baseEntry(overrides = {}) {
  return {
    id: "test-venue",
    name: "Test Venue",
    source_type: "VENUE",
    country_code: "PT",
    city: "Lisboa",
    municipality: "Lisboa",
    neighbourhood: null,
    physical_address: null,
    official_website: "https://example.pt",
    events_url: null,
    source_priority: "P1",
    scale: "SMALL",
    genres: null,
    acquisition_method: "STABLE_EVENT_PAGE",
    acquisition_path_detail: null,
    monitoring_status: "NEEDS_TECHNICAL_REVIEW",
    rights_status: "UNKNOWN",
    rights_notes: null,
    rights_evidence_url: null,
    regular_future_listings: "UNCLEAR",
    active_status: "ACTIVE",
    overlap_notes: null,
    research_notes: null,
    detailed_source_ref: null,
    lifecycle_status: "DISCOVERED",
    discovered_at: "2026-08-23",
    last_reviewed_at: "2026-08-23",
    research_provenance: {
      research_id: "BOTM-RESEARCH-LISBON-SOURCES-01",
      review_date: "2026-08-23",
      note: null,
    },
    ...overrides,
  };
}

test("validateEntry accepts a well-formed entry", () => {
  assert.deepEqual(validateEntry(baseEntry()), []);
});

test("validateEntry requires a non-empty kebab-case id", () => {
  assert.ok(validateEntry(baseEntry({ id: "" })).length > 0);
  assert.ok(validateEntry(baseEntry({ id: "Not Kebab Case" })).length > 0);
  assert.ok(validateEntry(baseEntry({ id: "UPPER" })).length > 0);
});

test("validateEntry rejects an invalid source_type", () => {
  const errors = validateEntry(baseEntry({ source_type: "BAND" }));
  assert.ok(errors.some((e) => e.includes("source_type")));
});

test("validateEntry rejects an invalid acquisition_method", () => {
  const errors = validateEntry(baseEntry({ acquisition_method: "SCRAPER" }));
  assert.ok(errors.some((e) => e.includes("acquisition_method")));
});

test("validateEntry rejects an invalid monitoring_status", () => {
  const errors = validateEntry(baseEntry({ monitoring_status: "PROBABLY_FINE" }));
  assert.ok(errors.some((e) => e.includes("monitoring_status")));
});

test("validateEntry rejects an invalid rights_status", () => {
  const errors = validateEntry(baseEntry({ rights_status: "GREENISH" }));
  assert.ok(errors.some((e) => e.includes("rights_status")));
});

test("validateEntry requires a two-letter country_code", () => {
  assert.ok(validateEntry(baseEntry({ country_code: "PRT" })).length > 0);
  assert.ok(validateEntry(baseEntry({ country_code: "pt" })).length > 0);
  assert.ok(validateEntry(baseEntry({ country_code: "" })).length > 0);
});

test("validateEntry requires a valid source_priority", () => {
  assert.ok(validateEntry(baseEntry({ source_priority: "P0" })).length > 0);
  assert.deepEqual(validateEntry(baseEntry({ source_priority: "P3" })), []);
});

test("validateEntry requires research_provenance.research_id and review_date", () => {
  const missingId = validateEntry(
    baseEntry({ research_provenance: { research_id: "", review_date: "2026-08-23" } }),
  );
  assert.ok(missingId.some((e) => e.includes("research_provenance.research_id")));

  const badDate = validateEntry(
    baseEntry({
      research_provenance: { research_id: "X", review_date: "23-08-2026" },
    }),
  );
  assert.ok(badDate.some((e) => e.includes("research_provenance.review_date")));
});

test("validateEntry requires YYYY-MM-DD discovered_at/last_reviewed_at", () => {
  assert.ok(validateEntry(baseEntry({ discovered_at: "23/08/2026" })).length > 0);
  assert.ok(validateEntry(baseEntry({ last_reviewed_at: "not-a-date" })).length > 0);
});

test("enum sets exposed by the module match the documented schema", () => {
  assert.ok(SOURCE_TYPES.has("CULTURAL_CENTRE"));
  assert.ok(ACQUISITION_METHODS.has("ICS_CALENDAR"));
  assert.ok(MONITORING_STATUSES.has("BLOCKED"));
  assert.ok(RIGHTS_STATUSES.has("AMBER"));
});

test("normaliseWebsite ignores protocol, www, and trailing slash", () => {
  assert.equal(normaliseWebsite("https://www.Example.pt/"), "example.pt");
  assert.equal(normaliseWebsite("http://example.pt"), "example.pt");
  assert.equal(normaliseWebsite(null), null);
  assert.equal(normaliseWebsite(""), null);
});

test("validateRegistry flags duplicate ids", () => {
  const errors = validateRegistry([baseEntry({ id: "dup" }), baseEntry({ id: "dup" })]);
  assert.ok(errors.some((e) => e.includes('duplicate id "dup"')));
});

test("validateRegistry flags duplicate official-website identities even with different ids", () => {
  const errors = validateRegistry([
    baseEntry({ id: "venue-a", official_website: "https://www.same-venue.pt/" }),
    baseEntry({ id: "venue-b", official_website: "https://same-venue.pt" }),
  ]);
  assert.ok(errors.some((e) => e.includes("duplicate official source identity")));
});

test("validateRegistry allows two distinct entries with different websites", () => {
  const errors = validateRegistry([
    baseEntry({ id: "venue-a", official_website: "https://venue-a.pt" }),
    baseEntry({ id: "venue-b", official_website: "https://venue-b.pt" }),
  ]);
  assert.deepEqual(errors, []);
});

test("validateRegistry tolerates entries with no official_website", () => {
  const errors = validateRegistry([
    baseEntry({ id: "venue-a", official_website: null }),
    baseEntry({ id: "venue-b", official_website: null }),
  ]);
  assert.deepEqual(errors, []);
});

test("validateRegistry rejects a non-array root", () => {
  assert.deepEqual(validateRegistry({}), ["registry root must be an array of entries"]);
});
