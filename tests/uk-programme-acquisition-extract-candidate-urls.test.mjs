import assert from "node:assert/strict";
import test from "node:test";

import { extractCandidateWebsite, normaliseWebsiteForDedup, buildCandidateUrlEstate } from "../ingestion/uk-programme-acquisition/extract-candidate-urls.mjs";

function venue({ venue_id, canonical_name = venue_id, evidence = [] }) {
  return { venue_id, canonical_name, evidence };
}

test("extractCandidateWebsite prefers UK_MAJOR_EVENT_CENSUS/OFFICIAL_VENUE_WEBSITE evidence over a raw OSM tag", () => {
  const v = venue({
    venue_id: "v1",
    evidence: [
      { kind: "DISCOVERY_OSM_TAGS", note: 'OSM_TAGS={"website":"https://osm-example.com/"}' },
      { kind: "UK_MAJOR_EVENT_CENSUS", url: "https://census-example.com/" },
    ],
  });
  assert.deepEqual(extractCandidateWebsite(v), { url: "https://census-example.com/", evidence_kind: "UK_MAJOR_EVENT_CENSUS" });
});

test("extractCandidateWebsite falls back to a DISCOVERY_OSM_TAGS website tag when no census/official evidence exists", () => {
  const v = venue({ venue_id: "v1", evidence: [{ kind: "DISCOVERY_OSM_TAGS", note: 'OSM_TAGS={"website":"https://osm-example.com/"}' }] });
  assert.deepEqual(extractCandidateWebsite(v), { url: "https://osm-example.com/", evidence_kind: "DISCOVERY_OSM_TAGS" });
});

test("extractCandidateWebsite falls back to contact:website when website is absent", () => {
  const v = venue({ venue_id: "v1", evidence: [{ kind: "DISCOVERY_OSM_TAGS", note: 'OSM_TAGS={"contact:website":"https://osm-example.com/"}' }] });
  assert.equal(extractCandidateWebsite(v).url, "https://osm-example.com/");
});

test("extractCandidateWebsite returns null for a venue with no website evidence at all", () => {
  const v = venue({ venue_id: "v1", evidence: [{ kind: "DISCOVERY_OSM_TAGS", note: 'OSM_TAGS={"amenity":"theatre"}' }] });
  assert.equal(extractCandidateWebsite(v), null);
});

test("extractCandidateWebsite never treats a non-http(s) value as a website (e.g. a bare domain with no scheme)", () => {
  const v = venue({ venue_id: "v1", evidence: [{ kind: "UK_MAJOR_EVENT_CENSUS", url: "not-a-url" }] });
  assert.equal(extractCandidateWebsite(v), null);
});

test("normaliseWebsiteForDedup strips protocol, www, and trailing slash", () => {
  assert.equal(normaliseWebsiteForDedup("https://www.Example.com/"), "example.com");
  assert.equal(normaliseWebsiteForDedup("http://example.com"), "example.com");
});

test("buildCandidateUrlEstate: one venue, one website -> one source, no skips", () => {
  const venues = [venue({ venue_id: "v1", evidence: [{ kind: "UK_MAJOR_EVENT_CENSUS", url: "https://a.example.com/" }] })];
  const { sources, skippedSharedWebsite, noWebsite } = buildCandidateUrlEstate(venues);
  assert.equal(sources.length, 1);
  assert.equal(skippedSharedWebsite.length, 0);
  assert.equal(noWebsite.length, 0);
});

test("buildCandidateUrlEstate: a venue with no website lands in noWebsite, never silently dropped", () => {
  const venues = [venue({ venue_id: "v1" })];
  const { sources, noWebsite } = buildCandidateUrlEstate(venues);
  assert.equal(sources.length, 0);
  assert.deepEqual(noWebsite, ["v1"]);
});

test("buildCandidateUrlEstate: two venues sharing one website -> exactly ONE source, deterministically the alphabetically-first name, the other recorded in skippedSharedWebsite", () => {
  const venues = [
    venue({ venue_id: "v-zebra", canonical_name: "Zebra Hall", evidence: [{ kind: "UK_MAJOR_EVENT_CENSUS", url: "https://shared.example.com/" }] }),
    venue({ venue_id: "v-alpha", canonical_name: "Alpha Hall", evidence: [{ kind: "UK_MAJOR_EVENT_CENSUS", url: "https://shared.example.com" }] }),
  ];
  const { sources, skippedSharedWebsite } = buildCandidateUrlEstate(venues);
  assert.equal(sources.length, 1, "exactly one source must be created for a shared website, never two conflicting entries");
  assert.equal(sources[0].venue.venue_id, "v-alpha", "the alphabetically-first canonical_name wins deterministically");
  assert.equal(skippedSharedWebsite.length, 1);
  assert.equal(skippedSharedWebsite[0].venue_id, "v-zebra");
  assert.equal(skippedSharedWebsite[0].attributed_to_venue_id, "v-alpha");
});

test("buildCandidateUrlEstate: three-way shared website still yields exactly one source and two skips", () => {
  const venues = [
    venue({ venue_id: "v1", canonical_name: "C Venue", evidence: [{ kind: "UK_MAJOR_EVENT_CENSUS", url: "https://shared.example.com/" }] }),
    venue({ venue_id: "v2", canonical_name: "A Venue", evidence: [{ kind: "UK_MAJOR_EVENT_CENSUS", url: "https://shared.example.com/" }] }),
    venue({ venue_id: "v3", canonical_name: "B Venue", evidence: [{ kind: "UK_MAJOR_EVENT_CENSUS", url: "https://shared.example.com/" }] }),
  ];
  const { sources, skippedSharedWebsite } = buildCandidateUrlEstate(venues);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].venue.venue_id, "v2");
  assert.equal(skippedSharedWebsite.length, 2);
});

test("buildCandidateUrlEstate: total accounting never loses or double-counts a venue", () => {
  const venues = [
    venue({ venue_id: "v1", canonical_name: "A", evidence: [{ kind: "UK_MAJOR_EVENT_CENSUS", url: "https://a.example.com/" }] }),
    venue({ venue_id: "v2", canonical_name: "B", evidence: [{ kind: "UK_MAJOR_EVENT_CENSUS", url: "https://shared.example.com/" }] }),
    venue({ venue_id: "v3", canonical_name: "C", evidence: [{ kind: "UK_MAJOR_EVENT_CENSUS", url: "https://shared.example.com/" }] }),
    venue({ venue_id: "v4" }),
  ];
  const { sources, skippedSharedWebsite, noWebsite } = buildCandidateUrlEstate(venues);
  assert.equal(sources.length + skippedSharedWebsite.length + noWebsite.length, venues.length);
});
