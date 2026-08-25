// Source-specific configuration for Centro Cultural de Belém (CCB) —
// the FIRST concrete proof of the generic Events Calendar REST API family
// (ingestion/events-calendar-api/). Every fact below is a plain
// configuration value, not logic: this file contains no parsing, no
// pagination, no Observation-mapping — see ingestion/events-calendar-api/
// for all of that. Adding another compatible source means adding another
// small file exactly like this one, not writing another collector.
//
// Provenance: research/source-investigations/ccb-lisbon-01/investigation.json
// (decision: READY_FOR_ACTIVATION). `source_id` matches the existing
// sources/lisbon.json registry entry id (ccb-centro-cultural-belem) for
// future consistency, but THIS PACKAGE DOES NOT ACTIVATE THAT REGISTRY
// ENTRY — sources/lisbon.json is unmodified; see docs/events-calendar-api.md.
//
// `category: "musica"` scopes acquisition to CCB's own music-taxonomy
// slug — the investigation deliberately targeted only this one category
// out of CCB's much broader multidisciplinary programme (see
// ccb-lisbon-01/README.md's cross-tagging caveat: the `musica` category
// is cross-tagged with theatre/performance/family programming on some
// records, so a caller wanting stricter live-music filtering should apply
// additional judgement downstream of this collector, not inside it).
export const CCB_MUSIC_CONFIG = {
  source_id: "ccb-centro-cultural-belem",
  baseUrl: "https://www.ccb.pt",
  restPath: "/wp-json/tribe/events/v1/events/",
  category: "musica",
  perPage: 10,
  // The investigation observed 90 records / 9 pages at 10-per-page — this
  // bound is set comfortably above that observed size, not tuned to it
  // exactly, so genuine future growth in CCB's own programme does not
  // silently truncate collection.
  maxPages: 20,
};
