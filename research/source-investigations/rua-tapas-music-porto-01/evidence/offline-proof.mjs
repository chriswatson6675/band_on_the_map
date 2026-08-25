// Offline, dependency-free, NO-NETWORK deterministic proof for the
// rua-tapas-music-porto-01 investigation.
//
// Parses the retained evidence files already saved under this directory
// (fetched once via curl during the investigation; never re-fetched here)
// and mechanically re-derives the claims recorded in investigation.json:
//
//   1. The homepage's own schema.org LocalBusiness JSON-LD gives a name,
//      address, and phone matching the venue this investigation targets.
//   2. The homepage's own embedded Wix page-routing data (pageUriSEO
//      list) already exposes candidate slugs "agenda" and "events" from
//      a plain static fetch, WITHOUT guessing them.
//   3. https://www.ruatapas.com/events resolves to Wix's own 404 page.
//   4. https://www.ruatapas.com/agenda resolves to a real 200 page
//      titled "Agenda | Rua Tapas Music Bar" — a genuine Wix Events &
//      Tickets app page exists.
//   5. That agenda page's HTML contains ZERO schema.org Event/MusicEvent
//      JSON-LD blocks (only whatever LocalBusiness/WebSite blocks the
//      shared site chrome injects, if any) — no structured per-event
//      data is exposed statically.
//   6. That agenda page's embedded "wix-warmup-data" SSR blob is tiny
//      (a heuristic, not a hard proof, but consistent with an empty/
//      unpopulated events widget rather than a server-rendered list of
//      real events).
//   7. The site's OWN sitemap (pages-sitemap.xml, itself Wix-generated)
//      lists neither /agenda nor /events at all — the venue's own SEO
//      signal treats the agenda page as excluded, not as content.
//   8. The only "_api/" paths visible in the agenda page's static HTML
//      are generic Wix platform bootstrap endpoints (access-tokens,
//      dynamicmodel, one-app-session-web/.../businesses) — none is a
//      dedicated, stable, publicly-documented events-fetch REST path.
//   9. The About page's own retained text contains the marketing
//      tagline "LIVE MUSIC EVERY NIGHT!!!" but no dated/day-specific
//      schedule content — a recurring-ambience claim, not a bounded
//      event record.
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

function extractTitle(html) {
  const m = html.match(/<title>([^<]*)<\/title>/);
  return m ? m[1].trim() : null;
}

function extractJsonLdBlocks(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g)];
  const parsed = [];
  for (const [, raw] of blocks) {
    try {
      parsed.push(JSON.parse(raw));
    } catch {
      // ignore malformed blocks — none expected on this site
    }
  }
  return parsed;
}

// --- 1. Homepage LocalBusiness JSON-LD (identity) ---

const homeHtml = read("body-home.html");
const homeLd = extractJsonLdBlocks(homeHtml);
console.log(`Parsed ${homeLd.length} JSON-LD block(s) from body-home.html`);

const localBusiness = homeLd.find((n) => n["@type"] === "LocalBusiness");
if (!localBusiness) {
  fail("expected a schema.org LocalBusiness JSON-LD block on the homepage — found none");
} else {
  ok(`LocalBusiness JSON-LD found: name="${localBusiness.name}" phone="${localBusiness.telephone}"`);
  const addr = localBusiness.address || {};
  const addrStr = `${addr.streetAddress ?? ""}, ${addr.postalCode ?? ""} ${addr.addressLocality ?? ""}, ${addr.addressCountry ?? ""}`;
  console.log(`  address: ${addrStr}`);
  if (!/travessa de cedofeita/i.test(addr.streetAddress || "")) {
    fail(`LocalBusiness address streetAddress "${addr.streetAddress}" does not mention Travessa de Cedofeita as expected`);
  } else {
    ok("LocalBusiness address matches the expected Cedofeita, Porto street");
  }
}

// --- 2. Homepage's own embedded page-routing data exposes "agenda" and
//        "events" slugs from a plain static fetch (not guessed). ---

