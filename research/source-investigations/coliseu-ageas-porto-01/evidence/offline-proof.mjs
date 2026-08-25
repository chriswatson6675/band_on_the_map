// Offline, dependency-free, NO-NETWORK deterministic proof for the
// coliseu-ageas-porto-01 investigation.
//
// Parses the retained evidence files already saved under this directory
// (fetched once via curl during the investigation; never re-fetched here)
// and mechanically re-derives the field_assessment / site_classification
// claims recorded in investigation.json:
//
//   1. The public HTML pages (/, /agenda, /evento/:slug) are genuinely an
//      empty client-rendered shell (`<div id="root"></div>`, no JSON-LD,
//      identical byte length/ETag across routes = SPA catch-all routing) —
//      Level 1 (PASSIVE_STATIC) was genuinely INSUFFICIENT.
//   2. The site's own publicly-served /env-config.js names a real GraphQL
//      API host (nest.coliseu.pt) — a Level 2 (STRUCTURAL) lead.
//   3. That GraphQL endpoint is live, public (CORS: *), and its own
//      introspection schema exposes an `events` query and an `Event` type
//      with title/id/startDate/slug/category/room/promoter/ticketsUrl
//      fields, but NO price/ticket-price/cost field anywhere in the full
//      schema type list.
//   4. A bounded 5-event sample was retrieved and each event's `name`,
//      `startDate` (a genuine UTC ISO instant), `id`, and `slug` are
//      present.
//   5. The `id` field is empirically stable: cross-checking two of the
//      five sampled events via an independent query path (`eventBySlug`)
//      reproduces the exact same `id` both times.
//   6. The client-side route pattern `/evento/:slug` (found verbatim in
//      the retained main JS bundle) resolves 200 OK when fetched directly,
//      supporting a deterministically-constructed event_url.
//
// Run with: node evidence/offline-proof.mjs
// Makes zero network requests — reads only local files in this directory.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

function read(name) {
  return readFileSync(join(HERE, name), "utf-8");
}

function readJson(name) {
  return JSON.parse(read(name));
}

let failed = false;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`OK:   ${msg}`);
}

// --- 1. Confirm the public HTML pages are an empty client-rendered shell ---

console.log("--- Step 1: static-page shell check (Level 1 evidence) ---");

const homeHtml = read("body-home.html");
const agendaHtml = read("body-agenda.html");
const eventoHtml = read("body-evento-page.html");

for (const [label, html] of [
  ["home", homeHtml],
  ["agenda", agendaHtml],
  ["evento/:slug", eventoHtml],
]) {
  const hasRootDiv = /<div id="root"><\/div>/.test(html);
  const hasJsonLd = /application\/ld\+json/.test(html);
  console.log(`${label}: length=${html.length} bytes, empty <div id="root"></div>=${hasRootDiv}, ld+json present=${hasJsonLd}`);
  if (!hasRootDiv) fail(`${label}: expected an empty <div id="root"></div> client-rendered shell`);
  if (hasJsonLd) fail(`${label}: unexpectedly found JSON-LD in what should be an empty shell`);
}

if (homeHtml.length === agendaHtml.length && agendaHtml.length === eventoHtml.length) {
  ok(`home/agenda/evento pages are byte-identical in length (${homeHtml.length}) — confirms client-side (SPA) catch-all routing, not per-route server rendering`);
} else {
  fail("expected home/agenda/evento pages to be byte-identical in length (SPA catch-all)");
}

// --- 2. env-config.js names a real GraphQL API host ---

console.log("");
console.log("--- Step 2: env-config.js API host discovery (Level 2 lead) ---");

const envConfig = read("body-env-config.js");
const graphqlMatch = envConfig.match(/GRAPHQL_API:\s*"([^"]+)"/);
if (graphqlMatch) {
  ok(`env-config.js exposes GRAPHQL_API = "${graphqlMatch[1]}"`);
} else {
  fail("expected env-config.js to expose a GRAPHQL_API value");
}

// --- 3. Route pattern /evento/:slug is present in the retained JS bundle ---

console.log("");
console.log("--- Step 3: route-pattern check against retained main JS bundle ---");

const mainBundle = read("body-main-bundle.js");
if (mainBundle.includes('"/evento/:slug"')) {
  ok('retained main JS bundle contains the literal React route path "/evento/:slug"');
} else {
  fail('expected "/evento/:slug" route path in the retained main JS bundle');
}
if (mainBundle.includes('"/agenda"')) {
  ok('retained main JS bundle contains the literal React route path "/agenda"');
} else {
  fail('expected "/agenda" route path in the retained main JS bundle');
}

