import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildLisbonAutomaticSubsetProof } from "../ingestion/lisbon-subset/generate-proof.mjs";
import { buildLisbonMapProof } from "../ingestion/map/generate-proof.mjs";

const SUBSET_PROOF_PATH = new URL("../fixtures/map/lisbon-automatic-subset-01-proof.json", import.meta.url);
const ORIGINAL_PROOF_PATH = new URL("../fixtures/map/lisbon-map-proof.json", import.meta.url);

test("the committed lisbon-automatic-subset-01-proof.json exactly matches what code regenerates from the same retained fixtures", async () => {
  const regenerated = await buildLisbonAutomaticSubsetProof();
  const committed = JSON.parse(await readFile(SUBSET_PROOF_PATH, "utf8"));
  assert.deepEqual(committed, regenerated);
});

// 12. rerunning generation against the same retained fixtures is deterministic.
test("12. regenerating twice from the same retained fixtures produces byte-identical output", async () => {
  const first = await buildLisbonAutomaticSubsetProof();
  const second = await buildLisbonAutomaticSubsetProof();
  assert.deepEqual(first, second);
});

test("all seven sources contribute at least one Observation from real retained fixtures", async () => {
  const proof = await buildLisbonAutomaticSubsetProof();
  const counts = proof.per_source_observation_counts;
  for (const sourceId of [
    "agendalx",
    "hot-clube-de-portugal",
    "teatro-variedades-capitolio",
    "village-underground-lisboa",
    "bota-anjos",
    "cm-odivelas-agenda-cultura",
    "meo-arena",
  ]) {
    assert.ok(counts[sourceId] > 0, `${sourceId} contributed 0 Observations`);
  }
  assert.equal(
    proof.total_underlying_observations,
    Object.values(counts).reduce((a, b) => a + b, 0),
  );
});

// 8. existing HCP <-> Capitólio grouping remains intact, unchanged, inside the bigger dataset.
test("8. the Capitólio marker keeps exactly 11 raw listings and 6 display listings — the just-fixed invariant is not regressed", async () => {
  const proof = await buildLisbonAutomaticSubsetProof();
  const capitolio = proof.markers.find((m) => m.venue_id === "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado");
  assert.ok(capitolio, "Capitólio marker must exist");
  assert.equal(capitolio.listings.length, 11);
  assert.equal(capitolio.display_listings.length, 6);
  assert.equal(proof.associated_pair_count, 5);
});

test("8b. the original three-source BOTM-MULTISOURCE-LINKS-01 proof is completely untouched by this package", async () => {
  const regeneratedOriginal = await buildLisbonMapProof();
  const committedOriginal = JSON.parse(await readFile(ORIGINAL_PROOF_PATH, "utf8"));
  assert.deepEqual(committedOriginal, regeneratedOriginal);
  assert.equal(committedOriginal.total_underlying_observations, 24); // 10 AgendaLX + 9 Hot Clube + 5 Capitólio
  assert.equal(committedOriginal.markers.length, 1);
});

// 9. AgendaLX recurring series remains unmerged (unaffected by the new sources).
test("9. the AgendaLX 'Há Jazz no Parque Mayer!' series listing stays separate from the 5 associated HCP/Capitólio pairs", async () => {
  const proof = await buildLisbonAutomaticSubsetProof();
  const capitolio = proof.markers.find((m) => m.venue_id === "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado");

  const agendalxDisplay = capitolio.display_listings.filter((d) => d.kind === "SINGLE" && d.source_id === "agendalx");
  assert.equal(agendalxDisplay.length, 1, "exactly one standalone AgendaLX display listing");
  assert.equal(agendalxDisplay[0].source_record_id, "241429");

  const groups = capitolio.display_listings.filter((d) => d.kind === "GROUP");
  assert.equal(groups.length, 5, "the 5 HCP<->Capitólio pairs remain grouped, not merged with AgendaLX");
  for (const group of groups) {
    assert.ok(!group.sources.some((s) => s.source_id === "agendalx"));
  }
});

test("no new source is silently merged into the HCP<->Capitólio association: only those two source_ids ever appear inside a GROUP", async () => {
  const proof = await buildLisbonAutomaticSubsetProof();
  for (const marker of proof.markers) {
    for (const listing of marker.display_listings) {
      if (listing.kind !== "GROUP") continue;
      for (const source of listing.sources) {
        assert.ok(
          ["hot-clube-de-portugal", "teatro-variedades-capitolio"].includes(source.source_id),
          `unexpected source in a GROUP: ${source.source_id}`,
        );
      }
    }
  }
});

// 10. display counts use grouped/display listings rather than raw Observation count.
test("10. display_listing counts differ from raw listing counts exactly where grouping collapsed pairs", async () => {
  const proof = await buildLisbonAutomaticSubsetProof();
  const capitolio = proof.markers.find((m) => m.venue_id === "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado");
  assert.notEqual(capitolio.listings.length, capitolio.display_listings.length);
  assert.equal(capitolio.listings.length - capitolio.display_listings.length, 5, "5 pairs each collapse 2 raw listings into 1");

  const meoArena = proof.markers.find((m) => m.venue_id === "venue-lisboa-meo-arena");
  assert.equal(meoArena.listings.length, meoArena.display_listings.length, "no grouping applies to MEO Arena");
});

// 11. generated map markers use resolved (CONFIRMED, coordinate-bearing) venues only.
test("11. every marker is a CONFIRMED venue with valid coordinates; BOTA/Village Underground/Odivelas never produce a marker", async () => {
  const proof = await buildLisbonAutomaticSubsetProof();
  const venueRegistry = JSON.parse(await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"));

  for (const marker of proof.markers) {
    const venue = venueRegistry.venues.find((v) => v.venue_id === marker.venue_id);
    assert.equal(venue.location_status, "CONFIRMED");
    assert.equal(typeof marker.latitude, "number");
    assert.equal(typeof marker.longitude, "number");
  }

  const markerVenueIds = new Set(proof.markers.map((m) => m.venue_id));
  assert.equal(markerVenueIds.has("venue-lisboa-bota-anjos"), false);
  assert.equal(markerVenueIds.has("venue-lisboa-village-underground-lisboa"), false);
  // Odivelas has no resolved venue at all in this bounded proof, so
  // naturally contributes no marker (see resolveOdivelasObservation).

  assert.ok(markerVenueIds.has("venue-lisboa-meo-arena"), "MEO Arena is CONFIRMED and must produce a marker");
  assert.equal(proof.markers.length, 2, "exactly Capitólio + MEO Arena in this fixture set");
});

// 6 (cross-source). Facts are never copied between sources' own Observations.
test("Capitólio's own price (5€) never leaks onto the Hot Clube side of its associated pair, and vice versa", async () => {
  const proof = await buildLisbonAutomaticSubsetProof();
  const capitolio = proof.markers.find((m) => m.venue_id === "venue-lisboa-cineteatro-capitolio-teatro-raul-solnado");
  const bodeWilsonGroup = capitolio.display_listings.find(
    (d) => d.kind === "GROUP" && d.sources.some((s) => s.source_record_id === "2915"),
  );
  assert.ok(bodeWilsonGroup);
  const [hcFact, capFact] = bodeWilsonGroup.fact_comparison.price_text.values;
  assert.equal(hcFact, null, "Hot Clube never provided a price — must stay null, not borrowed from Capitólio");
  assert.equal(capFact, "5€", "Capitólio's own evidenced price is retained on its own side");
});
