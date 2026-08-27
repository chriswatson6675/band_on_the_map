import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { createVenueId, validateVenue } from "../ingestion/venue/contract.mjs";
import {
  resolveAgendalxObservation,
  resolveCapitolioObservation,
  resolveHotClubeObservation,
  resolveObservation,
} from "../ingestion/venue/resolver.mjs";
import { toObservations as agendalxToObservations } from "../ingestion/agendalx/observation-adapter.mjs";
import { toObservations as hotClubeToObservations } from "../ingestion/hot-clube/observation-adapter.mjs";
import { toObservations as capitolioToObservations } from "../ingestion/capitolio/observation-adapter.mjs";

const REGISTRY_PATH = new URL("../venues/lisbon.json", import.meta.url);
const EVENTS_DIR = new URL("../fixtures/hot-clube/events/", import.meta.url);

async function loadRegistry() {
  return JSON.parse(await readFile(REGISTRY_PATH, "utf8"));
}

async function loadAllObservations() {
  const musicFixture = JSON.parse(
    await readFile(new URL("../fixtures/agendalx/music-sample.json", import.meta.url), "utf8"),
  );
  const agendalxObs = agendalxToObservations(musicFixture);

  const metadata = JSON.parse(
    await readFile(new URL("../fixtures/hot-clube/metadata.json", import.meta.url), "utf8"),
  );
  const names = (await readdir(EVENTS_DIR)).filter((f) => f.endsWith(".ics")).sort();
  const entries = [];
  for (const name of names) {
    entries.push({
      eventId: name.replace(/\.ics$/, ""),
      icsText: await readFile(new URL(name, EVENTS_DIR), "utf8"),
      fixturePath: `fixtures/hot-clube/events/${name}`,
    });
  }
  const hotClubeObs = hotClubeToObservations(entries, metadata);

  return { agendalxObs, hotClubeObs, all: [...agendalxObs, ...hotClubeObs] };
}

test("venues/lisbon.json contains at least 3 canonical physical venues", async () => {
  const registry = await loadRegistry();
  assert.ok(registry.venues.length >= 3);
});

test("every registry venue passes validateVenue and has a deterministic venue_id", async () => {
  const registry = await loadRegistry();
  for (const venue of registry.venues) {
    const errors = validateVenue(venue);
    assert.deepEqual(errors, [], `${venue.venue_id}: ${errors.join("; ")}`);
    assert.equal(venue.venue_id, createVenueId(venue.canonical_name, venue.city));
  }
});

test("no registry venue with location_status ADDRESS_ONLY or UNRESOLVED carries coordinates", async () => {
  const registry = await loadRegistry();
  for (const venue of registry.venues) {
    // VENUE-GEOCODING-01 (predating this test's own last update) legitimately
    // introduced a second coordinate-bearing status, GEOCODED, alongside
    // CONFIRMED — see ingestion/venue/contract.mjs's MAP_ELIGIBLE_LOCATION_STATUSES.
    // Only ADDRESS_ONLY/UNRESOLVED venues are asserted coordinate-free here.
    if (venue.location_status === "ADDRESS_ONLY" || venue.location_status === "UNRESOLVED") {
      assert.equal(venue.latitude, null, venue.venue_id);
      assert.equal(venue.longitude, null, venue.venue_id);
    }
  }
});

test("every CONFIRMED registry venue's coordinates are valid numeric lat/long and cite evidence", async () => {
  const registry = await loadRegistry();
  const confirmed = registry.venues.filter((v) => v.location_status === "CONFIRMED");
  assert.ok(confirmed.length >= 1);
  for (const venue of confirmed) {
    assert.equal(typeof venue.latitude, "number");
    assert.equal(typeof venue.longitude, "number");
    assert.ok(venue.latitude >= -90 && venue.latitude <= 90);
    assert.ok(venue.longitude >= -180 && venue.longitude <= 180);
    assert.ok(venue.evidence.length > 0);
    assert.ok(venue.evidence.every((e) => typeof e.url === "string" && e.url.startsWith("http")));
  }
});

