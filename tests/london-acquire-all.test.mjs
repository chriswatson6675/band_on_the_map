// BEATMAPPED-LONDON-FIRST-TRANCHE-MAIN-REBASE-AND-MUSIC-GATE-01 — proves
// ingestion/london/run.mjs's acquireAll() isolates one source's failure
// from every other source (never a whole-run abort), and that
// applyMusicGate() only ever removes the exact excluded titles it names,
// never a wider set — no live network in this test.

import assert from "node:assert/strict";
import test from "node:test";
import { acquireAll, applyMusicGate, LONDON_SOURCE_IDS } from "../ingestion/london/run.mjs";

test("LONDON_SOURCE_IDS lists exactly the 6 first-tranche sources", () => {
  assert.deepEqual(LONDON_SOURCE_IDS, [
    "downstairs-at-the-dome-london",
    "night-tales-loft-london",
    "the-roxy-london",
    "100-club-london",
    "the-underworld-london",
    "jazz-cafe-posk-london",
  ]);
});

test("acquireAll isolates one failing source from the other 5 — a thrown collector never aborts the run", async () => {
  const registryEntries = LONDON_SOURCE_IDS.map((id) => ({ id }));
  const collectors = Object.fromEntries(
    LONDON_SOURCE_IDS.map((id) => [
      id,
      id === "the-roxy-london"
        ? async () => { throw new Error("simulated HTTP 500"); }
        : async () => ({ rawRecordCount: 2, observations: [{ source_id: id, title: "X" }], notes: [] }),
    ]),
  );

  const results = await acquireAll(LONDON_SOURCE_IDS, registryEntries, collectors);

  assert.equal(results.length, 6);
  const roxy = results.find((r) => r.source_id === "the-roxy-london");
  assert.equal(roxy.success, false);
  assert.match(roxy.error, /simulated HTTP 500/);
  for (const r of results.filter((r) => r.source_id !== "the-roxy-london")) {
    assert.equal(r.success, true);
    assert.equal(r.observation_count, 1);
  }
});

test("acquireAll fails a source cleanly when it is not present in the supplied registry entries", async () => {
  const registryEntries = []; // no entries at all
  const collectors = { "100-club-london": async () => ({ rawRecordCount: 0, observations: [], notes: [] }) };
  const results = await acquireAll(["100-club-london"], registryEntries, collectors);
  assert.equal(results[0].success, false);
  assert.match(results[0].error, /not present in sources\/london\.json/);
});

test("applyMusicGate removes only the exact excluded titles for a source, never a wider set", () => {
  const observations = [{ title: "CLINTON BAPTISTE’S SUNDAY SEANCE" }, { title: "UNTITLED" }, { title: "A REAL BAND" }];
  const { keptObservations, excludedCount } = applyMusicGate("100-club-london", observations);
  assert.equal(excludedCount, 2);
  assert.deepEqual(keptObservations.map((o) => o.title), ["A REAL BAND"]);
});

test("applyMusicGate is a no-op for a source with no configured exclusions", () => {
  const observations = [{ title: "ANYTHING" }, { title: "ANYTHING ELSE" }];
  const { keptObservations, excludedCount } = applyMusicGate("the-underworld-london", observations);
  assert.equal(excludedCount, 0);
  assert.equal(keptObservations.length, 2);
});
