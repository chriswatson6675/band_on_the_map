// Offline, dependency-free, NO-NETWORK deterministic proof for the
// casa-das-artes-porto-01 investigation.
//
// Parses the retained evidence files already saved under this directory
// (fetched once via curl during the investigation; never re-fetched here)
// and mechanically re-derives the central finding recorded in
// investigation.json: that casadasartes.gov.pt is a genuine, official,
// fully server-rendered WordPress site with NO dedicated agenda/
// programação/eventos page anywhere in its navigation or its 11 static
// pages, NO calendar/events plugin registered in its own public REST API
// route list, and a sitewide total of exactly 3 blog posts ever published
// (most recent 2024-10-29) — of which only one is event-like, and that one
// event's date is stated by the source only as day+month prose with no
// year, and is already superseded relative to this investigation's date.
//
// Run with: node evidence/offline-proof.mjs
// Makes zero network requests — reads only local files in this directory.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const INVESTIGATION_DATE = "2026-08-25"; // investigated_at date, for staleness math only

function read(name) {
  return readFileSync(join(HERE, name), "utf-8");
}

function header(name, key) {
  const text = read(name);
  const re = new RegExp(`^${key}:\\s*(.+)$`, "im");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

let failed = false;
function fail(msg) {
  console.error(`FAIL: ${msg}`);
  failed = true;
}
function ok(msg) {
  console.log(`OK:   ${msg}`);
}

// --- 1. Homepage: confirm plain http:// serves content directly (no redirect needed) ---

const rootHeadersText = read("headers-00-http-plain-noredirect.txt");
const rootStatusLine = rootHeadersText.split(/\r?\n/)[0];
console.log(`Homepage fetch (plain http://casadasartes.gov.pt/, no -L): status line = "${rootStatusLine}"`);
if (/^HTTP\/1\.1 200 OK/.test(rootStatusLine)) {
  ok("plain http:// (no redirect follow) returned 200 OK directly — the official_url is served as-is, not merely a redirect stub");
} else {
  fail(`expected a 200 OK status line, got "${rootStatusLine}"`);
}
const rootHtml = read("body-00-http-plain-noredirect.html");
if (/<title>Casa das Artes/i.test(rootHtml)) {
  ok('homepage <title> confirms "Casa das Artes"');
} else {
  fail("homepage <title> did not confirm the expected site identity");
}

// --- 2. Homepage nav: confirm NO agenda/programação/eventos/calendário link exists ---

const navMatch = rootHtml.match(/<nav id="my-menu"[\s\S]*?<\/nav>/);
const navHtml = navMatch ? navMatch[0] : "";
const eventNavHit = /agenda|programa[cç][aã]o|eventos?|calend[aá]rio/i.test(navHtml);
console.log(`Primary nav menu HTML length: ${navHtml.length} chars`);
if (!eventNavHit) {
  ok("confirmed: primary nav menu contains no agenda/programação/eventos/calendário link");
} else {
  fail("primary nav menu unexpectedly contains an agenda/programação/eventos/calendário-like link");
}

const navItems = [...navHtml.matchAll(/class="nav-link"[^>]*>([^<]+)<\/a>/g)].map((m) => m[1].trim());
console.log(`Top-level nav items found: ${navItems.join(" | ")}`);

// --- 3. Homepage blog area: confirm exactly 3 sticky posts, extract their posted-dates ---

const articleRe = /<div class="(post-\d+) post type-post[\s\S]*?<\/article>/g;
function parseHomepagePosts(html) {
  const out = [];
  let m;
  const re = /<article class="blog-article[^"]*">([\s\S]*?)<\/article>/g;
  while ((m = re.exec(html)) !== null) {
    const block = m[1];
    const idMatch = block.match(/post-(\d+) post type-post/);
    const titleMatch = block.match(/<h2 class="entry-title"><a href="([^"]*)"[^>]*>([^<]*)<\/a><\/h2>/);
    const dateMatch = block.match(/posted-date">\s*([^<]+?)\s*<\/span>/);
    out.push({
      postId: idMatch ? idMatch[1] : null,
      url: titleMatch ? titleMatch[1] : null,
      title: titleMatch ? titleMatch[2].trim() : null,
      postedDateText: dateMatch ? dateMatch[1].trim() : null,
    });
  }
  return out;
}

const homepagePosts = parseHomepagePosts(rootHtml);
console.log("");
console.log(`Homepage sticky-post cards parsed: ${homepagePosts.length}`);
for (const p of homepagePosts) {
  console.log(`  - post-${p.postId} "${p.title}" posted="${p.postedDateText}" url=${p.url}`);
}
if (homepagePosts.length === 3) {
  ok("homepage shows exactly 3 post cards (matches the investigation's claim, not merely an eyeballed count)");
} else {
  fail(`expected exactly 3 homepage post cards, found ${homepagePosts.length}`);
}

// --- 4. Category (Música) page: confirm it shows a subset of the SAME posts, no new ones ---

