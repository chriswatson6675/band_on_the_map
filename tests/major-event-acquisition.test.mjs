// BEATMAPPED-UK-MAJOR-EVENT-ACQUISITION-TIER1-01 — Phase 16.
//
// Synthetic fixtures only; the real acquired dataset is validated
// separately by tests/major-event-acquisition-artifacts.test.mjs.

import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { loadTier1Population, venuesWithMultipleSources, eventDomainFromCensus, summarisePopulation } from "../ingestion/major-event-acquisition/population.mjs";
import { acquireSourceEntry, acquirePopulation, classifyTemporal, classifyVenueAttribution, deriveJsonLdRecordId, EVENT_FAMILY_TYPES } from "../ingestion/major-event-acquisition/acquire.mjs";
import { validateObservation } from "../ingestion/observation/contract.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const AT = "2026-09-20T12:00:00.000Z";

const entry = (overrides = {}) => ({
  calendar_source_id: "src-1",
  venue_census_id: "ukmec-england-exampleton-example-arena",
  venue_name: "Example Arena",
  city: "Exampleton",
  nation: "England",
  venue_type: "INDOOR_ARENA",
  calendar_url: "https://example.test/whats-on",
  census_calendar_class: "CONCERTS",
  event_domain: "CONCERTS",
  sport: null,
  source_family: "JSON_LD_EVENT",
  collector_route: "EXISTING_COLLECTOR_ZERO_CODE",
  ...overrides,
});

const jsonLdPage = (events) => `<html><script type="application/ld+json">${JSON.stringify(events)}</script></html>`;
const ev = (o) => ({ "@context": "https://schema.org", "@type": "Event", ...o });
const okPage = (body) => async () => ({ ok: true, status: 200, text: body, contentType: "text/html", url: "https://example.test/whats-on" });

// ---------------------------------------------------------------- POPULATION

test("the acquisition population is derived from the census, not hand-maintained", async () => {
  const { population, counts, unsupported } = await loadTier1Population();
  assert.equal(counts.sources, 43, "READY_TIER1 population must be the frozen 43 sources");
  assert.equal(counts.venues, 41, "across the frozen 41 venues");
  assert.deepEqual(counts.by_family, {
    JSON_LD_EVENT: { sources: 37, venues: 37 },
    WORDPRESS_TRIBE_API: { sources: 6, venues: 5 },
  });
  assert.equal(unsupported.length, 0, "every family must have an EXISTING collector — this package builds none");
  for (const item of population) {
    assert.ok(item.venue_census_id, "every source carries its census venue id");
    assert.ok(item.calendar_source_id, "and its census calendar source id");
    assert.equal(item.acquisition_readiness, "READY_TIER1");
  }
});

test("event domain comes from the census calendar class, never from the venue type", () => {
  // The defect this guards: inferring "sport" because a venue is a stadium
  // is exactly how a conference at an arena becomes a "concert".
  assert.equal(eventDomainFromCensus({ source_type: "CONFERENCES" }), "CONFERENCES");
  assert.equal(eventDomainFromCensus({ source_type: "SPORT_FIXTURES" }), "SPORT_FIXTURES");
  // Absent classification falls back explicitly, never to a guessed domain.
  assert.equal(eventDomainFromCensus({ source_type: null }), "OTHER_MAJOR_EVENTS");
  assert.equal(eventDomainFromCensus({}), "OTHER_MAJOR_EVENTS");
});

test("an unreachable source is reported, never silently dropped from the population", async () => {
  const results = await acquirePopulation([entry(), entry({ calendar_source_id: "src-2" })], {
    retrievedAt: AT,
    fetchPage: async () => { throw new Error("getaddrinfo ENOTFOUND example.test"); },
  });
  assert.equal(results.length, 2, "every attempted source yields a result row");
  for (const result of results) {
    assert.equal(result.state, "NETWORK_FAILURE");
    assert.match(result.reason, /ENOTFOUND/);
  }
});

// -------------------------------------------------------------- OBSERVATIONS

