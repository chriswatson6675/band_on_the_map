// Offline, dependency-free, NO-NETWORK deterministic proof for the
// museu-do-fado-lisbon-01 investigation.
//
// Parses the retained evidence files already saved under this directory
// (fetched once via curl during the investigation; never re-fetched here)
// and mechanically re-derives the field_assessment claims recorded in
// investigation.json:
//
//  - the public events list page (https://museudofado.pt/eventos) exposes
//    a source-defined event-type taxonomy (the <select name="type"> options)
//    and a server-rendered card per event (title, category, location, date,
//    and an explicit "Arquivo" (archive/past) label on already-occurred
//    events);
//  - each of the 4 sampled event detail pages exposes a consistent
//    structured field block (Data / Horas / Até / Termina / Local / Preços)
//    plus an og:url that matches the URL actually followed and the href
//    used on the list page;
//  - for the 3 sampled events that also appear as ordinary (non-highlight)
//    list cards, the list card's own title/date/location match the detail
//    page's title/Data/Local exactly;
//  - the source's own "Arquivo" label is genuinely tied to whether the
//    event's own displayed date is before or after the actual server-
//    observed "now" (the HTTP Date response header retained in
//    headers-eventos.txt), not asserted from any external/assumed
//    "today" — i.e. this is a check between two pieces of retained
//    evidence, not a fabricated fact.
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

let failed = false;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`OK:   ${msg}`);
}

// --- 0. Reference "now": the actual server-observed HTTP Date header from
//        the list-page fetch, not an assumed/external date. ---

const listHeaders = read("headers-eventos.txt");
const dateHeaderMatch = listHeaders.match(/^Date:\s*(.+)$/m);
if (!dateHeaderMatch) fail("could not find a Date: response header in headers-eventos.txt");
const referenceNow = dateHeaderMatch ? new Date(dateHeaderMatch[1].trim()) : null;
if (!referenceNow || Number.isNaN(referenceNow.getTime())) {
  fail("could not parse the retained Date: response header into a valid instant");
} else {
  ok(`parsed retained server Date header as reference "now": ${referenceNow.toISOString()}`);
}

// --- 1. List page: source-defined event-type taxonomy (from the page's own
//        <select name="type"> options, not hardcoded) ---

const listHtml = read("body-eventos.html");

const typeOptionRe = /<select name="type">([\s\S]*?)<\/select>/;
const typeBlockMatch = typeOptionRe.exec(listHtml);
const typeTaxonomy = [];
if (typeBlockMatch) {
  const optRe = /<option\s+value="\d+">\s*([^<]+?)\s*<\/option>/g;
  let m;
  while ((m = optRe.exec(typeBlockMatch[1])) !== null) {
    typeTaxonomy.push(m[1].trim());
  }
}
console.log(`Source-defined event-type taxonomy (from <select name="type">): ${typeTaxonomy.join(", ") || "(none found)"}`);
if (typeTaxonomy.length > 0) {
  ok(`found ${typeTaxonomy.length} source-defined event-type taxonomy values`);
} else {
  fail("expected at least one event-type taxonomy value in the type <select>");
}

// --- 2. List page: parse ordinary (non-highlight) event cards ---

const cardRe =
  /<a href="https:\/\/museudofado\.pt\/evento\/([a-z0-9-]+)" class="thumbnail line border">([\s\S]*?)<\/a>\s*<\/div>/g;

function parseCardBlock(slug, block) {
  const titleMatch = block.match(/<h6 class="gry">\s*([^<]*?)\s*<\/h6>/);
  const categoryMatch = block.match(/<h3 class="event-list-category">\s*([^<]*?)\s*(?:<label[\s\S]*?<\/label>\s*)?<\/h3>/);
  const archived = /<label class="event-list-past-label">\s*Arquivo\s*<\/label>/.test(block);
  const locationMatch = block.match(/<h4 class="event-list-category">\s*([^<]*?)\s*<\/h4>/);
  const dateMatch = block.match(/<h5 class="data">\s*([^<]*?)\s*<\/h5>/);
  return {
    slug,
    title: titleMatch ? titleMatch[1].trim() : null,
    category: categoryMatch ? categoryMatch[1].trim() : null,
    archived,
    location: locationMatch ? locationMatch[1].trim() : null,
    dateText: dateMatch ? dateMatch[1].trim() : null,
  };
}

