import assert from "node:assert/strict";
import test from "node:test";

import { selectEvidenceDocuments, checkIdentityMatch, buildInvestigationRecord } from "../ingestion/uk-programme-acquisition/investigation-writer.mjs";
import { buildInitialEntry, updateEntryFromAcquisition } from "../ingestion/uk-programme-acquisition/registry-entries.mjs";
import { TECHNICAL_MECHANISMS } from "../ingestion/venue-discovery/research-state.mjs";

function venue(overrides = {}) {
  return { venue_id: "venue-london-example-hall", canonical_name: "Example Hall", city: "London", ...overrides };
}

function entry() {
  return buildInitialEntry({ venue: venue(), website: "https://example-hall.example.com/", evidenceKind: "UK_MAJOR_EVENT_CENSUS", today: "2026-09-23" });
}

function observation(overrides = {}) {
  return {
    title: "A Real Gig",
    start: { raw: "2026-10-01", date: "2026-10-01", iso: "2026-10-01T20:00:00+01:00", is_utc: false, tzid: "Europe/London", certainty: "TZID_QUALIFIED_UNRESOLVED" },
    end: null,
    venue_name: "Example Hall",
    event_url: "https://example-hall.example.com/whats-on/a-real-gig",
    ...overrides,
  };
}

const homepageDoc = { url: "https://example-hall.example.com/", at: "2026-09-23T10:00:00.000Z", status: 200, content_type: "text/html", body: "<html><title>Example Hall - live music venue</title></html>" };
const programmeDoc = { url: "https://example-hall.example.com/whats-on", at: "2026-09-23T10:00:01.000Z", status: 200, content_type: "text/html", body: "<html>events here</html>" };

const evidenceMeta = [
  { evidence_id: "ev-1", url: homepageDoc.url, description: "Homepage fetch", content_type: "text/html", acquired_at: homepageDoc.at, path: "research/source-investigations/uk-prog-london-example-hall/evidence/homepage.html" },
  { evidence_id: "ev-2", url: programmeDoc.url, description: "Programme page fetch", content_type: "text/html", acquired_at: programmeDoc.at, path: "research/source-investigations/uk-prog-london-example-hall/evidence/programme.html" },
];

// --- selectEvidenceDocuments ---

test("selectEvidenceDocuments keeps homepage + programme + up to 2 detail docs, never more", () => {
  const result = {
    website: "https://x.example.com/",
    programme_discovery: { selected: { url: "https://x.example.com/events" } },
    evidence: [
      { url: "https://x.example.com/" },
      { url: "https://x.example.com/events" },
      { url: "https://x.example.com/events/1" },
      { url: "https://x.example.com/events/2" },
      { url: "https://x.example.com/events/3" },
    ],
  };
  const selected = selectEvidenceDocuments(result);
  assert.equal(selected.length, 4, "homepage + programme + 2 (bounded) details");
  assert.equal(selected[0].url, "https://x.example.com/");
  assert.equal(selected[1].url, "https://x.example.com/events");
});

test("selectEvidenceDocuments returns [] when acquireSource() retained nothing at all", () => {
  assert.deepEqual(selectEvidenceDocuments({ evidence: [] }), []);
});

test("selectEvidenceDocuments never selects a failed detail-fetch record (no .url, has .error) as retained evidence", () => {
  // Mirrors source-execution.mjs's own detail-fetch loop: a per-event
  // detail GET that throws is recorded as {requested_url, error,
  // network_stage} with no .url/.at — exactly the shape that produced a
  // real "evidence[3].acquired_from is required" investigation-generator
  // error against uk-prog-cambridge-corpus-playroom.
  const result = {
    website: "https://x.example.com/",
    programme_discovery: { selected: { url: "https://x.example.com/events" } },
    evidence: [
      { url: "https://x.example.com/" },
      { url: "https://x.example.com/events" },
      { url: "https://x.example.com/events/1" },
      { requested_url: "https://x.example.com/events/2", error: "TimeoutError: fetch timed out", network_stage: "READ" },
      { url: "https://x.example.com/events/3" },
    ],
  };
  const selected = selectEvidenceDocuments(result);
  assert.ok(selected.every((doc) => typeof doc.url === "string"), "every selected document must have a real .url");
  assert.ok(!selected.some((doc) => doc.error), "the failed detail-fetch record must never be selected");
  // homepage + programme + 2 bounded details, skipping the failed one
  // entirely rather than counting it toward the 2-detail cap.
  assert.deepEqual(selected.map((d) => d.url), [
    "https://x.example.com/",
    "https://x.example.com/events",
    "https://x.example.com/events/1",
    "https://x.example.com/events/3",
  ]);
});

