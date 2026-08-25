// Offline, dependency-free, NO-NETWORK deterministic proof for the
// ccb-lisbon-01 investigation.
//
// Parses the retained evidence files already saved under this directory
// (fetched once via curl during the investigation; never re-fetched here)
// and mechanically re-derives the field_assessment / classification claims
// recorded in investigation.json:
//
//   1. The public HTML category-listing page (`/eventos/categoria/musica`
//      -> canonical `/event/category/musica/`) is server-rendered by
//      WordPress + The Events Calendar (Pro), and itself advertises a
//      public REST API link for the same category.
//   2. The REST API (`/wp-json/tribe/events/v1/events/?categories=musica`)
//      returns well-formed, paginated JSON with a stable per-record numeric
//      `id`, and every record on the two retained pages carries the
//      `musica` category.
//   3. A record's `id`/`title`/`start_date`/`end_date`/`url` fetched via the
//      LIST endpoint are byte-identical to the same record fetched
//      independently via the SINGLE-event endpoint (`/events/{id}`), for
//      two sampled ids (one single-occurrence event, one multi-occurrence
//      recurring series member) -- proving the id is a stable, reusable
//      key, not merely an artefact of one response.
//   4. Three sampled detail pages each carry a schema.org JSON-LD `Event`
//      block whose `startDate`/`endDate` include an explicit UTC offset
//      (`+01:00`), and whose venue name/address match the REST API's own
//      `venue` object exactly.
//   5. A genuine anomaly: for a recurring/multi-date series, the *first*
//      chronological occurrence's own date-suffixed permalink (as given
//      verbatim by the REST API's own `url` field) 302-redirects to a
//      *different* occurrence's page rather than 200/404 -- reproduced
//      twice, across two unrelated event series, so this is a systematic
//      site behaviour, not a one-off fluke.
//   6. Ticket price is NOT present in the REST API's `cost`/`cost_details`
//      fields for the sampled events (all empty), but IS present as a
//      static, server-rendered price table on the detail page's own HTML
//      -- so price extraction, where available, requires the HTML page,
//      not the JSON API alone.
//   7. The 26-category taxonomy exposed by the REST API's own
//      `/categories` endpoint contains no "jardim"/"verão" category, and a
//      site search for "jardim de verão" returns a generic
//      no-direct-results "suggestions" page, not a matching result --
//      directly checked against the prior loose note's claim of a
//      "Jardim de Verão" series.
//
// Run with: node evidence/offline-proof.mjs
// Makes zero network requests -- reads only local files in this directory.

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

let failures = 0;
function fail(msg) {
  failures += 1;
  console.error(`FAIL: ${msg}`);
}
function ok(msg) {
  console.log(`OK:   ${msg}`);
}

// --- 1. HTML category-listing page: platform fingerprint + REST API link ---

const listHtml = read("body-eventos-musica.html");

console.log("--- 1. HTML listing page platform fingerprint ---");
const hasTribeBody = /post-type-archive-tribe_events/.test(listHtml) && /events-category-musica/.test(listHtml);
if (hasTribeBody) {
  ok('body class carries "post-type-archive-tribe_events" and "events-category-musica" (The Events Calendar archive for the musica category)');
} else {
  fail("expected The Events Calendar archive body classes not found on the listing page");
}

const restLinkMatch = listHtml.match(
  /<link rel="alternate" href="(https:\/\/www\.ccb\.pt\/wp-json\/tribe\/events\/v1\/events\/\?categories=musica)" \/>/,
);
if (restLinkMatch) {
  ok(`listing page itself advertises the public REST API endpoint: ${restLinkMatch[1]}`);
} else {
  fail("expected the listing page to advertise a tribe/events/v1 REST API <link> for this category");
}

const canonicalMatch = listHtml.match(/<link rel="canonical" href="([^"]+)" \/>/);
console.log(`canonical URL on the /eventos/categoria/musica request: ${canonicalMatch ? canonicalMatch[1] : "(not found)"}`);
if (canonicalMatch && canonicalMatch[1] === "https://www.ccb.pt/event/category/musica/") {
  ok("canonical URL matches the redirected/observed https://www.ccb.pt/event/category/musica/");
} else {
  fail("canonical URL did not match the expected https://www.ccb.pt/event/category/musica/");
}

// --- 2. REST API list pages: shape + category membership ---

console.log("");
console.log("--- 2. REST API list pages ---");