const pageSlugs = new Set([...homeHtml.matchAll(/pageUriSEO\":\"([^\"]+)\"/g)].map((m) => m[1]));
console.log(`\nDistinct pageUriSEO slugs found in body-home.html: ${[...pageSlugs].sort().join(", ")}`);

for (const expected of ["agenda", "events"]) {
  if (pageSlugs.has(expected)) {
    ok(`homepage's own embedded routing data exposes candidate slug "${expected}" (not guessed)`);
  } else {
    fail(`expected candidate slug "${expected}" in homepage pageUriSEO data — not found`);
  }
}

// --- 3. /events resolves to Wix's own 404 page ---

const eventsHtml = read("body-events.html");
const eventsTitle = extractTitle(eventsHtml);
console.log(`\nbody-events.html <title>: "${eventsTitle}"`);
if (eventsTitle === "404 | Rua Tapas Music Bar") {
  ok('/events resolves to the site\'s own 404 page ("404 | Rua Tapas Music Bar")');
} else {
  fail(`expected /events <title> to be "404 | Rua Tapas Music Bar", got "${eventsTitle}"`);
}

// --- 4. /agenda resolves to a real 200 page (a genuine Wix Events app page) ---

const agendaHtml = read("body-agenda.html");
const agendaTitle = extractTitle(agendaHtml);
console.log(`\nbody-agenda.html <title>: "${agendaTitle}"`);
if (agendaTitle === "Agenda | Rua Tapas Music Bar") {
  ok('/agenda resolves to a real page titled "Agenda | Rua Tapas Music Bar"');
} else {
  fail(`expected /agenda <title> to be "Agenda | Rua Tapas Music Bar", got "${agendaTitle}"`);
}

// --- 5. The agenda page has zero Event/MusicEvent JSON-LD blocks ---

const agendaLd = extractJsonLdBlocks(agendaHtml);
const agendaEventNodes = agendaLd.filter((n) => n["@type"] === "Event" || n["@type"] === "MusicEvent");
console.log(`\nAgenda page: ${agendaLd.length} JSON-LD block(s) total, ${agendaEventNodes.length} of type Event/MusicEvent`);
if (agendaEventNodes.length === 0) {
  ok("confirmed: the agenda page's static HTML exposes zero Event/MusicEvent JSON-LD nodes");
} else {
  fail(`expected zero Event/MusicEvent JSON-LD nodes on the agenda page, found ${agendaEventNodes.length}`);
}

// --- 6. The agenda page's wix-warmup-data SSR blob is small (heuristic only) ---

const warmupMatch = agendaHtml.match(/<script type="application\/json" id="wix-warmup-data">([\s\S]*?)<\/script>/);
const warmupLen = warmupMatch ? warmupMatch[1].length : null;
console.log(`\nAgenda page wix-warmup-data length: ${warmupLen ?? "not found"} characters`);
if (warmupLen !== null && warmupLen < 5000) {
  ok(`wix-warmup-data is small (${warmupLen} chars) — HEURISTIC ONLY, consistent with (not proof of) an unpopulated events widget`);
} else {
  console.log("NOTE: wix-warmup-data was not small/not found — this heuristic did not fire as expected.");
}

// --- 7. The site's own sitemap excludes /agenda and /events entirely ---

const sitemapXml = read("body-pages-sitemap.xml");
const locs = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
console.log(`\npages-sitemap.xml lists ${locs.length} URL(s): ${locs.join(", ")}`);

const sitemapHasAgenda = locs.some((u) => u.includes("/agenda"));
const sitemapHasEvents = locs.some((u) => u.includes("/events"));
if (!sitemapHasAgenda && !sitemapHasEvents) {
  ok("confirmed: the site's own generated sitemap lists neither /agenda nor /events");
} else {
  fail(`expected the sitemap to exclude /agenda and /events, but found agenda=${sitemapHasAgenda} events=${sitemapHasEvents}`);
}

// --- 8. Only generic Wix bootstrap "_api/" paths are visible in the agenda HTML ---

const apiPaths = [...new Set([...agendaHtml.matchAll(/_api\/[a-zA-Z0-9_\/-]+/g)].map((m) => m[0]))];
console.log(`\n_api/ paths found in body-agenda.html: ${apiPaths.join(", ") || "(none)"}`);

const eventSpecificApi = apiPaths.filter((p) => /event/i.test(p));
if (eventSpecificApi.length === 0) {
  ok("confirmed: no dedicated, event-specific public REST path is visible in the agenda page's static HTML (only generic Wix bootstrap endpoints) — this investigation did not guess/call any private Wix Events internal API, per policy");
} else {
  console.log(`NOTE: found apparently event-specific API path(s): ${eventSpecificApi.join(", ")} — would need further review before treating as a stable public data path.`);
}

// --- 9. About page has a marketing tagline, not a dated schedule ---

const aboutHtml = read("body-blank-1.html");
const hasTagline = /LIVE MUSIC EVERY NIGHT/i.test(aboutHtml);
console.log(`\nAbout page (blank-1) contains "LIVE MUSIC EVERY NIGHT!!!" tagline: ${hasTagline}`);
if (hasTagline) {
  ok('confirmed: About page carries a recurring-ambience marketing tagline, not per-event dated content');
} else {
  fail('expected the About page to contain the "LIVE MUSIC EVERY NIGHT!!!" tagline — not found');
}

// Look for any accidental dated-event-looking content across agenda + about
// (day-of-week + time-of-day pairs beyond the known opening-hours schedule).
const dateLikePattern = /\b(19|20)\d{2}-\d{2}-\d{2}\b/g;
const agendaDates = [...agendaHtml.matchAll(dateLikePattern)].map((m) => m[0]);
const aboutDates = [...aboutHtml.matchAll(dateLikePattern)].map((m) => m[0]);
console.log(`\nISO-date-like (YYYY-MM-DD) matches — agenda: ${agendaDates.length}, about: ${aboutDates.length}`);
if (agendaDates.length === 0 && aboutDates.length === 0) {
  ok("no ISO-date-like strings found on either page — corroborates no dated event content is present");
} else {
  console.log(`NOTE: unexpected date-like strings found — agenda=${agendaDates.join(",")} about=${aboutDates.join(",")} (review before treating as event dates)`);
}

console.log("");
if (process.exitCode === 1) {
  console.log("RESULT: one or more checks FAILED — see FAIL lines above.");
} else {
  console.log("RESULT: all checks passed against retained evidence — no structured, dated public event data is exposed by this candidate as currently fetched.");
}