// --- checkIdentityMatch ---

test("checkIdentityMatch finds a HIGH-confidence match when every meaningful name token appears in the retained text", () => {
  const result = checkIdentityMatch("Example Hall", [homepageDoc]);
  assert.equal(result.matched, true);
  assert.equal(result.confidence, "HIGH");
});

test("checkIdentityMatch does not match when the venue name is absent from every retained document", () => {
  const result = checkIdentityMatch("Completely Different Venue Name", [{ url: "x", body: "<html>nothing relevant here</html>" }]);
  assert.equal(result.matched, false);
});

// --- buildInvestigationRecord ---

test("ACQUISITION_PROVEN + confirmed identity + real events -> READY_FOR_ACTIVATION, and the record validates cleanly", () => {
  const result = {
    state: "ACQUISITION_PROVEN",
    collector: "JSON_LD_EVENT",
    programme_url: "https://example-hall.example.com/whats-on",
    website: "https://example-hall.example.com/",
    observations: [observation()],
  };
  const identity = checkIdentityMatch("Example Hall", [homepageDoc]);
  const { record, errors } = buildInvestigationRecord({
    sourceId: "uk-prog-london-example-hall",
    venue: venue(),
    entry: entry(),
    result,
    evidenceMeta,
    investigatedAt: "2026-09-23T10:05:00.000Z",
    identity,
  });
  assert.deepEqual(errors, [], `expected a valid record, got errors: ${JSON.stringify(errors)}`);
  assert.equal(record.decision.status, "READY_FOR_ACTIVATION");
  assert.equal(record.identity.status, "PROVEN");
  assert.equal(record.field_assessment.title.state, "PROVEN");
  assert.equal(record.field_assessment.start_date.state, "PROVEN");
  assert.equal(record.field_assessment.source_record_id.state, "UNKNOWN");
  assert.ok(record.field_assessment.source_record_id.notes.length > 0, "an UNKNOWN source_record_id must document the alternative identity strategy");
  assert.ok(record.evidence.some((e) => e.evidence_class === "DETERMINISTIC_DERIVATION"));
  assert.equal(record.probe_history.length, 1);
  assert.equal(record.probe_history[0].level, 1);
  assert.equal(record.probe_history[0].method, "PASSIVE_STATIC");
});

test("ACQUISITION_PROVEN but identity NOT confirmed -> HUMAN_REVIEW, never silently activated", () => {
  const result = {
    state: "ACQUISITION_PROVEN",
    collector: "JSON_LD_EVENT",
    programme_url: "https://example-hall.example.com/whats-on",
    website: "https://example-hall.example.com/",
    observations: [observation()],
  };
  const identity = checkIdentityMatch("Totally Unrelated Name", [{ url: "x", body: "no match here" }]);
  const { record, errors } = buildInvestigationRecord({
    sourceId: "uk-prog-london-example-hall",
    venue: venue(),
    entry: entry(),
    result,
    evidenceMeta,
    investigatedAt: "2026-09-23T10:05:00.000Z",
    identity,
  });
  assert.deepEqual(errors, []);
  assert.equal(record.decision.status, "HUMAN_REVIEW");
  assert.ok(record.decision.reasons.length > 0);
});

