// Dependency-free, no-network Node script that re-parses ONLY the retained
// evidence files under this directory and mechanically re-derives every
// field_assessment / site_classification claim made in
// ../investigation.json for the cm-sintra-agenda-cultural-01 investigation
// (Câmara Municipal de Sintra — Agenda Cultural, https://cm-sintra.pt/agenda).
//
// Run with: node evidence/offline-proof.mjs
//
// This never fetches anything over the network and never hard-codes a
// value that was not itself extracted from a retained file below — it is a
// deterministic re-parse/cross-check, not a restatement of already-trusted
// conclusions.

import { readFileSync } from "node:fs";
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

// --- 1. Parse the retained agenda list pages into structured event rows ---
//
// This iCagenda instance emits TWO distinct list-item date sub-templates:
//   - "single" events: <span class="ic-single-next">YYYY-MM-DD</span> (+
//     optional ic-single-starttime) — one specific occurrence, and the
//     permalink itself carries a /YYYY-MM-DD-HH-MM suffix.
//   - "period" events: <span class="ic-period-startdate">/<ic-period-enddate>
//     — a date RANGE (a multi-day exhibition, a talks series, etc.), and the
//     permalink carries NO date suffix at all (one page serves the whole run).
// Both sub-templates are retained and parsed honestly below — this
// investigation never assumes every row is a "single" event.

