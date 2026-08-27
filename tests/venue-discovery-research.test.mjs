import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

import { buildDiscoveryCensus } from "../ingestion/venue-discovery/run.mjs";
import {
  ACQUISITION_READINESS,
  EVIDENCE_STATES,
  TECHNICAL_MECHANISMS,
  VENUE_LIKELIHOODS,
  createCandidateResearch,
  validateCandidateResearch,
} from "../ingestion/venue-discovery/research-state.mjs";
import {
  fingerprintProgrammeSurface,
  justifyLikelyBespoke,
  routeCollectorCapability,
} from "../ingestion/venue-discovery/programme-fingerprint.mjs";
import {
  RESEARCH_ESCALATION_STAGES,
  createResearchQueueItem,
  nextResearchStage,
  routeCandidateResearch,
} from "../ingestion/venue-discovery/research-routing.mjs";
import {
  isReverificationDue,
  mergeResearchMemory,
  serializeResearchMemory,
} from "../ingestion/venue-discovery/research-memory.mjs";

const base = (overrides = {}) => createCandidateResearch({
  candidate_id: "candidate-1",
  city: "Example City",
  country_code: "GB",
  identity: { status: "PARTIAL", aliases: ["Example Hall"], confidence: "MEDIUM" },
  known: ["A discovery provider reported the candidate."],
  unknown: ["Current venue and programme status remain unresolved."],
  ...overrides,
});

test("research vocabularies expose the three independent state dimensions", () => {
  assert.equal(VENUE_LIKELIHOODS.size, 7);
  assert.equal(ACQUISITION_READINESS.size, 8);
  assert.equal(EVIDENCE_STATES.size, 13);
  assert.ok(TECHNICAL_MECHANISMS.has("PUBLIC_GRAPHQL"));
  assert.ok(TECHNICAL_MECHANISMS.has("SOCIAL_FIRST_PROGRAMME"));
});

test("a proven current music venue may retain an unresolved acquisition source", () => {
  const record = base({
    venue_likelihood: "PROVEN_CURRENT_MUSIC_VENUE",
    acquisition_readiness: "SOURCE_IDENTITY_UNRESOLVED",
    evidence_state: "CURRENT_MUSIC_VENUE_SOURCE_UNRESOLVED",
  });
  assert.deepEqual(validateCandidateResearch(record), []);
  assert.equal(routeCandidateResearch(record).next_action, "AI_RESEARCH_REQUIRED");
  assert.equal(record.venue_likelihood, "PROVEN_CURRENT_MUSIC_VENUE");
});

test("third-party and social programmes support venue status without becoming first-party acquisition", () => {
  const thirdParty = base({
    venue_likelihood: "LIKELY_CURRENT_MUSIC_VENUE",
    acquisition_readiness: "THIRD_PARTY_PROGRAMME_ONLY",
    evidence_state: "THIRD_PARTY_EVIDENCE_ONLY",
    programme: { third_party_urls: ["https://tickets.example/venue/1"], future_events_visible: true },
  });
  const social = base({
    venue_likelihood: "LIKELY_CURRENT_MUSIC_VENUE",
    acquisition_readiness: "SOCIAL_FIRST_PROGRAMME",
    evidence_state: "SOCIAL_FIRST_CURRENT_VENUE",
    programme: { official_social_urls: ["https://social.example/example-hall"], future_events_visible: true },
  });
  assert.deepEqual(validateCandidateResearch(thirdParty), []);
  assert.deepEqual(validateCandidateResearch(social), []);
  assert.equal(thirdParty.programme.first_party_url, null);
  assert.equal(social.programme.first_party_url, null);
});

test("current place with unproven music role does not enter acquisition work", () => {
  const record = base({
    venue_likelihood: "CURRENT_PLACE_MUSIC_NOT_PROVEN",
    acquisition_readiness: "NO_PROGRAMME_FOUND",
    evidence_state: "CURRENT_PLACE_PROVEN_MUSIC_ROLE_UNPROVEN",
  });
  assert.equal(routeCandidateResearch(record).next_action, "NO_FURTHER_ACTION");
});

test("investigation limitations are queue state, never negative venue evidence", () => {
  const limited = base({
    evidence_state: "ACCESS_OR_DISCOVERY_LIMITATION",
    limitations: [{ kind: "ACCESS_BLOCKED", summary: "The bounded request returned 403.", evidence_refs: ["limit-1"] }],
    evidence: [{
      evidence_id: "limit-1", purpose: "INVESTIGATION_LIMITATION", source_kind: "TECHNICAL_OBSERVATION",
      confidence: "HIGH", reference: "https://venue.example/events", observed_at: "2026-08-27T00:00:00.000Z",
      summary: "HTTP 403 constrained this investigation; it says nothing about whether the venue exists.",
    }],
  });
  assert.deepEqual(validateCandidateResearch(limited), []);
  assert.equal(routeCandidateResearch(limited).next_action, "RETRY_LATER");
  const fingerprint = fingerprintProgrammeSurface({ status: 403, url: "https://venue.example/events" });
  assert.equal(fingerprint.mechanism, "ACCESS_BLOCKED");
  assert.equal(fingerprint.negative_venue_evidence, false);
  assert.equal(routeCollectorCapability(fingerprint.mechanism), "CURRENTLY_BLOCKED");
});