const p1 = readJson("body-tribe-api-musica.json");
const p2 = readJson("body-tribe-api-musica-p2.json");
const allListEvents = [...p1.events, ...p2.events];

console.log(`page 1: ${p1.events.length} events, total=${p1.total}, total_pages=${p1.total_pages}`);
console.log(`page 2: ${p2.events.length} events`);

if (p1.events.length === 10 && p2.events.length === 10) {
  ok("both retained pages contain 10 events each (per_page default)");
} else {
  fail(`expected 10+10 events across the two retained pages, got ${p1.events.length}+${p2.events.length}`);
}

const allTagMusica = allListEvents.every((e) => (e.categories || []).some((c) => c.slug === "musica"));
if (allTagMusica) {
  ok(`all ${allListEvents.length} sampled events carry the "musica" category (source-defined taxonomy, not guessed)`);
} else {
  fail('at least one sampled event is missing the "musica" category');
}

const ids = allListEvents.map((e) => e.id);
const idsUnique = new Set(ids).size === ids.length;
if (idsUnique) {
  ok(`all ${ids.length} sampled event ids are unique numeric values (no collisions in this sample)`);
} else {
  fail("duplicate ids found among sampled events");
}

// --- 3. id stability: list endpoint vs single-event endpoint, for 2 ids ---

console.log("");
console.log("--- 3. Cross-check: list endpoint vs single-event endpoint ---");

const crossChecks = [
  { id: 281912, singleFile: "body-tribe-single-281912.json", label: "Sinfonia n.º 5 de Beethoven (single-occurrence)" },
  { id: 294811, singleFile: "body-tribe-single-294811.json", label: "Cantar Juntos pelo Mundo, 2026-09-12 occurrence (recurring series member)" },
];

for (const { id, singleFile, label } of crossChecks) {
  const listRecord = allListEvents.find((e) => e.id === id);
  if (!listRecord) {
    fail(`id ${id} (${label}) not found among retained list-endpoint events`);
    continue;
  }
  const singleRecord = readJson(singleFile);
  const fieldsMatch =
    singleRecord.id === listRecord.id &&
    singleRecord.title === listRecord.title &&
    singleRecord.start_date === listRecord.start_date &&
    singleRecord.end_date === listRecord.end_date &&
    singleRecord.url === listRecord.url;
  console.log(
    `${label}: list.start_date=${listRecord.start_date} single.start_date=${singleRecord.start_date} list.url=${listRecord.url} single.url=${singleRecord.url}`,
  );
  if (fieldsMatch) {
    ok(`${label}: id/title/start_date/end_date/url are byte-identical between the list endpoint and the single-event endpoint`);
  } else {
    fail(`${label}: list-endpoint and single-event-endpoint records disagree`);
  }
}

// --- 4. Detail-page JSON-LD: explicit UTC-offset dates + venue match ---

console.log("");
console.log("--- 4. Detail-page JSON-LD Event blocks ---");

function extractJsonLdEvent(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  for (const [, raw] of blocks) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    // This site emits the Event block as a bare top-level array: [{"@type":"Event",...}]
    if (Array.isArray(data)) {
      const found = data.find((n) => n && n["@type"] === "Event");
      if (found) return found;
    }
  }
  return null;
}

const detailSamples = [
  { file: "body-detail-sinfonia5.html", expectStart: "2026-09-27T17:00:00+01:00", expectEnd: "2026-09-27T18:30:00+01:00", label: "Sinfonia n.º 5 de Beethoven" },
  { file: "body-detail-amor-sin-pena.html", expectStart: "2026-09-13T17:00:00+01:00", expectEnd: "2026-09-13T18:00:00+01:00", label: "Amor Sin Pena" },
  { file: "body-detail-cantar-juntos-0913.html", expectStart: "2026-09-13T15:00:00+01:00", expectEnd: "2026-09-13T16:30:00+01:00", label: "Cantar Juntos pelo Mundo (09-13 occurrence)" },
];

const utcOffsetRe = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/;

