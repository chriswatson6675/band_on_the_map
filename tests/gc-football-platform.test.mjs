// BEATMAPPED-UK-GC-FOOTBALL-PLATFORM-ACQUISITION-01 — unit tests for the
// ONE generic collector. Pure and offline: nothing here fetches.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { detectPlatform, deriveServicesHost } from "../ingestion/gc-football-platform/detect.mjs";
import { matchesUrl, teamsUrl } from "../ingestion/gc-football-platform/client.mjs";
import {
  NON_VENUE_SENTINELS,
  classifyVenueText,
  fixtureTitle,
  kickoffDateTime,
  recordId,
  toObservation,
} from "../ingestion/gc-football-platform/record.mjs";
import { loadCandidatePopulation } from "../ingestion/gc-football-platform/population.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const COLLECTOR_DIR = resolve(ROOT, "ingestion/gc-football-platform");

const context = {
  source_id: "test-source",
  retrieved_at: "2026-09-20T00:00:00.000Z",
  source_url: "https://example.invalid/matches",
  team_label: "First Team",
};

/* ------------------------------------------------------------------ */
/* detection                                                           */
/* ------------------------------------------------------------------ */

test("the services host is derived from the page's own gc references, at any label depth", () => {
  const shallow = deriveServicesHost('<script>"images.gc.tenantservices.co.uk"</script>');
  assert.deepEqual(shallow.candidate_services_hosts, ["tenantservices.co.uk"]);

  const deep = deriveServicesHost('"matches.football.admin.gc.tenantservices.co.uk"');
  assert.deepEqual(deep.candidate_services_hosts, ["tenantservices.co.uk"]);
});

test("a host addressing the football service outranks one that does not", () => {
  const html = '"images.gc.alt-tenant.com" "matches.football.admin.gc.real-tenant.co.uk"';
  const derived = deriveServicesHost(html);
  assert.equal(derived.candidate_services_hosts[0], "real-tenant.co.uk", "the football host must be tried first");
  assert.equal(derived.candidate_services_hosts.length, 2, "the other candidate is kept, not discarded");
  assert.deepEqual(derived.hosts_addressing_football_service, ["real-tenant.co.uk"]);
});

test("a single-label host after .gc. is not a tenant (keeps *.gc.ca-style hosts out)", () => {
  const derived = deriveServicesHost('<a href="https://www.canada.gc.ca/en">');
  assert.deepEqual(derived.candidate_services_hosts, [], "gc.ca is not a gc tenant services host");
});

test("detection is only ever a HYPOTHESIS — it never confirms on page evidence alone", () => {
  const candidate = detectPlatform({ html: '"images.gc.tenantservices.co.uk" VUE_APP_CLUB_ID:"x"', status: 200 });
  assert.equal(candidate.detection, "PLATFORM_CANDIDATE");
  assert.notEqual(candidate.detection, "PLATFORM_CONFIRMED", "only the live API may confirm a tenant");

  const none = detectPlatform({ html: "<html>nothing here</html>", status: 200 });
  assert.equal(none.detection, "NOT_GC_PLATFORM");
  assert.deepEqual(none.candidate_services_hosts, []);
});

/* ------------------------------------------------------------------ */
/* routes                                                              */
/* ------------------------------------------------------------------ */

test("routes are built on the PUBLIC web host, never the authenticated admin host", () => {
  const teams = teamsUrl("tenantservices.co.uk");
  const matches = matchesUrl("tenantservices.co.uk", { teamId: "t1", seasonId: "2026" });

  for (const url of [teams, matches]) {
    assert.ok(url.includes(".web.gc."), `must use the public web host: ${url}`);
    assert.ok(!url.includes(".admin.gc."), `must never use the authenticated admin host: ${url}`);
    assert.ok(url.startsWith("https://"), "routes must be https");
  }

  assert.equal(teams, "https://filters.football.web.gc.tenantservices.co.uk/v2/filters");
  assert.ok(matches.includes("/v2/opta?"), "the public client uses the v2 opta route");
  assert.ok(matches.includes("clientMatches=true"));
  assert.ok(matches.includes("teamID=t1"));
  assert.ok(matches.includes("seasonID=2026"));
});

/* ------------------------------------------------------------------ */
/* date honesty                                                        */
/* ------------------------------------------------------------------ */