test("JSON-LD becomes an Observation carrying census provenance and no canonical event id", async () => {
  const page = jsonLdPage([ev({ name: "Gig One", url: "https://example.test/e/1", startDate: "2026-10-01T19:00:00+01:00" })]);
  const result = await acquireSourceEntry(entry(), { retrievedAt: AT, fetchPage: okPage(page) });

  assert.equal(result.state, "ACQUISITION_PROVEN");
  assert.equal(result.observations.length, 1);
  const observation = result.observations[0];

  assert.deepEqual(validateObservation(observation), []);
  assert.equal(observation.source_id, "src-1");
  assert.equal(observation.source_record_id, "https://example.test/e/1");
  assert.equal(observation.title, "Gig One");
  assert.equal(observation.source_fields.event_domain, "CONCERTS");
  assert.equal(observation.source_fields.calendar_source_id, "src-1");
  assert.equal(observation.source_fields.venue_census_id, "ukmec-england-exampleton-example-arena");
  assert.equal(observation.source_fields.census_calendar_class, "CONCERTS");
  assert.ok(!("event_id" in observation), "an Observation must never carry canonical Event identity");
});

test("WordPress Tribe becomes an Observation keyed on the source's own event id", async () => {
  const apiBody = JSON.stringify({
    events: [{ id: 43511, title: "Afternoon Tea", url: "https://example.test/events/tea/", start_date: "2026-10-04 14:00:00", utc_start_date: "2026-10-04 13:00:00", timezone: "Europe/London", venue: { venue: "The Rock" } }],
    total: 1, total_pages: 1,
  });
  const result = await acquireSourceEntry(entry({ source_family: "WORDPRESS_TRIBE_API", event_domain: "SPORT_FIXTURES", census_calendar_class: "SPORT_FIXTURES" }), {
    retrievedAt: AT,
    fetchPage: async () => ({ ok: true, status: 200, text: apiBody, contentType: "application/json", url: "https://example.test/wp-json/tribe/events/v1/events" }),
  });

  assert.equal(result.state, "ACQUISITION_PROVEN");
  const observation = result.observations[0];
  assert.equal(observation.source_record_id, "43511", "Tribe identity is the source's own post id, never title+date");
  assert.equal(observation.source_fields.event_domain, "SPORT_FIXTURES");
  assert.ok(!("event_id" in observation));
});

test("no artist, team or organiser is ever invented for a non-music event", async () => {
  // A sporting fixture with no performer must produce an EMPTY performers
  // list — never the home team's name, never the venue's, never the title.
  const page = jsonLdPage([ev({ "@type": "SportsEvent", name: "Race Day", url: "https://example.test/e/race", startDate: "2026-11-01" })]);
  const result = await acquireSourceEntry(entry({ event_domain: "SPORT_FIXTURES", census_calendar_class: "SPORT_FIXTURES", venue_name: "Example Racecourse" }), {
    retrievedAt: AT, fetchPage: okPage(page),
  });
  const observation = result.observations[0];
  assert.deepEqual(observation.source_fields.performers, [], "absence of a performer is preserved, not filled in");
  assert.equal(observation.title, "Race Day");
});

test("date certainty is preserved — a floating local time is never promoted to UTC", async () => {
  const page = jsonLdPage([
    ev({ name: "Floating", url: "https://example.test/e/f", startDate: "2026-10-01T19:00" }),
    ev({ name: "Zoned", url: "https://example.test/e/z", startDate: "2026-10-02T19:00:00+01:00" }),
    ev({ name: "DateOnly", url: "https://example.test/e/d", startDate: "2026-10-03" }),
  ]);
  const result = await acquireSourceEntry(entry(), { retrievedAt: AT, fetchPage: okPage(page) });
  const byTitle = Object.fromEntries(result.observations.map((o) => [o.title, o]));

  assert.equal(byTitle.Floating.start.certainty, "FLOATING_LOCAL");
  assert.notEqual(byTitle.Floating.start.is_utc, true, "a floating local time must never claim to be UTC");
  assert.equal(byTitle.Floating.start.iso, null, "and must not carry a fabricated UTC instant");
  assert.equal(byTitle.Zoned.start.certainty, "UTC_INSTANT");
  assert.equal(byTitle.Zoned.start.is_utc, true);
  assert.equal(byTitle.DateOnly.start.certainty, "DATE_ONLY");
});