test("AgendaLX resolver mappings are explicit: Capitólio, Graça, and BOTA resolve; an unmapped venue_id does not", async () => {
  const { agendalxObs } = await loadAllObservations();

  const capitolio = agendalxObs.find((o) => o.source_record_id === "241429"); // "Há Jazz no Parque Mayer!"
  assert.equal(resolveAgendalxObservation(capitolio).resolution_status, "RESOLVED");
  assert.equal(
    resolveAgendalxObservation(capitolio).venue_id,
    "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado",
  );

  const graca = agendalxObs.find((o) => o.source_record_id === "241538"); // "Graça com Fado"
  assert.equal(resolveAgendalxObservation(graca).resolution_status, "RESOLVED");
  assert.equal(resolveAgendalxObservation(graca).venue_id, "venue-lisboa-igreja-e-convento-da-graca");

  const bota = agendalxObs.find((o) => o.source_record_id === "242166"); // "Julia Piedade"
  assert.equal(resolveAgendalxObservation(bota).resolution_status, "RESOLVED");
  assert.equal(resolveAgendalxObservation(bota).venue_id, "venue-lisboa-bota-anjos");

  // "Fado na Rua" is attributed to a parish council (Junta de Freguesia de
  // Santa Maria Maior), not an actual performance venue — must not resolve.
  const fadoNaRua = agendalxObs.find((o) => o.source_record_id === "241259");
  assert.equal(resolveAgendalxObservation(fadoNaRua).resolution_status, "UNRESOLVED");
  assert.equal(resolveAgendalxObservation(fadoNaRua).venue_id, null);
});

test("Hot Clube resolver mapping is explicit: the exact Capitólio location_text resolves; others do not", async () => {
  const { hotClubeObs } = await loadAllObservations();

  const capitolioEvent = hotClubeObs.find((o) => o.source_record_id === "3794");
  const result = resolveHotClubeObservation(capitolioEvent);
  assert.equal(result.resolution_status, "RESOLVED");
  assert.equal(result.venue_id, "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado");

  // Jardim do Arco do Cego is a large outdoor garden with no single-point
  // evidenced address in this proof — must remain unresolved.
  const arcoCego = hotClubeObs.find((o) => o.source_record_id === "3788");
  assert.equal(resolveHotClubeObservation(arcoCego).resolution_status, "UNRESOLVED");

  // event 3786's location_text ("Muzeu Praça Municipal 62") turned out,
  // on investigation, to be a museum in Braga — a different city entirely,
  // outside this task's Lisbon venue scope — must remain unresolved.
  const muzeu = hotClubeObs.find((o) => o.source_record_id === "3786");
  assert.equal(resolveHotClubeObservation(muzeu).resolution_status, "UNRESOLVED");
});

test("Capitólio from both AgendaLX and Hot Clube resolves to the SAME canonical venue_id", async () => {
  const { agendalxObs, hotClubeObs } = await loadAllObservations();

  const agendalxCapitolio = agendalxObs.find((o) => o.source_record_id === "241429");
  const hotClubeCapitolioEvents = hotClubeObs.filter((o) =>
    o.location_text?.includes("Cineteatro Capitólio"),
  );
  assert.equal(hotClubeCapitolioEvents.length, 5, "5 Hot Clube events share the Capitólio location_text");

  const agendalxResult = resolveAgendalxObservation(agendalxCapitolio);
  const hotClubeResults = hotClubeCapitolioEvents.map(resolveHotClubeObservation);

  assert.equal(agendalxResult.resolution_status, "RESOLVED");
  for (const result of hotClubeResults) {
    assert.equal(result.resolution_status, "RESOLVED");
    assert.equal(result.venue_id, agendalxResult.venue_id);
  }
});

