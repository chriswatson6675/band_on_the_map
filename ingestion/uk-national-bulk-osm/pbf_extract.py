#!/usr/bin/env python3
"""BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02

Streaming, bounded-memory extraction of governed-tag-matching venue
candidates from a Geofabrik OSM PBF extract, using pyosmium (a Python
binding over libosmium, the same battle-tested C++ library osmium-tool and
the wider OSM toolchain are built on).

Tag selection is NEVER hardcoded here: it is read at runtime from a JSON
file produced by ingestion/uk-national-bulk-osm/export-tag-clauses.mjs,
which itself re-exports the exact TAG_CLAUSES / EXPLICIT_RELEVANCE_CLAUSES
constants ingestion/uk-national-discovery/overpass-bbox-query.mjs's live
Overpass sweep already uses — so the bulk-OSM path can never silently
drift from that governed, already-reviewed criteria.

Bounded memory: node locations needed to resolve way/relation centroids
are kept in a disk-backed dense_file_array index (osmium's standard
mechanism for exactly this — real-world OSM node ids are near-sequential,
which is what "dense" is tuned for; "file" backs it with a temp file on
disk rather than growing process RAM with country size), never an
in-process Python dict of every node in the country. Only
elements that actually match the tag filter are ever held in Python-side
memory, and even those are streamed straight to the output NDJSON file
line by line rather than accumulated into a list.

Output shape: one JSON object per line, matching the exact element shape
ingestion/venue-discovery/providers/overpass.mjs's parseOverpassCandidates()
already expects from a LIVE Overpass response ({type, id, lat, lon, tags}),
so the Node-side pipeline can feed extracted elements through that same,
unmodified parser — this file's only job is producing elements, never
candidate/venue construction itself. Additional identity fields (version,
timestamp) are included beyond what Overpass itself returns, for this
package's own "preserve exact OSM object identity" requirement; extra
fields are harmless to a consumer that only reads the ones it needs.

Relations: full multipolygon geometry resolution is out of scope for this
pass (needs osmium's area/multipolygon assembler, a materially heavier
dependency for a small minority of the matched tag set, which in real OSM
practice is overwhelmingly nodes/ways). A relation's centroid is instead
approximated from any of its own directly-resolvable node/way members'
locations; a relation with no resolvable member location is skipped and
counted in `relations_skipped_unresolved` (reported, never silently
dropped) rather than assigned an invented coordinate.
"""

import argparse
import json
import sys
from datetime import datetime, timezone

import osmium


