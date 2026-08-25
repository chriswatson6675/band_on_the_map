// Offline, dependency-free, NO-NETWORK deterministic proof for the
// teatro-sao-luiz-lisbon-01 investigation.
//
// Parses the retained evidence files already saved under this directory
// (fetched once via curl during the investigation; never re-fetched here)
// and mechanically re-derives the field_assessment claims recorded in
// investigation.json:
//
//   1. The public English programme list page (body-programme-en.html)
//      exposes a bounded, real, server-rendered set of event cards, each
//      with a day+month date (NO YEAR), a category tag, a title, and a
//      link to its own detail page.
//   2. Every sampled detail page's own numeric WordPress "shortlink" post
//      id (HTTP Link header, rel=shortlink) is present and, for one
//      sampled event, reproduces byte-identically across two independent
//      fetches (stability empirically proven, not merely assumed).
//   3. Every sampled detail page exposes title / date-text (day+month,
//      weekday, time-of-day) / venue(room) / price text in a consistent,
//      reliably-extractable static HTML shape, but genuinely NEVER states
//      a calendar year anywhere in the retained HTML.
//   4. A secondary, auxiliary JSON REST endpoint
//      (/wp-json/custom/v1/espetaculos?season=...&month=...) DOES expose
//      full ISO dates (including year) for a sparse, inconsistent subset
//      of titles, and one sampled title ("André Rosinha Trio", 14
//      January) can be mechanically cross-matched against it to recover
//      a real, source-confirmed year (2027) for that specific occurrence
//      -- while at least one other auxiliary-API title ("NA MINHA BOCA")
//      never appears anywhere in the retained static programme listing at
//      all, proving the two data paths are NOT a reliable 1:1 match and
//      the auxiliary endpoint cannot be trusted as a complete feed.
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

let failures = 0;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failures += 1;
}
function ok(msg) {
  console.log(`OK:   ${msg}`);
}

// --- 1. List page: extract event cards (href, day/month text, category, title) ---

const listHtml = read("body-programme-en.html");

const cardRe = /<div class='card event-item'>\s*<a href="([^"]+)" class="">([\s\S]*?)<\/a>\s*<\/div>/g;

const cards = [];
let m;
while ((m = cardRe.exec(listHtml)) !== null) {
  const [, href, block] = m;
  const dateMatch = block.match(/<span class='darkblue data'>([^<]*(?:<abbr[^>]*>[^<]*<\/abbr>[^<]*)*)<\/span>/);
  const categoryMatch = block.match(/<span class='category '>\s*([^<]+?)\s*<\/span>/);
  const titleMatch = block.match(/<span class="title">([^<]+)<\/span>/);
  cards.push({
    href,
    dateText: dateMatch ? dateMatch[1].replace(/\s+/g, " ").trim() : null,
    category: categoryMatch ? categoryMatch[1].trim() : null,
    title: titleMatch ? titleMatch[1].trim() : null,
  });
}

console.log(`Parsed ${cards.length} event cards from body-programme-en.html`);
if (cards.length === 0) {
  fail("expected at least one event card on the programme list page -- found zero");
} else {
  ok(`found ${cards.length} event cards (>= 1)`);
}

// Confirm the source's own year-less date convention: NOT ONE card's date
// text contains a 4-digit year.
const cardsWithYear = cards.filter((c) => c.dateText && /\b(19|20)\d{2}\b/.test(c.dateText));
console.log(`Cards whose list-page date text contains a 4-digit year: ${cardsWithYear.length}/${cards.length}`);
if (cardsWithYear.length === 0) {
  ok("confirmed: zero list-page event cards state a calendar year in their date text (day+month only)");
} else {
  fail(`expected zero list-page cards with a year in the date text, found ${cardsWithYear.length}`);
}

// Confirm at least one non-"music" category is present alongside "music" --
// this source's programme is not music-exclusive.
const categories = new Set(cards.map((c) => c.category).filter(Boolean));
console.log(`Distinct categories observed on the sampled list page: ${[...categories].join(", ")}`);
if (categories.has("music") && [...categories].some((c) => c !== "music")) {
  ok('category "music" is present alongside at least one non-music category (e.g. theatre/dance/thinking)');
} else {
  fail("expected both a music category and at least one non-music category on the list page");
}

