// Dependency-free, no-network offline proof for campo-pequeno-lisbon-01.
//
// Re-parses ONLY the retained evidence files in this directory (no network
// access, no external packages — plain Node.js built-ins) and mechanically
// re-derives every claim made in ../investigation.json's field_assessment
// and probe_history sections. Run with:
//
//   node evidence/offline-proof.mjs
//
// Exits non-zero and prints "OFFLINE PROOF: FAILED" if any check fails.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf-8");

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`PASS: ${label}`);
  } else {
    failures += 1;
    console.log(`FAIL: ${label}${detail ? " -- " + detail : ""}`);
  }
}

// ---------------------------------------------------------------------
// Step 0: a tiny, dependency-free decoder for the small, fixed set of
// numeric/named HTML entities actually observed in the retained fixtures
// (the source encodes accented Portuguese characters as named entities,
// e.g. "In&iacute;cio" for "Início"). Not a general HTML-entity library —
// bounded to what this investigation's retained evidence actually uses.
// ---------------------------------------------------------------------

const ENTITY_MAP = {
  iacute: "í", aacute: "á", atilde: "ã", oacute: "ó", ocirc: "ô",
  ecirc: "ê", eacute: "é", egrave: "è", ccedil: "ç", uacute: "ú",
  ucirc: "û", otilde: "õ", agrave: "à", acirc: "â", ntilde: "ñ",
  ograve: "ò", ordm: "º", ordf: "ª", nbsp: " ", amp: "&", quot: '"',
  apos: "'",
};