test("future/past/unknown classification is honest about weak certainty", () => {
  const at = "2026-09-20T12:00:00.000Z";
  const obs = (start) => ({ start });

  assert.equal(classifyTemporal(obs({ certainty: "UTC_INSTANT", iso: "2026-10-01T18:00:00.000Z", date: "2026-10-01" }), at), "FUTURE_EVENT");
  assert.equal(classifyTemporal(obs({ certainty: "UTC_INSTANT", iso: "2026-01-01T18:00:00.000Z", date: "2026-01-01" }), at), "PAST_EVENT");
  // A DATE_ONLY event today has not demonstrably passed, and must not be
  // discarded merely for lacking a time.
  assert.equal(classifyTemporal(obs({ certainty: "DATE_ONLY", date: "2026-09-20" }), at), "FUTURE_EVENT");
  assert.equal(classifyTemporal(obs({ certainty: "FLOATING_LOCAL", date: "2026-12-01" }), at), "FUTURE_EVENT");
  // Nothing usable is never guessed into the future to inflate the yield.
  assert.equal(classifyTemporal(obs({ certainty: "TEXT_ONLY", date: null }), at), "DATE_UNKNOWN");
  assert.equal(classifyTemporal(obs({ certainty: "UNKNOWN", date: null }), at), "DATE_UNKNOWN");
});

// ------------------------------------------------------------------ IDENTITY

test("a non-unique event URL is not a stable identity — those records are dropped, not renamed", async () => {
  // The defect this guards: two arena listing pages published EVERY event
  // with the listing's own URL. Emitting them would give several genuinely
  // different events one identity and silently collapse them downstream.
  const page = jsonLdPage([
    ev({ name: "A", url: "https://example.test/whats-on", startDate: "2026-10-01" }),
    ev({ name: "B", url: "https://example.test/whats-on", startDate: "2026-10-02" }),
  ]);
  const result = await acquireSourceEntry(entry(), { retrievedAt: AT, fetchPage: okPage(page) });

  assert.equal(result.state, "STABLE_IDENTITY_PROOF_FAILED");
  assert.equal(result.observations.length, 0, "a colliding identity must never be emitted");
  assert.equal(result.identity_dropped, 2);
  assert.match(result.reason, /non-unique event URL/);
});

test("identity is never synthesised from title and date", async () => {
  const page = jsonLdPage([ev({ name: "No URL Event", startDate: "2026-10-01" })]);
  const result = await acquireSourceEntry(entry(), { retrievedAt: AT, fetchPage: okPage(page) });
  assert.equal(result.state, "STABLE_IDENTITY_PROOF_FAILED");
  assert.equal(result.observations.length, 0);

  assert.equal(deriveJsonLdRecordId({ name: "X", startDate: "2026-10-01" }), null, "no URL means no id, never a title+date fallback");
  assert.equal(deriveJsonLdRecordId({ url: "/e/1" }, { pageUrl: "https://example.test/whats-on" }), "https://example.test/e/1", "a relative URL resolves against the page");
});

test("records with a usable unique URL survive even when siblings collide", async () => {
  const page = jsonLdPage([
    ev({ name: "Dup A", url: "https://example.test/whats-on", startDate: "2026-10-01" }),
    ev({ name: "Dup B", url: "https://example.test/whats-on", startDate: "2026-10-02" }),
    ev({ name: "Good", url: "https://example.test/e/good", startDate: "2026-10-03" }),
  ]);
  const result = await acquireSourceEntry(entry(), { retrievedAt: AT, fetchPage: okPage(page) });
  assert.equal(result.state, "ACQUISITION_PROVEN");
  assert.equal(result.observations.length, 1, "only the uniquely identified record is emitted");
  assert.equal(result.observations[0].title, "Good");
  assert.equal(result.identity_dropped, 2);
});

// ------------------------------------------------------------ MULTI-DOMAIN

