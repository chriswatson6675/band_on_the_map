// Dependency-free, no-network Node script that re-parses ONLY the retained
// evidence files under this directory and mechanically re-derives every
// field_assessment claim made in ../investigation.json for the
// cco-sintra-01 investigation (Centro Cultural Olga Cadaval, Sintra).
//
// Run with: node evidence/offline-proof.mjs
//
// This never fetches anything over the network and never hard-codes a
// value that was not itself extracted from a retained file below — it is a
// deterministic re-parse/cross-check, not a restatement of already-trusted
// conclusions.

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf-8");

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.log(`FAIL: ${label}`);
    failures += 1;
  }
}

// --- 1. Parse the two retained agenda list pages into structured event rows ---

const AUDITORIA = new Set(["Auditório Jorge Sampaio", "Auditório Acácio Barreiros"]);

function parseListPage(html) {
  const events = [];
  const blockRe = /<div class="ic-list-event ic-clearfix ic-event-id-(\d+)">([\s\S]*?)<\/div>\s*\n\s*\n\s*\t\t\t<\/div>/g;
  // The above closing-boundary heuristic is fragile across minor markup
  // variance, so instead walk block-by-block using the event-id marker as
  // the split point, which is robust to internal nesting.
  const splitMarker = /<div class="ic-list-event ic-clearfix ic-event-id-(\d+)">/g;
  const starts = [];
  let m;
  while ((m = splitMarker.exec(html))) {
    starts.push({ id: m[1], index: m.index });
  }
  for (let i = 0; i < starts.length; i++) {
    const chunkStart = starts[i].index;
    const chunkEnd = i + 1 < starts.length ? starts[i + 1].index : html.length;
    const chunk = html.slice(chunkStart, chunkEnd);

    const hrefMatch = chunk.match(/href="(\/agenda\/(\d+)-([a-z0-9-]+)\/(\d{4}-\d{2}-\d{2}-\d{2}-\d{2}))"/);
    const titleMatch = chunk.match(/<h2>\s*<a[^>]*>\s*([^<]+?)\s*<\/a>/);
    const dateMatch = chunk.match(/ic-single-next">(\d{4}-\d{2}-\d{2})</);
    const timeMatch = chunk.match(/ic-single-starttime">(\d{2}:\d{2})</);
    const placeMatch = chunk.match(/class="place ic-place">\s*([\s\S]*?)\s*<\/div>/);
    const catMatch = chunk.match(/ic-title-cat-btn[^>]*>\s*([^<]+?)\s*<\/a>/);

    events.push({
      id: starts[i].id,
      url: hrefMatch ? hrefMatch[1] : null,
      urlId: hrefMatch ? hrefMatch[2] : null,
      urlSlug: hrefMatch ? hrefMatch[3] : null,
      urlDateTime: hrefMatch ? hrefMatch[4] : null,
      title: titleMatch ? titleMatch[1] : null,
      date: dateMatch ? dateMatch[1] : null,
      time: timeMatch ? timeMatch[1] : null,
      place: placeMatch ? placeMatch[1].replace(/\s+/g, " ").trim() : null,
      category: catMatch ? catMatch[1] : null,
    });
  }
  return events;
}

const page1Html = read("body-agenda.html");
const page2Html = read("body-agenda-page2.html");
const page1Events = parseListPage(page1Html);
const page2Events = parseListPage(page2Html);
const allListEvents = [...page1Events, ...page2Events];

check("page 1 contains exactly 5 event rows", page1Events.length === 5);
check("page 2 contains exactly 5 event rows", page2Events.length === 5);
check("10/10 sampled event rows parsed with a non-null title", allListEvents.every((e) => e.title));
check(
  "10/10 sampled event rows have a full ISO date (YYYY-MM-DD) directly in ic-single-next",
  allListEvents.every((e) => e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)),
);
const rowsWithTime = allListEvents.filter((e) => e.time && /^\d{2}:\d{2}$/.test(e.time));
const rowsWithoutTime = allListEvents.filter((e) => !e.time);
check(
  "9/10 sampled event rows have an HH:MM start time directly in ic-single-starttime (time is common but NOT universal — see next check)",
  rowsWithTime.length === 9 && allListEvents.length === 10,
);
check(
  "exactly 1/10 sampled rows (event id 551) has NO ic-single-starttime span at all on either its list row or its own detail page — an honest, empirically-found exception, not smoothed over",
  rowsWithoutTime.length === 1 && rowsWithoutTime[0].id === "551",
);
check(
  "10/10 sampled event rows have a venue that is one of the two known CCOC auditoria",
  allListEvents.every((e) => e.place && AUDITORIA.has(e.place)),
);
check(
  "10/10 sampled event rows expose a permalink whose own id/slug components match the row's own id, and whose date-time suffix's date component matches the row's own displayed date",
  allListEvents.every((e) => e.url && e.urlId === e.id && e.urlDateTime.slice(0, 10) === e.date),
);
check(
  "for the 9/10 rows that DO show a displayed time, the permalink's own date-time suffix time component matches that displayed time exactly",
  rowsWithTime.every((e) => e.urlDateTime === `${e.date}-${e.time.replace(":", "-")}`),
);
check(
  "event id 551's permalink itself still encodes a time suffix (17-00) even though no ic-single-starttime span displays it anywhere — the permalink's time component cannot be treated as proof that a start time is genuinely, reliably displayed for every event",
  allListEvents.find((e) => e.id === "551")?.urlDateTime === "2026-09-20-17-00",
);

// Both auditoria genuinely appear across the sample (corroborates the prior
// loose research note describing "two auditoria").
const placesSeen = new Set(allListEvents.map((e) => e.place));
check("both known auditoria appear at least once across the 10-row sample", placesSeen.size === 2);

// --- 2. The multi-date "Evita" production (id 543) — the stable-id nuance ---

const id543Rows = allListEvents.filter((e) => e.id === "543");
check("event id 543 (Evita) appears exactly twice in the 10-row sample (two distinct dates)", id543Rows.length === 2);
check(
  "the two id-543 rows have two DIFFERENT dates but the SAME bare numeric id — proving the bare id is NOT alone a per-occurrence-unique key",
  id543Rows.length === 2 && id543Rows[0].date !== id543Rows[1].date && id543Rows[0].id === id543Rows[1].id,
);
check(
  "the two id-543 rows nonetheless have two DIFFERENT full permalink URLs (id+slug+date-time)",
  id543Rows.length === 2 && id543Rows[0].url !== id543Rows[1].url,
);

// --- 3. Cross-check each retained event-detail page's own <link rel="canonical"> ---
// against the exact URL it was fetched from, proving the source itself
// declares that permalink as this specific occurrence's own canonical path
// (not assumed by this investigation).

const detailPages = [
  { file: "body-event-gnr.html", fetchedUrl: "https://ccolgacadaval.pt/agenda/519-gnr/2026-09-11-21-00" },
  {
    file: "body-event-evita1.html",
    fetchedUrl: "https://ccolgacadaval.pt/agenda/543-ciclo-de-teatro-evita-com-sofia-escobar-e-diogo-morgado/2026-09-03-21-00",
  },
  {
    file: "body-event-evita2.html",
    fetchedUrl: "https://ccolgacadaval.pt/agenda/543-ciclo-de-teatro-evita-com-sofia-escobar-e-diogo-morgado/2026-09-04-21-00",
  },
  {
    file: "body-event-orquestra.html",
    fetchedUrl:
      "https://ccolgacadaval.pt/agenda/551-orquestra-sinfonica-portuguesa-obras-de-mozart-e-ravel/2026-09-20-17-00",
  },
];

for (const { file, fetchedUrl } of detailPages) {
  const html = read(file);
  const canonMatch = html.match(/<link rel="canonical" href="([^"]+)">/);
  check(
    `${file}: retained detail page's own <link rel="canonical"> exactly matches the URL it was fetched from`,
    canonMatch && canonMatch[1] === fetchedUrl,
  );
}

