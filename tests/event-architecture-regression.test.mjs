// BEATMAPPED-EVENT-IDENTITY-ADMISSION-FOUNDATION-01 — structural controls
// on the Event foundation.
//
// These assert properties of the CODE and the repository, not of one
// record: that the foundation stayed domain-neutral, that it touches no
// publication path, and that the architectural invariants the merged
// contract states are still enforced by behaviour rather than by prose.

import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createObservation } from "../ingestion/observation/contract.mjs";
import { createEvent, createEventId } from "../ingestion/event/contract.mjs";
import { validateOccurrenceMapping } from "../ingestion/event/occurrence-mapping.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const EVENT_MODULES = [
  "ingestion/event/contract.mjs",
  "ingestion/event/occurrence-mapping.mjs",
  "ingestion/event/schedule-history.mjs",
  "ingestion/event/registry.mjs",
  "ingestion/event/admission.mjs",
];

const readModule = async (path) => readFile(resolve(ROOT, path), "utf8");

/** Source with comments stripped — what the code actually does. */
const codeOnly = (source) => source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ---------------------------------------------------------------- */
/* DOMAIN NEUTRALITY                                                 */
/* ---------------------------------------------------------------- */

test("no Event module contains domain-specific admission logic", async () => {
  for (const path of EVENT_MODULES) {
    const code = codeOnly(await readModule(path));

    // The ONLY football or music tokens permitted in code are the
    // classification vocabulary values themselves, which live in
    // contract.mjs's exported sets. Nothing may branch on them.
    for (const forbidden of [
      "home_team",
      "away_team",
      "club_id",
      "competition",
      "artist_id",
      "kickoff",
      "match_id",
      "platform_match_id",
      "publisher_domain",
      "genre",
    ]) {
      assert.equal(code.includes(forbidden), false, `${path} references domain field ${forbidden}`);
    }

    // No branch on a category. Classification is data, not control flow.
    assert.equal(/if\s*\([^)]*===\s*"(MUSIC|SPORT)"/.test(code), false, `${path} branches on a category`);
    assert.equal(/if\s*\([^)]*===\s*"(GIG|FOOTBALL_FIXTURE|FESTIVAL|PERFORMANCE)"/.test(code), false, `${path} branches on a type`);
  }
});

test("no Event module encodes a source-count or publisher threshold", async () => {
  for (const path of EVENT_MODULES) {
    const code = codeOnly(await readModule(path));
    for (const forbidden of [
      "source_count",
      "publisher_count",
      "publisher_domain_count",
      "cross_publisher",
      "CROSS_PUBLISHER",
      "SAME_PUBLISHER",
      "evidence_class",
      "trusted",
      "threshold",
    ]) {
      assert.equal(code.includes(forbidden), false, `${path} encodes admission policy via ${forbidden}`);
    }
  }
});

test("the Event core defines no participant, club, competition or series schema", async () => {
  const code = codeOnly(await readModule("ingestion/event/contract.mjs"));
  for (const forbidden of ["participant", "Participant", "series", "Series", "speaker", "organisation"]) {
    assert.equal(code.includes(forbidden), false, `the Event contract defines ${forbidden}`);
  }
});

/* ---------------------------------------------------------------- */
/* NO PUBLICATION, NO DEPLOYMENT, NO NETWORK                         */
/* ---------------------------------------------------------------- */

test("no Event module imports a publication, deployment or transport path", async () => {
  for (const path of EVENT_MODULES) {
    const code = codeOnly(await readModule(path));

    const specifiers = [...code.matchAll(/\bfrom\s+["']([^"']+)["']/g)].map((match) => match[1]);
    for (const specifier of specifiers) {
      assert.equal(
        /publish|publication|deploy|map-data|\/map\/|child_process|node:http|https|net|tls/i.test(specifier),
        false,
        `${path} imports ${specifier}`,
      );
    }

    for (const call of ["fetch(", "execFile", "execSync", "spawn(", "spawnSync", "require("]) {
      assert.equal(code.includes(call), false, `${path} calls ${call}`);
    }
  }
});

