import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { toObservations as agendalxToObservations } from "../ingestion/agendalx/observation-adapter.mjs";
import { toObservations as hotClubeToObservations } from "../ingestion/hot-clube/observation-adapter.mjs";
import { resolveObservation } from "../ingestion/venue/resolver.mjs";
import {
  getMarkersForCountry,
  projectObservationsToMapMarkers,
} from "../ingestion/map/projection.mjs";
import { buildLisbonMapProof } from "../ingestion/map/generate-proof.mjs";

const COMMITTED_PROOF_PATH = new URL(
  "../fixtures/map/lisbon-map-proof.json",
  import.meta.url,
);

async function loadAllObservations() {
  const musicFixture = JSON.parse(
    await readFile(new URL("../fixtures/agendalx/music-sample.json", import.meta.url), "utf8"),
  );
  const agendalxObs = agendalxToObservations(musicFixture);

  const metadata = JSON.parse(
    await readFile(new URL("../fixtures/hot-clube/metadata.json", import.meta.url), "utf8"),
  );
  const discovery = JSON.parse(
    await readFile(
      new URL("../fixtures/hot-clube/discovery/homepage-event-links.json", import.meta.url),
      "utf8",
    ),
  );
  const eventLinks = discovery.permalink_verification.safe_event_urls;
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
  const hotClubeObs = hotClubeToObservations(entries, metadata, eventLinks);

  return { agendalxObs, hotClubeObs, all: [...agendalxObs, ...hotClubeObs] };
}

async function loadRegistries() {
  const venueRegistry = JSON.parse(
    await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"),
  );
  const sourceRegistry = JSON.parse(
    await readFile(new URL("../sources/lisbon.json", import.meta.url), "utf8"),
  );
  return { venueRegistry, sourceRegistry };
}

test("1. 19 real retained Observations are produced", async () => {
  const { all } = await loadAllObservations();
  assert.equal(all.length, 19);
});

test("2. 9 Observations resolve to a canonical venue (8 via the original hardcoded tables, +1 — Casa Capitão, record 241833 — via VENUE-AUTO-ONBOARDING-01's data-driven mapping)", async () => {
  const { all } = await loadAllObservations();
  const resolvedCount = all.filter((o) => resolveObservation(o).resolution_status === "RESOLVED").length;
  assert.equal(resolvedCount, 9);

  const casaCapitao = all.find((o) => o.source_record_id === "241833");
  const result = resolveObservation(casaCapitao);
  assert.equal(result.resolution_status, "RESOLVED");
  assert.equal(result.venue_id, "venue-lisboa-casa-capitao");
  assert.match(result.resolution_method, /^DATA_DRIVEN_MAPPING:/);
});

test("3-7. the map projection contains exactly 1 marker, at Capitólio's exact coordinates, with exactly 6 listings", async () => {
  const { all } = await loadAllObservations();
  const { venueRegistry, sourceRegistry } = await loadRegistries();
  const markers = projectObservationsToMapMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });

  assert.equal(markers.length, 1, "exactly 1 venue marker");

  const [marker] = markers;
  assert.equal(marker.venue_id, "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado");
  assert.equal(marker.latitude, 38.7188712);
  assert.equal(marker.longitude, -9.1466143);
  assert.equal(marker.listings.length, 6, "exactly 6 map-eligible listings");

  const totalMapEligible = markers.reduce((sum, m) => sum + m.listings.length, 0);
  assert.equal(totalMapEligible, 6, "exactly 6 Observations are map-eligible overall");
});

test("8-9. listings preserve source_id/source_record_id and carry no canonical Event ID", async () => {
  const { all } = await loadAllObservations();
  const { venueRegistry, sourceRegistry } = await loadRegistries();
  const [marker] = projectObservationsToMapMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });

  for (const listing of marker.listings) {
    assert.equal(typeof listing.source_id, "string");
    assert.ok(listing.source_id.length > 0);
    assert.equal(typeof listing.source_record_id, "string");
    assert.ok(listing.source_record_id.length > 0);

    const keys = Object.keys(listing);
    for (const forbidden of ["event_id", "canonical_event_id", "canonicalEventId", "id"]) {
      assert.equal(keys.includes(forbidden), false, `${forbidden} must not appear on a listing`);
    }
  }
});

