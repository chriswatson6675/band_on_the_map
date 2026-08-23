import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { toObservations as agendalxToObservations } from "../ingestion/agendalx/observation-adapter.mjs";
import { toObservations as hotClubeToObservations } from "../ingestion/hot-clube/observation-adapter.mjs";
import { toObservations as capitolioToObservations } from "../ingestion/capitolio/observation-adapter.mjs";
import { associateHotClubeCapitolio } from "../ingestion/association/hot-clube-capitolio.mjs";
import { projectObservationsToDisplayMarkers } from "../ingestion/map/group-associated-listings.mjs";
import { getMarkersForCountry } from "../ingestion/map/projection.mjs";
import { buildLisbonMapProof } from "../ingestion/map/generate-proof.mjs";

const COMMITTED_PROOF_PATH = new URL("../fixtures/map/lisbon-map-proof.json", import.meta.url);

async function loadAll() {
  const musicFixture = JSON.parse(
    await readFile(new URL("../fixtures/agendalx/music-sample.json", import.meta.url), "utf8"),
  );
  const agendalxObs = agendalxToObservations(musicFixture);

  const metadata = JSON.parse(
    await readFile(new URL("../fixtures/hot-clube/metadata.json", import.meta.url), "utf8"),
  );
  const eventsDir = new URL("../fixtures/hot-clube/events/", import.meta.url);
  const names = (await readdir(eventsDir)).filter((f) => f.endsWith(".ics")).sort();
  const entries = [];
  for (const name of names) {
    entries.push({
      eventId: name.replace(/\.ics$/, ""),
      icsText: await readFile(new URL(name, eventsDir), "utf8"),
      fixturePath: `fixtures/hot-clube/events/${name}`,
    });
  }
  const hotClubeObs = hotClubeToObservations(entries, metadata);

  const capitolioFixture = JSON.parse(
    await readFile(new URL("../fixtures/capitolio/events.json", import.meta.url), "utf8"),
  );
  const capitolioObs = capitolioToObservations(capitolioFixture);

  const venueRegistry = JSON.parse(
    await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"),
  );
  const sourceRegistry = JSON.parse(
    await readFile(new URL("../sources/lisbon.json", import.meta.url), "utf8"),
  );

  const associations = associateHotClubeCapitolio(hotClubeObs, capitolioObs);
  const all = [...agendalxObs, ...hotClubeObs, ...capitolioObs];

  return { agendalxObs, hotClubeObs, capitolioObs, all, venueRegistry, sourceRegistry, associations };
}

test("19. the marker count stays exactly 1 after adding Capitólio Observations", async () => {
  const { all, venueRegistry, sourceRegistry, associations } = await loadAll();
  const markers = projectObservationsToDisplayMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
    associations,
  });
  assert.equal(markers.length, 1);
});

test("20. coordinates are unchanged", async () => {
  const { all, venueRegistry, sourceRegistry, associations } = await loadAll();
  const [marker] = projectObservationsToDisplayMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
    associations,
  });
  assert.equal(marker.latitude, 38.7188712);
  assert.equal(marker.longitude, -9.1466143);
  assert.equal(marker.venue_id, "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado");
});

test("19. underlying Observations (raw listings) grow to 11 at the Capitólio marker: 1 AgendaLX + 5 Hot Clube + 5 Capitólio", async () => {
  const { all, venueRegistry, sourceRegistry, associations } = await loadAll();
  const [marker] = projectObservationsToDisplayMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
    associations,
  });
  assert.equal(marker.listings.length, 11, "raw listings must still reflect every underlying Observation");
});

test("14-15. displayed/grouped listings collapse the 5 associated pairs into 1 GROUP each: 6 total (1 SINGLE + 5 GROUP)", async () => {
  const { all, venueRegistry, sourceRegistry, associations } = await loadAll();
  const [marker] = projectObservationsToDisplayMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
    associations,
  });

  assert.equal(marker.display_listings.length, 6);
  const singles = marker.display_listings.filter((l) => l.kind === "SINGLE");
  const groups = marker.display_listings.filter((l) => l.kind === "GROUP");
  assert.equal(singles.length, 1, "only AgendaLX remains a SINGLE listing");
  assert.equal(singles[0].source_id, "agendalx");
  assert.equal(groups.length, 5);
});