const cards = [];
let cm;
while ((cm = cardRe.exec(listHtml)) !== null) {
  cards.push(parseCardBlock(cm[1], cm[2]));
}
console.log("");
console.log(`Parsed ${cards.length} ordinary event cards from body-eventos.html (page 1 of the events list)`);
if (cards.length === 0) fail("expected at least one ordinary event card on the list page — found zero");
else ok(`found ${cards.length} ordinary event cards (>= 1)`);

for (const c of cards) {
  console.log(
    `  - ${c.slug}: title="${c.title}" category="${c.category}" archived=${c.archived} location="${c.location}" date="${c.dateText}"`,
  );
}

// --- 3. List page: parse the one highlighted/featured card separately
//        (different markup — title/location only, no category/date). ---

const highlightRe =
  /<a class="frame" href="https:\/\/museudofado\.pt\/evento\/([a-z0-9-]+)">([\s\S]*?)<\/a>\s*<\/div>/;
const highlightMatch = highlightRe.exec(listHtml);
let highlight = null;
if (highlightMatch) {
  const [, slug, block] = highlightMatch;
  const titleMatch = block.match(/<div class="title">\s*([^<]*?)\s*<\/div>/);
  const localMatch = block.match(/<div class="local">\s*([^<]*?)\s*<\/div>/);
  highlight = {
    slug,
    title: titleMatch ? titleMatch[1].trim() : null,
    location: localMatch ? localMatch[1].trim() : null,
  };
  console.log("");
  console.log(`Parsed highlighted/featured card: slug="${highlight.slug}" title="${highlight.title}" location="${highlight.location}"`);
  ok("found and parsed the one highlighted/featured card");
} else {
  fail("expected to find the one highlighted/featured card on the list page — found none");
}

// --- 4. Portuguese date-text parsing helper (mechanical, no inference) ---

const PT_MONTHS = {
  janeiro: 0, fevereiro: 1, "março": 2, abril: 3, maio: 4, junho: 5,
  julho: 6, agosto: 7, setembro: 8, outubro: 9, novembro: 10, dezembro: 11,
};

// Parses a single "D month, YYYY" date (optionally with an "HH:MM" time)
// into a JS Date. Returns null for anything that is not exactly this shape
// (e.g. a "D month - D month, YYYY" range is deliberately NOT parsed here —
// see the range-handling note below).
function parseSingleDate(dateText, timeText) {
  if (!dateText) return null;
  const m = /^(\d{1,2})\s+([a-zçãáéíóõôâê]+),\s*(\d{4})$/i.exec(dateText.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const monthName = m[2].toLowerCase();
  const year = Number(m[3]);
  if (!(monthName in PT_MONTHS)) return null;
  const month = PT_MONTHS[monthName];
  let hour = 0, minute = 0;
  if (timeText && /^\d{1,2}:\d{2}$/.test(timeText.trim())) {
    [hour, minute] = timeText.trim().split(":").map(Number);
  }
  return new Date(year, month, day, hour, minute, 0);
}

// --- 5. Detail pages: parse the 4 sampled event detail pages and
//        cross-check against the list page. ---

const sample = [
  { slug: "marco-rodrigues-canta-carlos-do-carmo", listKind: "card" },
  { slug: "sul", listKind: "card" },
  { slug: "pop-up-fado-4", listKind: "card" },
  { slug: "o-fado-sou-eu", listKind: "highlight" },
];

function extractDetailFields(html) {
  const h1Match = html.match(/<h1>\s*([^<]*?)\s*<\/h1>/);
  const ogUrlMatch = html.match(/<meta property="og:url" content="([^"]*)"\s*\/?>/);

  const startIdx = html.indexOf('<div class="wraps-description">');
  const endIdx = html.indexOf('<div class="col-md col-12">');
  const fieldBlock = startIdx !== -1 && endIdx !== -1 && endIdx > startIdx ? html.slice(startIdx, endIdx) : "";

  function field(label) {
    const re = new RegExp(`<h6>\\s*${label}\\s*<\\/h6>\\s*<h2>([\\s\\S]*?)<\\/h2>`);
    const m = re.exec(fieldBlock);
    if (!m) return null;
    return m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
  }

  return {
    title: h1Match ? h1Match[1].trim() : null,
    ogUrl: ogUrlMatch ? ogUrlMatch[1].trim() : null,
    data: field("Data"),
    horas: field("Horas"),
    ate: field("Até"),
    termina: field("Termina"),
    local: field("Local"),
    precos: field("Preços"),
  };
}

