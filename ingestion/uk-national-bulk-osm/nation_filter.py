#!/usr/bin/env python3
"""BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02

Geofabrik has no standalone Northern-Ireland-only extract (confirmed at
runtime: https://download.geofabrik.de/europe/ireland-and-northern-ireland.html
states "No sub regions are defined for this region.") — the combined
ireland-and-northern-ireland-latest.osm.pbf covers BOTH Northern Ireland
(in scope for this UK campaign) and the Republic of Ireland (a separate,
out-of-scope country). This script splits pbf_extract.py's raw candidate
output from that one file into NI-kept and ROI-excluded NDJSON files by a
real point-in-polygon test against Northern Ireland's own OSM
administrative boundary (relation 156393, fetched from Nominatim — the
same governed geocoding provider this project already trusts — and saved
as GeoJSON with its own source/retrieved_at provenance). This is a
processing FILTER using real, verifiable OSM boundary data, never an
invented fact about any individual venue.

Every candidate is written to exactly one of the two outputs — nothing is
silently dropped; the ROI-excluded file is retained for transparency/audit
even though its contents are out of scope and never processed further.
"""

import argparse
import json

from shapely.geometry import shape, Point


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidates", required=True, help="raw candidates NDJSON from pbf_extract.py")
    parser.add_argument("--boundary", required=True, help="Northern Ireland boundary GeoJSON Feature")
    parser.add_argument("--keep-out", required=True, help="output NDJSON path for candidates INSIDE the boundary (Northern Ireland)")
    parser.add_argument("--exclude-out", required=True, help="output NDJSON path for candidates OUTSIDE the boundary (Republic of Ireland)")
    parser.add_argument("--summary-out", required=True, help="output JSON path for split counts")
    args = parser.parse_args()

    with open(args.boundary, "r", encoding="utf-8") as f:
        boundary_feature = json.load(f)
    boundary_polygon = shape(boundary_feature["geometry"])

    kept = 0
    excluded = 0
    unresolved = 0

    with open(args.candidates, "r", encoding="utf-8") as candidates_file, \
         open(args.keep_out, "w", encoding="utf-8") as keep_file, \
         open(args.exclude_out, "w", encoding="utf-8") as exclude_file:
        for line in candidates_file:
            line = line.strip()
            if not line:
                continue
            record = json.loads(line)
            lat, lon = record.get("lat"), record.get("lon")
            if lat is None or lon is None:
                unresolved += 1
                exclude_file.write(line + "\n")
                continue
            point = Point(lon, lat)
            if boundary_polygon.contains(point) or boundary_polygon.touches(point):
                kept += 1
                keep_file.write(line + "\n")
            else:
                excluded += 1
                exclude_file.write(line + "\n")

    with open(args.summary_out, "w", encoding="utf-8") as f:
        json.dump({
            "boundary_source": boundary_feature.get("properties", {}),
            "kept_northern_ireland": kept,
            "excluded_republic_of_ireland_or_other": excluded,
            "unresolved_no_coordinate": unresolved,
        }, f, indent=2)

    print(f"kept(NI)={kept} excluded(ROI/other)={excluded} unresolved={unresolved}")


if __name__ == "__main__":
    main()
