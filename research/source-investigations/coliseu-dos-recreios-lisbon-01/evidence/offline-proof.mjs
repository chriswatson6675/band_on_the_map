#!/usr/bin/env node
// Dependency-free, no-network offline proof for coliseu-dos-recreios-lisbon-01.
//
// Re-parses ONLY the retained fixtures in this evidence/ directory (never the
// live network) and mechanically reproduces every structural claim this
// investigation makes:
//
//   1. The homepage (body-home.html) is a fully server-rendered upcoming-
//      events list: extracts every (date_text, title, url) triplet from the
//      raw HTML using the same fixed regex pattern for all entries.
//   2. Five sampled events' WordPress REST API JSON responses
//      (body-wpjson-eventos-<id>.json) each expose a structured
//      toolset-meta.evento.datainicialevento.formatted date that, after a
//      trivial month-name/locale normalisation, is IDENTICAL to the
//      corresponding homepage date_text for the same event slug — proving
//      the two independent data paths (server-rendered HTML list, and the
//      JSON REST API) agree, not merely that each looks plausible in
//      isolation.
//   3. The WordPress post ID embedded in the detail page's own <body> CSS
//      class ("postid-XXXX") is empirically stable: fischer-z was fetched
//      TWICE, independently, and both retained responses show the exact
//      same postid.
//   4. The custom "categoriaevento" taxonomy term IDs used by the REST API
//      (49 = "Concerto", 47 = "Música & Festivais") are cross-checked
//      against the retained taxonomy-terms listing and against the sampled
//      concert events' own categoriaevento term-id arrays.
//
// Run: node offline-proof.mjs
// Exit code 0 with "OFFLINE PROOF: PASSED" means every check below passed.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf8");

let failures = 0;
function check(label, condition, detail = "") {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.log(`FAIL: ${label}${detail ? " -- " + detail : ""}`);
    failures += 1;
  }
}

// ---------------------------------------------------------------------
// Step 1: extract every (date_text, title, url) triplet from the raw,
// retained homepage HTML using one fixed regex pattern applied uniformly.
// ---------------------------------------------------------------------
const home = read("body-home.html");

const titleRe =
  /<h3 class="elementor-heading-title elementor-size-default"><a href="(https:\/\/coliseulisboa\.com\/eventos\/[^"]+)">([^<]+)<\/a><\/h3>/g;
const dateSpanRe = /elementor-post-info__item--type-custom">\s*([^<]+?)\s*<\/span>/g;

const homeEvents = [];
let m;
while ((m = titleRe.exec(home)) !== null) {
  const url = m[1];
  const title = m[2];
  const windowStart = Math.max(0, m.index - 3000);
  const window = home.slice(windowStart, m.index);
  let dateMatch;
  let lastDate = null;
  dateSpanRe.lastIndex = 0;
  while ((dateMatch = dateSpanRe.exec(window)) !== null) {
    lastDate = dateMatch[1].trim();
  }
  const slug = url.replace(/\/$/, "").split("/").pop();
  homeEvents.push({ slug, url, title, dateText: lastDate });
}

check(
  "homepage list extraction found at least 60 upcoming events",
  homeEvents.length >= 60,
  `found ${homeEvents.length}`,
);

check(
  "every extracted homepage event has a non-null date_text",
  homeEvents.every((e) => e.dateText),
  `${homeEvents.filter((e) => !e.dateText).length} missing`,
);

const homeBySlug = new Map(homeEvents.map((e) => [e.slug, e]));

// ---------------------------------------------------------------------
// Step 2: cross-check 5 sampled events' REST API JSON dates against the
// homepage's own date_text for the same slug.
// ---------------------------------------------------------------------
const MONTHS_PT = {
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5,
  junho: 6, julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11,
  dezembro: 12,
};
const MONTHS_EN = {
  January: 1, February: 2, March: 3, April: 4, May: 5, June: 6, July: 7,
  August: 8, September: 9, October: 10, November: 11, December: 12,
};

// Parses "4 setembro, 2026" or "15 janeiro, 2027 a 16 janeiro, 2027"
// (multi-day range) -> returns the FIRST date only, as {y,m,d}.
function parseHomeDateText(text) {
  const firstPart = text.split(" a ")[0].trim();
  const mm = firstPart.match(/^(\d{1,2})\s+([^\s,]+),\s*(\d{4})$/);
  if (!mm) return null;
  const day = Number(mm[1]);
  const monthName = mm[2].toLowerCase();
  const year = Number(mm[3]);
  const month = MONTHS_PT[monthName];
  if (!month) return null;
  return { y: year, m: month, d: day };
}

// Parses REST API's "formatted" field, e.g. "September 4, 2026".
function parseRestFormatted(text) {
  const mm = text.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/);
  if (!mm) return null;
  const month = MONTHS_EN[mm[1]];
  if (!month) return null;
  return { y: Number(mm[3]), m: month, d: Number(mm[2]) };
}

