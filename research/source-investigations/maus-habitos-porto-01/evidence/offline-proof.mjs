// Offline, dependency-free, NO-NETWORK proof script for the
// maus-habitos-porto-01 source investigation.
//
// Deterministically re-parses the RETAINED evidence files in this same
// directory and prints the fields this investigation's field_assessment
// claims. Run with: node evidence/offline-proof.mjs
//
// This is NOT a production collector. It never makes a network request,
// never touches anything outside this evidence/ directory, and exists
// only to prove the extraction claims made in investigation.json are
// reproducible against the retained fixtures.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(here, name), "utf-8");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

// --- 1. Parse the sample event card ("23.03.21 Jazz II") out of the ---
// --- retained plain-HTTP listing-page response.                     ---
const listingHtml = read("music-events.html");

const CONTENT_ID = "sj6qSd81GL7yDMgx";
const cardStart = listingHtml.indexOf(`data-content-id="${CONTENT_ID}"`);
if (cardStart === -1) fail(`sample event content-id ${CONTENT_ID} not found in music-events.html`);
// The card for this content-id spans a few KB; slice a generous bounded
// window right after its first occurrence (the "card porto" anchor tag).
const cardAnchorIdx = listingHtml.indexOf(`href="/en/events/230321-jazz-ii/"`);
if (cardAnchorIdx === -1) fail("sample event detail-page href not found in music-events.html");
const card = listingHtml.slice(cardAnchorIdx, cardAnchorIdx + 4800);

// event_url: the card's own href
const hrefMatch = card.match(/href="(\/en\/events\/[^"]+)"/);
const eventUrl = hrefMatch ? `https://www.maushabitos.com${hrefMatch[1]}` : null;

// source_record_id: the URL slug (last path segment)
const sourceRecordId = eventUrl ? eventUrl.replace(/\/$/, "").split("/").pop() : null;

// date + time: bounded from the "date and time PORTO" block up to the
// next sibling block ("Image container"), which contains exactly six
// bl-text nodes in document order: weekday, day, month, ",", year, time.
const dtStart = card.indexOf('data-bl-name="date and time PORTO"');
const dtEnd = card.indexOf('data-bl-name="Image container"');
const dtBlock = card.slice(dtStart, dtEnd);
const dtTexts = [...dtBlock.matchAll(/class="bl-text[^"]*">(?:<p>)?([^<]*)/g)].map((m) => m[1].trim());
const [wd, day, mon, , year, timeText] = dtTexts;
const MONTHS = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
const startDate = day && mon && year && MONTHS[mon] ? `${year}-${MONTHS[mon]}-${day.padStart(2, "0")}` : null;

// price
const priceMatch = card.match(/data-bl-name="venue price"[^>]*>([^<]*)</);
const price = priceMatch ? priceMatch[1].trim() : null;

// title (rubrica) + subtitle (details line)
const rubricaStart = card.indexOf('data-bl-name="rubrica PORTO"');
const rubricaBlock = card.slice(rubricaStart, rubricaStart + 400);
const rubricaTexts = [...rubricaBlock.matchAll(/<p>([^<]*)<br\s*\/?>(?:<\/p>)?/g)].map((m) => m[1].trim()).filter(Boolean);
const title = rubricaTexts.join(" ").trim();

const detailsStart = card.indexOf('data-bl-name="Details"');
const detailsMatch = card.slice(detailsStart, detailsStart + 400).match(/<p>([^<]*)<\/p>/);
const detailsLine = detailsMatch ? detailsMatch[1].trim() : null;

// venue label for this card's group ("Passos Manuel Porto")
const venueLabelMatch = listingHtml.match(/data-bl-name="Venue 1024"[\s\S]{0,700}?<p>([^<]*)<br/);
const venueLabel = venueLabelMatch ? venueLabelMatch[1].trim() : null;

// footer address for the Porto venue
const addrMatch = listingHtml.match(/Maus Hábitos<br><\/p><p[^>]*>Rua Passos Manuel 178, 4º<br><\/p><p[^>]*>(4000-382 Porto)/);
const footerAddress = addrMatch ? `Rua Passos Manuel 178, 4º, ${addrMatch[1]}` : null;

console.log("=== Sample event extracted from evidence/music-events.html ===");
console.log("event_url        :", eventUrl);
console.log("source_record_id :", sourceRecordId);
console.log("start_date       :", startDate, `(raw: "${wd} ${day} ${mon}, ${year}")`);
console.log("time (local, no tz):", timeText);
console.log("price             :", price);
console.log("title (rubrica)   :", title);
console.log("details line      :", detailsLine);
console.log("venue label       :", venueLabel);
console.log("footer address    :", footerAddress);

// --- 2. Confirm the detail page's own canonical URL matches the slug ---
// --- used in the listing card (stable-identifier list->detail check). ---
const detailHtml = read("event-detail-230321-jazz-ii.html");
const canonicalMatch = detailHtml.match(/<link rel="canonical" href="([^"]+)"/);
const canonicalUrl = canonicalMatch ? canonicalMatch[1] : null;

console.log("\n=== Stable-identifier cross-check (list -> detail canonical) ===");
console.log("listing card href :", eventUrl);
console.log("detail page canonical:", canonicalUrl);
console.log("MATCH:", canonicalUrl === eventUrl);
if (canonicalUrl !== eventUrl) fail("listing href and detail-page canonical URL do not match");