const categoryHtml = read("body-02-category-musica.html");
const categoryPosts = parseHomepagePosts(categoryHtml);
console.log("");
console.log(`/category/musica/ post cards parsed: ${categoryPosts.length}`);
for (const p of categoryPosts) console.log(`  - post-${p.postId} "${p.title}"`);

const homepageIds = new Set(homepagePosts.map((p) => p.postId));
const categoryIsSubset = categoryPosts.every((p) => homepageIds.has(p.postId));
if (categoryIsSubset && categoryPosts.length > 0) {
  ok("every post shown under /category/musica/ is one of the same 3 sitewide posts already seen on the homepage (no additional/hidden music post)");
} else if (categoryPosts.length === 0) {
  fail("expected at least one post under /category/musica/ (Salão Piolho is tagged Música)");
} else {
  fail("/category/musica/ contains a post NOT present on the homepage's 3-post set — investigation's totals claim would be wrong");
}

// --- 5. wp-json posts endpoint: X-WP-Total header vs actual parsed array length ---

const postsTotalHeader = header("headers-03-wpjson-posts.txt", "X-WP-Total");
const postsJson = JSON.parse(read("body-03-wpjson-posts.json"));
console.log("");
console.log(`wp-json posts: X-WP-Total header = ${postsTotalHeader}, parsed JSON array length = ${postsJson.length}`);
if (String(postsJson.length) === String(postsTotalHeader) && postsJson.length === 3) {
  ok("X-WP-Total header matches the parsed JSON array length, and both equal 3 — the ENTIRE site has exactly 3 posts ever published, mechanically confirmed via the site's own REST API, not merely by eyeballing the rendered homepage");
} else {
  fail(`X-WP-Total (${postsTotalHeader}) / parsed length (${postsJson.length}) mismatch or not 3`);
}

const sortedByDate = [...postsJson].sort((a, b) => (a.date < b.date ? 1 : -1));
const mostRecent = sortedByDate[0];
console.log(`Most recent post: id=${mostRecent.id} slug=${mostRecent.slug} date=${mostRecent.date}`);

const mostRecentDate = new Date(mostRecent.date + "Z");
const investigationDate = new Date(INVESTIGATION_DATE + "T00:00:00Z");
const staleDays = Math.round((investigationDate - mostRecentDate) / (1000 * 60 * 60 * 24));
console.log(`Staleness: ${staleDays} days between most recent post (${mostRecent.date}) and investigation date (${INVESTIGATION_DATE})`);
if (staleDays > 365) {
  ok(`confirmed: the most recent post is more than a year (${staleDays} days) stale relative to the investigation date — the site has not been actively updated with new posts recently`);
} else {
  fail(`most recent post is only ${staleDays} days old — staleness claim not reproduced`);
}

// Cross-check homepage posted-date text against the REST API's own date field
// for the Salão Piolho post specifically (post 3231).
const salaoRest = postsJson.find((p) => p.id === 3231);
const salaoHomepage = homepagePosts.find((p) => p.postId === "3231");
console.log("");
console.log(`Salão Piolho (post 3231): REST date="${salaoRest?.date}", homepage posted-date text="${salaoHomepage?.postedDateText}"`);
if (salaoRest && salaoHomepage && salaoRest.date.startsWith("2024-10-29") && /29 de Outubro, 2024/.test(salaoHomepage.postedDateText)) {
  ok("REST API date (2024-10-29) and homepage-rendered Portuguese posted-date text (29 de Outubro, 2024) agree for the same post");
} else {
  fail("REST API date and homepage posted-date text disagree for post 3231");
}

// --- 6. wp-json pages endpoint: X-WP-Total vs parsed length, and no agenda-like page ---

const pagesTotalHeader = header("headers-04-wpjson-pages.txt", "X-WP-Total");
const pagesJson = JSON.parse(read("body-04-wpjson-pages.json"));
console.log("");
console.log(`wp-json pages: X-WP-Total header = ${pagesTotalHeader}, parsed JSON array length = ${pagesJson.length}`);
if (String(pagesJson.length) === String(pagesTotalHeader) && pagesJson.length === 11) {
  ok("X-WP-Total header matches parsed JSON array length, and both equal 11 — the ENTIRE site has exactly 11 static pages");
} else {
  fail(`X-WP-Total (${pagesTotalHeader}) / parsed length (${pagesJson.length}) mismatch or not 11`);
}

const eventPageHit = pagesJson.find((p) => /agenda|programa[cç][aã]o|eventos?|calend[aá]rio/i.test(p.slug + " " + p.title.rendered));
console.log(`Pages: ${pagesJson.map((p) => p.slug).join(", ")}`);
if (!eventPageHit) {
  ok("confirmed: none of the 11 pages' slugs/titles is agenda/programação/eventos/calendário-like");
} else {
  fail(`unexpectedly found an event-like page: ${eventPageHit.slug}`);
}

// --- 7. wp-json API root: confirm no calendar/events-plugin REST namespace is registered ---