test("21. exactly 5 associated pairs are reported", async () => {
  const { associations } = await loadAll();
  const associated = associations.filter((a) => a.association_status === "ASSOCIATED");
  assert.equal(associated.length, 5);
});

test("15-16. each GROUP listing carries both sources independently, each with its own event_url", async () => {
  const { all, venueRegistry, sourceRegistry, associations } = await loadAll();
  const [marker] = projectObservationsToDisplayMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
    associations,
  });

  for (const group of marker.display_listings.filter((l) => l.kind === "GROUP")) {
    assert.equal(group.sources.length, 2);
    const hc = group.sources.find((s) => s.source_id === "hot-clube-de-portugal");
    const cap = group.sources.find((s) => s.source_id === "teatro-variedades-capitolio");
    assert.ok(hc);
    assert.ok(cap);
    assert.equal(hc.event_url, null, "Hot Clube never gets an invented link");
    assert.ok(cap.event_url.startsWith("https://teatrovariedades-capitolio.pt/evento/"));
  }
});

test("17. a null event_url inside a GROUP's sources renders no fake link value", async () => {
  const { all, venueRegistry, sourceRegistry, associations } = await loadAll();
  const [marker] = projectObservationsToDisplayMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
    associations,
  });
  for (const group of marker.display_listings.filter((l) => l.kind === "GROUP")) {
    const hc = group.sources.find((s) => s.source_id === "hot-clube-de-portugal");
    assert.equal(hc.event_url, null);
    assert.notEqual(hc.event_url, "");
  }
});

test("18. AgendaLX's recurring series listing is never merged into any GROUP", async () => {
  const { all, venueRegistry, sourceRegistry, associations } = await loadAll();
  const [marker] = projectObservationsToDisplayMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
    associations,
  });
  const single = marker.display_listings.find((l) => l.kind === "SINGLE");
  assert.equal(single.source_id, "agendalx");
  assert.equal(single.title, "Há Jazz no Parque Mayer!");
  for (const group of marker.display_listings.filter((l) => l.kind === "GROUP")) {
    assert.equal(group.sources.some((s) => s.source_id === "agendalx"), false);
  }
});

test("no GROUP display listing carries a canonical Event ID of any kind", async () => {
  const { all, venueRegistry, sourceRegistry, associations } = await loadAll();
  const [marker] = projectObservationsToDisplayMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
    associations,
  });
  for (const listing of marker.display_listings) {
    const keys = Object.keys(listing);
    for (const forbidden of ["event_id", "canonical_event_id", "canonicalEventId", "id"]) {
      assert.equal(keys.includes(forbidden), false);
    }
  }
});

test("Bode Wilson's GROUP listing exposes the price disagreement via fact_comparison", async () => {
  const { all, venueRegistry, sourceRegistry, associations } = await loadAll();
  const [marker] = projectObservationsToDisplayMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
    associations,
  });
  const bodeWilson = marker.display_listings.find(
    (l) => l.kind === "GROUP" && l.display_title === "Bode Wilson",
  );
  assert.ok(bodeWilson);
  assert.equal(bodeWilson.fact_comparison.price_text.agree, false);
  assert.deepEqual(bodeWilson.fact_comparison.price_text.values, [null, "5€"]);
});

test("22. Croatia still receives zero proof markers with the grouped display projection", async () => {
  const { all, venueRegistry, sourceRegistry, associations } = await loadAll();
  const portugalMarkers = projectObservationsToDisplayMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
    associations,
  });
  assert.ok(portugalMarkers.length > 0);
  assert.deepEqual(getMarkersForCountry("Croatia", portugalMarkers), []);
});

test("23. the committed fixtures/map/lisbon-map-proof.json exactly matches the projection regenerated from the canonical fixtures", async () => {
  const regenerated = await buildLisbonMapProof();
  const committed = JSON.parse(await readFile(COMMITTED_PROOF_PATH, "utf8"));
  assert.deepEqual(committed, regenerated);
  assert.equal(regenerated.total_underlying_observations, 24);
  assert.equal(regenerated.associated_pair_count, 5);
});