test("Capitólio resolver mapping is explicit: both retained location_text variants resolve to the SAME canonical venue as AgendaLX/Hot Clube", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../fixtures/capitolio/events.json", import.meta.url), "utf8"),
  );
  const capitolioObs = capitolioToObservations(fixture);
  assert.equal(capitolioObs.length, 5);

  for (const observation of capitolioObs) {
    const result = resolveCapitolioObservation(observation);
    assert.equal(result.resolution_status, "RESOLVED");
    assert.equal(result.venue_id, "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado");
  }

  // Sanity: the weather-note variant (Marta Garrett) is a genuinely
  // different exact string, still explicitly mapped, not fuzzy-matched.
  const martaGarrett = capitolioObs.find((o) => o.source_record_id === "2913");
  assert.match(martaGarrett.location_text, /meteorológicas/);
  assert.equal(resolveCapitolioObservation(martaGarrett).resolution_status, "RESOLVED");
});

test("Capitólio resolver never guesses: an unmapped location_text is UNRESOLVED", () => {
  const result = resolveCapitolioObservation({
    source_id: "teatro-variedades-capitolio",
    location_text: "Somewhere Nobody Verified",
  });
  assert.equal(result.resolution_status, "UNRESOLVED");
  assert.equal(result.venue_id, null);
});

test("resolveObservation dispatches Capitólio Observations to resolveCapitolioObservation", async () => {
  const fixture = JSON.parse(
    await readFile(new URL("../fixtures/capitolio/events.json", import.meta.url), "utf8"),
  );
  const [first] = capitolioToObservations(fixture);
  assert.deepEqual(resolveObservation(first), resolveCapitolioObservation(first));
});

test("unknown/ambiguous venue text returns UNRESOLVED, never a fuzzy guess", async () => {
  assert.equal(
    resolveHotClubeObservation({ source_id: "hot-clube-de-portugal", location_text: "Somewhere Nobody Verified" })
      .resolution_status,
    "UNRESOLVED",
  );
  assert.equal(
    resolveAgendalxObservation({ source_id: "agendalx", source_fields: { venue_id: 999999 } }).resolution_status,
    "UNRESOLVED",
  );
  assert.equal(resolveObservation({ source_id: "some-future-source" }).resolution_status, "UNRESOLVED");
});

test("resolving does not mutate the Observation passed in", async () => {
  const { agendalxObs, hotClubeObs } = await loadAllObservations();
  const observation = agendalxObs[1]; // Capitólio record
  const before = JSON.parse(JSON.stringify(observation));
  resolveAgendalxObservation(observation);
  assert.deepEqual(observation, before);

  const hcObservation = hotClubeObs[0];
  const hcBefore = JSON.parse(JSON.stringify(hcObservation));
  resolveHotClubeObservation(hcObservation);
  assert.deepEqual(hcObservation, hcBefore);
});

test("resolution result never contains a canonical Event field, and does not deduplicate Observations", async () => {
  const { all } = await loadAllObservations();
  for (const observation of all) {
    const result = resolveObservation(observation);
    const keys = Object.keys(result);
    assert.deepEqual(keys.sort(), ["resolution_method", "resolution_status", "venue_id"]);
    for (const forbidden of ["event_id", "canonical_event_id", "canonicalEventId", "id"]) {
      assert.equal(keys.includes(forbidden), false);
    }
  }
  // 19 Observations in, 19 independent resolution results out — nothing
  // is merged or collapsed even when several share the same venue_id.
  const results = all.map(resolveObservation);
  assert.equal(results.length, 19);
});

test("at least 5 of the 19 real Observations resolve safely, across at least 3 distinct venues", async () => {
  const { all } = await loadAllObservations();
  assert.equal(all.length, 19);

  const results = all.map(resolveObservation);
  const resolvedResults = results.filter((r) => r.resolution_status === "RESOLVED");
  assert.ok(resolvedResults.length >= 5, `expected >=5 resolved, got ${resolvedResults.length}`);

  const distinctVenues = new Set(resolvedResults.map((r) => r.venue_id));
  assert.ok(distinctVenues.size >= 3, `expected >=3 distinct venues, got ${distinctVenues.size}`);
});