const rootJson = JSON.parse(read("body-09-wpjson-root.json"));
const routes = Object.keys(rootJson.routes || {});
console.log("");
console.log(`wp-json API root: ${routes.length} registered routes`);
const KNOWN_CALENDAR_PLUGIN_NAMESPACES = ["tribe/events", "eventon", "the-events-calendar", "wp-event-manager"];
const calendarRouteHit = routes.find((r) => KNOWN_CALENDAR_PLUGIN_NAMESPACES.some((ns) => r.toLowerCase().includes(ns)));
if (!calendarRouteHit) {
  ok("confirmed: no known calendar/events-plugin REST namespace (tribe/events, eventon, the-events-calendar, wp-event-manager) is registered among all 281 routes");
} else {
  fail(`unexpectedly found a calendar-plugin route: ${calendarRouteHit}`);
}

// --- 8. Salão Piolho single post page: confirm the date is stated as day+month prose,
//        with NO 4-digit year anywhere in that specific line — AMBIGUOUS, never PROVEN. ---

const salaoHtml = read("body-07-salao-piolho.html");
const dateLineMatch = salaoHtml.match(/<p><strong><u>([^<]+)<\/u><\/strong><\/p>/);
const dateLine = dateLineMatch ? dateLineMatch[1] : null;
console.log("");
console.log(`Salão Piolho single-post page date/time line: "${dateLine}"`);
if (dateLine && /23 de NOVEMBRO/i.test(dateLine)) {
  const hasYear = /\b(19|20)\d{2}\b/.test(dateLine);
  if (!hasYear) {
    ok('confirmed: the source states the event date as "23 de NOVEMBRO | Sábado | 18h" with NO year digit anywhere in that line — a claimed exact date/year would be an invented value, not one the source itself states (AMBIGUOUS is the honest field_assessment.start_date state, not PROVEN)');
  } else {
    fail("expected no year digit in the source's own date line, but one was found");
  }
} else {
  fail("could not locate the expected Salão Piolho date/time line in the retained single-post page");
}

// Cross-check: the single-post page's own post-3231 marker matches the REST API id.
const singlePagePostIdMatch = salaoHtml.match(/post-(\d+) post type-post status-publish format-standard has-post-thumbnail hentry/);
console.log(`Single-post page post id marker: post-${singlePagePostIdMatch ? singlePagePostIdMatch[1] : "NOT FOUND"}`);
if (singlePagePostIdMatch && singlePagePostIdMatch[1] === "3231" && salaoRest && salaoRest.id === 3231) {
  ok("single-post page's own post-3231 DOM marker matches the REST API's id 3231 for the same slug (salao-piolho-2)");
} else {
  fail("single-post page post-id marker did not cross-check against the REST API id");
}

// --- 9. Confirm no JSON-LD Event/MusicEvent and no .ics link anywhere in retained HTML ---

const htmlFiles = [
  "body-00-http-plain-noredirect.html",
  "body-02-category-musica.html",
  "body-05-horarios.html",
  "body-06-noticias.html",
  "body-07-salao-piolho.html",
  "body-08-contactos.html",
];
let anyJsonLdEvent = false;
let anyIcsLink = false;
for (const f of htmlFiles) {
  const html = read(f);
  const ldBlocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  for (const [, raw] of ldBlocks) {
    try {
      const data = JSON.parse(raw);
      const type = data["@type"];
      if (type === "Event" || type === "MusicEvent" || (Array.isArray(type) && type.some((t) => /Event/i.test(t)))) {
        anyJsonLdEvent = true;
      }
    } catch {
      // ignore unparsable blocks — not the check being performed
    }
  }
  if (/href="[^"]*\.ics[^"]*"/i.test(html)) anyIcsLink = true;
}
console.log("");
console.log(`Checked ${htmlFiles.length} retained HTML files for JSON-LD Event/MusicEvent blocks and .ics links.`);
if (!anyJsonLdEvent) {
  ok("confirmed: no JSON-LD Event/MusicEvent structured data anywhere in the retained sample");
} else {
  fail("unexpectedly found a JSON-LD Event/MusicEvent block in the retained sample");
}
if (!anyIcsLink) {
  ok("confirmed: no .ics calendar export link anywhere in the retained sample");
} else {
  fail("unexpectedly found an .ics link in the retained sample");
}

// --- 10. Identity: confirm the real-world Porto street address is present on /contactos/ ---

const contactosHtml = read("body-08-contactos.html");
if (/Rua Ruben A,?\s*n[ºo]?\s*210/i.test(contactosHtml)) {
  ok('confirmed: /contactos/ page states the address "Rua Ruben A, nº 210" (Porto), matching the real-world Casa das Artes venue');
} else {
  fail("expected street address not found on /contactos/");
}

console.log("");
if (failed) {
  console.log("RESULT: one or more checks FAILED — see FAIL lines above.");
  process.exitCode = 1;
} else {
  console.log(
    "RESULT: all checks passed against retained evidence — casadasartes.gov.pt is a genuine official site with NO current/future event data exposed through any public path sampled (no agenda/programação page, no calendar-plugin REST namespace, sitewide total of 3 posts, most recent ~22 months stale, and its sole event-like post's date is unstructured day+month prose with no year).",
  );
}