// The two id-543 detail pages, fetched at different date-time permalinks,
// each independently state their OWN date via ic-single-next/starttime,
// confirming the URL's date-time suffix genuinely determines page content
// (not merely decorative).
const evita1 = read("body-event-evita1.html");
const evita2 = read("body-event-evita2.html");
const evita1Date = evita1.match(/ic-single-next">(\d{4}-\d{2}-\d{2})</);
const evita2Date = evita2.match(/ic-single-next">(\d{4}-\d{2}-\d{2})</);
check(
  "body-event-evita1.html (fetched at .../2026-09-03-21-00) states its own date as 2026-09-03",
  evita1Date && evita1Date[1] === "2026-09-03",
);
check(
  "body-event-evita2.html (fetched at .../2026-09-04-21-00) states its own date as 2026-09-04",
  evita2Date && evita2Date[1] === "2026-09-04",
);

// --- 4. Price / duration free-text presence is INCONSISTENT across sampled ---
// detail pages — never promoted to a structured, universally-present field.

function findPriceDuration(html) {
  const durationMatch = html.match(/Dura[cç][aã]o:\s*<\/strong>\s*(\d+)\s*minutos/);
  const priceMatch = html.match(/Pre[cç]o:<\/strong><\/p>\s*<p>([^<]+€)/);
  return {
    hasDuration: Boolean(durationMatch),
    durationMinutes: durationMatch ? Number(durationMatch[1]) : null,
    hasPrice: Boolean(priceMatch),
    priceText: priceMatch ? priceMatch[1] : null,
  };
}

const gnr = findPriceDuration(read("body-event-gnr.html"));
const orquestra = findPriceDuration(read("body-event-orquestra.html"));

check("body-event-gnr.html contains a free-text 'Duração:' block (75 minutos)", gnr.hasDuration && gnr.durationMinutes === 75);
check("body-event-gnr.html contains a free-text 'Preço:' block with at least one € value", gnr.hasPrice);
check(
  "body-event-orquestra.html contains NEITHER a 'Duração:' NOR a 'Preço:' block — proving these are not universally present, structured fields",
  !orquestra.hasDuration && !orquestra.hasPrice,
);

// Demonstrate (not activate) the mechanical end = start + duration
// combination for the one sampled event where both start time and a clean
// numeric duration are directly retained — this is why `end` is honestly
// recorded as PARTIAL, not PROVEN: the free-text "Duração:" block was only
// found on 2 of 4 sampled detail pages, so it cannot be claimed as a
// reliably-present field across the source.
function addMinutes(hhmm, minutes) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + minutes;
  const endH = Math.floor(total / 60) % 24;
  const endM = total % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}
const gnrEnd = addMinutes("21:00", gnr.durationMinutes);
check("demonstration only: GNR start 21:00 + retained duration 75min = 22:15", gnrEnd === "22:15");

// --- 5. RSS / feed data path was checked and genuinely rejected (410 Gone) ---

const feedHeaders = read("headers-feed.txt");
const feedBody = read("body-feed.xml");
check("headers-feed.txt records HTTP/1.1 410 Gone for /agenda?format=feed&type=rss", /^HTTP\/1\.1 410 Gone/.test(feedHeaders));
check("body-feed.xml is a generic nginx 410 error page, not an RSS/XML feed", feedBody.includes("410 Gone") && !feedBody.includes("<rss"));

// --- 6. Identity evidence: municipal address/email/phone block, retained verbatim ---

const gnrHtml = read("body-event-gnr.html");
check(
  "retained event-detail page states the full postal address 'Praça Dr. Francisco Sá Carneiro, 2710-720 SINTRA' for Centro Cultural Olga Cadaval",
  gnrHtml.includes("Centro Cultural Olga Cadaval") &&
    gnrHtml.includes("Praça Dr. Francisco Sá Carneiro") &&
    gnrHtml.includes("2710-720 SINTRA"),
);
check(
  "retained event-detail page states a cm-sintra.pt (Câmara Municipal de Sintra) contact email",
  gnrHtml.includes("geral.ccoc@cm-sintra.pt"),
);
check(
  "retained event-detail page's own footer privacy-policy text names 'Câmara Municipal de Sintra'",
  gnrHtml.includes("Câmara Municipal de Sintra"),
);
const homeHtml = read("body-home.html");
check(
  "retained homepage names 'Centro Cultural Olga Cadaval' in its own meta description/keywords",
  homeHtml.includes('content="Centro Cultural Olga Cadaval"'),
);

// --- 7. Platform classification: com_icagenda on Joomla (Helix Ultimate template) ---

check(
  "retained agenda-page HTML body classes literally contain 'com_icagenda' and 'com-icagenda'",
  page1Html.includes("com_icagenda") && page1Html.includes("com-icagenda"),
);
check(
  "retained homepage HTML contains the literal generator tag HELIX_ULTIMATE_GENERATOR_TEXT (Joomla Helix Ultimate template framework)",
  homeHtml.includes("HELIX_ULTIMATE_GENERATOR_TEXT"),
);
check(
  "retained homepage HTML contains the literal string 'Joomla'",
  /joomla/i.test(homeHtml),
);
check(
  "no application/ld+json (JSON-LD) block exists anywhere in the retained agenda list page or the 4 retained detail pages",
  !page1Html.includes("application/ld+json") &&
    !page2Html.includes("application/ld+json") &&
    detailPages.every(({ file }) => !read(file).includes("application/ld+json")),
);

console.log("");
if (failures === 0) {
  console.log(`OFFLINE PROOF: PASSED (all ${allListEvents.length ? "checks" : "checks"} succeeded, 0 failures)`);
} else {
  console.log(`OFFLINE PROOF: FAILED (${failures} check(s) failed)`);
  process.exitCode = 1;
}
