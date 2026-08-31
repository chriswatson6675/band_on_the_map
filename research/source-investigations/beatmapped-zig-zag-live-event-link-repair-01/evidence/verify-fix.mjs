// BEATMAPPED-ZIG-ZAG-LIVE-EVENT-LINK-REPAIR-01 bounded validation script.
// collectZigZagJazzClub()/collectListDetailJsonLd() are module-private in
// ingestion/berlin/run.mjs (no per-source export exists), and the brief
// explicitly forbids running all 38 Berlin sources merely to test one
// collector. This script therefore exercises the exact same real,
// unmodified library calls the (now-fixed) collectZigZagJazzClub() makes —
// fetchText, extractLinksMatching, extractEventNodes, normaliseJsonLdEvent,
// toObservation — with the identical arguments, once with the fix applied
// and once without, as a bounded, single-source, live-network reproduction.
import { fetchText } from "../../../../ingestion/http/fetch.mjs";
import { extractLinksMatching } from "../../../../ingestion/html-link-discovery/discovery.mjs";
import { extractEventNodes, normaliseJsonLdEvent } from "../../../../ingestion/json-ld/parse.mjs";
import { toObservation } from "../../../../ingestion/json-ld/observation-adapter.mjs";

const listUrl = "https://www.zigzag-jazzclub.berlin/menu-marquee";
const linkPattern = /href="(\/program-mai\/[a-z0-9-]+)"/g;
const baseUrl = "https://www.zigzag-jazzclub.berlin";
const MAX_DETAIL_FETCHES = 80;

function lastPathSegment(url) {
  const trimmed = (url ?? "").replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || null;
}

async function run({ applyFix }) {
  const listRes = await fetchText(listUrl, {});
  if (!listRes.ok) throw new Error(`HTTP ${listRes.status} from ${listUrl}`);
  const allDetailUrls = extractLinksMatching(listRes.text, linkPattern, { baseUrl });
  const detailUrls = allDetailUrls.length > MAX_DETAIL_FETCHES ? allDetailUrls.slice(0, MAX_DETAIL_FETCHES) : allDetailUrls;

  const observations = [];
  const notes = [];
  for (const detailUrl of detailUrls) {
    const detailRes = await fetchText(detailUrl, {});
    if (!detailRes.ok) {
      notes.push(`${detailUrl}: HTTP ${detailRes.status}`);
      continue;
    }
    const nodes = extractEventNodes(detailRes.text, { types: new Set(["Event", "MusicEvent", "DanceEvent"]) });
    if (nodes.length === 0) {
      notes.push(`${detailUrl}: no qualifying JSON-LD node`);
      continue;
    }
    const record = normaliseJsonLdEvent(nodes[0], { deriveId: () => lastPathSegment(detailUrl) });
    const options = { retrievedAt: detailRes.retrievedAt, sourceUrl: detailUrl, venueNameOverride: "Zig Zag Jazz Club" };
    if (applyFix) options.eventDetailUrl = detailUrl;
    observations.push(toObservation(record, { source_id: "zig-zag-jazz-club-berlin" }, options));
  }
  return { allDetailUrls, observations, notes };
}

function classify(observation) {
  const url = observation.event_url;
  if (!url) return "NO_URL";
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "OTHER";
  }
  if (parsed.origin !== "https://www.zigzag-jazzclub.berlin") return "OTHER";
  if (parsed.pathname === "/menu-marquee" || parsed.pathname === "/programmneu") return "FIRST_PARTY_PROGRAMME_PAGE";
  if (/^\/program-mai\/[a-z0-9-]+$/.test(parsed.pathname)) return "INDIVIDUAL_FIRST_PARTY_EVENT_PAGE";
  return "OTHER";
}

function summarize(label, result) {
  const counts = { INDIVIDUAL_FIRST_PARTY_EVENT_PAGE: 0, FIRST_PARTY_PROGRAMME_PAGE: 0, NO_URL: 0, OTHER: 0 };
  for (const o of result.observations) counts[classify(o)]++;
  console.log(`\n=== ${label} ===`);
  console.log("candidate detail URLs discovered:", result.allDetailUrls.length);
  console.log("observations produced:", result.observations.length);
  console.log("notes:", JSON.stringify(result.notes));
  console.log("URL-quality breakdown:", JSON.stringify(counts));
  return { counts, result };
}

const before = await run({ applyFix: false });
const beforeSummary = summarize("BEFORE (current production behaviour)", before);

const after = await run({ applyFix: true });
const afterSummary = summarize("AFTER (with eventUrlFallback fix)", after);

console.log("\n=== Title/date/count regression check ===");
const sameCount = before.observations.length === after.observations.length;
console.log("event count unchanged:", sameCount, `(${before.observations.length} -> ${after.observations.length})`);
let titleDateMismatch = 0;
for (let i = 0; i < Math.min(before.observations.length, after.observations.length); i++) {
  const b = before.observations[i];
  const a = after.observations[i];
  if (b.title !== a.title || JSON.stringify(b.start) !== JSON.stringify(a.start) || b.source_record_id !== a.source_record_id || b.source_id !== a.source_id || b.venue_name !== a.venue_name) {
    titleDateMismatch++;
    console.log("MISMATCH at index", i, JSON.stringify({ before: { title: b.title, start: b.start, id: b.source_record_id }, after: { title: a.title, start: a.start, id: a.source_record_id } }));
  }
}
console.log("title/date/identity mismatches:", titleDateMismatch, "(expect 0)");

console.log("\n=== Spot check (first 5 AFTER observations) ===");
for (const o of after.observations.slice(0, 5)) {
  let status = null;
  try {
    const r = await fetchText(o.event_url, {});
    status = r.status;
  } catch (e) {
    status = `ERROR: ${e.message}`;
  }
  console.log(JSON.stringify({ title: o.title, date: o.start?.date, event_url: o.event_url, url_fetch_status: status, classification: classify(o) }));
}

import { writeFileSync } from "node:fs";
writeFileSync(
  new URL("./verify-fix-results.json", import.meta.url),
  JSON.stringify(
    {
      before: { discovered: before.allDetailUrls.length, observation_count: before.observations.length, url_quality: beforeSummary.counts, notes: before.notes },
      after: { discovered: after.allDetailUrls.length, observation_count: after.observations.length, url_quality: afterSummary.counts, notes: after.notes },
      title_date_identity_mismatches: titleDateMismatch,
      after_observations_sample: after.observations.slice(0, 10).map((o) => ({ title: o.title, start: o.start, event_url: o.event_url, source_record_id: o.source_record_id, venue_name: o.venue_name, source_id: o.source_id })),
    },
    null,
    2,
  ),
);
console.log("\nwrote verify-fix-results.json");
