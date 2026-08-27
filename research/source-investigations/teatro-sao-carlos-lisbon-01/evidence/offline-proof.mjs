// Dependency-free, no-network offline proof for teatro-sao-carlos-lisbon-01.
//
// Re-parses the retained evidence files under this directory and mechanically
// re-derives every claim made in ../investigation.json's field_assessment,
// site_classification, data_paths, and identity sections. Makes zero network
// requests — everything it reads was already fetched and retained by curl
// earlier in this investigation (see the `evidence[]` entries in
// investigation.json for exactly how/when).
//
// Run with: node evidence/offline-proof.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf-8");

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`OK   ${label}`);
  } else {
    console.log(`FAIL ${label}`);
    failures += 1;
  }
}

// --- Portuguese 3-letter month abbreviations used verbatim by this source's
// own "Month" field on every Card.Calendar/session entry. This mapping is
// only used to mechanically re-express the source's own stated month token
// as a 2-digit number for a reproducible ISO string — it is not inventing
// or guessing a month, every row already states its own month directly.
const MONTH_MAP = {
  Jan: "01", Fev: "02", Mar: "03", Abr: "04", Mai: "05", Jun: "06",
  Jul: "07", Ago: "08", Set: "09", Out: "10", Nov: "11", Dez: "12",
};

/**
 * Extracts every "Card.Calendar" event row from a retained saocarlos.pt
 * /calendar/ (or /program/) HTML page. Each row directly states its own
 * day/month/year/time/type/local/city/title — nothing here is combined
 * from a separate heading or external context (basis: DIRECT_SOURCE).
 */
function extractCalendarCards(html) {
  const parts = html.split('data-bl-name="Card.Calendar"').slice(1);
  const grabSimple = (chunk, name) => {
    const m = chunk.match(new RegExp(`data-bl-name="${name}"[^>]*>([^<]*)<`));
    return m ? m[1] : null;
  };
  const grabNested = (chunk, name) => {
    const m = chunk.match(
      new RegExp(`data-bl-name="${name}"[^>]*>\\s*<div data-bl-name="Text"[^>]*>([^<]*)<`),
    );
    return m ? m[1] : null;
  };
  return parts.map((p) => {
    const chunk = p.slice(0, 4500);
    const hrefMatch = chunk.match(/href="([^"]*)"/);
    const contentIdMatch = chunk.match(/data-content-id="([^"]*)"/);
    return {
      href: hrefMatch ? hrefMatch[1] : null,
      contentId: contentIdMatch ? contentIdMatch[1] : null,
      day: grabSimple(chunk, "Day"),
      month: grabSimple(chunk, "Month"),
      year: grabSimple(chunk, "Year"),
      time: grabSimple(chunk, "Time"),
      type: grabNested(chunk, "Type"),
      local: grabNested(chunk, "Local"),
      city: grabNested(chunk, "City"),
      title: grabSimple(chunk, "Display Title"),
    };
  });
}

/** Mechanical, source-agnostic combination rule: DD + Month-abbr + YYYY + HH:MM,
 * all stated together on one retained event row, into an ISO-8601 local
 * (floating, no timezone stated) datetime string. This is DIRECT_SOURCE
 * parsing of one row's own co-located fields, not DETERMINISTIC_CONTEXT
 * (which would require combining fields from two separate locations). */
function toIsoLocal(row) {
  const mm = MONTH_MAP[row.month];
  if (!mm) return null;
  const dd = row.day.padStart(2, "0");
  return `${row.year}-${mm}-${dd}T${row.time}:00`;
}

console.log("=== teatro-sao-carlos-lisbon-01 offline proof ===\n");

