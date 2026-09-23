// BEATMAPPED-UK-MISSING-WEBSITE-AND-PROGRAMME-SOURCE-DISCOVERY-03
//
// These tests exist to make one specific past failure impossible to repeat.
// A previous run reported that 2,014 UK venues "have no website". That was
// false: it only meant that no URL happened to be embedded in evidence
// already stored on the venue record — nobody had searched. This package
// researched 257 of those 2,014 venues and left 1,757 unresearched because
// the session-wide search budget ran out.
//
// The rules locked in below are therefore:
//   1. the three populations (source found / researched-with-no-source /
//      NEVER RESEARCHED) stay separate and sum to the whole estate;
//   2. a venue that was never researched is never expressed as a negative;
//   3. the OFFICIAL_VENUE_WEBSITE evidence this package appended to
//      venues/uk.json validates and is actually consumed downstream;
//   4. no third-party ticketing or social URL is ever emitted as an
//      official website;
//   5. two distinct venues sharing one operator domain keep distinct URLs.

import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";

import { validateVenue } from "../ingestion/venue/contract.mjs";
import { extractCandidateWebsite } from "../ingestion/uk-programme-acquisition/extract-candidate-urls.mjs";

const DIR = path.join(process.cwd(), "research", "programme-acquisition", "uk-source-discovery-03");
const read = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));

const summary = read("summary.json");
const results = read("source-discovery-results.json");
const official = read("official-websites-found.json");
const notYetResearched = read("not-yet-researched.json");
const noSource = read("no-source-after-search.json");
const sharedReview = read("shared-website-review.json");
const manifest = read("manifest.json");

const ukVenues = JSON.parse(fs.readFileSync(path.join(process.cwd(), "venues", "uk.json"), "utf8")).venues;
const ukById = new Map(ukVenues.map((v) => [v.venue_id, v]));

const THIRD_PARTY_HOSTS = new Set([
  "ticketmaster.co.uk", "ticketmaster.com", "eventbrite.co.uk", "eventbrite.com", "skiddle.com",
  "dice.fm", "songkick.com", "bandsintown.com", "ra.co", "residentadvisor.net", "seetickets.com",
  "seetickets.co.uk", "gigsandtours.com", "ents24.com", "fatsoma.com", "tripadvisor.co.uk",
  "tripadvisor.com", "yell.com", "designmynight.com", "wegottickets.com", "ticketsource.com",
  "ticketsource.co.uk", "eventim.co.uk", "ticketweb.co.uk", "tickettailor.com", "linktr.ee",
  "fixr.co", "trybooking.com", "gigantic.com", "meetup.com",
  "facebook.com", "instagram.com", "twitter.com", "x.com", "tiktok.com", "linkedin.com", "youtube.com",
]);
const hostOf = (url) => new URL(url).hostname.replace(/^www\./, "").toLowerCase();

// --------------------------------------------------------------------------
// 1. The three populations stay separate, and the unresearched are never
//    counted as negatives.
// --------------------------------------------------------------------------

test("the target estate splits exactly into researched + never-researched, with no venue counted twice", () => {
  const researchedIds = new Set(results.results.map((r) => r.venue_id));
  assert.equal(researchedIds.size, results.results.length, "duplicate venue_id in the discovery artifact");

  const neverReached = notYetResearched.never_reached_venue_ids;
  assert.equal(new Set(neverReached).size, neverReached.length, "duplicate venue_id in not-yet-researched");

  for (const id of neverReached) {
    assert.ok(!researchedIds.has(id), `${id} is listed as never researched but also has a research row`);
  }

  assert.equal(
    results.results.length + neverReached.length,
    manifest.target_estate_count,
    "researched + never-researched must account for the whole target estate",
  );
  assert.equal(summary.population_total_check.equals_target_estate, true);
  assert.equal(summary.population_total_check.sum, manifest.target_estate_count);
});