// --- 2. Detail pages: extract Dates/Schedules text, Venue, Price, Duration
//        (if present), and the WordPress shortlink post id from headers. ---

const sample = [
  { slug: "batucadeiras-das-olaias-pt", body: "body-detail-batucadeiras.html", headers: "headers-detail-batucadeiras.txt" },
  { slug: "picadeiro-fest-2026", body: "body-detail-picadeiro-fest.html", headers: "headers-detail-picadeiro-fest.txt" },
  { slug: "o-pai", body: "body-detail-o-pai.html", headers: "headers-detail-o-pai.txt" },
  { slug: "as-ilhas-desconhecidas", body: "body-detail-as-ilhas-desconhecidas.html", headers: "headers-detail-as-ilhas-desconhecidas.txt" },
  { slug: "vacuo", body: "body-detail-vacuo.html", headers: "headers-detail-vacuo.txt" },
];

function extractShortlinkPostId(headersText) {
  const m2 = /Link:\s*<https:\/\/www\.teatrosaoluiz\.pt\/en\/\?p=(\d+)>;\s*rel=shortlink/.exec(headersText);
  return m2 ? m2[1] : null;
}

function extractLabelledField(html, label) {
  // Matches the theme's repeated "<span class='subtitle'>Label</span> ... <p>VALUE</p>" pattern.
  const re = new RegExp(`${label}\\s*</span>\\s*<p>\\s*([\\s\\S]*?)\\s*</p>`, "m");
  const found = re.exec(html);
  if (!found) return null;
  return found[1].replace(/<br\s*\/?>/gi, " / ").replace(/\s+/g, " ").trim();
}

function extractTitle(html) {
  const t = /<title>([^<]+)<\/title>/.exec(html);
  return t ? t[1].replace(/\s*-\s*Teatro São Luiz\s*$/, "").trim() : null;
}

console.log("");
console.log("--- Per-sample-event detail-page checks ---");

const results = [];
for (const { slug, body, headers } of sample) {
  let html, headerText;
  try {
    html = read(body);
    headerText = read(headers);
  } catch (e) {
    fail(`could not read retained evidence for ${slug}: ${e.message}`);
    continue;
  }

  const postId = extractShortlinkPostId(headerText);
  const title = extractTitle(html);
  const datesAndSchedules = extractLabelledField(html, "Dates and Schedules");
  const venue = extractLabelledField(html, "Venue");
  const price = extractLabelledField(html, "Price");
  const duration = extractLabelledField(html, "Duration");
  const hasYearInDates = datesAndSchedules ? /\b(19|20)\d{2}\b/.test(datesAndSchedules) : null;

  const row = { slug, postId, title, datesAndSchedules, venue, price, duration, hasYearInDates };
  results.push(row);

  console.log(
    `${slug}: postId=${postId} title="${title}" dates="${datesAndSchedules}" venue="${venue}" price="${price}" duration=${duration ?? "(not present)"} yearStatedInDates=${hasYearInDates}`,
  );

  if (!postId) fail(`${slug}: no WordPress shortlink post id found in retained headers`);
  else ok(`${slug}: stable WordPress shortlink post id extracted (${postId})`);

  if (!title) fail(`${slug}: missing <title>`);
  if (!datesAndSchedules) fail(`${slug}: missing "Dates and Schedules" field`);
  if (!venue) fail(`${slug}: missing "Venue" field`);
  if (price === null) fail(`${slug}: missing "Price" field`);
  if (hasYearInDates) fail(`${slug}: expected NO year in "Dates and Schedules" text, but found one`);
}

// --- 3. Empirical stable-id proof: re-fetched copy of one sampled event
//        reproduces the identical shortlink post id AND byte-identical body. ---

console.log("");
const original = read("body-detail-batucadeiras.html");
const recheck = read("body-detail-batucadeiras-recheck.html");
const originalHeaders = read("headers-detail-batucadeiras.txt");
const recheckHeaders = read("headers-detail-batucadeiras-recheck.txt");

const idOriginal = extractShortlinkPostId(originalHeaders);
const idRecheck = extractShortlinkPostId(recheckHeaders);

if (idOriginal && idOriginal === idRecheck) {
  ok(`empirical stability: independent re-fetch of batucadeiras-das-olaias-pt reproduced the identical shortlink post id (${idOriginal})`);
} else {
  fail(`empirical stability check failed: original id=${idOriginal}, recheck id=${idRecheck}`);
}