test("the only path an Event module writes is the single canonical Event-state file", async () => {
  const code = codeOnly(await readModule("ingestion/event/registry.mjs"));
  const literals = [...code.matchAll(/"(events\/[^"]+)"/g)].map((match) => match[1]);
  assert.deepEqual(
    [...new Set(literals)].sort(),
    ["events/event-state.json"],
    "events, event_occurrence_mappings and schedule_history are one document now, not three files that could be torn apart by a crash between renames",
  );

  // And no other module writes at all.
  for (const path of EVENT_MODULES.filter((candidate) => candidate !== "ingestion/event/registry.mjs")) {
    const other = codeOnly(await readModule(path));
    assert.equal(other.includes("writeFile"), false, `${path} writes directly instead of via registry.mjs`);
  }
});

test("this package changed no public data and no map code", () => {
  const git = (...args) => execFileSync("git", args, { cwd: ROOT, encoding: "utf8" });
  for (const path of ["data/public", "ingestion/map", "app", "components", "venues", "sources", "artists"]) {
    const status = git("status", "--porcelain", "--", path).trim();
    assert.equal(status, "", `this package modified ${path}:\n${status}`);
  }
});

/* ---------------------------------------------------------------- */
/* THE OBSERVATION BOUNDARY (rule 7)                                 */
/* ---------------------------------------------------------------- */

test("an Observation still carries no Event identity", async () => {
  const observation = createObservation({
    source_id: "example-source",
    source_record_id: "123",
    retrieved_at: "2026-01-01T00:00:00Z",
  });
  const keys = Object.keys(observation);
  for (const forbidden of ["event_id", "canonical_event_id", "canonicalEventId", "id"]) {
    assert.equal(keys.includes(forbidden), false, `${forbidden} must not be an Observation field`);
  }

  // And nothing in the Event foundation writes one onto an Observation.
  for (const path of EVENT_MODULES) {
    const code = codeOnly(await readModule(path));
    assert.equal(/observation\.\w*event_id\s*=/.test(code), false, `${path} assigns an event id onto an Observation`);
  }
});

test("the Event-to-Observation relationship lives only in the mapping", async () => {
  const contract = codeOnly(await readModule("ingestion/event/contract.mjs"));
  // The Event core knows nothing about Observations at all.
  assert.equal(contract.includes("observations"), false);
  assert.equal(contract.includes("source_record_id"), false);

  const mapping = codeOnly(await readModule("ingestion/event/occurrence-mapping.mjs"));
  assert.ok(mapping.includes("source_record_id"), "the mapping is where Observation refs belong");
});

/* ---------------------------------------------------------------- */
/* RULE 6, STILL ENFORCED BY BEHAVIOUR                               */
/* ---------------------------------------------------------------- */

test("rule 6 holds: no source-specific identifier can become an Event identity", () => {
  // Minting cannot consume a provider identifier...
  const pinned = () => "44444444-4444-4444-8444-444444444444";
  assert.equal(
    createEventId({ uuid: pinned, provider_event_key: "a527e730-6a36-11f1-aac4-0b3e482c279d" }),
    createEventId({ uuid: pinned }),
  );

  // ...and a provider identifier cannot be written as one either.
  const errors = validateOccurrenceMapping({
    event_id: "a527e730-6a36-11f1-aac4-0b3e482c279d",
    basis_kind: "PROVIDER_FINGERPRINT",
    fingerprint: "dof1-gc-football-20260718T130000Z-4f08817f27d9daf89f771718",
    observations: [{ source_id: "s", source_record_id: "1" }],
    method: "m",
    evidence: [],
    decided_at: "2026-09-21T00:00:00.000Z",
    lifecycle: "ACTIVE",
    superseded_reason: null,
  });
  assert.ok(errors.some((error) => error.includes("a provider id or fingerprint is never an Event id")));
});