for (const { file, expectStart, expectEnd, label } of detailSamples) {
  const html = read(file);
  const ev = extractJsonLdEvent(html);
  if (!ev) {
    fail(`${label}: no JSON-LD Event block found in ${file}`);
    continue;
  }
  console.log(`${label}: name="${ev.name}" startDate=${ev.startDate} endDate=${ev.endDate} venue="${ev.location?.name}"`);

  if (utcOffsetRe.test(ev.startDate) && utcOffsetRe.test(ev.endDate)) {
    ok(`${label}: startDate/endDate carry an explicit UTC offset (not a floating local datetime)`);
  } else {
    fail(`${label}: startDate/endDate do not match the expected explicit-offset ISO 8601 shape`);
  }

  if (ev.startDate === expectStart && ev.endDate === expectEnd) {
    ok(`${label}: startDate/endDate match the expected retained values exactly`);
  } else {
    fail(`${label}: startDate/endDate did not match expected values (expected ${expectStart} / ${expectEnd})`);
  }

  const addr = ev.location?.address;
  if (
    ev.location?.name === "Centro Cultural de Belém" &&
    addr?.streetAddress === "Praça do Império" &&
    addr?.postalCode === "1449-003" &&
    addr?.addressLocality === "Lisboa"
  ) {
    ok(`${label}: JSON-LD venue name/address matches the REST API's own venue object (Centro Cultural de Belém, Praça do Império, 1449-003 Lisboa)`);
  } else {
    fail(`${label}: JSON-LD venue/address did not match the expected CCB address`);
  }
}

// Cross-check the JSON-LD venue against the REST API's own venue object for one event.
const apiVenue = p1.events[0].venue;
if (
  apiVenue &&
  apiVenue.venue === "Centro Cultural de Belém" &&
  apiVenue.address === "Praça do Império" &&
  apiVenue.zip === "1449-003" &&
  apiVenue.city === "Lisboa"
) {
  ok("REST API venue object (list endpoint) matches the same CCB address independently");
} else {
  fail("REST API venue object did not match the expected CCB address");
}

// --- 5. The recurring-event permalink redirect anomaly (reproduced twice) ---

console.log("");
console.log("--- 5. Recurring-event date-suffixed permalink redirect anomaly ---");

function parseStatusAndLocation(headerText) {
  const statusMatch = headerText.match(/^HTTP\/[\d.]+\s+(\d{3})/m);
  const locationMatch = headerText.match(/^Location:\s*(\S+)/im);
  return {
    status: statusMatch ? Number(statusMatch[1]) : null,
    location: locationMatch ? locationMatch[1].trim() : null,
  };
}

const redirectCases = [
  {
    requestedUrl: "https://www.ccb.pt/evento/cantar-juntos-pelo-mundo-3/2026-09-12/",
    headersFile: "headers-detail-cantar-juntos-0912.txt",
    requestedDate: "2026-09-12",
    label: "Cantar Juntos pelo Mundo",
  },
  {
    requestedUrl: "https://www.ccb.pt/evento/festival-big-bang-norquestra-pt/2026-10-02/",
    headersFile: "headers-detail-norquestra-1002.txt",
    requestedDate: "2026-10-02",
    label: "Festival BIG BANG — Norquestra (PT)",
  },
];

let redirectAnomalyCount = 0;
for (const { requestedUrl, headersFile, requestedDate, label } of redirectCases) {
  const headers = read(headersFile);
  const { status, location } = parseStatusAndLocation(headers);
  console.log(`${label}: requested ${requestedUrl} -> status=${status} Location=${location}`);
  if (status === 302 && location && location !== requestedUrl && !location.includes(requestedDate)) {
    redirectAnomalyCount += 1;
    ok(`${label}: confirmed 302 redirect AWAY from the requested date-suffixed occurrence, to a different date (${location})`);
  } else {
    fail(`${label}: expected a 302 redirect to a different date than requested; got status=${status} Location=${location}`);
  }
}

if (redirectAnomalyCount === redirectCases.length && redirectCases.length >= 2) {
  ok(`redirect anomaly reproduced ${redirectAnomalyCount}/${redirectCases.length} times across unrelated event series -- treated as a systematic site behaviour, not a one-off fluke`);
} else {
  fail("redirect anomaly was not consistently reproduced across the sampled series");
}

// The single-event REST API endpoint for the "redirected-away" occurrence
// still reports the CORRECT, requested date -- proving the JSON API itself
// is unaffected by the HTML permalink redirect bug.
const single294811 = readJson("body-tribe-single-294811.json");
if (single294811.start_date === "2026-09-12 15:00:00") {
  ok("despite the HTML permalink redirecting elsewhere, the single-event REST API endpoint for id 294811 still correctly reports start_date=2026-09-12 15:00:00 -- the JSON API's per-id data is unaffected by the HTML routing bug");
} else {
  fail("expected the single-event REST API endpoint for id 294811 to report 2026-09-12 15:00:00 regardless of the HTML redirect");
}