function decodeEntities(html) {
  return html
    .replace(/&#0*39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(parseInt(code, 10)))
    .replace(/&([a-zA-Z]+);/g, (full, name) =>
      Object.prototype.hasOwnProperty.call(ENTITY_MAP, name) ? ENTITY_MAP[name] : full,
    );
}

// ---------------------------------------------------------------------
// Step 1: parse the retained agenda list page into event cards
// ---------------------------------------------------------------------

const agendaHtml = decodeEntities(read("body-agenda-www.html"));

// Each card: <div class="col ... event mb-3" > <a href="/pt/agenda/SLUG" ...>
//   ... <h3 class="card-title line-clamp-2">TITLE</h3>
//   <div class="local">LOCAL</div>
//   <div class="date">   DATE_TEXT   </div>
const cardRe =
  /col col-6 col-sm-6 col-md-4 col-lg-4 col-xl-3 event mb-3"[\s\S]*?<a href="(\/pt\/agenda\/[a-z0-9-]+)"[\s\S]*?<h3 class="card-title line-clamp-2">([^<]*)<\/h3>\s*<div class="local">([^<]*)<\/div>\s*<div class="date">\s*([^<]*?)\s*<\/div>/g;

const cards = [];
let m;
while ((m = cardRe.exec(agendaHtml)) !== null) {
  cards.push({
    href: m[1],
    slug: m[1].replace("/pt/agenda/", ""),
    title: m[2].trim(),
    local: m[3].trim(),
    date: m[4].trim(),
  });
}

check(
  "agenda list page yields 28 distinct event cards",
  cards.length === 28,
  `found ${cards.length}`,
);

const slugs = cards.map((c) => c.slug);
const uniqueSlugs = new Set(slugs);
check(
  "every event card has a unique /pt/agenda/{slug} href (no duplicate slugs)",
  uniqueSlugs.size === slugs.length,
  `${uniqueSlugs.size} unique of ${slugs.length} total`,
);

check(
  "every card's title, local, and date are non-empty",
  cards.every((c) => c.title.length > 0 && c.local.length > 0 && c.date.length > 0),
);

check(
  "every card's 'local' field is exactly 'Lisboa' (city only, on the list page)",
  cards.every((c) => c.local === "Lisboa"),
);

// ---------------------------------------------------------------------
// Step 2: parse 4 sampled detail pages
// ---------------------------------------------------------------------

const DETAIL_FIXTURES = [
  { slug: "alphaville", file: "body-event-alphaville.html" },
  { slug: "megadeth", file: "body-event-megadeth.html" },
  { slug: "the-nutcracker-ice-show", file: "body-event-nutcracker.html" },
  { slug: "brandi-carlile---cancelado", file: "body-event-cancelado.html" },
];

function parseDetail(html) {
  const h1Match = html.match(/<h1 class="font-bold">([^<]*)/);
  const canonicalMatch = html.match(
    /<link rel="canonical" href="([^"]*)"/,
  );
  const headerBlockMatch = html.match(
    /event-header-info[\s\S]*?<\/div>\s*<\/div>/,
  );
  const headerBlock = headerBlockMatch ? headerBlockMatch[0] : "";
  const dateMatch = headerBlock.match(
    /<div class="date">\s*([^<]*?)\s*<\/div>/,
  );
  const locationMatch = headerBlock.match(
    /<div class="location">([^<]*)<\/div>/,
  );
  const ticketUrlMatch = headerBlock.match(
    /<a href="([^"]*)" target="_blank" class="buyticket/,
  );
  // The retained fixtures show TWO distinct free-text formats for the
  // same two facts (start time, doors time) across sampled events — this
  // inconsistency is itself a real, material finding (see
  // field_assessment.time.notes and collector_assessment.blockers), not
  // something to paper over with an over-permissive single regex.
  //   Pattern A (e.g. alphaville, nutcracker, cancelado):
  //     "Início de espetáculo: HH H MM" then "Abertura de portas: HH H MM"
  //   Pattern B (e.g. megadeth):
  //     "Abertura de Portas HHhMM" then "Inicio do Espetáculo HHhMM"
  //     (reversed order, lowercase "h", no colon, no accent on "Início")
  const patternA = html.match(
    /id="sessions"[\s\S]*?In[íi]cio de espet[áa]culo:\s*([0-9]{1,2}[Hh][0-9]{2})[\s\S]*?Abertura de portas:\s*([0-9]{1,2}[Hh][0-9]{2})/,
  );
  const patternB = html.match(
    /id="sessions"[\s\S]*?Abertura de [Pp]ortas\s+([0-9]{1,2}[Hh][0-9]{2})[\s\S]*?Inicio do Espet[áa]culo\s+([0-9]{1,2}[Hh][0-9]{2})/,
  );
  let sessionTimePattern = null;
  let startTimeRaw = null;
  let doorsTimeRaw = null;
  if (patternA) {
    sessionTimePattern = "A";
    startTimeRaw = patternA[1];
    doorsTimeRaw = patternA[2];
  } else if (patternB) {
    sessionTimePattern = "B";
    doorsTimeRaw = patternB[1];
    startTimeRaw = patternB[2];
  }
  const priceRe = /data-areaname="([^"]*)" data-price="([^"]*)"/g;
  const prices = [];
  let pm;
  while ((pm = priceRe.exec(html)) !== null) {
    prices.push({ area: pm[1], price: pm[2] });
  }
  return {
    title: h1Match ? h1Match[1].trim() : null,
    canonicalUrl: canonicalMatch ? canonicalMatch[1] : null,
    dateText: dateMatch ? dateMatch[1].trim() : null,
    location: locationMatch ? locationMatch[1].trim() : null,
    ticketUrl: ticketUrlMatch ? ticketUrlMatch[1].trim() : null,
    startTime: startTimeRaw,
    doorsTime: doorsTimeRaw,
    sessionTimePattern,
    prices,
  };
}

const details = {};
for (const fixture of DETAIL_FIXTURES) {
  details[fixture.slug] = parseDetail(decodeEntities(read(fixture.file)));
}

check(
  "all 4 sampled detail pages expose a non-empty <h1> title",
  DETAIL_FIXTURES.every((f) => details[f.slug].title && details[f.slug].title.length > 0),
);

check(
  "all 4 sampled detail pages expose a canonical URL of the form https://www.sagrescampopequeno.pt/pt/{slug}",
  DETAIL_FIXTURES.every((f) =>
    details[f.slug].canonicalUrl === `https://www.sagrescampopequeno.pt/pt/${f.slug}`,
  ),
  JSON.stringify(DETAIL_FIXTURES.map((f) => details[f.slug].canonicalUrl)),
);

check(
  "all 4 sampled detail pages expose a full 'DD month YYYY , weekday' date header",
  DETAIL_FIXTURES.every((f) => /^[0-9]{1,2} [\p{L}]+ 20[0-9]{2} , [\p{L}-]+$/u.test(details[f.slug].dateText || "")),
  JSON.stringify(DETAIL_FIXTURES.map((f) => details[f.slug].dateText)),
);

check(
  "all 4 sampled detail pages expose 'Lisboa - Sagres Campo Pequeno' as the location",
  DETAIL_FIXTURES.every((f) => details[f.slug].location === "Lisboa - Sagres Campo Pequeno"),
);

check(
  "all 4 sampled detail pages expose both a start time and a doors time, via EITHER retained free-text pattern A or B",
  DETAIL_FIXTURES.every((f) => details[f.slug].startTime && details[f.slug].doorsTime),
  JSON.stringify(DETAIL_FIXTURES.map((f) => [details[f.slug].startTime, details[f.slug].doorsTime])),
);

const patternCounts = DETAIL_FIXTURES.reduce((acc, f) => {
  const p = details[f.slug].sessionTimePattern || "NONE";
  acc[p] = (acc[p] || 0) + 1;
  return acc;
}, {});
console.log(
  `NOTE (material finding, not a failure): the 'Sessões' free-text time format is INCONSISTENT across this bounded 4-event sample — pattern distribution: ${JSON.stringify(patternCounts)}. A collector cannot rely on a single fixed regex for this field without handling both variants; recorded honestly as field_assessment.time.state = PARTIAL, not PROVEN.`,
);

check(
  "all 4 sampled detail pages expose at least one priced admission tier (data-areaname + data-price)",
  DETAIL_FIXTURES.every((f) => details[f.slug].prices.length > 0),
  JSON.stringify(DETAIL_FIXTURES.map((f) => details[f.slug].prices.length)),
);

// ---------------------------------------------------------------------
// Step 3: cross-check each sampled detail page's date against its own
// agenda-list card (independent same-source corroboration, not identical
// text — list card omits weekday, detail page includes it).
// ---------------------------------------------------------------------

function dateOnly(fullDateText) {
  // "16 outubro 2026 , sexta-feira" -> "16 outubro 2026"
  const m2 = fullDateText.match(/^([0-9]{1,2} [\p{L}]+ 20[0-9]{2})/u);
  return m2 ? m2[1] : null;
}

for (const fixture of DETAIL_FIXTURES) {
  const card = cards.find((c) => c.slug === fixture.slug);
  const detail = details[fixture.slug];
  check(
    `detail page date for '${fixture.slug}' matches its own agenda-list card date`,
    card ? dateOnly(detail.dateText) === card.date : false,
    card ? `card='${card.date}' detail='${dateOnly(detail.dateText)}'` : "no matching agenda card found",
  );
}

// ---------------------------------------------------------------------
// Step 4: mechanical Gregorian-calendar weekday cross-check. The source
// states BOTH the calendar date AND the Portuguese weekday name on every
// sampled detail page (e.g. "16 outubro 2026 , sexta-feira"). This
// mechanically recomputes the real day-of-week for that exact calendar
// date (using the year/month/day the SOURCE itself states, never today's
// real-world date) and confirms the source's own stated weekday matches
// real Gregorian-calendar arithmetic.
// ---------------------------------------------------------------------

const PT_MONTHS = {
  janeiro: 1, fevereiro: 2, "março": 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};

const PT_WEEKDAYS = [
  "domingo", "segunda-feira", "terça-feira", "quarta-feira",
  "quinta-feira", "sexta-feira", "sábado",
];

function ptWeekdayForDate(day, month, year) {
  // UTC noon avoids any local-timezone/DST off-by-one issues.
  const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  return PT_WEEKDAYS[d.getUTCDay()];
}

function parseFullDateWithWeekday(text) {
  // "16 outubro 2026 , sexta-feira" -> {day, month, year, weekday}
  const m3 = text.match(/^([0-9]{1,2}) ([\p{L}]+) (20[0-9]{2}) , ([\p{L}-]+)$/u);
  if (!m3) return null;
  const day = parseInt(m3[1], 10);
  const monthName = m3[2].toLowerCase();
  const year = parseInt(m3[3], 10);
  const statedWeekday = m3[4].toLowerCase();
  const month = PT_MONTHS[monthName];
  return { day, month, year, statedWeekday, monthName };
}

let weekdayChecks = 0;
let weekdayMatches = 0;
for (const fixture of DETAIL_FIXTURES) {
  const parsed = parseFullDateWithWeekday(details[fixture.slug].dateText || "");
  if (!parsed) continue;
  weekdayChecks += 1;
  const computed = ptWeekdayForDate(parsed.day, parsed.month, parsed.year);
  const matched = computed === parsed.statedWeekday;
  if (matched) weekdayMatches += 1;
  check(
    `'${fixture.slug}': source-stated weekday '${parsed.statedWeekday}' for ${parsed.day} ${parsed.monthName} ${parsed.year} matches real Gregorian-calendar arithmetic ('${computed}')`,
    matched,
  );
}
check(
  "at least 4 independent weekday cross-checks were actually performed (not zero)",
  weekdayChecks === 4,
  `performed ${weekdayChecks}`,
);

// ---------------------------------------------------------------------
// Step 5: canonical-slug stability cross-check. body-canonical-check.html
// was fetched from the SHORT canonical URL form (https://.../pt/alphaville)
// rather than the agenda-relative form (https://.../pt/agenda/alphaville)
// that body-event-alphaville.html was fetched from. If both forms serve
// the same event (same <h1>, same canonical tag, same date), this proves
// the slug is the source's own stable identifying path, not merely one
// URL among several unrelated ones.
// ---------------------------------------------------------------------

const canonicalCheckDetail = parseDetail(read("body-canonical-check.html"));
const alphavilleDetail = details["alphaville"];

check(
  "the canonical short URL (/pt/alphaville) and the agenda-relative URL (/pt/agenda/alphaville) serve the identical event (same <h1> title)",
  canonicalCheckDetail.title === alphavilleDetail.title,
  `canonical='${canonicalCheckDetail.title}' agenda-relative='${alphavilleDetail.title}'`,
);
check(
  "the canonical short URL response's own <link rel=canonical> is self-consistent (points at itself)",
  canonicalCheckDetail.canonicalUrl === "https://www.sagrescampopequeno.pt/pt/alphaville",
);
check(
  "the canonical short URL and agenda-relative URL responses state the identical date+weekday",
  canonicalCheckDetail.dateText === alphavilleDetail.dateText,
);

// ---------------------------------------------------------------------
// Step 6: sitemap corroboration. The retained sitemap (pt/sitemap.xml)
// independently lists the same /pt/{slug} canonical form for each of the
// 4 sampled events, as a second, separate source-authored artifact (not
// merely the per-page <link rel="canonical"> tag) declaring the same
// slug as this event's stable path.
// ---------------------------------------------------------------------

const sitemapXml = read("body-sitemap-pt.xml");
for (const fixture of DETAIL_FIXTURES) {
  const loc = `<loc>https://www.sagrescampopequeno.pt/pt/${fixture.slug}</loc>`;
  check(
    `retained sitemap (body-sitemap-pt.xml) independently lists https://www.sagrescampopequeno.pt/pt/${fixture.slug}`,
    sitemapXml.includes(loc),
  );
}

// ---------------------------------------------------------------------
// Step 7: JSON-LD inspection — confirm no Event/MusicEvent structured
// data exists anywhere in the retained agenda or detail pages (only
// BreadcrumbList), ruling out JSON_LD_EVENT as the acquisition class.
// ---------------------------------------------------------------------

function hasEventJsonLd(html) {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  return scripts.some((s) => /"@type"\s*:\s*"(Music)?Event"/.test(s[1]));
}

check(
  "the agenda list page's own JSON-LD contains no Event/MusicEvent block (BreadcrumbList only)",
  !hasEventJsonLd(agendaHtml),
);
check(
  "the alphaville detail page's own JSON-LD contains no Event/MusicEvent block (BreadcrumbList only)",
  !hasEventJsonLd(read("body-event-alphaville.html")),
);

// ---------------------------------------------------------------------
// Step 8: redirect behaviour — the bare https://sagrescampopequeno.pt
// (no www) 301-redirects to https://www.sagrescampopequeno.pt/, and the
// bare /pt/agenda also redirects to the www host's /pt/agenda. Confirms
// the registry's official_website/events_url values are reachable, via
// one hop, from exactly the www canonical host used throughout this
// investigation.
// ---------------------------------------------------------------------

const homeRedirectHeaders = read("headers-home.txt");
const agendaRedirectHeaders = read("headers-agenda.txt");
check(
  "https://sagrescampopequeno.pt redirects (301) to https://www.sagrescampopequeno.pt/",
  /301 Moved Permanently/.test(homeRedirectHeaders) &&
    /Location: https:\/\/www\.sagrescampopequeno\.pt\//.test(homeRedirectHeaders),
);
check(
  "https://sagrescampopequeno.pt/pt/agenda redirects (301) to https://www.sagrescampopequeno.pt/pt/agenda",
  /301 Moved Permanently/.test(agendaRedirectHeaders) &&
    /Location: https:\/\/www\.sagrescampopequeno\.pt\/pt\/agenda/.test(agendaRedirectHeaders),
);

// ---------------------------------------------------------------------
// Step 9: identity corroboration — the retained homepage states the
// venue's own name/branding and its Avenida da República address text.
// ---------------------------------------------------------------------

const homeHtml = read("body-home-www.html");
check(
  "homepage <title> is 'Sagres Campo Pequeno'",
  /<title>Sagres Campo Pequeno <\/title>/.test(homeHtml),
);
check(
  "homepage states the venue's own street context ('Avenida da República')",
  homeHtml.includes("Avenida da República"),
);
check(
  "homepage footer names 'Sagres Campo Pequeno' as the site section heading",
  homeHtml.includes("<h4>Sagres Campo Pequeno</h4>"),
);

// ---------------------------------------------------------------------
// Sample output (first 5 + the 4 sampled detail slugs), for transparency
// ---------------------------------------------------------------------

console.log("\n--- sample of parsed agenda cards (first 5 of " + cards.length + ") ---");
for (const c of cards.slice(0, 5)) {
  console.log(`  ${c.date} | ${c.title} | ${c.href}`);
}
console.log("\n--- sampled detail-page extraction ---");
for (const fixture of DETAIL_FIXTURES) {
  const d = details[fixture.slug];
  console.log(
    `  ${fixture.slug}: title="${d.title}" date="${d.dateText}" location="${d.location}" ` +
      `start=${d.startTime} doors=${d.doorsTime} prices=${d.prices.length} canonical="${d.canonicalUrl}"`,
  );
}

console.log(`\nweekday cross-checks: ${weekdayMatches}/${weekdayChecks} matched real Gregorian-calendar arithmetic`);

console.log(`\n${failures === 0 ? "OFFLINE PROOF: PASSED" : "OFFLINE PROOF: FAILED"} (${failures} failing check(s))`);
process.exitCode = failures === 0 ? 0 : 1;