test("closure requires closure-purpose evidence and cannot be inferred from a failed tool", () => {
  assert.throws(
    () => base({ venue_likelihood: "LIKELY_CLOSED_OR_HISTORICAL", evidence_state: "LIKELY_CLOSED_OR_HISTORICAL" }),
    /requires closure-purpose evidence/,
  );
});

test("technical fingerprinting classifies reusable mechanisms deterministically", () => {
  const cases = [
    [{ body: '<script type="application/ld+json">{"@type":"Event"}</script>' }, "JSON_LD_EVENT"],
    [{ body: '<div itemscope itemtype="https://schema.org/MusicEvent"><time itemprop="startDate"></time></div>' }, "MICRODATA"],
    [{ body: "BEGIN:VEVENT\nSUMMARY:Show", content_type: "text/calendar" }, "ICS_OR_ICAL"],
    [{ body: '<div class="tribe-events"></div>' }, "WORDPRESS_TRIBE_API"],
    [{ body: '{"events":[{"start_date":"2026-09-01"}]}', content_type: "application/json" }, "PUBLIC_REST_JSON"],
    [{ body: '<script id="__NEXT_DATA__" type="application/json">{}</script>' }, "EMBEDDED_NEXT_DATA"],
    [{ body: '<div data-wf-page="abc">Events</div>' }, "WEBFLOW"],
    [{ body: '<div id="root"></div><script src="app.js"></script>' }, "CLIENT_RENDERED_UNKNOWN"],
  ];
  for (const [input, expected] of cases) assert.equal(fingerprintProgrammeSurface(input).mechanism, expected);
  const perEvent = fingerprintProgrammeSurface({ links: [{ url: "https://venue.example/show.ics", text: "Add to calendar", role: "EVENT_DOWNLOAD" }] });
  assert.equal(perEvent.mechanism, "PER_EVENT_ICS");
});

test("collector routing prefers reusable capability layers and guards bespoke classification", () => {
  assert.equal(routeCollectorCapability("JSON_LD_EVENT"), "EXISTING_COLLECTOR_ZERO_CODE");
  assert.equal(routeCollectorCapability("STATIC_HTML_CARDS"), "CONFIGURATION_ONLY");
  assert.equal(routeCollectorCapability("EMBEDDED_NUXT_STATE"), "GENERIC_CAPABILITY_WIDENING");
  assert.equal(routeCollectorCapability("PUBLIC_GRAPHQL"), "NEW_REUSABLE_COLLECTOR_FAMILY");
  assert.throws(() => justifyLikelyBespoke({ reusable_routes_considered: ["CONFIGURATION_ONLY"], reason: "This source is unusual and needs custom parsing." }), /every reusable collector route/);
  assert.equal(justifyLikelyBespoke({
    reusable_routes_considered: ["EXISTING_COLLECTOR_ZERO_CODE", "CONFIGURATION_ONLY", "GENERIC_CAPABILITY_WIDENING", "NEW_REUSABLE_COLLECTOR_FAMILY"],
    reason: "Retained evidence proves a source-specific binary protocol after all reusable public families were rejected.",
  }), "LIKELY_BESPOKE");
});

