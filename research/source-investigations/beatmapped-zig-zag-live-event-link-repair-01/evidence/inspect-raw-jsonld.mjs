// BEATMAPPED-ZIG-ZAG-LIVE-EVENT-LINK-REPAIR-01, step 2 — bounded, live,
// single-detail-page GET proving the exact root cause: this venue's own
// JSON-LD Event node genuinely publishes no `url` property at all
// (Squarespace's default Event schema block). Writes
// raw-jsonld-sample.json as retained evidence.
import { fetchText } from "../../../../ingestion/http/fetch.mjs";
import { extractEventNodes } from "../../../../ingestion/json-ld/parse.mjs";
import { writeFileSync } from "node:fs";

const detailUrl = "https://www.zigzag-jazzclub.berlin/program-mai/bwnarwjfpss3x6p-c38nm-ntfs4-hcxx7-95y6w";
const res = await fetchText(detailUrl, {});
console.log("status:", res.status);
const nodes = extractEventNodes(res.text, { types: new Set(["Event", "MusicEvent", "DanceEvent"]) });
console.log("nodes found:", nodes.length);
console.log(JSON.stringify(nodes[0], null, 2));

writeFileSync(
  new URL("./raw-jsonld-sample.json", import.meta.url),
  `${JSON.stringify({ detail_url: detailUrl, fetched_at: res.retrievedAt, status: res.status, node_count: nodes.length, raw_event_node: nodes[0], has_url_property: Object.prototype.hasOwnProperty.call(nodes[0] ?? {}, "url") }, null, 2)}\n`,
);
console.log("wrote raw-jsonld-sample.json");