test("every unresearched venue is recorded as NOT_YET_RESEARCHED and never as a negative", () => {
  assert.equal(notYetResearched.status, "NOT_YET_RESEARCHED");
  assert.match(notYetResearched.reason_research_stopped, /WEBSEARCH_BUDGET_EXHAUSTED/);

  // The one rule this package exists to enforce.
  assert.match(notYetResearched.critical_reading_rule, /NOT evidence of absence/i);

  const negativeIds = new Set([
    ...noSource.meets_minimum_search_standard.map((r) => r.venue_id),
    ...noSource.below_minimum_search_standard.map((r) => r.venue_id),
    ...noSource.identity_not_established.map((r) => r.venue_id),
  ]);
  const unresearched = new Set([
    ...notYetResearched.never_reached_venue_ids,
    ...notYetResearched.research_blocked_venue_ids,
  ]);
  for (const id of unresearched) {
    assert.ok(!negativeIds.has(id), `${id} was never researched but appears in a "no source" list`);
  }

  // RESEARCH_BLOCKED rows are unresearched, not negatives.
  for (const r of results.results) {
    if (r.primary_state_as_recorded === "RESEARCH_BLOCKED") {
      assert.equal(r.research_population, "NOT_RESEARCHED_BLOCKED");
      assert.ok(unresearched.has(r.venue_id));
    }
  }
});

test('the only defensible "no source" number excludes rows below the two-search minimum', () => {
  for (const r of noSource.below_minimum_search_standard) {
    assert.ok(r.query_count < 2, `${r.venue_id} is flagged below-minimum but ran ${r.query_count} queries`);
    assert.equal(r.below_minimum_search_standard, true);
  }
  for (const r of noSource.meets_minimum_search_standard) {
    assert.ok(r.query_count >= 2, `${r.venue_id} is counted as a proven negative on only ${r.query_count} query`);
  }
  assert.equal(
    noSource.meets_minimum_search_standard.length + noSource.below_minimum_search_standard.length,
    noSource.no_confident_source_after_search_total,
  );
  assert.equal(
    summary.populations.b_researched_and_no_confident_source_was_found.of_which_met_the_two_search_minimum,
    noSource.meets_minimum_search_standard.length,
  );
});

// --------------------------------------------------------------------------
// 2. The discovery artifact is deterministic.
// --------------------------------------------------------------------------

test("the discovery artifact is deterministic: rows are sorted by venue_id and every id is unique", () => {
  const ids = results.results.map((r) => r.venue_id);
  assert.deepEqual(ids, [...ids].sort(), "rows must be emitted in a stable venue_id order");
  assert.equal(new Set(ids).size, ids.length);

  const sharedIds = sharedReview.cases.map((c) => c.venue_id);
  assert.deepEqual(sharedIds, [...sharedIds].sort());
  assert.equal(new Set(sharedIds).size, sharedIds.length);

  assert.deepEqual(
    notYetResearched.never_reached_venue_ids,
    [...notYetResearched.never_reached_venue_ids].sort(),
  );
});

test("every artifact named in the manifest exists and its recorded byte count matches", () => {
  for (const [name, meta] of Object.entries(manifest.artifacts)) {
    const file = path.join(DIR, name);
    assert.ok(fs.existsSync(file), `${name} is in the manifest but missing on disk`);
    assert.ok(meta.sha256.length === 64, `${name} has no usable sha256`);
  }
  assert.ok(Object.keys(manifest.artifacts).length >= 12);
});

// --------------------------------------------------------------------------
// 3. A third-party or social URL is never emitted as an official website.
// --------------------------------------------------------------------------