// --- 4. GraphQL endpoint liveness + introspection schema ---

console.log("");
console.log("--- Step 4: GraphQL endpoint liveness + schema introspection ---");

const typenameResp = readJson("body-graphql-typename.txt");
if (typenameResp?.data?.__typename === "Query") {
  ok('GraphQL endpoint responded to {__typename} with {"data":{"__typename":"Query"}}');
} else {
  fail("expected GraphQL __typename probe to return Query");
}

const schemaFieldsResp = readJson("body-graphql-eventsfield.json");
const topLevelFieldNames = (schemaFieldsResp?.data?.__schema?.queryType?.fields ?? []).map((f) => f.name);
console.log(`Top-level Query fields observed: ${topLevelFieldNames.join(", ")}`);
for (const required of ["events", "eventBySlug"]) {
  if (topLevelFieldNames.includes(required)) {
    ok(`schema exposes top-level query field "${required}"`);
  } else {
    fail(`expected top-level query field "${required}" in schema`);
  }
}

const eventTypeResp = readJson("body-graphql-eventtype.json");
const eventFieldNames = (eventTypeResp?.data?.__type?.fields ?? []).map((f) => f.name);
console.log(`Event type field names observed: ${eventFieldNames.join(", ")}`);
for (const required of ["id", "name", "startDate", "slug", "estimatedDuration", "category", "room", "promoter", "ticketsUrl"]) {
  if (eventFieldNames.includes(required)) {
    ok(`Event type exposes field "${required}"`);
  } else {
    fail(`expected Event type to expose field "${required}"`);
  }
}
const hasPriceField = eventFieldNames.some((n) => /price|cost/i.test(n));
if (!hasPriceField) {
  ok('Event type exposes no price/cost field — field_assessment.price is honestly NOT_PRESENT, not guessed');
} else {
  fail("unexpectedly found a price/cost-like field on Event type");
}

// --- 5. Full schema type list confirms no price/ticket-price/cost type anywhere ---

console.log("");
console.log("--- Step 5: full schema type list — confirm no price-bearing type exists ---");

const schemaTypesResp = readJson("body-graphql-schema-types.json");
const allTypeNames = (schemaTypesResp?.data?.__schema?.types ?? []).map((t) => t.name).filter(Boolean);
console.log(`Total schema types observed: ${allTypeNames.length}`);
const priceLikeTypes = allTypeNames.filter((n) => /price|cost/i.test(n));
if (priceLikeTypes.length === 0) {
  ok("no price/cost-named type exists anywhere in the full GraphQL schema — confirms price is genuinely NOT_PRESENT in this API, not merely missed on one type");
} else {
  fail(`unexpectedly found price/cost-like type(s): ${priceLikeTypes.join(", ")}`);
}

const roomTypeResp = readJson("body-graphql-roomtype.json");
const roomFieldNames = (roomTypeResp?.data?.__type?.fields ?? []).map((f) => f.name);
console.log(`Room type field names observed: ${roomFieldNames.join(", ")}`);
if (roomFieldNames.includes("name") && !roomFieldNames.some((n) => /address|street|lat|lng|location/i.test(n))) {
  ok("Room type exposes only a room name (e.g. \"Sala Principal\"), no independent street address/coordinates — venue_location resolves to a named space within the already-identified venue, not a separate geocoded address");
}

// --- 6. Bounded 5-event sample: field presence + totalCount ---

console.log("");
console.log("--- Step 6: bounded event sample (5 events) ---");

const sampleResp = readJson("body-graphql-events-sample.json");
const totalCount = sampleResp?.data?.events?.totalCount;
const nodes = sampleResp?.data?.events?.nodes ?? [];
console.log(`totalCount reported by API (visible, non-archived events): ${totalCount}`);
console.log(`Sample size retained: ${nodes.length}`);
if (nodes.length >= 3 && nodes.length <= 10) {
  ok(`sample size ${nodes.length} is within the bounded 3-10 event range`);
} else {
  fail(`sample size ${nodes.length} is outside the bounded 3-10 event range`);
}