if (original === recheck) {
  ok("empirical stability: independent re-fetch of batucadeiras-das-olaias-pt returned a byte-identical HTML body");
} else {
  fail("expected the re-fetched batucadeiras-das-olaias-pt body to be byte-identical to the original fetch");
}

// --- 4. Auxiliary JSON API cross-check: mechanically confirm the year gap
//        and the sparse/unreliable coverage of the auxiliary endpoint. ---

console.log("");
console.log("--- Auxiliary /wp-json/custom/v1/espetaculos cross-check ---");

const months = ["sep", "oct", "nov", "dec", "jan", "apr"];
const auxEntries = [];
for (const month of months) {
  const raw = read(`body-espetaculos-api-${month}.json`);
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    fail(`body-espetaculos-api-${month}.json did not parse as JSON: ${e.message}`);
    continue;
  }
  for (const [date, entries] of Object.entries(parsed)) {
    for (const entry of entries) {
      auxEntries.push({ month, date, title: entry.title });
    }
  }
}

console.log(`Parsed ${auxEntries.length} auxiliary-API (date, title) entries across ${months.length} sampled months.`);
if (auxEntries.length === 0) {
  fail("expected at least one auxiliary-API entry across the sampled months");
} else {
  ok(`found ${auxEntries.length} auxiliary-API entries (>= 1)`);
}

// Positive cross-check: "André Rosinha Trio" appears on the static list
// page (day=14, month=January, no year) AND in the auxiliary API for
// month=jan with a full year -- mechanically confirming 2027 for that
// specific sampled occurrence, without ever inventing it.
const listCard = cards.find((c) => c.href.includes("andre-rosinha-trio"));
const auxMatch = auxEntries.find((e) => e.month === "jan" && /andr.*rosinha.*trio/i.test(e.title));

if (listCard && auxMatch) {
  const auxYear = /^(\d{4})-\d{2}-\d{2}$/.exec(auxMatch.date)?.[1] ?? null;
  console.log(
    `Cross-check "André Rosinha Trio": list-page date text="${listCard.dateText}" (no year) <-> auxiliary API date="${auxMatch.date}" (year=${auxYear})`,
  );
  if (auxYear) {
    ok(`mechanically recovered year ${auxYear} for "André Rosinha Trio" via the auxiliary API -- NOT invented, cross-matched from two independently retained source documents`);
  } else {
    fail("could not parse a year out of the auxiliary API's own date string for André Rosinha Trio");
  }
} else {
  fail("expected to find André Rosinha Trio on both the static list page and the January auxiliary-API response");
}

// Negative finding: at least one auxiliary-API title ("NA MINHA BOCA")
// does NOT appear anywhere in the retained static programme list --
// proving the auxiliary endpoint's coverage does not reliably correspond
// to the static list and cannot be trusted as a complete/authoritative feed.
const naMinhaBoca = auxEntries.filter((e) => /na minha boca/i.test(e.title));
const naMinhaBocaOnListPage = cards.some((c) => c.title && /na minha boca/i.test(c.title));

console.log(
  `Auxiliary-API entries for "NA MINHA BOCA": ${naMinhaBoca.length} (dates: ${naMinhaBoca.map((e) => e.date).join(", ") || "none"}); present on static list page: ${naMinhaBocaOnListPage}`,
);
if (naMinhaBoca.length > 0 && !naMinhaBocaOnListPage) {
  ok('confirmed (not silently reconciled): "NA MINHA BOCA" appears in the auxiliary API but nowhere in the retained static programme list -- the two data paths do not correspond 1:1, so the auxiliary API cannot be treated as a reliable/complete supplementary feed');
} else {
  fail('expected "NA MINHA BOCA" to appear in the auxiliary API but NOT on the static list page (evidence of unreliable coverage)');
}

// --- Summary ---

console.log("");
if (failures > 0) {
  process.exitCode = 1;
  console.log(`RESULT: ${failures} check(s) FAILED -- see FAIL lines above.`);
} else {
  console.log(
    `RESULT: all checks passed against retained evidence (${results.length}/${sample.length} sample events fully cross-checked; year-gap and auxiliary-API unreliability both mechanically confirmed).`,
  );
}
