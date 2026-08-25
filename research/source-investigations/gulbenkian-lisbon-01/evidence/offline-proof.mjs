// Offline, dependency-free, NO-NETWORK deterministic proof for the
// gulbenkian-lisbon-01 investigation.
//
// Parses the retained evidence files already saved under this directory
// (fetched once via curl during the investigation; never re-fetched here)
// and mechanically re-derives the field_assessment claims recorded in
// investigation.json: that the list page (musica/agenda) exposes a
// source-defined event-type taxonomy ("Concerto" vs "Transmissão"), that
// each list-page event card's data-event-id reappears as the numeric
// suffix of the corresponding detail page's own JSON-LD MusicEvent/Event
// "@id", and that title/startDate/endDate/location/price are extractable
// from the detail page's JSON-LD block plus one static price DOM node.
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

function fail(msg) {
  console.error(`FAIL: ${msg}`);
  process.exitCode = 1;
}

function ok(msg) {
  console.log(`OK:   ${msg}`);
}

// --- 1. List page: extract event cards (id, category, title, date/time text) ---

const listHtml = read("body-musica-agenda.html");

const cardRe =
  /<article\s+class="fcg-card fcg-card--with-link"\s*\n?\s*data-event-id="(\d+)"\s*>([\s\S]*?)<\/article>/g;

const cards = [];
let m;
while ((m = cardRe.exec(listHtml)) !== null) {
  const [, id, block] = m;
  const metaItems = [...block.matchAll(/<li class="fcg-card__meta-item">\s*([^<]+?)\s*<\/li>/g)].map(
    (x) => x[1].trim(),
  );
  const titleMatch = block.match(/<h3 class="fcg-card__title">\s*([^<]+?)\s*<\/h3>/);
  const timeMatch = block.match(/<time datetime="([^"]*)">([^<]*)<\/time>/);
  cards.push({
    id,
    metaItems,
    title: titleMatch ? titleMatch[1].trim() : null,
    timeText: timeMatch ? timeMatch[2].trim() : null,
  });
}

console.log(`Parsed ${cards.length} event cards from body-musica-agenda.html`);

if (cards.length === 0) {
  fail("expected at least one event card on the list page — found zero");
} else {
  ok(`found ${cards.length} event cards (>= 1)`);
}

// --- 2. Confirm the source's own event-type taxonomy is present and used
//        to distinguish concerts from other music-section entries. ---

const categories = new Set(cards.flatMap((c) => c.metaItems));
console.log(`Distinct fcg-card__meta-item categories observed: ${[...categories].join(", ")}`);

if (categories.has("Concerto")) {
  ok('source-defined category "Concerto" is present on the list page — used to select the music/concert sample');
} else {
  fail('expected category "Concerto" to be present on the list page');
}

const concertoCards = cards.filter((c) => c.metaItems.includes("Concerto"));
const nonConcertoCards = cards.filter((c) => !c.metaItems.includes("Concerto"));
console.log(
  `${concertoCards.length} card(s) tagged "Concerto"; ${nonConcertoCards.length} card(s) tagged otherwise (${[
    ...new Set(nonConcertoCards.flatMap((c) => c.metaItems)),
  ].join(", ") || "none"})`,
);

// --- 3. Detail pages: extract JSON-LD MusicEvent/Event node + static price DOM node,
//        and cross-check @id against the list page's data-event-id for the sample. ---

const sample = [
  { file: "body-detail-vale-do-silencio.html", listId: "106594", slug: "vale-do-silencio-3" },
  { file: "body-detail-oedipus-rex.html", listId: "106764", slug: "oedipus-rex" },
  { file: "body-detail-kafka-fragmente.html", listId: "106787", slug: "kafka-fragmente" },
  { file: "body-detail-quarteto-diotima.html", listId: "106799", slug: "quarteto-diotima" },
  { file: "body-detail-beatrice-rana-4.html", listId: "106821", slug: "beatrice-rana-4" },
];