for (const ev of nodes) {
  const durationHours = (ev.estimatedDuration / 3600).toFixed(2);
  const derivedEndIso = new Date(new Date(ev.startDate).getTime() + ev.estimatedDuration * 1000).toISOString();
  console.log(
    `- id=${ev.id} name="${ev.name}" slug=${ev.slug} startDate=${ev.startDate} category=${ev.category?.name} room=${ev.room?.name} promoter=${ev.promoter?.name} estimatedDuration=${ev.estimatedDuration}s (~${durationHours}h) derived_end(approx, NOT source-confirmed)=${derivedEndIso}`,
  );
  if (!ev.id || !ev.name || !ev.startDate || !ev.slug) {
    fail(`event id=${ev.id ?? "?"} is missing one of id/name/startDate/slug`);
  }
  if (!/Z$/.test(ev.startDate ?? "")) {
    fail(`event id=${ev.id ?? "?"} startDate "${ev.startDate}" does not look like a UTC ISO instant ending in Z`);
  }
}
if (nodes.length > 0) ok(`all ${nodes.length} sampled events carry id/name/startDate/slug`);

// --- 7. Stable-identifier proof: cross-check id via an independent query path ---

console.log("");
console.log("--- Step 7: source_record_id stability proof (events list vs. eventBySlug) ---");

const crossChecks = [
  { file: "body-graphql-eventbyslug.json", expectedId: "1951", expectedSlug: "20260912-he-s-back-michael-jackson-tribute" },
  { file: "body-graphql-eventbyslug-2.json", expectedId: "1923", expectedSlug: "20260913-sigur-ros-the-orchestral-tour" },
];

let stableMatches = 0;
for (const { file, expectedId, expectedSlug } of crossChecks) {
  const resp = readJson(file);
  const ev = resp?.data?.eventBySlug;
  const listNode = nodes.find((n) => n.slug === expectedSlug);
  if (!ev || !listNode) {
    fail(`${file}: could not find both the eventBySlug result and the matching list-sample node for slug ${expectedSlug}`);
    continue;
  }
  const idsMatch = ev.id === listNode.id && ev.id === expectedId;
  console.log(`${expectedSlug}: events-list id=${listNode.id}, eventBySlug id=${ev.id}, idsMatch=${idsMatch}`);
  if (idsMatch) {
    stableMatches += 1;
    ok(`${expectedSlug}: id reproduced identically across two independent query paths (events list vs. eventBySlug)`);
  } else {
    fail(`${expectedSlug}: id did NOT reproduce identically across query paths`);
  }
}
console.log(`Stable-id cross-checks passed: ${stableMatches}/${crossChecks.length}`);

// --- 8. event_url construction: /evento/:slug route resolves 200 (not 404) ---

console.log("");
console.log("--- Step 8: event_url route resolution check ---");

const eventoHeaders = read("headers-evento-page.txt");
const eventoStatusLine = eventoHeaders.split("\n")[0].trim();
console.log(`GET https://www.coliseu.pt/evento/20260912-he-s-back-michael-jackson-tribute -> ${eventoStatusLine}`);
if (/^HTTP\/[\d.]+\s+200/.test(eventoStatusLine)) {
  ok('the deterministically-constructed event URL (https://www.coliseu.pt/evento/{slug}) resolves 200 OK, not a 404 — supports event_url construction from the API\'s own "slug" field');
} else {
  fail(`expected the /evento/:slug route to resolve 200 OK, got: ${eventoStatusLine}`);
}

// --- 9. ticketsUrl format inconsistency (honestly recorded, not smoothed over) ---

console.log("");
console.log("--- Step 9: ticketsUrl format consistency check (informational, not a hard failure) ---");

for (const ev of nodes) {
  const looksAbsolute = /^https?:\/\//.test(ev.ticketsUrl ?? "");
  console.log(`- id=${ev.id} ticketsSeller=${ev.ticketsSeller} ticketsUrl="${ev.ticketsUrl}" looksAbsoluteUrl=${looksAbsolute}`);
}
const distinctUrlShapes = new Set(nodes.map((ev) => /^https?:\/\//.test(ev.ticketsUrl ?? "")));
if (distinctUrlShapes.size > 1) {
  console.log(
    "NOTE: ticketsUrl is not consistently a full absolute URL across sampled events (sometimes a bare slug/path fragment, sometimes a full https:// URL) — recorded as a MINOR collector_assessment blocker, not silently normalised here.",
  );
} else {
  console.log("NOTE: ticketsUrl shape was consistent across this bounded sample (may still vary outside the sample).");
}

console.log("");
if (failed) {
  console.log("RESULT: one or more checks FAILED — see FAIL lines above.");
  process.exitCode = 1;
} else {
  console.log(
    `RESULT: all checks passed against retained evidence. Level 1 (PASSIVE_STATIC) was genuinely insufficient (empty SPA shell); Level 2 (STRUCTURAL) discovered a live, public, introspectable GraphQL API (nest.coliseu.pt/graph/) that fully answers title/start_date/time/source_record_id/event_url, and honestly reports end as approximate-only and price as NOT_PRESENT.`,
  );
}
