// BEATMAPPED-UK-GC-FOOTBALL-VENUE-ATTRIBUTION-01 — unit tests.
// Pure and offline.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { indexVenues } from "../ingestion/major-event-attribution/census-index.mjs";
import { resolveObservation } from "../ingestion/major-event-attribution/resolve.mjs";
import { adaptForResolver } from "../ingestion/gc-football-attribution/adapt.mjs";
import { UNRESOLVED_REASONS, noVenueKind, unresolvedReason } from "../ingestion/gc-football-attribution/reason-codes.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PKG_DIR = resolve(ROOT, "ingestion/gc-football-attribution");

/** A tiny census with two distinct grounds owned by one club. */
const CENSUS = indexVenues([
  {
    venue_census_id: "v-current", canonical_name: "Hill Dickinson Stadium",
    alternative_names: [], city: "Liverpool", nation: "England", postcode: "L3 0AA", address: null,
  },
  {
    venue_census_id: "v-former", canonical_name: "Goodison Park",
    alternative_names: [], city: "Liverpool", nation: "England", postcode: "L4 4EL", address: null,
  },
  {
    venue_census_id: "v-alias", canonical_name: "Crown Ground",
    alternative_names: ["Wham Stadium"], city: "Accrington", nation: "England", postcode: "BB5 5BX", address: null,
  },
  {
    venue_census_id: "v-noalias", canonical_name: "Madejski Stadium",
    alternative_names: [], city: "Reading", nation: "England", postcode: "RG2 0FL", address: null,
  },
]);

const SOURCE = { census_venue_id: "v-current", census_venue_name: "Hill Dickinson Stadium" };

function observation(fields = {}) {
  return {
    source_id: "src-1",
    source_record_id: fields.source_record_id ?? "m1",
    retrieved_at: "2026-09-20T00:00:00.000Z",
    venue_name: fields.venue_name ?? null,
    location_text: null,
    start: { iso: "2026-10-01T14:00:00.000Z", certainty: "UTC_INSTANT" },
    source_fields: {
      match_id: fields.source_record_id ?? "m1",
      home_or_away: fields.home_or_away ?? "Home",
      venue_text_state: fields.venue_text_state ?? (fields.venue_name ? "NAMED" : "ABSENT"),
      venue_text_raw: fields.venue_text_raw ?? fields.venue_name ?? null,
      competition_name: "Test League",
      team_names: ["A", "B"],
    },
  };
}

const resolveIt = (obs, source = SOURCE) => resolveObservation(adaptForResolver(obs, source), CENSUS, { derivedAt: "t" });

/* ---------------------------------------------------------------- */
/* REUSE                                                             */
/* ---------------------------------------------------------------- */

