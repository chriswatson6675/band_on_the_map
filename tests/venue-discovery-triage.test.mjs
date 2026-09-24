import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readJson = async (path) => JSON.parse(await readFile(new URL(`../${path}`, import.meta.url), "utf8"));

const statuses = new Set([
  "CURRENT_REGULAR_MUSIC_VENUE",
  "CURRENT_OCCASIONAL_BUT_MATERIAL_MUSIC_VENUE",
  "CURRENT_VENUE_MUSIC_NOT_MATERIAL",
  "CURRENT_NON_MUSIC_VENUE",
  "FESTIVAL_ONLY_OR_TEMPORARY",
  "CLOSED_OR_HISTORICAL",
  "DUPLICATE_OR_ROOM_OF_EXISTING_VENUE",
  "IDENTITY_UNCERTAIN",
  "INSUFFICIENT_EVIDENCE",
]);
const musicStatuses = new Set(["CURRENT_REGULAR_MUSIC_VENUE", "CURRENT_OCCASIONAL_BUT_MATERIAL_MUSIC_VENUE"]);

test("Berlin triage covers every new candidate exactly once", async () => {
  const census = await readJson("research/venue-discovery/berlin-01/census.json");
  const triage = await readJson("research/venue-discovery/berlin-02-triage/triage.json");
  const expected = census.candidates.filter((candidate) => candidate.existing_registry_reconciliation.status === "NEW_DISCOVERY_CANDIDATE");
  const expectedIds = new Set(expected.map((candidate) => candidate.reconciled_candidate_id));
  const actualIds = new Set(triage.candidate_ledger.map((candidate) => candidate.candidate_id));

  assert.equal(expected.length, 181);
  assert.equal(triage.candidate_ledger.length, 181);
  assert.equal(actualIds.size, 181);
  assert.deepEqual(actualIds, expectedIds);
  assert.ok(triage.candidate_ledger.every((candidate) => statuses.has(candidate.primary_status)));
});

test("possible existing matches stay outside the new-candidate ledger and are resolved separately", async () => {
  const census = await readJson("research/venue-discovery/berlin-01/census.json");
  const triage = await readJson("research/venue-discovery/berlin-02-triage/triage.json");
  const possible = census.candidates.filter((candidate) => candidate.existing_registry_reconciliation.status === "POSSIBLE_EXISTING_MATCH_REVIEW");
  const ledgerIds = new Set(triage.candidate_ledger.map((candidate) => candidate.candidate_id));
  const reviewIds = new Set(triage.identity_review_resolutions.map((candidate) => candidate.candidate_id));

  assert.equal(possible.length, 2);
  for (const candidate of possible) {
    assert.equal(ledgerIds.has(candidate.reconciled_candidate_id), false);
    assert.equal(reviewIds.has(candidate.reconciled_candidate_id), true);
  }
  const possibleReviews = triage.identity_review_resolutions.filter((candidate) => possible.some((entry) => entry.reconciled_candidate_id === candidate.candidate_id));
  assert.match(possibleReviews.find((candidate) => candidate.reported_name === "Bi Nuu").reason, /Bi Nuu/);
  assert.match(possibleReviews.find((candidate) => candidate.reported_name === "Kater Blau").reason, /Kater/);
});

test("music candidates have acquisition fields and quick wins are future-proven configuration work", async () => {
  const triage = await readJson("research/venue-discovery/berlin-02-triage/triage.json");
  const byId = new Map(triage.candidate_ledger.map((candidate) => [candidate.candidate_id, candidate]));
  const music = triage.candidate_ledger.filter((candidate) => musicStatuses.has(candidate.primary_status));

  assert.equal(music.length, 51);
  assert.ok(music.every((candidate) => candidate.future_programme_status !== "NOT_APPLICABLE"));
  assert.ok(music.every((candidate) => candidate.technical_mechanism !== "NOT_APPLICABLE"));
  assert.ok(music.every((candidate) => candidate.collector_fit));
  assert.equal(triage.quick_wins.length, 5);
  for (const quickWin of triage.quick_wins) {
    const candidate = byId.get(quickWin.candidate_id);
    assert.equal(candidate.future_programme_status, "FUTURE_PROGRAMME_PROVEN");
    assert.equal(candidate.collector_fit, "CONFIGURATION_ONLY");
    assert.match(candidate.programme_url, /^https:\/\//);
  }
});

test("coverage and the next-50 waves use venue counts rather than coordinates", async () => {
  const triage = await readJson("research/venue-discovery/berlin-02-triage/triage.json");
  assert.equal(triage.counts.current_acquired_venues, 38);
  assert.equal(triage.counts.current_music_venues_not_acquired, 51);
  assert.equal(triage.counts.practical_current_music_venue_universe, 89);
  assert.equal(triage.counts.acquisition_coverage_percentage, 42.7);
  assert.deepEqual(triage.next_50_plan.map(({ from, to }) => [from, to]), [[38, 43], [43, 51]]);
});