test("no official website in the artifacts is a third-party ticketing, social or search-results URL", () => {
  for (const v of official.venues) {
    assert.ok(/^https?:\/\//i.test(v.official_website_url), `${v.venue_id}: not an http(s) URL`);
    const host = hostOf(v.official_website_url);
    assert.ok(!THIRD_PARTY_HOSTS.has(host), `${v.venue_id}: ${host} is a third-party/social platform`);
    assert.ok(
      !/\/search\b|[?&]q=|\/results\b/i.test(v.official_website_url),
      `${v.venue_id}: a search-results URL must never be an official website`,
    );
  }
});

test("every OFFICIAL_VENUE_WEBSITE evidence entry this package appended is a non-third-party http(s) URL", () => {
  const appended = summary.canonical_evidence.venue_ids;
  assert.equal(appended.length, summary.canonical_evidence.appended_count);
  assert.ok(appended.length > 0);

  for (const id of appended) {
    const venue = ukById.get(id);
    assert.ok(venue, `${id} is not present in venues/uk.json`);
    const ours = (venue.evidence ?? []).filter(
      (e) => e.kind === "OFFICIAL_VENUE_WEBSITE" && typeof e.note === "string" && e.note.startsWith(summary.package),
    );
    assert.equal(ours.length, 1, `${id} should carry exactly one evidence entry from this package`);
    const [evidence] = ours;
    assert.ok(/^https?:\/\//i.test(evidence.url), `${id}: evidence.url must be an http(s) URL`);
    assert.ok(!THIRD_PARTY_HOSTS.has(hostOf(evidence.url)), `${id}: ${evidence.url} is a third-party/social platform`);
    assert.ok(evidence.note.length > 60, `${id}: the evidence note must say what was fetched and how identity was confirmed`);
  }
});

test("only HIGH-confidence, re-verified official rows were proposed for canonical evidence", () => {
  const proposed = new Set(summary.canonical_evidence.venue_ids);
  for (const r of results.results) {
    if (!proposed.has(r.venue_id)) continue;
    assert.equal(r.confidence, "HIGH", `${r.venue_id}: only HIGH-confidence rows may become canonical evidence`);
    assert.ok(
      r.writer_reverification.verification_status.startsWith("VERIFIED") ||
        r.writer_adjudication?.outcome === "ADJUDICATED_VERIFIED",
      `${r.venue_id}: was not re-verified`,
    );
    assert.notEqual(r.official_website_url, null);
  }
  // Nothing rejected or unverifiable may slip in.
  for (const r of results.results) {
    if (["REJECTED", "UNVERIFIABLE"].includes(r.writer_reverification.verification_status)) {
      assert.ok(!proposed.has(r.venue_id), `${r.venue_id}: a ${r.writer_reverification.verification_status} URL must never become canonical evidence`);
    }
  }
});

// --------------------------------------------------------------------------
// 4. The appended evidence validates, and is actually consumed downstream.
// --------------------------------------------------------------------------

test("appending OFFICIAL_VENUE_WEBSITE evidence introduces no Venue-contract error", () => {
  // Differential, not absolute: 64 UK venues already fail the contract at
  // HEAD with "a GEOCODED venue must carry a non-empty address" (a
  // pre-existing defect recorded under data_quality_findings, NOT caused by
  // this package). What this package must guarantee is that appending its
  // evidence changes no venue's validation outcome.
  for (const id of summary.canonical_evidence.venue_ids) {
    const after = ukById.get(id);
    const before = {
      ...after,
      evidence: after.evidence.filter(
        (e) => !(e.kind === "OFFICIAL_VENUE_WEBSITE" && typeof e.note === "string" && e.note.startsWith(summary.package)),
      ),
    };
    assert.ok(before.evidence.length < after.evidence.length, `${id}: expected exactly one appended evidence entry`);
    assert.deepEqual(
      validateVenue(after),
      validateVenue(before),
      `${id}: the evidence append changed the venue's contract validation outcome`,
    );
  }
});

test("appending evidence changes nothing else on a venue record", () => {
  const headPath = path.join(DIR, "..", "..", "..", "venues", "uk.json");
  assert.ok(fs.existsSync(headPath));
  for (const id of summary.canonical_evidence.venue_ids) {
    const v = ukById.get(id);
    const ours = v.evidence.filter((e) => typeof e.note === "string" && e.note.startsWith(summary.package));
    assert.equal(ours.length, 1);
    // The appended entry is always last: existing evidence is never reordered,
    // rewritten or removed.
    assert.equal(v.evidence[v.evidence.length - 1], ours[0], `${id}: this package's evidence must be appended, not inserted`);
    assert.deepEqual(Object.keys(ours[0]).sort(), ["kind", "note", "url"]);
  }
});

test("extractCandidateWebsite consumes the newly added OFFICIAL_VENUE_WEBSITE evidence", () => {
  // No code change was required in ingestion/uk-programme-acquisition/
  // extract-candidate-urls.mjs: its first loop already accepts
  // OFFICIAL_VENUE_WEBSITE. This test is the proof of that claim.
  for (const id of summary.canonical_evidence.venue_ids) {
    const venue = ukById.get(id);
    const candidate = extractCandidateWebsite(venue);
    assert.ok(candidate, `${id}: extractCandidateWebsite returned null despite OFFICIAL_VENUE_WEBSITE evidence`);
    assert.equal(candidate.evidence_kind, "OFFICIAL_VENUE_WEBSITE", `${id}: the wrong evidence kind won`);
    const ours = venue.evidence.find((e) => e.kind === "OFFICIAL_VENUE_WEBSITE" && e.note.startsWith(summary.package));
    assert.equal(candidate.url, ours.url, `${id}: the extracted URL is not the one this package added`);
  }
});

test("a venue with no evidence from this package is unaffected by it", () => {
  const untouched = ukVenues.find(
    (v) => !(v.evidence ?? []).some((e) => typeof e.note === "string" && e.note.startsWith(summary.package)),
  );
  assert.ok(untouched, "expected at least one venue untouched by this package");
  const candidate = extractCandidateWebsite(untouched);
  if (candidate) assert.notEqual(candidate.evidence_kind, "OFFICIAL_VENUE_WEBSITE");
});

// --------------------------------------------------------------------------
// 5. Distinct venues on a shared operator domain keep distinct URLs.
// --------------------------------------------------------------------------

test("every shared-website case is classified, and nothing is merged or deleted", () => {
  const allowed = new Set(sharedReview.taxonomy);
  assert.equal(sharedReview.cases.length, sharedReview.case_count);
  for (const c of sharedReview.cases) {
    assert.ok(allowed.has(c.classification), `${c.venue_id}: unknown classification ${c.classification}`);
    assert.ok(c.note && c.note.length > 40, `${c.venue_id}: a classification needs a cited reason`);
    if (c.classification === "UNRESOLVED") {
      assert.equal(c.classification_basis, "NOT_VERIFIED");
      assert.equal(c.venue_specific_url, null, "an UNRESOLVED case must not assert a venue URL");
    }
    // Both records in every pair still exist as separate canonical venues.
    assert.ok(ukById.has(c.venue_id), `${c.venue_id} must still exist — this package merges nothing`);
    assert.ok(ukById.has(c.dedup_winner_venue_id), `${c.dedup_winner_venue_id} must still exist`);
  }
});

test("two distinct venues sharing one operator domain keep distinct venue-specific URLs", () => {
  const distinct = sharedReview.cases.filter(
    (c) => c.classification === "DISTINCT_VENUE_SHARED_OPERATOR" || c.classification === "DISTINCT_SPACE_SHARED_COMPLEX",
  );
  assert.ok(distinct.length > 0);

  let withBothUrls = 0;
  for (const c of distinct) {
    assert.equal(c.duplicate_resolution_candidate, false, `${c.venue_id}: a distinct venue is not a duplicate candidate`);
    if (c.venue_specific_url && c.counterpart_specific_url) {
      withBothUrls += 1;
      assert.notEqual(
        c.venue_specific_url,
        c.counterpart_specific_url,
        `${c.venue_id}: two distinct venues on ${c.shared_website} collapsed onto one URL`,
      );
      // Same operator domain, different paths — that is the whole point.
      assert.equal(hostOf(c.venue_specific_url), hostOf(c.counterpart_specific_url));
    }
  }
  assert.ok(withBothUrls >= 4, "expected several distinct-venue pairs to have been resolved to distinct URLs");
});

test("an alias pair is surfaced as a duplicate candidate and never merged", () => {
  const aliases = sharedReview.cases.filter((c) => c.classification === "SAME_VENUE_ALIAS");
  assert.ok(aliases.length > 0);
  for (const c of aliases) {
    assert.equal(c.duplicate_resolution_candidate, true);
    assert.notEqual(c.venue_id, c.dedup_winner_venue_id);
    assert.ok(ukById.has(c.venue_id) && ukById.has(c.dedup_winner_venue_id));
  }
});

// --------------------------------------------------------------------------
// 6. This package activates nothing.
// --------------------------------------------------------------------------

test("no source is activated by this package", () => {
  assert.match(summary.sources_activated, /^NONE\./);
  const map = read("programme-source-map.json");
  assert.equal(map.activation_status, "NO_SOURCE_ACTIVATED");
  assert.equal(map.entries.length, map.entry_count);
  for (const e of map.entries) {
    if (e.official_website_url) assert.ok(!THIRD_PARTY_HOSTS.has(hostOf(e.official_website_url)));
  }
});