test("a genuine UTC kickoff becomes a UTC_INSTANT; an absent one invents nothing", () => {
  const known = kickoffDateTime({ kickOffUTC: "2026-10-11T13:00:00.000Z" });
  assert.equal(known.certainty, "UTC_INSTANT");
  assert.equal(known.iso, "2026-10-11T13:00:00.000Z");
  assert.equal(known.date, "2026-10-11");
  assert.equal(known.is_utc, true);

  const absent = kickoffDateTime({});
  assert.equal(absent.certainty, "UNKNOWN");
  assert.equal(absent.iso, null);
  assert.equal(absent.date, null, "a missing kickoff must not become a guessed date");

  const garbage = kickoffDateTime({ kickOffUTC: "sometime in spring" });
  assert.equal(garbage.certainty, "TEXT_ONLY");
  assert.equal(garbage.iso, null);
  assert.equal(garbage.date, null, "unparseable text must never become a date");
});

/* ------------------------------------------------------------------ */
/* venue honesty — the core invariant                                  */
/* ------------------------------------------------------------------ */

test("operational placeholders are NOT venues", () => {
  for (const sentinel of NON_VENUE_SENTINELS) {
    const classified = classifyVenueText(sentinel);
    assert.equal(classified.venue_name, null, `"${sentinel}" must not become a venue`);
    assert.equal(classified.venue_text_state, "NON_VENUE_SENTINEL");
  }
  assert.equal(classifyVenueText("Behind Closed Doors").venue_name, null, "sentinels are case-insensitive");
  assert.equal(classifyVenueText("  ").venue_name, null);
  assert.equal(classifyVenueText(null).venue_text_state, "ABSENT");
  assert.equal(classifyVenueText("Racecourse Ground").venue_name, "Racecourse Ground");
});

test("venue_name is the RECORD's own venue, never the source's registered venue", () => {
  // An away fixture: the record names the opponent's ground. The collector
  // is given no census venue at all, so it cannot substitute one.
  const observation = toObservation(
    { matchID: "m1", venue: "Pride Park Stadium", homeOrAway: "Away", kickOffUTC: "2026-10-10T14:00:00.000Z" },
    context,
  );
  assert.equal(observation.venue_name, "Pride Park Stadium");
  assert.ok(!("census_venue_id" in observation.source_fields), "acquisition must not carry a census venue decision");
  assert.equal(observation.source_fields.home_or_away, "Away");
});

test("homeOrAway is retained as evidence but NEVER becomes venue identity", () => {
  // Observed live: clubs publish pre-season fixtures abroad as "Home".
  const observation = toObservation(
    { matchID: "m2", venue: "Yankee Stadium", homeOrAway: "Home", kickOffUTC: "2026-07-26T23:00:00.000Z" },
    context,
  );
  assert.equal(observation.venue_name, "Yankee Stadium", "a 'Home' flag must not override the stated venue");
  assert.equal(observation.source_fields.home_or_away, "Home");
});

test("a sentinel venue on a Home record yields NO venue rather than the club's ground", () => {
  const observation = toObservation(
    { matchID: "m3", venue: "Behind closed doors", homeOrAway: "Home", kickOffUTC: "2026-10-01T13:00:00.000Z" },
    context,
  );
  assert.equal(observation.venue_name, null);
  assert.equal(observation.source_fields.venue_text_state, "NON_VENUE_SENTINEL");
  assert.equal(observation.source_fields.venue_text_raw, "Behind closed doors", "the source's words are still retained");
});

/* ------------------------------------------------------------------ */
/* identity and titles                                                 */
/* ------------------------------------------------------------------ */

test("the platform's own matchID is the record identity; without one there is no Observation", () => {
  assert.equal(recordId({ matchID: "g2649031" }), "g2649031");
  assert.equal(recordId({}), null);
  assert.equal(toObservation({ venue: "Anywhere" }, context), null, "no stable id means no Observation");
});

test("a title is built only from names the record supplies — no opponent is invented", () => {
  assert.equal(fixtureTitle({ teamData: [{ teamName: "A" }, { teamName: "B" }] }), "A v B");
  assert.equal(fixtureTitle({ teamData: [{ teamName: "A" }] }), "A", "a missing opponent must not be fabricated");
  assert.equal(fixtureTitle({ teamData: [], competitionName: "Some Cup" }), "Some Cup");
  assert.equal(fixtureTitle({}), null);
});

test("an Observation creates no canonical Event identity", () => {
  const observation = toObservation(
    { matchID: "m4", venue: "Oakwell", homeOrAway: "Home", kickOffUTC: "2026-10-01T13:00:00.000Z" },
    context,
  );
  assert.ok(!("event_id" in observation));
  assert.ok(!("canonical_event_id" in observation));
  assert.ok(!("resolved_venue_census_id" in observation));
  assert.equal(observation.raw_evidence.byte_faithful, false);
});

/* ------------------------------------------------------------------ */
/* GENERICNESS — the defining constraint of this package               */
/* ------------------------------------------------------------------ */

