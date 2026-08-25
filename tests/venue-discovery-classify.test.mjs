import assert from "node:assert/strict";
import test from "node:test";
import { classifyCandidate, SIGNAL_LEVELS } from "../ingestion/venue-discovery/classify.mjs";

test("no signals classifies EXCLUDED with an explanatory reason", () => {
  const result = classifyCandidate([]);
  assert.equal(result.status, "EXCLUDED");
  assert.equal(result.reasons.length, 1);
});

test("a single STRONG signal classifies LIKELY_LIVE_MUSIC_VENUE", () => {
  const result = classifyCandidate([{ level: "STRONG", reason: "explicit music venue tag" }]);
  assert.equal(result.status, "LIKELY_LIVE_MUSIC_VENUE");
  assert.deepEqual(result.reasons, ["explicit music venue tag"]);
});

test("a single MEDIUM signal classifies POSSIBLE_LIVE_MUSIC_VENUE", () => {
  const result = classifyCandidate([{ level: "MEDIUM", reason: "live_music tag present" }]);
  assert.equal(result.status, "POSSIBLE_LIVE_MUSIC_VENUE");
});

test("a single WEAK signal classifies WEAK_CANDIDATE", () => {
  const result = classifyCandidate([{ level: "WEAK", reason: "generic nightclub" }]);
  assert.equal(result.status, "WEAK_CANDIDATE");
});

test("the strongest signal present wins, never averaged", () => {
  const result = classifyCandidate([
    { level: "WEAK", reason: "generic nightclub" },
    { level: "STRONG", reason: "explicit music venue tag" },
    { level: "MEDIUM", reason: "live_music tag present" },
  ]);
  assert.equal(result.status, "LIKELY_LIVE_MUSIC_VENUE");
  assert.equal(result.reasons.length, 3);
});

test("duplicate reasons across signals are not repeated", () => {
  const result = classifyCandidate([
    { level: "MEDIUM", reason: "live_music=yes tag present" },
    { level: "MEDIUM", reason: "live_music=yes tag present" },
  ]);
  assert.deepEqual(result.reasons, ["live_music=yes tag present"]);
});

test("malformed signal entries are ignored rather than crashing classification", () => {
  const result = classifyCandidate([null, { level: "BOGUS", reason: "x" }, { level: "STRONG" }]);
  assert.equal(result.status, "EXCLUDED");
});

test("SIGNAL_LEVELS is exactly STRONG/MEDIUM/WEAK", () => {
  assert.deepEqual([...SIGNAL_LEVELS].sort(), ["MEDIUM", "STRONG", "WEAK"]);
});