test("REUSE: this package contains no venue-matching logic of its own", async () => {
  const files = (await readdir(PKG_DIR)).filter((name) => name.endsWith(".mjs"));
  for (const file of files) {
    const code = await readFile(resolve(PKG_DIR, file), "utf8");
    // No forked resolver, no football alias table, no football-only state.
    assert.ok(!/function\s+(resolveObservation|resolveAll|nameCandidates|compareGeography|indexVenues)\b/.test(code), `${file} forks resolver logic`);
    assert.ok(!/alternative_names\s*[:=]|ALIAS(ES)?\s*=\s*[[{]/.test(code), `${file} defines its own aliases`);
    // A football-specific venue lookup table would be the obvious shape of
    // a fork. (Matched on declarations only, so an artifact_type string
    // such as UK_GC_FOOTBALL_VENUE_ATTRIBUTION_SUMMARY does not trip it.)
    assert.ok(
      !/(?:const|let|var|function)\s+[A-Za-z_]*(?:VENUE_MAP|VENUE_TABLE|VENUE_ALIASES|VENUE_LOOKUP|CLUB_VENUES?)\b/i.test(code),
      `${file} declares a football-specific venue lookup`,
    );
  }
  const runner = await readFile(resolve(PKG_DIR, "run-attribution.mjs"), "utf8");
  assert.match(runner, /from "\.\.\/major-event-attribution\/resolve\.mjs"/, "must import the existing generic resolver");
  assert.match(runner, /from "\.\.\/major-event-attribution\/census-index\.mjs"/, "must import the existing census index");
});

test("REUSE: the generic attribution module is not modified by this package", async () => {
  const { execSync } = await import("node:child_process");
  const status = execSync("git status --porcelain ingestion/major-event-attribution", { cwd: ROOT, encoding: "utf8" });
  assert.equal(status.trim(), "", `the shared resolver must not be edited:\n${status}`);
});

/* ---------------------------------------------------------------- */
/* ADAPTER                                                           */
/* ---------------------------------------------------------------- */

test("the adapter copies — it never mutates the Observation", () => {
  const original = observation({ venue_name: "Goodison Park" });
  const snapshot = JSON.stringify(original);
  const adapted = adaptForResolver(original, SOURCE);
  assert.equal(JSON.stringify(original), snapshot, "the input Observation must be untouched");
  assert.notEqual(adapted, original);
  assert.ok(!("venue_census_id" in original.source_fields), "the original must not gain census provenance");
  assert.equal(adapted.source_fields.venue_census_id, "v-current");
  assert.equal(adapted.venue_name, "Goodison Park", "the source's own venue words are carried verbatim");
});

/* ---------------------------------------------------------------- */
/* NO VENUE EVIDENCE — never substituted                             */
/* ---------------------------------------------------------------- */

test("NO VENUE: an absent venue stays unresolved and does NOT inherit the source venue", () => {
  const record = resolveIt(observation({ venue_name: null, venue_text_state: "ABSENT" }));
  assert.equal(record.attribution_state, "UNRESOLVED_NO_VENUE_EVIDENCE");
  assert.equal(record.resolved_venue_census_id, null);
  assert.notEqual(record.resolved_venue_census_id, "v-current", "the source's census venue must never be substituted");
});

test("NO VENUE: an operational placeholder stays unresolved even on a Home record", () => {
  // The acquisition already turned the placeholder into venue_name === null
  // and recorded the raw text. It must not resurface as a venue here.
  const obs = observation({ venue_name: null, venue_text_state: "NON_VENUE_SENTINEL", venue_text_raw: "Behind closed doors", home_or_away: "Home" });
  const record = resolveIt(obs);
  assert.equal(record.attribution_state, "UNRESOLVED_NO_VENUE_EVIDENCE");
  assert.equal(record.resolved_venue_census_id, null);
  assert.equal(unresolvedReason(record, obs), "NO_VENUE_EVIDENCE");
  assert.deepEqual(noVenueKind(obs), { kind: "NON_VENUE_SENTINEL", raw: "Behind closed doors" });
});

test("NO VENUE: an away record with no venue does not inherit anything either", () => {
  const record = resolveIt(observation({ venue_name: null, home_or_away: "Away" }));
  assert.equal(record.resolved_venue_census_id, null);
});

/* ---------------------------------------------------------------- */
/* HOME / AWAY                                                       */
/* ---------------------------------------------------------------- */

test("HOME: a Home fixture can resolve AWAY from the source's own stadium", () => {
  const record = resolveIt(observation({ venue_name: "Goodison Park", home_or_away: "Home" }));
  assert.equal(record.resolved_venue_census_id, "v-former");
  assert.equal(record.attribution_state, "RESOLVED_TO_DIFFERENT_CENSUS_VENUE");
  assert.notEqual(record.resolved_venue_census_id, record.source_census_venue_id);
});

test("AWAY: an away fixture resolves to the venue it names, not the source's stadium", () => {
  const record = resolveIt(observation({ venue_name: "Goodison Park", home_or_away: "Away" }));
  assert.equal(record.resolved_venue_census_id, "v-former");
  assert.notEqual(record.resolved_venue_census_id, "v-current");
});

test("the home/away label cannot change the outcome — it is evidence, not identity", () => {
  const home = resolveIt(observation({ venue_name: "Goodison Park", home_or_away: "Home" }));
  const away = resolveIt(observation({ venue_name: "Goodison Park", home_or_away: "Away" }));
  assert.equal(home.resolved_venue_census_id, away.resolved_venue_census_id, "the same venue text must resolve identically regardless of the label");
});

/* ---------------------------------------------------------------- */
/* ALIASES                                                           */
/* ---------------------------------------------------------------- */

test("ALIASES: a GOVERNED alias resolves", () => {
  const record = resolveIt(observation({ venue_name: "Wham Stadium" }), { census_venue_id: "v-alias", census_venue_name: "Crown Ground" });
  assert.equal(record.resolved_venue_census_id, "v-alias");
});

test("ALIASES: a sponsor name that is NOT governed stays unresolved rather than being guessed", () => {
  // Madejski Stadium carries no alias in this census, so its trading name
  // must not resolve by similarity, proximity, or the source's identity.
  const record = resolveIt(observation({ venue_name: "Select Car Leasing Stadium" }), { census_venue_id: "v-noalias", census_venue_name: "Madejski Stadium" });
  assert.equal(record.resolved_venue_census_id, null);
  assert.equal(record.attribution_state, "UNRESOLVED_NO_CENSUS_MATCH");
});

/* ---------------------------------------------------------------- */
/* MULTI-VENUE                                                       */
/* ---------------------------------------------------------------- */

test("MULTI-VENUE: one club's current and former grounds stay distinct venues", () => {
  const current = resolveIt(observation({ venue_name: "Hill Dickinson Stadium" }));
  const former = resolveIt(observation({ venue_name: "Goodison Park" }));
  assert.equal(current.resolved_venue_census_id, "v-current");
  assert.equal(former.resolved_venue_census_id, "v-former");
  assert.notEqual(current.resolved_venue_census_id, former.resolved_venue_census_id);
});

/* ---------------------------------------------------------------- */
/* OUT OF CENSUS                                                     */
/* ---------------------------------------------------------------- */

test("OUT-OF-CENSUS: a venue absent from the census stays unresolved", () => {
  const obs = observation({ venue_name: "Helsinki Olympic Stadium" });
  const record = resolveIt(obs);
  assert.equal(record.resolved_venue_census_id, null);
  assert.equal(record.attribution_state, "UNRESOLVED_NO_CENSUS_MATCH");
  assert.equal(unresolvedReason(record, obs), "NOT_IN_CENSUS");
});

test("no reason code asserts a venue's country", async () => {
  const code = await readFile(resolve(PKG_DIR, "reason-codes.mjs"), "utf8");
  for (const reason of UNRESOLVED_REASONS) {
    assert.ok(!/OVERSEAS|ABROAD|FOREIGN|DOMESTIC_/.test(reason), `${reason} asserts geography that is not established`);
  }
  assert.match(code, /states the country of a venue/i, "the limitation must be documented, not silently dropped");
});