test("ACQUISITION_PROVEN with zero proven observations -> DEFER, never READY_FOR_ACTIVATION", () => {
  const result = {
    state: "ACQUISITION_PROVEN",
    collector: "JSON_LD_EVENT",
    programme_url: "https://example-hall.example.com/whats-on",
    website: "https://example-hall.example.com/",
    observations: [],
  };
  const identity = checkIdentityMatch("Example Hall", [homepageDoc]);
  const { record, errors } = buildInvestigationRecord({
    sourceId: "uk-prog-london-example-hall",
    venue: venue(),
    entry: entry(),
    result,
    evidenceMeta,
    investigatedAt: "2026-09-23T10:05:00.000Z",
    identity,
  });
  assert.deepEqual(errors, []);
  assert.equal(record.decision.status, "DEFER");
});

const RESIDUE_CASES = [
  "NETWORK_FAILURE",
  "PROGRAMME_SOURCE_UNRESOLVED",
  "ACCESS_BLOCKED",
  "BROWSER_REQUIRED",
  "SOCIAL_FIRST_PROGRAMME",
  "IMAGE_OR_POSTER_ONLY",
  "PROGRAMME_EMPTY",
  "SOURCE_FINGERPRINT_UNSUPPORTED",
  "STABLE_IDENTITY_PROOF_FAILED",
  "SUPPORTED_COLLECTOR_NO_VALID_EVENTS",
];

for (const state of RESIDUE_CASES) {
  test(`residue state ${state} -> DEFER, and the record validates cleanly with at least one retained evidence item`, () => {
    const result = { state, collector: null, programme_url: state === "PROGRAMME_EMPTY" ? "https://example-hall.example.com/whats-on" : null, website: "https://example-hall.example.com/", observations: [] };
    const identity = { matched: false, confidence: "LOW" };
    const { record, errors } = buildInvestigationRecord({
      sourceId: "uk-prog-london-example-hall",
      venue: venue(),
      entry: entry(),
      result,
      evidenceMeta: [evidenceMeta[0]],
      investigatedAt: "2026-09-23T10:05:00.000Z",
      identity,
    });
    assert.deepEqual(errors, [], `${state}: expected a valid record, got errors: ${JSON.stringify(errors)}`);
    assert.equal(record.decision.status, "DEFER");
    assert.ok(record.decision.reasons.length > 0);
    assert.ok(record.evidence.length > 0, "every investigation must retain at least one evidence item, even a residue/failure outcome");
  });
}

test("ACCESS_BLOCKED specifically records a CRITICAL blocker in collector_assessment", () => {
  const result = { state: "ACCESS_BLOCKED", collector: null, programme_url: null, website: "https://example-hall.example.com/", observations: [] };
  const { record } = buildInvestigationRecord({
    sourceId: "uk-prog-london-example-hall",
    venue: venue(),
    entry: entry(),
    result,
    evidenceMeta: [evidenceMeta[0]],
    investigatedAt: "2026-09-23T10:05:00.000Z",
    identity: { matched: false, confidence: "LOW" },
  });
  assert.ok(record.collector_assessment.blockers.some((b) => b.severity === "CRITICAL"));
});

// BEATMAPPED-UK-NATIONAL-VENUE-PROGRAMME-ACQUISITION-01: a real gap found
// at national scale — STATIC_HTML_CARDS (Brighton Dome's own real, live
// site, 31 genuinely proven events) was missing from the mechanism
// mapping table, silently downgrading site_classification.acquisition_class
// to AMBIGUOUS and blocking an otherwise-earned READY_FOR_ACTIVATION. This
// test proves EVERY "real collecting" TECHNICAL_MECHANISMS member (every
// one that can legitimately accompany a real ACQUISITION_PROVEN result) is
// mapped to a genuinely resolved, activation-eligible classification — not
// just the handful this package's own early smoke testing happened to
// exercise — so this exact class of silent-suppression bug can never
// regress unnoticed for whichever mechanism is added or hit next.
const RESIDUE_ONLY_MECHANISMS = new Set(["IMAGE_OR_POSTER_PROGRAMME", "SOCIAL_FIRST_PROGRAMME", "CLIENT_RENDERED_UNKNOWN", "ACCESS_BLOCKED", "NO_CURRENT_PROGRAMME_FOUND", "OTHER"]);
const REAL_COLLECTING_MECHANISMS = [...TECHNICAL_MECHANISMS].filter((m) => !RESIDUE_ONLY_MECHANISMS.has(m));

