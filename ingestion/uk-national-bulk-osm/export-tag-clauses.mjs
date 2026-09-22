#!/usr/bin/env node
// BEATMAPPED-UK-NATIONAL-VENUE-BULK-OSM-COMPLETION-02 — writes
// ingestion/uk-national-discovery/overpass-bbox-query.mjs's TAG_CLAUSES /
// EXPLICIT_RELEVANCE_CLAUSES to a JSON file the offline pbf-extract.py
// script reads at runtime. This is the ONLY place those tag semantics are
// ever serialised for the Python side — the Python filter never hardcodes
// its own copy of the tag list, so the bulk-OSM path can never silently
// drift from the live-Overpass path's governed criteria (this package's
// brief: "reuse package-01/02's exact governed discovery tag semantics").

import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { TAG_CLAUSES, EXPLICIT_RELEVANCE_CLAUSES } from "../uk-national-discovery/overpass-bbox-query.mjs";

export async function writeTagClauses(outPath) {
  const payload = { TAG_CLAUSES, EXPLICIT_RELEVANCE_CLAUSES };
  await writeFile(outPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

async function main() {
  const outArg = process.argv.find((a) => a.startsWith("--out="));
  const outPath = outArg ? resolve(outArg.slice("--out=".length)) : resolve("tag-clauses.json");
  const payload = await writeTagClauses(outPath);
  console.log(`wrote ${outPath}: ${payload.TAG_CLAUSES.length} single-tag clauses, ${payload.EXPLICIT_RELEVANCE_CLAUSES.length} explicit-relevance clauses`);
}

if (fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