test("10-11. AgendaLX remains a separate listing from the 5 Hot Clube records; nothing is deduplicated", async () => {
  const { all } = await loadAllObservations();
  const { venueRegistry, sourceRegistry } = await loadRegistries();
  const [marker] = projectObservationsToMapMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });

  const agendalxListings = marker.listings.filter((l) => l.source_id === "agendalx");
  const hotClubeListings = marker.listings.filter((l) => l.source_id === "hot-clube-de-portugal");
  assert.equal(agendalxListings.length, 1);
  assert.equal(hotClubeListings.length, 5);

  // Distinct by (source_id, source_record_id) — no collapsing of the 5
  // semantically-overlapping Hot Clube "Há Jazz no Parque Mayer" listings.
  const identities = new Set(marker.listings.map((l) => `${l.source_id}:${l.source_record_id}`));
  assert.equal(identities.size, 6);
});

test("12-13. ADDRESS_ONLY venues (Graça, BOTA) never receive a map marker", async () => {
  const { all } = await loadAllObservations();
  const { venueRegistry, sourceRegistry } = await loadRegistries();
  const markers = projectObservationsToMapMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });

  const markerVenueIds = new Set(markers.map((m) => m.venue_id));
  assert.equal(markerVenueIds.has("venue-lisboa-igreja-e-convento-da-graca"), false);
  assert.equal(markerVenueIds.has("venue-lisboa-bota-anjos"), false);

  // Sanity: those two venues genuinely exist as ADDRESS_ONLY in the
  // registry (proving they were excluded by the rule, not by accident).
  const graca = venueRegistry.venues.find((v) => v.venue_id === "venue-lisboa-igreja-e-convento-da-graca");
  const bota = venueRegistry.venues.find((v) => v.venue_id === "venue-lisboa-bota-anjos");
  assert.equal(graca.location_status, "ADDRESS_ONLY");
  assert.equal(bota.location_status, "ADDRESS_ONLY");
});

test("14. UNRESOLVED Observations never appear in any marker's listings", async () => {
  const { all } = await loadAllObservations();
  const { venueRegistry, sourceRegistry } = await loadRegistries();
  const markers = projectObservationsToMapMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });

  const listedIdentities = new Set(
    markers.flatMap((m) => m.listings.map((l) => `${l.source_id}:${l.source_record_id}`)),
  );
  for (const observation of all) {
    const resolution = resolveObservation(observation);
    const identity = `${observation.source_id}:${observation.source_record_id}`;
    if (resolution.resolution_status === "UNRESOLVED") {
      assert.equal(listedIdentities.has(identity), false, identity);
    }
  }
});

test("15. no coordinate fallback exists: an ADDRESS_ONLY/UNRESOLVED venue is never turned into a marker, even synthetically", () => {
  const syntheticObservation = {
    source_id: "agendalx",
    source_record_id: "999999",
    retrieved_at: "2026-01-01T00:00:00Z",
    source_fields: { venue_id: 4952 }, // maps to Igreja e Convento da Graça, ADDRESS_ONLY
  };
  const markers = projectObservationsToMapMarkers([syntheticObservation], {
    venues: [
      {
        venue_id: "venue-lisboa-igreja-e-convento-da-graca",
        canonical_name: "Igreja e Convento da Graça",
        location_status: "ADDRESS_ONLY",
        address: "Largo da Graça, 1170-165 Lisboa",
        latitude: null,
        longitude: null,
      },
    ],
    sourceRegistry: [],
  });
  assert.equal(markers.length, 0, "an ADDRESS_ONLY venue must never produce a marker or a fallback coordinate");
});

test("16. listing titles flow from the retained source evidence, not a manual rewrite", async () => {
  const { all } = await loadAllObservations();
  const { venueRegistry, sourceRegistry } = await loadRegistries();
  const [marker] = projectObservationsToMapMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });

  const knownRealTitles = [
    "Hugo Lobo Trio convida Madalena Caldeira – Há Jazz no Parque Mayer",
    "Marta Garrett “Assanhado” – Há Jazz no Parque Mayer",
    "Bode Wilson – Há Jazz no Parque Mayer",
  ];
  const titles = marker.listings.map((l) => l.title);
  for (const expected of knownRealTitles) {
    assert.ok(titles.includes(expected), `expected retained title present: ${expected}`);
  }

  // Directly cross-check each Hot Clube listing's title against the raw
  // ICS fixture's own SUMMARY line — proving it is read, not retyped.
  const eventsDir = new URL("../fixtures/hot-clube/events/", import.meta.url);
  for (const listing of marker.listings.filter((l) => l.source_id === "hot-clube-de-portugal")) {
    const icsText = await readFile(new URL(`${listing.source_record_id}.ics`, eventsDir), "utf8");
    const summaryLine = icsText.split(/\r\n|\n/).find((line) => line.startsWith("SUMMARY:"));
    assert.equal(listing.title, summaryLine.slice("SUMMARY:".length));
  }
});