/** Strip // and /* *\/ comments so prose examples cannot satisfy a rule. */
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*/gm, "$1");
}

/**
 * Generic venue-type and place nouns shared by dozens of venues. These
 * identify NO club, so treating them as per-club code would only make the
 * test fire on ordinary English ("the club's own ground") and on the
 * contract's own `source_fields`. Distinctive names — goodison,
 * hillsborough, oakwell, molineux, evertonfc — are deliberately NOT here.
 */
const GENERIC_PLACE_WORDS = new Set([
  "ground", "grounds", "stadium", "stadia", "arena", "field", "fields", "park",
  "centre", "center", "community", "sports", "sporting", "county", "united",
  "city", "town", "club", "rovers", "athletic", "albion", "stand", "road",
  "lane", "hall", "house", "court", "north", "south", "east", "west",
  "street", "green", "villa", "county's", "national", "international",
]);

test("ONE COLLECTOR: no club, domain or stadium name appears as code anywhere in the collector", async () => {
  const population = await loadCandidatePopulation();

  // Distinctive tokens taken from the real estate: every club's domain
  // label, and every census venue name word that is not a generic noun.
  const tokens = new Set();
  for (const candidate of population.candidates) {
    const label = String(candidate.domain ?? "").split(".")[0];
    if (label.length >= 4) tokens.add(label.toLowerCase());
    for (const word of String(candidate.census_venue_name ?? "").split(/[^A-Za-z]+/)) {
      const lower = word.toLowerCase();
      if (lower.length >= 5 && !GENERIC_PLACE_WORDS.has(lower)) tokens.add(lower);
    }
  }
  assert.ok(tokens.size > 50, "the token list must be substantial for this test to mean anything");
  // The test is only worth anything if it would still catch a real name.
  for (const distinctive of ["evertonfc", "hillsborough", "goodison", "wrexhamafc"]) {
    assert.ok(tokens.has(distinctive), `the token list must still contain "${distinctive}"`);
  }

  const files = (await readdir(COLLECTOR_DIR)).filter((name) => name.endsWith(".mjs"));
  assert.ok(files.length >= 5, "the collector must actually be present");

  const offences = [];
  for (const file of files) {
    const code = stripComments(await readFile(resolve(COLLECTOR_DIR, file), "utf8")).toLowerCase();
    for (const token of tokens) {
      // Word-boundary matched, so `source_fields` is not read as "field".
      if (new RegExp(`\\b${token}\\b`).test(code)) offences.push(`${file}: "${token}"`);
    }
  }

  assert.deepEqual(offences, [], `the collector must contain no per-club code:\n${offences.join("\n")}`);
});

test("the genericness test actually fires when a club name IS present", async () => {
  // Guards the guard: a stoplist that swallowed everything would make the
  // test above pass vacuously.
  const population = await loadCandidatePopulation();
  const tokens = new Set(
    population.candidates
      .map((candidate) => String(candidate.domain ?? "").split(".")[0].toLowerCase())
      .filter((label) => label.length >= 4),
  );
  const planted = stripComments('const host = "evertonfc" + "services.co.uk";').toLowerCase();
  const caught = [...tokens].filter((token) => new RegExp(`\\b${token}\\b`).test(planted));
  assert.deepEqual(caught, ["evertonfc"], "a planted club name must be caught");
});

test("ONE COLLECTOR: the collector branches on no tenant-specific literal", async () => {
  const files = (await readdir(COLLECTOR_DIR)).filter((name) => name.endsWith(".mjs"));
  for (const file of files) {
    const code = stripComments(await readFile(resolve(COLLECTOR_DIR, file), "utf8"));
    // A switch over hostnames, or an if comparing a club domain, would be
    // the obvious shape of a per-club special case.
    assert.ok(!/switch\s*\(\s*(?:\w+\.)?(?:domain|host|hostname|club|clubId)/i.test(code), `${file} switches on tenant identity`);
    assert.ok(!/\bwww\.[a-z0-9-]+\.(?:co\.uk|com|net)\b/i.test(code), `${file} hardcodes a club domain`);
  }
});

test("the candidate population is derived from census FIELDS, not from a URL path", async () => {
  const code = stripComments(await readFile(resolve(COLLECTOR_DIR, "population.mjs"), "utf8"));
  assert.ok(!/\/matches/.test(code), "membership must not be defined by a URL path convention");

  const population = await loadCandidatePopulation();
  assert.ok(population.counts.candidate_sources > 0);
  for (const candidate of population.candidates) {
    assert.ok(candidate.source_id && candidate.source_url && candidate.census_venue_id);
  }
});