test("an Event record never carries a fingerprint or provider key", () => {
  const event = createEvent({
    event_id: createEventId(),
    event_category: "SPORT",
    event_type: "FOOTBALL_FIXTURE",
    display_title: null,
    occurrence_shape: "POINT_IN_TIME",
    start: { raw: "2026-07-18T13:00:00.000Z", date: "2026-07-18", iso: "2026-07-18T13:00:00.000Z", is_utc: true, tzid: null, certainty: "UTC_INSTANT" },
    end: null,
    status: "COMPLETED",
    venue_id: null,
    parent_event_id: null,
    admitted_at: "2026-09-21T00:00:00.000Z",
    admission_basis: { basis_kind: "PROVIDER_FINGERPRINT", method: "m" },
  });

  const serialised = JSON.stringify(event);
  assert.equal(serialised.includes("dof1"), false);
  assert.equal(serialised.includes("a527e730"), false);
  assert.equal(serialised.includes("GC_FOOTBALL"), false);
});

/* ---------------------------------------------------------------- */
/* THE FINGERPRINT LAYER'S CORRECTED SEMANTICS                       */
/* ---------------------------------------------------------------- */

test("the fingerprint layer no longer claims football is ineligible for being non-music", async () => {
  const sources = await Promise.all([
    readModule("ingestion/gc-football-occurrence-fingerprints/adapt.mjs"),
    readModule("ingestion/gc-football-occurrence-fingerprints/run-fingerprints.mjs"),
    readFile(resolve(ROOT, "research/major-event-occurrence-fingerprints/uk-gc-football-01/summary.json"), "utf8"),
  ]);

  for (const source of sources) {
    assert.equal(
      source.includes("NOT_ADMITTED_NO_GOVERNED_ENTITY_FOR_NON_MUSIC_OCCURRENCE"),
      false,
      "the stale non-music state must be gone",
    );
    assert.equal(source.includes("LIVE MUSIC"), false, "Event is no longer defined as live-music-only");
  }

  const summary = JSON.parse(sources[2]);
  assert.match(summary.provenance.architecture_note, /rule 6/, "the rule 6 argument is preserved");
  assert.match(summary.provenance.architecture_note, /no record here states whether a canonical Event has been admitted/);
  assert.equal(summary.provenance.creates_beatmapped_event_entity, false);
  assert.equal(summary.provenance.reads_event_state, false);
});

test("correcting the wording changed no fingerprint fact", async () => {
  const artifact = JSON.parse(
    await readFile(
      resolve(ROOT, "research/major-event-occurrence-fingerprints/uk-gc-football-01/occurrence-fingerprints.json"),
      "utf8",
    ),
  );
  const records = artifact.occurrence_fingerprints;

  assert.equal(records.length, 898);
  assert.equal(new Set(records.map((record) => record.occurrence_fingerprint)).size, 898);
  assert.equal(records.filter((record) => record.evidence_class === "CROSS_PUBLISHER_CORROBORATED").length, 674);
  assert.equal(records.filter((record) => record.evidence_class === "SAME_PUBLISHER_MULTI_SOURCE").length, 224);
  assert.equal(records.filter((record) => record.governed_venue_census_id != null).length, 420);
  assert.equal(records.filter((record) => record.governed_venue_census_id == null).length, 478);

  // Still evidence, still carrying no downstream Event state at all.
  const DOWNSTREAM = /(^|_)event_id$|canonical_event|application_entity|admitted|admission/i;
  for (const record of records) {
    for (const field of Object.keys(record)) {
      assert.equal(DOWNSTREAM.test(field), false, `${field} states downstream Event state`);
    }
    assert.equal(record.lifecycle_state, "DERIVED_EVIDENCE_ANCHOR_NOT_AN_ENTITY");
    assert.ok(record.occurrence_fingerprint.startsWith("dof1-"));
  }
});