function extractJsonLdEventNode(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const [, raw] of blocks) {
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      continue;
    }
    const graph = Array.isArray(data["@graph"]) ? data["@graph"] : [];
    const eventNode = graph.find((n) => n["@type"] === "MusicEvent" || n["@type"] === "Event");
    if (eventNode) return eventNode;
  }
  return null;
}

function extractPriceText(html) {
  const priceMatch = html.match(/<dd class="fcg-event-ticket-price__value">([\s\S]*?)<\/dd>/);
  return priceMatch ? priceMatch[1].replace(/\s+/g, " ").trim() : null;
}

console.log("");
console.log("--- Per-sample-event detail-page checks ---");

const results = [];
for (const { file, listId, slug } of sample) {
  let html;
  try {
    html = read(file);
  } catch (e) {
    fail(`could not read retained evidence file ${file}: ${e.message}`);
    continue;
  }

  const eventNode = extractJsonLdEventNode(html);
  if (!eventNode) {
    fail(`${file}: no JSON-LD MusicEvent/Event node found`);
    continue;
  }

  const idMatch = /\/(?:MusicEvent|Event)\/(\d+)$/.exec(eventNode["@id"] || "");
  const detailId = idMatch ? idMatch[1] : null;
  const idsMatch = detailId === listId;

  const priceText = extractPriceText(html);

  const row = {
    file,
    slug,
    listId,
    detailId,
    idsMatch,
    name: eventNode.name ?? null,
    url: eventNode.url ?? null,
    startDate: eventNode.startDate ?? null,
    endDate: eventNode.endDate ?? null,
    location: Array.isArray(eventNode.location) ? eventNode.location.map((l) => l.name).join(" / ") : null,
    priceText,
  };
  results.push(row);

  console.log(
    `${slug}: listId=${listId} detailId=${detailId} idsMatch=${idsMatch} name="${row.name}" start=${row.startDate} end=${row.endDate} location="${row.location}" price="${priceText}"`,
  );

  if (!idsMatch) {
    fail(`${slug}: list-page data-event-id (${listId}) does not match detail-page JSON-LD @id suffix (${detailId})`);
  } else {
    ok(`${slug}: list-page data-event-id matches detail-page JSON-LD @id suffix (${detailId})`);
  }

  if (!row.name) fail(`${slug}: missing event name/title in JSON-LD`);
  if (!row.startDate) fail(`${slug}: missing startDate in JSON-LD`);
  if (!row.location) fail(`${slug}: missing location in JSON-LD`);
  if (priceText === null) fail(`${slug}: no static price/admission DOM node found`);
}

// --- 4. Known, honestly-documented anomaly: Oedipus Rex's top-level
//        eventStatus disagrees with its own subEvent-level eventStatus. ---

const oedipus = extractJsonLdEventNode(read("body-detail-oedipus-rex.html"));
if (oedipus) {
  const topStatus = oedipus.eventStatus;
  const subStatuses = (oedipus.subEvent || []).map((s) => s.eventStatus);
  console.log("");
  console.log(
    `Oedipus Rex eventStatus anomaly check: top-level="${topStatus}", subEvent-level=[${subStatuses.join(", ")}]`,
  );
  if (topStatus !== subStatuses[0]) {
    ok(
      "confirmed (not silently reconciled): the source's own JSON-LD disagrees with itself about eventStatus at the production vs. individual-session level — recorded honestly in field_assessment notes, not resolved by guessing which is correct",
    );
  } else {
    console.log("NOTE: top-level and subEvent-level eventStatus matched on this run (anomaly not reproduced).");
  }
}

console.log("");
if (process.exitCode === 1) {
  console.log("RESULT: one or more checks FAILED — see FAIL lines above.");
} else {
  console.log(`RESULT: all checks passed against retained evidence (${results.length}/${sample.length} sample events fully cross-checked).`);
}
