import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const PUBLICATION_PATH = new URL("../../data/public/lisbon-porto-map.json", import.meta.url);
const OUTPUT_PATH = new URL("./publication-audit.json", import.meta.url);

const LIST_DETAIL_SOURCES = Object.freeze({
  "konzerthaus-berlin": { linkState: "EXPLICIT_STRUCTURED_EVENT_URL", reconstruction: "NOT_REQUIRED_EXPLICIT_EVENT_URL" },
  "lido-berlin": { linkState: "EXPLICIT_STRUCTURED_EVENT_URL", reconstruction: "NOT_REQUIRED_EXPLICIT_EVENT_URL" },
  "b-flat-berlin": { linkState: "DETAIL_PAGE_FALLBACK_REQUIRED", reconstruction: "RECONSTRUCTABLE_FROM_PROVEN_PREFIX_AND_SOURCE_RECORD_ID" },
  "so36-berlin": { linkState: "EXPLICIT_STRUCTURED_TICKET_URL", reconstruction: "NOT_REQUIRED_EXPLICIT_TICKET_URL" },
  "zig-zag-jazz-club-berlin": { linkState: "DETAIL_PAGE_FALLBACK_REQUIRED", reconstruction: "RECONSTRUCTABLE_FROM_PROVEN_PREFIX_AND_SOURCE_RECORD_ID" },
  "kesselhaus-kulturbrauerei-berlin": { linkState: "DETAIL_PAGE_FALLBACK_REQUIRED", reconstruction: "RECONSTRUCTABLE_FROM_PROVEN_PREFIX_AND_SOURCE_RECORD_ID" },
  "hkw-berlin": { linkState: "MIXED_EXPLICIT_URL_AND_DETAIL_PAGE_FALLBACK", reconstruction: "NOT_RECONSTRUCTABLE_FROM_PUBLICATION_RECORD_ALONE" },
  "volksbuehne-berlin": { linkState: "EXPLICIT_STRUCTURED_EVENT_URL", reconstruction: "NOT_REQUIRED_EXPLICIT_EVENT_URL" },
});

function sourceListings(artifact) {
  const rows = [];
  for (const country of Object.values(artifact.countries ?? {})) {
    for (const marker of country.markers ?? []) {
      for (const listing of marker.display_listings ?? []) {
        const sources = listing.kind === "GROUP" ? listing.sources : [listing];
        for (const source of sources) {
          if (LIST_DETAIL_SOURCES[source.source_id]) rows.push({ ...source, venue_id: marker.venue_id });
        }
      }
    }
  }
  return rows;
}

export async function buildPublicationAudit() {
  const artifact = JSON.parse(await readFile(PUBLICATION_PATH, "utf8"));
  const rows = sourceListings(artifact);
  const sources = {};
  for (const [sourceId, config] of Object.entries(LIST_DETAIL_SOURCES)) {
    const sourceRows = rows.filter((row) => row.source_id === sourceId);
    const affected = sourceRows.filter((row) => !row.event_url);
    sources[sourceId] = {
      retained_fixture_classification: config.linkState,
      published_event_count: sourceRows.length,
      null_event_url_count: affected.length,
      affected_venue_ids: [...new Set(affected.map((row) => row.venue_id))].sort(),
      original_detail_url_recoverability: affected.length ? config.reconstruction : "NOT_APPLICABLE",
    };
  }
  const affectedSources = Object.entries(sources).filter(([, value]) => value.null_event_url_count > 0);
  return {
    artifact_type: "READ_ONLY_EVENT_DETAIL_URL_PUBLICATION_AUDIT",
    input: "data/public/lisbon-porto-map.json",
    input_generated_at: artifact.generated_at ?? null,
    prerequisite_head: "7d98a4f663ac4d0ea17967b26b9fd15978bbf547",
    scope: "Eight configured Berlin HTML/sitemap list-to-detail JSON-LD sources",
    collector_families_affected: ["HTML_LINK_DISCOVERY_TO_JSON_LD"],
    totals: {
      determinable_published_events: rows.length,
      affected_null_event_url: affectedSources.reduce((sum, [, value]) => sum + value.null_event_url_count, 0),
      affected_source_count: affectedSources.length,
      reconstructable_from_published_source_record_id: affectedSources
        .filter(([, value]) => value.original_detail_url_recoverability.startsWith("RECONSTRUCTABLE_"))
        .reduce((sum, [, value]) => sum + value.null_event_url_count, 0),
      not_reconstructable_from_publication_alone: affectedSources
        .filter(([, value]) => value.original_detail_url_recoverability.startsWith("NOT_RECONSTRUCTABLE_"))
        .reduce((sum, [, value]) => sum + value.null_event_url_count, 0),
    },
    sources,
    limitations: [
      "This is a read-only audit of the committed publication artifact, not a live collection or republication.",
      "Recoverability describes the committed publication record plus already-proven route shape; it does not claim that a current live page was refetched.",
      "HKW detail routes may contain more path context than the retained source_record_id, so its exact original URLs cannot be reconstructed from publication records alone.",
    ],
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const audit = await buildPublicationAudit();
  await writeFile(OUTPUT_PATH, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(audit.totals, null, 2));
}