// --- 3. Confirm the CMS's OWN recorded timestamps for this record, ---
// --- proving (not merely inferring) that the sample event is stale. ---
function extractCmsTimestamps(jsSrc, id) {
  const text = jsSrc.replace(/^window\.BndLyrContent\s*=\s*/, "").replace(/;\s*$/, "");
  const data = JSON.parse(text);
  for (const block of Object.values(data)) {
    if (!block || !Array.isArray(block.items)) continue;
    for (const item of block.items) {
      if (item.id === id) return { created: item._created_at, updated: item._updated_at, slug: item._slug?.all };
    }
  }
  return null;
}

const listingBlobTs = extractCmsTimestamps(read("content-blob.js"), CONTENT_ID);
const detailBlobTs = extractCmsTimestamps(read("event-detail-content-blob.js"), CONTENT_ID);

console.log("\n=== CMS record timestamps (proves staleness, not just cache-busting) ===");
console.log("From content.cHksH8JLZ_0.js (listing screen, fetched via curl AND observed live in browser):");
console.log("  _created_at:", listingBlobTs?.created, " _updated_at:", listingBlobTs?.updated, " _slug:", listingBlobTs?.slug);
console.log("From content.exposicoes_" + CONTENT_ID + ".js (detail page's own content blob, newer build v=1779716994727 / 2026-05-25):");
console.log("  _created_at:", detailBlobTs?.created, " _updated_at:", detailBlobTs?.updated, " _slug:", detailBlobTs?.slug);
console.log("SAME record, unchanged _updated_at across a 3+ year-newer platform build:", listingBlobTs?.updated === detailBlobTs?.updated);

const now = new Date("2026-08-25T00:00:00Z");
const updated = new Date(listingBlobTs?.updated ?? 0);
const ageDays = Math.round((now - updated) / 86400000);
console.log(`\nSample event's CMS _updated_at is ${ageDays} days before this investigation's real-world date (2026-08-25) — i.e. ~${(ageDays / 365).toFixed(1)} years stale.`);

// --- 4. Corroborate with the homepage content blob (proves the platform ---
// --- itself is actively maintained/redeployed, so staleness is specific ---
// --- to the events-listing content, not the whole site being abandoned). ---
function maxCreatedAt(jsSrc) {
  const text = jsSrc.replace(/^window\.BndLyrContent\s*=\s*/, "").replace(/;\s*$/, "");
  const data = JSON.parse(text);
  let max = null;
  for (const block of Object.values(data)) {
    if (!block || !Array.isArray(block.items)) continue;
    for (const item of block.items) {
      if (item._created_at && (!max || item._created_at > max)) max = item._created_at;
    }
  }
  return max;
}
console.log("\n=== Homepage content blob freshness (evidence/homepage-content-blob.js) ===");
console.log("Most recent _created_at among homepage content items:", maxCreatedAt(read("homepage-content-blob.js")));
console.log("(compare against the events-listing record's _updated_at above — homepage content is far more recent)");

// --- 5. Sitemap recency check: does evidence/sitemap.xml contain any ---
// --- 2026 event page, or a lastmod newer than late 2025?             ---
const sitemapXml = read("sitemap.xml");
const urlBlocks = sitemapXml.split("<url>").slice(1);
const eventBlocks = urlBlocks.filter((b) => /\/events\//.test(b));
const parsedEvents = eventBlocks
  .map((b) => {
    const loc = (b.match(/<loc>([^<]+)<\/loc>/) || [])[1];
    const lastmod = (b.match(/<lastmod>([^<]+)<\/lastmod>/) || [])[1];
    return { loc, lastmod };
  })
  .filter((x) => x.loc && x.lastmod);
parsedEvents.sort((a, b) => new Date(b.lastmod) - new Date(a.lastmod));
const mostRecentEventPage = parsedEvents[0];
const any2026Event = parsedEvents.some((p) => p.lastmod.startsWith("2026"));

console.log("\n=== sitemap.xml recency check ===");
console.log("Total <url> blocks:", urlBlocks.length, " | blocks matching /events/:", eventBlocks.length);
console.log("Most recently modified /events/ page:", mostRecentEventPage?.lastmod, mostRecentEventPage?.loc);
console.log("Any /events/ page with a 2026 lastmod found:", any2026Event);

// --- Assertions matching field_assessment values in investigation.json ---
const expected = {
  eventUrl: "https://www.maushabitos.com/en/events/230321-jazz-ii/",
  sourceRecordId: "230321-jazz-ii",
  startDate: "2023-03-21",
  timeText: "21:00",
  price: "€10",
  title: "Jazz à Mesa",
  venueLabel: "Passos Manuel Porto",
};

let allOk = true;
for (const [key, val] of Object.entries(expected)) {
  const actual = { eventUrl, sourceRecordId, startDate, timeText, price, title, venueLabel }[key];
  const ok = actual === val;
  allOk &&= ok;
  console.log(`${ok ? "OK  " : "MISMATCH"} ${key}: expected="${val}" actual="${actual}"`);
}

if (!allOk) {
  fail("one or more extracted fields did not match the values recorded in investigation.json");
} else {
  console.log("\nAll extracted fields match investigation.json's field_assessment values. Offline proof PASSED.");
}