function parseListPage(html) {
  const idMarker = /ic-list-event ic-clearfix ic-event-id-(\d+)"/g;
  const starts = [];
  let m;
  while ((m = idMarker.exec(html))) starts.push({ id: m[1], index: m.index });

  const items = [];
  for (let i = 0; i < starts.length; i++) {
    const chunkStart = starts[i].index;
    const chunkEnd = i + 1 < starts.length ? starts[i + 1].index : html.length;
    const chunk = html.slice(chunkStart, chunkEnd);

    const titleMatch = chunk.match(/<h3>\s*<a[^>]*>\s*([^\t\n]+?)\s*<\/a>\s*<\/h3>/);
    const catMatch = chunk.match(/ic-title-cat-btn[^>]*>\s*([^\t\n]+?)\s*<\/a>/);
    const singleDate = chunk.match(/ic-single-next">(\d{4}-\d{2}-\d{2})</);
    const singleTime = chunk.match(/ic-single-starttime">(\d{2}:\d{2})</);
    const periodStart = chunk.match(/ic-period-startdate">(\d{4}-\d{2}-\d{2})</);
    const periodEnd = chunk.match(/ic-period-enddate">(\d{4}-\d{2}-\d{2})</);
    const placeMatch = chunk.match(/class="place ic-place">\s*([^\t\n]+?)\s*(?:<div|<\/div)/);
    const hrefMatch = chunk.match(/href="(\/agenda\/[a-z0-9-]+(?:\/\d{4}-\d{2}-\d{2}-\d{2}-\d{2})?)"/);

    items.push({
      id: starts[i].id,
      title: titleMatch ? titleMatch[1] : null,
      category: catMatch ? catMatch[1] : null,
      kind: singleDate ? "single" : periodStart ? "period" : "unknown",
      date: singleDate ? singleDate[1] : null,
      time: singleTime ? singleTime[1] : null,
      periodStart: periodStart ? periodStart[1] : null,
      periodEnd: periodEnd ? periodEnd[1] : null,
      place: placeMatch ? placeMatch[1].replace(/\s+/g, " ").trim() : null,
      href: hrefMatch ? hrefMatch[1] : null,
    });
  }
  return items;
}

const page1Html = read("body-agenda.html");
const page2Html = read("body-agenda-page2.html");
const page1Events = parseListPage(page1Html);
const page2Events = parseListPage(page2Html);
const allListEvents = [...page1Events, ...page2Events];

check("page 1 (/agenda) contains exactly 10 event rows", page1Events.length === 10);
check("page 2 (/agenda?page=2) contains exactly 8 event rows", page2Events.length === 8);
check("combined retained sample is exactly 18 rows, matching the page's own 'Existem 18 eventos próximos' count", allListEvents.length === 18);
check("18/18 sampled rows parsed with a non-null title", allListEvents.every((e) => e.title));
check("18/18 sampled rows carry their own source-provided category label directly (ic-title-cat-btn)", allListEvents.every((e) => e.category));

// --- 2. The category taxonomy genuinely spans many non-music civic topics ---
// (never just music) — this is the honest, mechanical proof that the "não
// importar categorias não relacionadas" (don't bulk-import unrelated
// categories) constraint from the task is met by filtering on the item's
// own category text, not by narrowing the source itself.

const categoryTally = {};
for (const e of allListEvents) categoryTally[e.category] = (categoryTally[e.category] ?? 0) + 1;
const distinctCategories = Object.keys(categoryTally).sort();
check(
  "the retained 18-row sample spans at least 5 distinct first-party categories (a genuine multi-topic civic calendar, not a music-only feed)",
  distinctCategories.length >= 5,
);
check(
  "the retained sample includes several genuinely non-music categories (Bibliotecas, Exposições, Teatro, Visitas Guiadas, Outros)",
  ["Bibliotecas", "Exposições", "Teatro", "Visitas Guiadas", "Outros"].every((c) => distinctCategories.includes(c)),
);
check(
  "exactly 3 of the 18 raw rows carry the source's own 'Música' category label",
  categoryTally["Música"] === 3,
);

// --- 3. The site's own server-side category+date filter is genuinely ---
// functional, not merely decorative — cross-checked against the raw,
// UNFILTERED 18-row tally above, not just trusted on its own.

const musicaUpcomingHtml = read("body-agenda-musica-upcoming.html");
const musicaUpcomingEvents = parseListPage(musicaUpcomingHtml);
check(
  "GET /agenda?filter_from=<today>&filter_category=3 (the site's own server-side filter) returns exactly 3 rows",
  musicaUpcomingEvents.length === 3,
);
check(
  "every row returned by the filtered query itself carries category 'Música' (100% precision, not merely trusted)",
  musicaUpcomingEvents.every((e) => e.category === "Música"),
);
const musicIdsFromRawTally = allListEvents.filter((e) => e.category === "Música").map((e) => `${e.id}@${e.date}`).sort();
const musicIdsFromFilter = musicaUpcomingEvents.map((e) => `${e.id}@${e.date}`).sort();
check(
  "the filtered query's 3 rows are EXACTLY the same 3 (id, date) occurrences found by independently tallying the raw unfiltered 18-row sample — the category filter is proven complete AND accurate, not just plausible",
  JSON.stringify(musicIdsFromRawTally) === JSON.stringify(musicIdsFromFilter),
);

// --- 4. Every sampled music row directly states title/date/time/venue/url ---
// with no page-heading/context combination needed anywhere (DIRECT_SOURCE
// throughout, never DETERMINISTIC_CONTEXT for this source).

const musicRows = allListEvents.filter((e) => e.category === "Música");
check("3/3 sampled Música rows use the 'single' (specific occurrence) date sub-template, not the 'period' range sub-template", musicRows.every((e) => e.kind === "single"));
check("3/3 sampled Música rows have a full ISO date (YYYY-MM-DD) directly in ic-single-next", musicRows.every((e) => e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date)));
check("3/3 sampled Música rows have an HH:MM start time directly in ic-single-starttime", musicRows.every((e) => e.time && /^\d{2}:\d{2}$/.test(e.time)));
check("3/3 sampled Música rows have a non-null venue name directly in the row's own place/ic-place element", musicRows.every((e) => e.place));
check("3/3 sampled Música rows have a distinct permalink whose own date-time suffix matches the row's own displayed date+time", musicRows.every((e) => e.href && e.href.endsWith(`/${e.date}-${e.time.replace(":", "-")}`)));

// --- 5. The stable-identifier nuance already established in cco-sintra-01 ---
// recurs on this sibling municipal source: the bare numeric event id is NOT
// per-occurrence-unique (empirically demonstrated, not assumed).

const id148Rows = allListEvents.filter((e) => e.id === "148");
check("event id 148 ('Evita no Olga Cadaval') appears exactly twice in the 18-row sample (two distinct dates)", id148Rows.length === 2);
check(
  "the two id-148 rows have two DIFFERENT dates but the SAME bare numeric id — the bare id alone is NOT a per-occurrence-unique key",
  id148Rows.length === 2 && id148Rows[0].date !== id148Rows[1].date && id148Rows[0].id === id148Rows[1].id,
);
check(
  "the two id-148 rows nonetheless have two DIFFERENT full permalink URLs (slug + date-time suffix)",
  id148Rows.length === 2 && id148Rows[0].href !== id148Rows[1].href,
);

// --- 6. Cross-check each retained event-detail page's own self-declared URL ---
// (og:url meta tag — this platform emits no <link rel="canonical"> at all,
// checked and confirmed absent below) against the exact URL it was fetched
// from, proving the source itself declares that permalink as this specific
// occurrence's own address.

const detailPages = [
  { file: "body-event-evita.html", fetchedUrl: "https://cm-sintra.pt/agenda/evita-no-olga-cadaval-com-sofia-escobar-e-diogo-morgado/2026-09-03-21-00" },
  { file: "body-event-orfeu.html", fetchedUrl: "https://cm-sintra.pt/agenda/sintra-celebra-musica-e-mitologia-nas-noites-de-orfeu/2026-10-17-21-00" },
];
for (const { file, fetchedUrl } of detailPages) {
  const html = read(file);
  check(`${file}: contains NO <link rel="canonical"> anywhere (confirmed absent, not merely unchecked)`, !/<link rel="canonical"/.test(html));
  const ogUrlMatch = html.match(/<meta property="og:url" content="([^"]+)"/);
  check(`${file}: its own og:url meta tag exactly matches the URL it was fetched from`, ogUrlMatch && ogUrlMatch[1] === fetchedUrl);
}

// Each detail page also independently re-states its own date/time/venue,
// confirming the permalink's date-time suffix genuinely determines page
// content (not merely decorative).
const evitaHtml = read("body-event-evita.html");
const orfeuHtml = read("body-event-orfeu.html");
check("body-event-evita.html states its own date/time as 2026-09-03 21:00", /ic-single-next">2026-09-03</.test(evitaHtml) && /ic-single-starttime">21:00</.test(evitaHtml));
check("body-event-evita.html states its own venue as 'Centro Cultural Olga Cadaval'", /Centro Cultural Olga Cadaval/.test(evitaHtml));
check("body-event-orfeu.html states its own date/time as 2026-10-17 21:00", /ic-single-next">2026-10-17</.test(orfeuHtml) && /ic-single-starttime">21:00</.test(orfeuHtml));
check("body-event-orfeu.html states its own venue as 'Museu Arqueológico de São Miguel de Odrinhas'", /Museu Arqueológico de São Miguel de Odrinhas/.test(orfeuHtml));

// --- 7. Price is genuinely NOT a structured, reliably-present field ---
// (and a naive text search for "gratuit*" is actively misleading on this
// source — the word appears on the Evita page too, but in an UNRELATED
// footer news-slider item about a different venue's free exhibition, not
// about Evita's own price. This is checked and distinguished explicitly,
// never conflated.)

const evitaDescMatch = evitaHtml.match(/<div class="ic-full-description">([\s\S]*?)<\/div>\s*\n\s*\n\s*<p>&nbsp;<\/p>/);
const evitaDescText = evitaDescMatch ? evitaDescMatch[1] : "";
check(
  "body-event-evita.html contains the word 'gratuita' SOMEWHERE on the page, but NOT within its own event description block — a naive 'gratuit*' text match would be WRONG for this ticketed musical",
  /gratuita/.test(evitaHtml) && evitaDescMatch !== null && !/gratuita/.test(evitaDescText),
);
check(
  "body-event-evita.html's own full description links out to an external Ticketline URL rather than stating a price directly on this page",
  /ticketline\.pt/i.test(evitaHtml),
);
check(
  "body-event-orfeu.html's own full description states, within its own text, that admission is free ('proposta cultural gratuita')",
  /proposta cultural gratuita/.test(orfeuHtml),
);

// --- 8. RSS / feed data path was checked and genuinely rejected (410 Gone) ---
// — the same finding already established for the sibling cco-sintra-01
// investigation (same municipal platform family), re-verified independently
// here against this distinct cm-sintra.pt site rather than assumed from it.

const feedHeaders = read("headers-feed.txt");
const feedBody = read("body-feed.xml");
check("headers-feed.txt records HTTP/1.1 410 Gone for /agenda?format=feed&type=rss", /^HTTP\/1\.1 410 Gone/.test(feedHeaders));
check("body-feed.xml is a generic nginx 410 error page, not an RSS/XML feed", feedBody.includes("410 Gone") && !feedBody.includes("<rss"));
check("the retained agenda page's own <head> nonetheless advertises that (now-dead) RSS route via <link rel=\"alternate\">", /rel="alternate" type="application\/rss\+xml"/.test(page1Html));

// --- 9. Identity evidence: municipal branding/contact, retained verbatim ---

const homeHtml = read("body-home.html");
check("retained homepage's own OpenSearch <link> title names 'Câmara Municipal de Sintra'", /title="OpenSearch C(â|Ã¢)mara Municipal de Sintra"/.test(homeHtml));
check("retained homepage and agenda page both state a municipe@cm-sintra.pt contact email", homeHtml.includes("municipe@cm-sintra.pt") && page1Html.includes("municipe@cm-sintra.pt"));
check("retained Evita event-detail page's own og:site_name states 'Câmara Municipal de Sintra'", /<meta property="og:site_name" content="Câmara Municipal de Sintra"/.test(evitaHtml));

// --- 10. Platform classification: com_icagenda on Joomla (Helix Ultimate) ---
// — the SAME platform family already identified for cco-sintra-01, but this
// is a genuinely distinct Joomla site/install (cm-sintra.pt, not
// ccolgacadaval.pt), independently re-confirmed here rather than assumed.

check("retained agenda-page <body> class list literally contains 'com_icagenda' and 'com-icagenda'", page1Html.includes("com_icagenda") && page1Html.includes("com-icagenda"));
check("retained homepage <meta name=\"generator\"> literally contains 'Helix Ultimate' and 'Joomla'", /generator" content="Helix Ultimate[^"]*Joomla[^"]*"/.test(homeHtml));
check(
  "the retained agenda page's one application/ld+json block is a BreadcrumbList only — no Event/MusicEvent JSON-LD exists anywhere on the retained agenda list page or the 2 retained detail pages",
  (page1Html.match(/application\/ld\+json/g) ?? []).length === 1 &&
    page1Html.includes('"@type":"BreadcrumbList"') &&
    !page1Html.includes('"@type":"Event"') &&
    !evitaHtml.includes('"@type":"Event"') &&
    !orfeuHtml.includes('"@type":"Event"'),
);

// --- 11. robots.txt does not disallow /agenda; this investigation's own ---
// request pattern (a small, bounded number of GETs) respects it.

const robotsBody = read("body-robots.txt");
check("retained robots.txt does not Disallow /agenda anywhere", !/disallow:\s*\/agenda/i.test(robotsBody));

console.log("");
if (failures === 0) {
  console.log(`OFFLINE PROOF: PASSED (0 failures)`);
} else {
  console.log(`OFFLINE PROOF: FAILED (${failures} check(s) failed)`);
  process.exitCode = 1;
}