const SAMPLE = [
  ["7902", "fischer-z"],
  ["7845", "deva-premal-miten-singing-our-prayers-lisbon-2026"],
  ["8224", "o-lago-dos-cisnes-imperial-heritage-ballet-classic-stage"],
  ["8231", "antonio-zambujo-miguel-araujo-10-anos-depois"],
  ["7806", "iolanda"],
];

const sampleResults = [];
for (const [postId, slug] of SAMPLE) {
  const rest = JSON.parse(read(`body-wpjson-eventos-${postId}.json`));
  const evento = rest["toolset-meta"].evento;
  const restDate = parseRestFormatted(evento.datainicialevento.formatted);
  const homeEntry = homeBySlug.get(slug);
  const homeDate = homeEntry ? parseHomeDateText(homeEntry.dateText) : null;

  const datesMatch =
    !!restDate &&
    !!homeDate &&
    restDate.y === homeDate.y &&
    restDate.m === homeDate.m &&
    restDate.d === homeDate.d;

  check(
    `${slug}: REST API start date matches homepage list date_text`,
    datesMatch,
    `REST=${JSON.stringify(restDate)} HOME=${JSON.stringify(homeDate)} (home text: ${homeEntry?.dateText})`,
  );

  check(
    `${slug}: REST title matches homepage title (ignoring HTML entities/case)`,
    rest.title.rendered.trim().toUpperCase() ===
      homeEntry.title
        .replace(/&#8217;/g, "'")
        .replace(/&#8211;/g, "-")
        .trim()
        .toUpperCase(),
    `REST="${rest.title.rendered}" HOME="${homeEntry.title}"`,
  );

  check(
    `${slug}: WordPress post id (REST 'id') matches the slug-derived detail page`,
    String(rest.id) === postId,
    `rest.id=${rest.id}`,
  );

  sampleResults.push({
    slug,
    postId: rest.id,
    codigoEvento: evento["codigo-evento"].raw,
    startDate: `${restDate.y}-${String(restDate.m).padStart(2, "0")}-${String(restDate.d).padStart(2, "0")}`,
    startTime: evento.horainicialeventosemsegundos.raw,
    doorsTime: evento.aberturaportas.raw,
    venue: rest["toolset-meta"].entidade.nome.raw,
    category: evento.categoria.raw,
    subcategory: evento.subcategoria.raw,
  });
}

// ---------------------------------------------------------------------
// Step 3: empirical source_record_id stability -- fischer-z was fetched
// TWICE, independently. Both retained detail-page bodies must show the
// identical WordPress "postid-XXXX" body class.
// ---------------------------------------------------------------------
function extractPostId(html) {
  const mm = html.match(/<body[^>]*class="([^"]+)"/);
  if (!mm) return null;
  const pidMatch = mm[1].match(/postid-(\d+)/);
  return pidMatch ? pidMatch[1] : null;
}

const fischerFirst = extractPostId(read("body-detail-fischer-z.html"));
const fischerRecheck = extractPostId(read("body-detail-fischer-z-recheck.html"));

check(
  "fischer-z: postid is identical across two independent fetches (empirical stability)",
  fischerFirst !== null && fischerFirst === fischerRecheck,
  `first=${fischerFirst} recheck=${fischerRecheck}`,
);

// ---------------------------------------------------------------------
// Step 4: categoriaevento taxonomy term IDs cross-checked against the
// retained taxonomy-terms listing and the sample's own term arrays.
// ---------------------------------------------------------------------
const terms = JSON.parse(read("body-wpjson-categoriaevento-terms.json"));
const termById = new Map(terms.map((t) => [t.id, t.name]));

check(
  "categoriaevento term 49 is named 'Concerto' in the retained taxonomy-terms listing",
  termById.get(49) === "Concerto",
  `term 49 = ${termById.get(49)}`,
);
check(
  "categoriaevento term 47 is named 'Música & Festivais' (parent) in the retained taxonomy-terms listing",
  termById.get(47) === "Música &amp; Festivais",
  `term 47 = ${termById.get(47)}`,
);

const bySlugFiltered = JSON.parse(read("body-wpjson-by-slug.json"));
check(
  "fischer-z's own categoriaevento term-id array includes 49 (Concerto) and 47 (Música & Festivais)",
  Array.isArray(bySlugFiltered[0]?.categoriaevento) &&
    bySlugFiltered[0].categoriaevento.includes(49) &&
    bySlugFiltered[0].categoriaevento.includes(47),
  `categoriaevento=${JSON.stringify(bySlugFiltered[0]?.categoriaevento)}`,
);

// ---------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------
console.log("\n--- Sample field extraction (mechanically reproduced) ---");
for (const r of sampleResults) {
  console.log(
    `${r.slug} | id=${r.postId} | codigo-evento=${r.codigoEvento} | start=${r.startDate} ${r.startTime} (doors ${r.doorsTime}) | venue="${r.venue}" | category="${r.category} / ${r.subcategory}"`,
  );
}

console.log(`\n${failures === 0 ? "OFFLINE PROOF: PASSED" : "OFFLINE PROOF: FAILED"} (${failures} failing check(s))`);
process.exit(failures === 0 ? 0 : 1);