test("the Event family is widened for a multi-domain census, and music filtering is never applied", async () => {
  for (const type of ["SportsEvent", "BusinessEvent", "ExhibitionEvent", "TheaterEvent", "Festival"]) {
    assert.ok(EVENT_FAMILY_TYPES.has(type), `${type} must be acquirable — this census is not music-only`);
  }
  const page = jsonLdPage([
    ev({ "@type": "SportsEvent", name: "Fixture", url: "https://example.test/e/s", startDate: "2026-10-01" }),
    ev({ "@type": "BusinessEvent", name: "Conference", url: "https://example.test/e/b", startDate: "2026-10-02" }),
    ev({ "@type": "ExhibitionEvent", name: "Trade Show", url: "https://example.test/e/x", startDate: "2026-10-03" }),
  ]);
  const result = await acquireSourceEntry(entry({ event_domain: "CONFERENCES", census_calendar_class: "CONFERENCES" }), { retrievedAt: AT, fetchPage: okPage(page) });
  assert.equal(result.observations.length, 3, "sport, business and exhibition events must all survive");
  for (const observation of result.observations) assert.equal(observation.source_fields.event_domain, "CONFERENCES");
});

test("a shared operator platform serving another venue's events is flagged, not silently mis-attributed", () => {
  // The Jockey Club publishes JSON-LD for its WHOLE estate on each
  // course's page, so a Carlisle census source genuinely yields Kempton
  // events. The Observation stays honest either way, but the disagreement
  // must be machine-readable.
  assert.equal(classifyVenueAttribution("Cheltenham", "Carlisle Racecourse"), "SOURCE_VENUE_DIFFERS_FROM_CENSUS");
  assert.equal(classifyVenueAttribution("Llangollen Pavilion", "Royal International Pavilion"), "SOURCE_VENUE_MATCHES_CENSUS");
  assert.equal(classifyVenueAttribution("bp pulse LIVE", "bp pulse LIVE"), "SOURCE_VENUE_MATCHES_CENSUS");
  assert.equal(classifyVenueAttribution(null, "Anything"), "SOURCE_VENUE_NOT_STATED");
});

// ----------------------------------------------------------------------- RUN

test("one source's failure never affects another's result", async () => {
  const good = jsonLdPage([ev({ name: "Fine", url: "https://example.test/e/1", startDate: "2026-10-01" })]);
  const isolated = await acquirePopulation(
    [entry({ calendar_source_id: "boom", calendar_url: "https://boom.test/x" }), entry({ calendar_source_id: "fine", calendar_url: "https://fine.test/x" })],
    {
      retrievedAt: AT,
      concurrency: 2,
      fetchPage: async (url) => {
        if (url.includes("boom")) throw new Error("connection reset");
        return { ok: true, status: 200, text: good, contentType: "text/html", url };
      },
    },
  );
  assert.equal(isolated.find((r) => r.calendar_source_id === "boom").state, "NETWORK_FAILURE");
  assert.equal(isolated.find((r) => r.calendar_source_id === "fine").state, "ACQUISITION_PROVEN");
});

test("HTTP status maps to the canonical terminal state, and a block is not a network failure", async () => {
  const cases = [[403, "ACCESS_BLOCKED"], [429, "ACCESS_BLOCKED"], [404, "NETWORK_FAILURE"], [500, "NETWORK_FAILURE"]];
  for (const [status, expected] of cases) {
    const result = await acquireSourceEntry(entry(), {
      retrievedAt: AT,
      fetchPage: async () => ({ ok: false, status, text: "", contentType: null, url: "https://example.test/whats-on" }),
    });
    assert.equal(result.state, expected, `HTTP ${status} should be ${expected}`);
  }
});

test("a page with no Event JSON-LD is PROGRAMME_EMPTY, never a silent success", async () => {
  const result = await acquireSourceEntry(entry(), { retrievedAt: AT, fetchPage: okPage("<html><body>nothing here</body></html>") });
  assert.equal(result.state, "PROGRAMME_EMPTY");
  assert.equal(result.observations.length, 0);
});