test("17. the committed fixtures/map/lisbon-map-proof.json exactly matches the projection regenerated from the canonical fixtures", async () => {
  const regenerated = await buildLisbonMapProof();
  const committed = JSON.parse(await readFile(COMMITTED_PROOF_PATH, "utf8"));
  assert.deepEqual(committed, regenerated);
});

test("18. Croatia receives zero proof markers via getMarkersForCountry", async () => {
  const { all } = await loadAllObservations();
  const { venueRegistry, sourceRegistry } = await loadRegistries();
  const portugalMarkers = projectObservationsToMapMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });
  assert.ok(portugalMarkers.length > 0, "sanity: Portugal actually has markers to withhold");

  assert.deepEqual(getMarkersForCountry("Croatia", portugalMarkers), []);
  assert.deepEqual(getMarkersForCountry("Portugal", portugalMarkers), portugalMarkers);
  // Any other/unexpected value also fails closed to no markers.
  assert.deepEqual(getMarkersForCountry("Spain", portugalMarkers), []);
  assert.deepEqual(getMarkersForCountry(undefined, portugalMarkers), []);
});

test("no source_name is hardcoded: it is looked up from the source registry", async () => {
  const { all } = await loadAllObservations();
  const { venueRegistry, sourceRegistry } = await loadRegistries();
  const [marker] = projectObservationsToMapMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });

  for (const listing of marker.listings) {
    const entry = sourceRegistry.entries.find((e) => e.id === listing.source_id);
    assert.equal(listing.source_name, entry.name);
  }
});

test("Hot Clube listings never carry an event_url; AgendaLX's real link is preserved", async () => {
  const { all } = await loadAllObservations();
  const { venueRegistry, sourceRegistry } = await loadRegistries();
  const [marker] = projectObservationsToMapMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });

  const agendalxListing = marker.listings.find((l) => l.source_id === "agendalx");
  assert.equal(agendalxListing.event_url, "https://www.agendalx.pt/events/event/ha-jazz-no-parque-mayer/");

  for (const listing of marker.listings.filter((l) => l.source_id === "hot-clube-de-portugal")) {
    assert.equal(listing.event_url, null, "Hot Clube event_url must not be invented");
  }
});

// BOTM-HOT-CLUBE-EVENT-URL-01

test("each listing's event_url is independent: one listing having a link never leaks onto another", async () => {
  const { agendalxObs, hotClubeObs } = await loadAllObservations();
  const { venueRegistry, sourceRegistry } = await loadRegistries();

  // Simulate a future, genuinely-proven eventLinks entry for exactly one
  // Hot Clube record, to prove the per-listing wiring — not to change any
  // committed data.
  const enrichedHotClubeObs = hotClubeObs.map((observation) =>
    observation.source_record_id === "3794"
      ? { ...observation, event_url: "https://example.test/proven/" }
      : observation,
  );

  const [marker] = projectObservationsToMapMarkers([...agendalxObs, ...enrichedHotClubeObs], {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });

  const withLink = marker.listings.filter((l) => l.event_url === "https://example.test/proven/");
  assert.equal(withLink.length, 1);
  assert.equal(withLink[0].source_record_id, "3794");

  const withoutLink = marker.listings.filter((l) => l.source_record_id !== "3794");
  assert.equal(withoutLink.length, 5);
  for (const listing of withoutLink) {
    assert.notEqual(listing.event_url, "https://example.test/proven/");
  }
});

test("a listing with event_url null carries no link value of any kind (no fake link to render)", async () => {
  const { all } = await loadAllObservations();
  const { venueRegistry, sourceRegistry } = await loadRegistries();
  const [marker] = projectObservationsToMapMarkers(all, {
    venues: venueRegistry.venues,
    sourceRegistry: sourceRegistry.entries,
  });

  const nullLinkListings = marker.listings.filter((l) => l.event_url === null);
  assert.equal(nullLinkListings.length, 5, "the 5 Hot Clube listings currently have no verified permalink");
  for (const listing of nullLinkListings) {
    assert.equal(listing.event_url, null);
    assert.notEqual(listing.event_url, "", "null, not an empty-string placeholder either");
  }
});
