#!/usr/bin/env node
// BEATMAPPED-ENRICHMENT-PILOT-01 — `npm run enrich:artists`.
//
// Reapplies Artist/genre enrichment onto the ALREADY-COMMITTED
// data/public/lisbon-porto-map.json in place, from the current
// artists/artists.json + artists/event-artist-links.json — no live
// network acquisition. See ingestion/artist-enrichment/apply.mjs's own
// doc comment for when this is the right tool versus a full
// `npm run publish:map-data` re-run.
//
// Same atomic-write safety as every other publisher: validation
// (validatePublicationArtifact, via writePublicationArtifactAtomic)
// happens BEFORE any temp file is opened — a result that would fail
// validation is refused and the previously committed artifact is left
// untouched.

import { readFile } from "node:fs/promises";

import { loadArtistRegistry, loadArtistLinks } from "../artist/registry-store.mjs";
import { applyAndValidate } from "./apply.mjs";
import { writePublicationArtifactAtomic, resolvePublicationArtifactPath } from "../map/publish-artifact-io.mjs";

async function main() {
  const artifactPath = resolvePublicationArtifactPath();
  console.log(`BEATMAPPED-ENRICHMENT-PILOT-01 artist-enrichment run starting`);
  console.log(`  reading ${artifactPath}`);

  const artifact = JSON.parse(await readFile(artifactPath, "utf8"));
  const artistRegistry = await loadArtistRegistry();
  const artistLinks = await loadArtistLinks();

  console.log(`  ${artistRegistry.artists.length} artist(s), ${artistLinks.links.length} event-artist link(s) loaded`);

  const result = applyAndValidate(artifact, {
    artistRegistry: artistRegistry.artists,
    artistLinks: artistLinks.links,
  });

  if (!result.ok) {
    console.error(`\nEnriched artifact failed schema validation — NOT written. Errors:`);
    for (const error of result.errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  const linkedEventCount = result.artifact.artists.reduce((sum, a) => sum + a.events.length, 0);
  console.log(`  ${result.artifact.artists.filter((a) => a.events.length > 0).length} artist(s) with a linked upcoming event (${linkedEventCount} event(s) total)`);

  const writeResult = await writePublicationArtifactAtomic(result.artifact);
  console.log(`\nWrote ${writeResult.path}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