test("acquisition is idempotent — the same evidence yields the same observations", async () => {
  const page = jsonLdPage([
    ev({ name: "One", url: "https://example.test/e/1", startDate: "2026-10-01T19:00:00+01:00" }),
    ev({ name: "Two", url: "https://example.test/e/2", startDate: "2026-10-02T19:00:00+01:00" }),
  ]);
  const first = await acquireSourceEntry(entry(), { retrievedAt: AT, fetchPage: okPage(page) });
  const second = await acquireSourceEntry(entry(), { retrievedAt: AT, fetchPage: okPage(page) });
  assert.deepEqual(second.observations, first.observations);
  assert.deepEqual(second.temporal, first.temporal);
});

test("two sources covering one venue are retained separately — no cross-source merge", async () => {
  const page = jsonLdPage([ev({ name: "Same Event", url: "https://example.test/e/1", startDate: "2026-10-01" })]);
  const results = await acquirePopulation(
    [entry({ calendar_source_id: "a", calendar_url: "https://a.test/x" }), entry({ calendar_source_id: "b", calendar_url: "https://b.test/x" })],
    { retrievedAt: AT, concurrency: 2, fetchPage: async (url) => ({ ok: true, status: 200, text: page, contentType: "text/html", url }) },
  );
  const observations = results.flatMap((r) => r.observations);
  assert.equal(observations.length, 2, "both sources' observations are kept — canonical reconciliation is a later package");
  assert.deepEqual([...new Set(observations.map((o) => o.source_id))].sort(), ["a", "b"]);

  const multi = venuesWithMultipleSources([
    entry({ calendar_source_id: "a" }), entry({ calendar_source_id: "b" }),
    entry({ calendar_source_id: "c", venue_census_id: "other-venue" }),
  ]);
  assert.equal(multi.length, 1);
  assert.equal(multi[0].source_count, 2);
});

test("population counts are deterministic from fixed input", () => {
  const input = [entry({ calendar_source_id: "a" }), entry({ calendar_source_id: "b", venue_census_id: "v2", nation: "Wales" })];
  assert.deepEqual(summarisePopulation(input), summarisePopulation([...input].reverse()));
});

// --------------------------------------------------------------------- SAFETY

test("SAFETY: the acquisition modules never import a registry, publication or deployment path", async () => {
  const files = [
    "ingestion/major-event-acquisition/population.mjs",
    "ingestion/major-event-acquisition/acquire.mjs",
    "ingestion/major-event-acquisition/run-acquisition.mjs",
  ];
  const forbidden = [
    /from\s+["'][^"']*publish-map-data/,
    /from\s+["'][^"']*publication-server/,
    /from\s+["'][^"']*venue-onboarding/,
    /from\s+["'][^"']*\/venue\/registry/,
    /from\s+["'][^"']*source-registry/,
    /from\s+["'][^"']*deploy/,
  ];
  // Scan CODE, not prose: acquire.mjs documents in a comment that it
  // deliberately does not use music filtering, and a naive text scan would
  // fail on the very comment that explains the safeguard.
  const stripComments = (source) => source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*/gm, "$1 ");

  for (const file of files) {
    const body = stripComments(await readFile(resolve(ROOT, file), "utf8"));
    for (const pattern of forbidden) {
      assert.ok(!pattern.test(body), `${file} must not import a production path (${pattern})`);
    }
    assert.ok(!/venues\/[a-z-]+\.json/.test(body), `${file} must not reference a production venue registry file`);
    // Checked as an IMPORT or CALL, not as the bare word: acquire.mjs
    // documents in a comment that it deliberately does not use it.
    assert.ok(!/import\s*\{[^}]*filterMusicEventNodes/.test(body), `${file} must not import music filtering`);
    assert.ok(!/filterMusicEventNodes\s*\(/.test(body), `${file} must not call music filtering on a multi-domain census`);
  }
});

test("SAFETY: acquisition writes nothing outside its own research directory", async () => {
  const body = await readFile(resolve(ROOT, "ingestion/major-event-acquisition/run-acquisition.mjs"), "utf8");
  const writes = [...body.matchAll(/writeJson\(\s*resolve\(([^)]*)\)/g)].map((m) => m[1]);
  assert.ok(writes.length > 0, "the runner does write its retained dataset");
  for (const target of writes) {
    assert.match(target, /OUT_DIR/, `every write must target OUT_DIR, found: ${target}`);
  }
  assert.match(body, /research\/major-event-acquisition\/uk-tier1-01/);
});