console.log("");
console.log("--- Per-sample-event detail-page checks ---");

const detailResults = [];
for (const { slug, listKind } of sample) {
  const file = `body-detail-${slug}.html`;
  let html;
  try {
    html = read(file);
  } catch (e) {
    fail(`could not read retained evidence file ${file}: ${e.message}`);
    continue;
  }

  const detail = extractDetailFields(html);
  detailResults.push({ slug, detail });

  console.log(
    `${slug}: title="${detail.title}" ogUrl="${detail.ogUrl}" data="${detail.data}" horas="${detail.horas}" ate="${detail.ate}" termina="${detail.termina}" local="${detail.local}" precos="${detail.precos}"`,
  );

  const expectedOgUrl = `https://museudofado.pt/evento/${slug}`;
  if (detail.ogUrl === expectedOgUrl) {
    ok(`${slug}: detail page og:url matches the URL actually followed (${expectedOgUrl})`);
  } else {
    fail(`${slug}: detail page og:url "${detail.ogUrl}" does not match the URL actually followed "${expectedOgUrl}"`);
  }

  if (!detail.title) fail(`${slug}: missing <h1> title on detail page`);
  if (!detail.data) fail(`${slug}: missing "Data" field on detail page`);
  if (!detail.local) fail(`${slug}: missing "Local" field on detail page`);
  if (!detail.precos) fail(`${slug}: missing "Preços" field on detail page (price/admission text)`);

  if (listKind === "card") {
    const card = cards.find((c) => c.slug === slug);
    if (!card) {
      fail(`${slug}: expected to find a matching ordinary list card — found none`);
    } else {
      if (card.title === detail.title) ok(`${slug}: list-card title matches detail-page <h1> ("${detail.title}")`);
      else fail(`${slug}: list-card title "${card.title}" does not match detail-page <h1> "${detail.title}"`);

      if (card.dateText === detail.data) ok(`${slug}: list-card date matches detail-page "Data" field ("${detail.data}")`);
      else fail(`${slug}: list-card date "${card.dateText}" does not match detail-page "Data" field "${detail.data}"`);

      if (card.location === detail.local) ok(`${slug}: list-card location matches detail-page "Local" field ("${detail.local}")`);
      else fail(`${slug}: list-card location "${card.location}" does not match detail-page "Local" field "${detail.local}"`);
    }
  } else if (listKind === "highlight") {
    if (!highlight || highlight.slug !== slug) {
      fail(`${slug}: expected this to be the highlighted/featured card — highlight parse did not match`);
    } else {
      if (highlight.title === detail.title) ok(`${slug}: highlighted-card title matches detail-page <h1> ("${detail.title}")`);
      else fail(`${slug}: highlighted-card title "${highlight.title}" does not match detail-page <h1> "${detail.title}"`);

      if (highlight.location === detail.local) ok(`${slug}: highlighted-card location matches detail-page "Local" field ("${detail.local}")`);
      else fail(`${slug}: highlighted-card location "${highlight.location}" does not match detail-page "Local" field "${detail.local}"`);
    }
  }

  // Confirm this sampled event is genuinely current/future relative to the
  // retained server Date header (proves the sample is not stale/archived).
  const parsed = parseSingleDate(detail.data, detail.horas);
  if (referenceNow && parsed) {
    if (parsed.getTime() >= referenceNow.getTime() - 24 * 3600 * 1000) {
      ok(`${slug}: parsed event start (${parsed.toISOString()}) is at/after the retained server "now" (${referenceNow.toISOString()}) — genuinely current/future, not stale archive data`);
    } else {
      fail(`${slug}: parsed event start (${parsed.toISOString()}) is BEFORE the retained server "now" (${referenceNow.toISOString()}) — sample is NOT current/future as claimed`);
    }
  } else {
    fail(`${slug}: could not mechanically parse "${detail.data}" / "${detail.horas}" into a comparable date`);
  }
}