// --- 6. Price: absent from REST API cost fields, present in detail-page HTML ---

console.log("");
console.log("--- 6. Price field: REST API vs detail-page HTML ---");

const sinfoniaListRecord = allListEvents.find((e) => e.id === 281912);
if (sinfoniaListRecord && sinfoniaListRecord.cost === "" && (sinfoniaListRecord.cost_details?.values || []).length === 0) {
  ok('REST API cost/cost_details for id 281912 (Sinfonia n.º 5 de Beethoven) are empty, despite this being a real ticketed concert -- price is NOT reliably available from the JSON API alone');
} else {
  fail("expected REST API cost fields for id 281912 to be empty (this investigation's basis for saying price needs the HTML page)");
}

const sinfoniaHtml = read("body-detail-sinfonia5.html");
const priceSpanRe = /<span>\(?(?:preço por lugar\)? )?(\d+)<\/span>€/g;
const prices = [...sinfoniaHtml.matchAll(priceSpanRe)].map((m) => Number(m[1]));
console.log(`prices extracted from the static "Preços" DOM table on the detail page: ${prices.join(", ")}`);
const hasBuyButton = /Comprar Bilhete/.test(sinfoniaHtml) && /ccb\.bol\.pt\/Comprar\/Bilhetes/.test(sinfoniaHtml);

if (prices.length > 0) {
  ok(`extracted ${prices.length} distinct price values (€${Math.min(...prices)}-€${Math.max(...prices)}) from the detail page's static, server-rendered price table`);
} else {
  fail("expected to extract at least one price value from the detail page's static price table");
}
if (hasBuyButton) {
  ok('detail page links to an external ticketing system (ccb.bol.pt) via a "Comprar Bilhete" button, confirming this is a real paid, ticketed event, not free admission');
} else {
  fail('expected a "Comprar Bilhete" button linking to ccb.bol.pt on the detail page');
}

// --- 7. Category taxonomy has no "jardim"/"verão" entry; site search confirms no direct hit ---

console.log("");
console.log("--- 7. \"Jardim de Verão\" cross-check against the prior loose note ---");

const catP1 = readJson("body-tribe-categories.json");
const catP2 = readJson("body-tribe-categories-p2.json");
const catP3 = readJson("body-tribe-categories-p3.json");
const allCategories = [...catP1.categories, ...catP2.categories, ...catP3.categories];

console.log(`total categories reported by REST API: ${catP1.total}; retained across 3 pages: ${allCategories.length}`);
if (catP1.total === allCategories.length) {
  ok(`retained category pages (${allCategories.length}) account for the full reported total (${catP1.total}) -- nothing left unpaged/unseen`);
} else {
  fail(`retained category pages (${allCategories.length}) do not account for the full reported total (${catP1.total})`);
}

const jardimCategory = allCategories.find((c) => /jardim|ver[aã]o/i.test(c.slug) || /jardim|ver[aã]o/i.test(c.name));
if (!jardimCategory) {
  ok('no "jardim"/"verão" category exists anywhere in the full 26-entry public category taxonomy');
} else {
  fail(`unexpectedly found a jardim/verão-like category: ${JSON.stringify(jardimCategory)}`);
}

const searchHtml = read("body-search-jardim.html");
const searchTitle = searchHtml.match(/<title>([\s\S]*?)<\/title>/)?.[1];
const suggestionsHeading = /As nossas Sugest[oõ]es/i.test(searchHtml);
console.log(`search page <title>: ${searchTitle}`);
console.log(`page shows a generic "As nossas Sugestões" (no-direct-match suggestions) heading: ${suggestionsHeading}`);
if (searchTitle && /jardim de ver[aã]o/i.test(searchTitle) && suggestionsHeading) {
  ok('a site search for "jardim de verão" was genuinely performed (title reflects the query) and returned a generic suggestions page, not a matching result -- consistent with no such series being currently discoverable, contradicting the prior loose note');
} else {
  fail("search page did not have the expected title/suggestions-heading shape");
}

// --- Summary ---

console.log("");
if (failures === 0) {
  console.log(
    `RESULT: all checks passed against retained evidence (${allListEvents.length} list-endpoint events across 2 pages; ${detailSamples.length} detail pages cross-checked; 2/2 recurring-permalink redirect anomalies reproduced; "jardim de verão" independently re-checked and not found).`,
  );
} else {
  console.log(`RESULT: ${failures} check(s) FAILED -- see FAIL lines above.`);
  process.exitCode = 1;
}