def load_tag_predicates(tag_clauses_path):
    with open(tag_clauses_path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    single = [(k, v) for k, v in payload["TAG_CLAUSES"]]
    explicit = [[(k, v) for k, v in group] for group in payload["EXPLICIT_RELEVANCE_CLAUSES"]]
    return single, explicit


def tags_match(tags, single_clauses, explicit_clauses):
    """Matches directly against an osmium TagList (which supports .get()
    like a dict, backed by the C++ side) — NEVER against a Python dict
    copy. Called on every scanned node/way/relation, the overwhelming
    majority of which (untagged way-geometry vertices, unrelated POIs)
    never match; keeping this check off the TagList avoids materialising a
    Python dict for every one of them, which is what made the first version
    of this script minutes-per-hundred-MB slow at real country scale."""
    for key, value in single_clauses:
        if tags.get(key) == value:
            return True
    for group in explicit_clauses:
        if all(tags.get(key) == value for key, value in group):
            return True
    return False


def tags_to_dict(osmium_tags):
    return {tag.k: tag.v for tag in osmium_tags}


def iso_timestamp(osmium_timestamp):
    try:
        return osmium_timestamp.to_datetime().replace(tzinfo=timezone.utc).isoformat().replace("+00:00", "Z")
    except Exception:
        return None


class VenueCandidateHandler(osmium.SimpleHandler):
    def __init__(self, single_clauses, explicit_clauses, out_file, node_location_index):
        super().__init__()
        self.single_clauses = single_clauses
        self.explicit_clauses = explicit_clauses
        self.out_file = out_file
        self.node_location_index = node_location_index
        self.counts = {
            "nodes_scanned": 0,
            "ways_scanned": 0,
            "relations_scanned": 0,
            "nodes_matched": 0,
            "ways_matched": 0,
            "ways_matched_unresolved_location": 0,
            "relations_matched": 0,
            "relations_skipped_unresolved": 0,
        }

    def _emit(self, element_type, element_id, lat, lon, tags, version, timestamp, geometry_source):
        record = {
            "type": element_type,
            "id": element_id,
            "lat": lat,
            "lon": lon,
            "tags": tags,
            "osm_version": version,
            "osm_timestamp": timestamp,
            "geometry_source": geometry_source,
        }
        self.out_file.write(json.dumps(record) + "\n")

    def _maybe_report_progress(self):
        scanned = self.counts["nodes_scanned"] + self.counts["ways_scanned"] + self.counts["relations_scanned"]
        if scanned % 5_000_000 == 0:
            print(f"progress: {scanned} elements scanned, {self.counts['nodes_matched'] + self.counts['ways_matched'] + self.counts['relations_matched']} matched so far", file=sys.stderr, flush=True)

    def node(self, n):
        self.counts["nodes_scanned"] += 1
        self._maybe_report_progress()
        if len(n.tags) == 0 or "name" not in n.tags:
            return
        if not tags_match(n.tags, self.single_clauses, self.explicit_clauses):
            return
        tags = tags_to_dict(n.tags)
        self.counts["nodes_matched"] += 1
        self._emit("node", n.id, n.location.lat, n.location.lon, tags, n.version, iso_timestamp(n.timestamp), "NODE_COORDINATE")

    def way(self, w):
        self.counts["ways_scanned"] += 1
        if len(w.tags) == 0 or "name" not in w.tags:
            return
        if not tags_match(w.tags, self.single_clauses, self.explicit_clauses):
            return
        tags = tags_to_dict(w.tags)
        lats, lons = [], []
        for node_ref in w.nodes:
            if node_ref.location.valid():
                lats.append(node_ref.location.lat)
                lons.append(node_ref.location.lon)
        if not lats:
            self.counts["ways_matched_unresolved_location"] += 1
            return
        self.counts["ways_matched"] += 1
        centroid_lat = sum(lats) / len(lats)
        centroid_lon = sum(lons) / len(lons)
        self._emit("way", w.id, centroid_lat, centroid_lon, tags, w.version, iso_timestamp(w.timestamp), "WAY_NODE_AVERAGE_CENTROID")

    def relation(self, r):
        self.counts["relations_scanned"] += 1
        if len(r.tags) == 0 or "name" not in r.tags:
            return
        if not tags_match(r.tags, self.single_clauses, self.explicit_clauses):
            return
        tags = tags_to_dict(r.tags)
        # Best-effort centroid: only directly-resolvable node members, looked
        # up in the same node-location index NodeLocationsForWays populates
        # for every node in the file (way members' own further-nested node
        # locations are not resolved without a second geometry pass — see
        # module docstring). A relation with zero resolvable node members is
        # honestly skipped, never guessed.
        lats, lons = [], []
        for member in r.members:
            if member.type != "n":
                continue
            try:
                loc = self.node_location_index.get(member.ref)
            except KeyError:
                continue
            if loc.valid():
                lats.append(loc.lat)
                lons.append(loc.lon)
        if not lats:
            self.counts["relations_skipped_unresolved"] += 1
            return
        self.counts["relations_matched"] += 1
        centroid_lat = sum(lats) / len(lats)
        centroid_lon = sum(lons) / len(lons)
        self._emit("relation", r.id, centroid_lat, centroid_lon, tags, r.version, iso_timestamp(r.timestamp), "RELATION_MEMBER_AVERAGE_CENTROID")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--pbf", required=True, help="path to input .osm.pbf file")
    parser.add_argument("--tag-clauses", required=True, help="path to tag-clauses.json (from export-tag-clauses.mjs)")
    parser.add_argument("--out", required=True, help="output NDJSON path")
    parser.add_argument("--counts-out", required=True, help="output JSON path for scan counters")
    args = parser.parse_args()

    single_clauses, explicit_clauses = load_tag_predicates(args.tag_clauses)

    # Built and driven manually (rather than SimpleHandler.apply_file's
    # locations=True convenience) specifically so `index` stays a reference
    # THIS script also queries directly inside relation() for member-node
    # centroid lookups — apply_file's shortcut builds its own internal
    # index the caller never gets a handle back to.
    index = osmium.index.create_map("dense_file_array")
    location_handler = osmium.NodeLocationsForWays(index)
    location_handler.ignore_errors()

    with open(args.out, "w", encoding="utf-8") as out_file:
        handler = VenueCandidateHandler(single_clauses, explicit_clauses, out_file, index)
        reader = osmium.io.Reader(args.pbf)
        osmium.apply(reader, location_handler, handler)
        reader.close()

    with open(args.counts_out, "w", encoding="utf-8") as f:
        json.dump({
            "pbf": args.pbf,
            "completed_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            **handler.counts,
        }, f, indent=2)

    print(f"done: {json.dumps(handler.counts)}", file=sys.stderr)


if __name__ == "__main__":
    main()