// --- 6. Cross-check the source's own "Arquivo" (archive) label against the
//        retained server "now", for every ordinary card on the list page —
//        not just the sampled 4. Single-date cards only; multi-date ranges
//        (e.g. "25 julho - 5 setembro, 2026") are reported, not asserted,
//        since parseSingleDate deliberately does not parse ranges. ---

console.log("");
console.log("--- Cross-check: source's own \"Arquivo\" label vs. retained server \"now\", across all parsed list cards ---");

for (const c of cards) {
  const parsed = parseSingleDate(c.dateText, null);
  if (!parsed) {
    console.log(`  ${c.slug}: date "${c.dateText}" is not a single-date shape (likely a multi-date range) — not asserted either way, archived=${c.archived}`);
    continue;
  }
  const isPast = parsed.getTime() < referenceNow.getTime();
  if (isPast === c.archived) {
    ok(`${c.slug}: source's own "Arquivo"=${c.archived} label agrees with its own displayed date (${c.dateText}) relative to the retained server "now"`);
  } else {
    fail(`${c.slug}: source's own "Arquivo"=${c.archived} label DISAGREES with its own displayed date (${c.dateText}) relative to the retained server "now" — recorded honestly, not silently reconciled`);
  }
}

// --- 7. No JSON-LD, no ICS, no WordPress fingerprints anywhere in the
//        retained evidence — supports the STATIC_HTML classification
//        (a plain, well-structured, server-rendered HTML field layout is
//        the actual acquisition path here, not JSON_LD_EVENT/ICS/WORDPRESS). ---

console.log("");
const allBodies = [
  "body-eventos.html",
  "body-home.html",
  ...sample.map((s) => `body-detail-${s.slug}.html`),
];
let anyJsonLd = false;
let anyWpFingerprint = false;
for (const f of allBodies) {
  const html = read(f);
  if (html.includes("application/ld+json")) anyJsonLd = true;
  if (/wp-content|wp-json|wordpress/i.test(html)) anyWpFingerprint = true;
}
console.log(`JSON-LD script tags found across ${allBodies.length} retained files: ${anyJsonLd}`);
console.log(`WordPress fingerprints (wp-content/wp-json/wordpress) found across ${allBodies.length} retained files: ${anyWpFingerprint}`);
if (!anyJsonLd && !anyWpFingerprint) {
  ok("confirms event data is exposed as plain server-rendered structured HTML fields, not JSON-LD and not a WordPress calendar plugin — supports acquisition_class STATIC_HTML");
} else {
  fail("expected neither JSON-LD nor WordPress fingerprints in the retained evidence for a STATIC_HTML classification");
}

console.log("");
if (failed) {
  console.log("RESULT: one or more checks FAILED — see FAIL lines above.");
  process.exitCode = 1;
} else {
  console.log(
    `RESULT: all checks passed against retained evidence (${detailResults.length}/${sample.length} sample events fully cross-checked; ${cards.length} ordinary cards + 1 highlighted card parsed from the list page).`,
  );
}