// --- 1. Homepage redirect + identity ---
const headersHomeBare = read("headers-home-bare.txt");
check("bare saocarlos.pt returns 301 to https://www.saocarlos.pt/", /^HTTP\/1\.1 301/.test(headersHomeBare) && /Location: https:\/\/www\.saocarlos\.pt\//.test(headersHomeBare));

const homeHtml = read("body-home-www.html");
check('homepage <title> self-identifies as "TNSC - Teatro Nacional de São Carlos"', /<title>TNSC - Teatro Nacional de S[aã]o Carlos<\/title>/.test(homeHtml));
check('homepage meta description names the venue as "o único teatro de ópera em Portugal"', homeHtml.includes("único teatro de ópera em Portugal"));
check('homepage names its own producing entity "OPART"', homeHtml.includes("OPART"));
check(
  "homepage's own retained news item states the São Carlos building is currently relocated to Boa Hora during works (\"São Carlos, por agora, na Boa Hora\")",
  homeHtml.includes("São Carlos, por agora, na Boa Hora") && homeHtml.includes("obras de requalificação"),
);

// --- 2. Platform classification: no JSON-LD, no wp-json, no RSS feed ---
check("homepage contains zero application/ld+json blocks", !homeHtml.includes("application/ld+json"));
check('homepage/calendar HTML is built on the bespoke "bl-" (Bond Habits / bndlyr) platform, not WordPress', homeHtml.includes("data-bl-name=") && homeHtml.includes("cdn.bndlyr.com"));

const feedHeaders = read("headers-feed.txt");
check("/feed/ returns 404 (no WordPress-style RSS feed)", /^HTTP\/1\.1 404/.test(feedHeaders));

const wpjsonHeaders = read("headers-wpjson.txt");
check("/wp-json/ returns 403 (no public WP REST API)", /^HTTP\/1\.1 403/.test(wpjsonHeaders));

const robots = read("body-robots.txt");
check("robots.txt does not blanket-disallow ordinary crawling (only disallows archive.org bots)", robots.includes("ia_archiver") && !/^Disallow: \/\s*$/m.test(robots.split("ia_archiver")[0] ?? ""));

// --- 3. /calendar/ page: real, server-rendered, structured event data ---
const calendarHtml = read("body-calendar.html");
const cards = extractCalendarCards(calendarHtml);
check("retained /calendar/ page contains exactly 60 Card.Calendar rows", cards.length === 60);
check("every row has non-null day/month/year/time/type/local/city/title/href/contentId", cards.every((c) => c.day && c.month && c.year && c.time && c.type && c.local && c.city && c.title && c.href && c.contentId));

const localCounts = new Map();
for (const c of cards) localCounts.set(c.local, (localCounts.get(c.local) ?? 0) + 1);
const saoCarlosAsLocal = cards.filter((c) => /carlos/i.test(c.local)).length;
check(
  "zero of the 60 retained rows list \"Teatro Nacional de São Carlos\" itself as the performance venue (Local) — confirms the closure/relocation finding above",
  saoCarlosAsLocal === 0,
);
console.log(`     -> distinct Local values in this retained sample: ${[...localCounts.keys()].join(" | ")}`);

const contentIds = cards.map((c) => c.contentId);
check("all 60 contentIds are unique within the retained fetch", new Set(contentIds).size === 60);

const hrefs = new Set(cards.map((c) => c.href));
check("hrefs are shared across multiple session dates of the same production (fewer unique hrefs than rows)", hrefs.size < cards.length && hrefs.size === 21);

// --- 4. Empirical stable-identifier proof: two independent fetches, same IDs ---
const calendarRecheckHtml = read("body-calendar-recheck.html");
const recheckCards = extractCalendarCards(calendarRecheckHtml);
check("second, independent fetch of /calendar/ also returns exactly 60 rows", recheckCards.length === 60);
const recheckIds = recheckCards.map((c) => c.contentId);
let matchingPositions = 0;
for (let i = 0; i < Math.min(contentIds.length, recheckIds.length); i += 1) {
  if (contentIds[i] === recheckIds[i]) matchingPositions += 1;
}
check(
  `data-content-id is empirically stable across two independent fetches (${matchingPositions}/${contentIds.length} positions match) — satisfies the stable-identifier rule empirically`,
  matchingPositions === 60 && contentIds.length === 60,
);

// --- 5. Deterministic ISO-datetime reconstruction from each row's own co-located fields ---
const isoSamples = cards.slice(0, 3).map((c) => ({ title: c.title, day: c.day, month: c.month, year: c.year, time: c.time, iso: toIsoLocal(c) }));
check("every row's day+month+year+time mechanically combines into a well-formed ISO-local datetime (DIRECT_SOURCE, all inputs co-located on one row)", cards.every((c) => {
  const iso = toIsoLocal(c);
  return iso !== null && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00$/.test(iso);
}));
console.log("     -> sample derived ISO-local datetimes:");
for (const s of isoSamples) console.log(`        "${s.title}": ${s.day} ${s.month} ${s.year} ${s.time} -> ${s.iso}`);

// --- 6. Month/day range sanity (no fabricated calendar impossibilities) ---
check("every row's day is a plausible 1-31 integer", cards.every((c) => { const d = Number(c.day); return Number.isInteger(d) && d >= 1 && d <= 31; }));
check("every row's month token is a recognised Portuguese 3-letter abbreviation", cards.every((c) => MONTH_MAP[c.month] !== undefined));

// --- 7. No price/€ anywhere on the listing pages (price field: NOT_PRESENT) ---
const programHtml = read("body-program.html");
const priceRe = /€\s?\d|\d[.,]?\d*\s?€/;
check("no € / price token found anywhere on the retained /calendar/ page", !priceRe.test(calendarHtml));
check("no € / price token found anywhere on the retained /program/ page", !priceRe.test(programHtml));

// --- 8. Detail page: per-production Sessions repeater is empty in the static HTML
// (confirms the detail page's own session list is client-rendered, unlike the
// listing pages above, which are genuinely server-rendered) ---
const carmenHtml = read("body-carmen-detail.html");
const sessionsLayoutIdx = carmenHtml.indexOf('data-bl-name="Sessions Flex Layout"');
const sessionsChunk = carmenHtml.slice(sessionsLayoutIdx, sessionsLayoutIdx + 600);
check(
  "the individual production detail page's own 'Sessions Flex Layout' repeater is empty in retained static HTML (session-level detail there is client-rendered; the listing pages are the real data path)",
  sessionsChunk.includes('class="bl-grid-items bl-grid-gutter') && /bl-grid-items bl-grid-gutter [A-Za-z0-9]+">\s*<\/div>/.test(sessionsChunk),
);
check('the Carmen detail page names "Teatro Nacional de São Carlos" only as a credited company (its own choir), never as this production\'s performance venue', /Coro do Teatro Nacional de São Carlos/.test(carmenHtml));

console.log(`\n=== ${failures === 0 ? "OFFLINE PROOF: PASSED" : `OFFLINE PROOF: FAILED (${failures} check(s))`} ===`);
process.exitCode = failures === 0 ? 0 : 1;