test("research escalation is provider-neutral, ordered, and produces processable queue items", () => {
  assert.deepEqual(RESEARCH_ESCALATION_STAGES.map((item) => item.order), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  assert.equal(nextResearchStage([]).stage, "IDENTITY_RECONCILIATION");
  assert.equal(nextResearchStage(["IDENTITY_RECONCILIATION"]).stage, "OFFICIAL_WEBSITE_RESOLUTION");
  const queue = createResearchQueueItem(base({ evidence_state: "INVESTIGATION_INCOMPLETE" }));
  assert.equal(queue.next_action, "DETERMINISTIC_CONTINUE");
  assert.equal(queue.deterministic_sub_action, "OFFICIAL_WEBSITE_RESOLUTION");
});

test("Berlin outcomes are represented as data without a Berlin runtime branch", async () => {
  const examples = [
    base({ candidate_id: "panke-regression", city: "Berlin", country_code: "DE", venue_likelihood: "PROVEN_CURRENT_MUSIC_VENUE", acquisition_readiness: "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN", evidence_state: "LIKELY_CURRENT_MUSIC_VENUE_FIRST_PARTY_PROOF_WEAK", programme: { first_party_url: "https://venue.example/programme", future_events_visible: true } }),
    base({ candidate_id: "rso-regression", city: "Berlin", country_code: "DE", venue_likelihood: "PROVEN_CURRENT_MUSIC_VENUE", acquisition_readiness: "SOURCE_IDENTITY_UNRESOLVED", evidence_state: "CURRENT_MUSIC_VENUE_SOURCE_UNRESOLVED" }),
    base({ candidate_id: "social-regression", city: "Berlin", country_code: "DE", venue_likelihood: "LIKELY_CURRENT_MUSIC_VENUE", acquisition_readiness: "SOCIAL_FIRST_PROGRAMME", evidence_state: "SOCIAL_FIRST_CURRENT_VENUE", programme: { official_social_urls: ["https://social.example/venue"] } }),
    base({ candidate_id: "place-regression", city: "Berlin", country_code: "DE", venue_likelihood: "CURRENT_PLACE_MUSIC_NOT_PROVEN", acquisition_readiness: "NO_PROGRAMME_FOUND", evidence_state: "CURRENT_PLACE_PROVEN_MUSIC_ROLE_UNPROVEN" }),
    base({ candidate_id: "low-evidence-regression", city: "Berlin", country_code: "DE", venue_likelihood: "UNKNOWN", acquisition_readiness: "NO_PROGRAMME_FOUND", evidence_state: "NO_MEANINGFUL_CURRENT_EVIDENCE_FOUND" }),
    base({ candidate_id: "identity-regression", city: "Berlin", country_code: "DE", identity: { status: "AMBIGUOUS", aliases: ["Room Name"], confidence: "LOW" }, evidence_state: "IDENTITY_PROBLEM_DISCOVERED" }),
  ];
  assert.deepEqual(examples.map((record) => routeCandidateResearch(record).next_action), [
    "DETERMINISTIC_CONTINUE", "AI_RESEARCH_REQUIRED", "AI_RESEARCH_REQUIRED",
    "NO_FURTHER_ACTION", "NO_FURTHER_ACTION", "HUMAN_REVIEW_REQUIRED",
  ]);
  assert.equal(examples[1].venue_likelihood, "PROVEN_CURRENT_MUSIC_VENUE", "source-unresolved must not degrade to generic insufficient evidence");
  const source = await readFile(new URL("../ingestion/venue-discovery/research-routing.mjs", import.meta.url), "utf8");
  assert.equal(/Berlin|Panke|RSO/.test(source), false);
});

test("an arbitrary non-Berlin city receives the same initial research state", async () => {
  const census = await buildDiscoveryCensus({
    city: "Manchester", country_code: "GB", retrieved_at: "2026-08-27T00:00:00.000Z",
    overpassRaw: { elements: [] },
    curatedInput: { records: [{ id: "m1", name: "Northern Test Hall", address: "1 Example Road", website: "https://northern.example" }], excluded: [] },
    curatedProviderId: "MUNICIPAL_DIRECTORY", curatedProviderUrl: "https://directory.example/manchester",
    sourceRegistry: { entries: [] }, venueRegistry: { venues: [] }, providerEvidence: [],
  });
  const [candidate] = census.candidates;
  assert.equal(candidate.city, "Manchester");
  assert.equal(candidate.candidate_research.city, "Manchester");
  assert.equal(candidate.candidate_research.venue_likelihood, "UNKNOWN");
  assert.equal(candidate.handoff.next_action, "DETERMINISTIC_CONTINUE");
  assert.equal(JSON.stringify(candidate).includes("Berlin"), false);
});

test("persistent memory is deterministic, re-verifiable, and survives a temporary access failure", () => {
  const proven = base({
    venue_likelihood: "PROVEN_CURRENT_MUSIC_VENUE",
    acquisition_readiness: "FIRST_PARTY_FUTURE_PROGRAMME_PROVEN",
    evidence_state: "LIKELY_CURRENT_MUSIC_VENUE_FIRST_PARTY_PROOF_WEAK",
    programme: { first_party_url: "https://venue.example/events", future_events_visible: true },
    memory: { verification_state: "CURRENT", last_verified_at: "2026-08-01T00:00:00.000Z", reverify_after: "2026-09-01T00:00:00.000Z" },
  });
  const limited = base({
    evidence_state: "ACCESS_OR_DISCOVERY_LIMITATION",
    limitations: [{ kind: "HTTP_429", summary: "Periodic recheck was rate limited.", evidence_refs: ["limit"] }],
    evidence: [{ evidence_id: "limit", purpose: "INVESTIGATION_LIMITATION", source_kind: "TECHNICAL_OBSERVATION", confidence: "HIGH", reference: "https://venue.example/events", observed_at: "2026-08-27T00:00:00.000Z", summary: "HTTP 429 during re-verification." }],
  });
  const merged = mergeResearchMemory(proven, limited, { verified_at: "2026-08-27T00:00:00.000Z", reverify_after: "2026-09-03T00:00:00.000Z" });
  assert.equal(merged.venue_likelihood, "PROVEN_CURRENT_MUSIC_VENUE");
  assert.equal(merged.memory.verification_state, "REVERIFY_BLOCKED");
  assert.equal(isReverificationDue(proven, new Date("2026-09-02T00:00:00.000Z")), true);
  assert.equal(serializeResearchMemory(merged), serializeResearchMemory(merged));
  assert.deepEqual(JSON.parse(serializeResearchMemory(merged)), JSON.parse(serializeResearchMemory(merged)));
});