test("every real-collecting TECHNICAL_MECHANISMS value maps to a resolved, activation-eligible acquisition_class and collector family", () => {
  for (const mechanism of REAL_COLLECTING_MECHANISMS) {
    const result = {
      state: "ACQUISITION_PROVEN",
      collector: mechanism,
      programme_url: "https://example-hall.example.com/whats-on",
      website: "https://example-hall.example.com/",
      observations: [observation()],
    };
    const { record, errors } = buildInvestigationRecord({
      sourceId: "uk-prog-london-example-hall",
      venue: venue(),
      entry: entry(),
      result,
      evidenceMeta,
      investigatedAt: "2026-09-23T10:05:00.000Z",
      identity: checkIdentityMatch("Example Hall", [homepageDoc]),
    });
    assert.deepEqual(errors, [], `${mechanism}: record must validate`);
    assert.equal(record.decision.status, "READY_FOR_ACTIVATION", `${mechanism} must not be silently blocked from activation by an unmapped classification`);
    assert.notEqual(record.site_classification.acquisition_class, "AMBIGUOUS", `${mechanism} must not fall back to AMBIGUOUS`);
    assert.notEqual(record.site_classification.acquisition_class, "UNKNOWN", `${mechanism} must not fall back to UNKNOWN`);
    assert.ok(record.collector_assessment.recommended_family, `${mechanism} must resolve to a real collector family, not null`);
  }
});

test("every real-collecting TECHNICAL_MECHANISMS value also maps to a resolved registry acquisition_method (never UNKNOWN)", () => {
  for (const mechanism of REAL_COLLECTING_MECHANISMS) {
    const initial = buildInitialEntry({ venue: venue(), website: "https://example-hall.example.com/", evidenceKind: "UK_MAJOR_EVENT_CENSUS", today: "2026-09-23" });
    const updated = updateEntryFromAcquisition(initial, {
      result: { state: "ACQUISITION_PROVEN", collector: mechanism, programme_url: "https://example-hall.example.com/whats-on", proven_event_count: 1, normalized_event_count: 1 },
      today: "2026-09-24",
      hasFutureDatedEvent: true,
    });
    assert.notEqual(updated.acquisition_method, "UNKNOWN", `${mechanism} must resolve to a real registry acquisition_method`);
  }
});

test("source_id is null unless the decision reached READY_FOR_ACTIVATION (investigation vs activation stay separate)", () => {
  const provenResult = { state: "ACQUISITION_PROVEN", collector: "JSON_LD_EVENT", programme_url: "https://example-hall.example.com/whats-on", website: "https://example-hall.example.com/", observations: [observation()] };
  const { record: activated } = buildInvestigationRecord({ sourceId: "uk-prog-london-example-hall", venue: venue(), entry: entry(), result: provenResult, evidenceMeta, investigatedAt: "2026-09-23T10:05:00.000Z", identity: checkIdentityMatch("Example Hall", [homepageDoc]) });
  assert.equal(activated.source_id, "uk-prog-london-example-hall");

  const deferredResult = { state: "PROGRAMME_EMPTY", collector: null, programme_url: "https://example-hall.example.com/whats-on", website: "https://example-hall.example.com/", observations: [] };
  const { record: deferred } = buildInvestigationRecord({ sourceId: "uk-prog-london-example-hall", venue: venue(), entry: entry(), result: deferredResult, evidenceMeta: [evidenceMeta[0]], investigatedAt: "2026-09-23T10:05:00.000Z", identity: { matched: false, confidence: "LOW" } });
  assert.equal(deferred.source_id, null);
});
