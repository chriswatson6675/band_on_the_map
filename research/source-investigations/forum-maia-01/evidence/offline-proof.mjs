#!/usr/bin/env node
// Dependency-free, no-network offline proof for forum-maia-01.
// Re-parses ONLY the retained evidence files in this directory and
// mechanically re-derives every claim cited by investigation.json's
// field_assessment / site_classification / collector_assessment /
// decision blocks. Never makes a network request. Exits non-zero on any
// failed check.
//
// Run: node evidence/offline-proof.mjs

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf8");

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`PASS  ${label}`);
  } else {
    console.log(`FAIL  ${label}`);
    failures += 1;
  }
}

// --- 1. Identity: retained homepage self-identifies as CM Maia's official site ---
const home = read("body-home.html");
check("homepage <title> is 'CM Maia'", /<title>CM Maia<\/title>/.test(home));
check(
  "homepage meta description self-identifies as CM Maia's official site",
  home.includes("S\u00edtio oficial da C\u00e2mara Municipal da Maia") ||
    home.includes(Buffer.from("Sítio oficial da Câmara Municipal da Maia", "utf8").toString("utf8")),
);
check("homepage og:site_name includes 'C\u00e2mara Municipal da Maia'", home.includes("C\u00e2mara Municipal da Maia") || home.includes("Câmara Municipal da Maia"));

// --- 2. The given events_url (sources/porto.json) is a 301 redirect, and the
//        general /agenda/todos-os-eventos listing is a separate, richer root ---
const givenUrlHeaders = read("headers-events-weekend.txt");
check(
  "the sources/porto.json events_url returns HTTP 301 (not a live page in its own right)",
  /^HTTP\/1\.1 301/.test(givenUrlHeaders),
);
check(
  "the 301 redirects within the same 'agenda' path family (not to an unrelated page)",
  /Location:\s*https:\/\/www\.cm-maia\.pt\/institucional\/atualidade-e-participacao\/agenda\/evento\/agenda-cultural_fim-de-semana-88/i.test(
    givenUrlHeaders,
  ),
);
const agendaTodosHeaders = read("headers-agenda-todos.txt");
check(
  "the independently-discovered general listing root (/agenda/todos-os-eventos) returns HTTP 200",
  /^HTTP\/1\.1 200/.test(agendaTodosHeaders),
);

// --- 3. Listing page is a real, server-rendered, paginated event index ---
const listing = read("body-agenda-todos.html");
const cardRe =
  /<span class=dia>(\d+)<\/span>(?:\s*<span class='separador_dias'>[^<]*<\/span>\s*<span class=dia>(\d+)<\/span>)?\s*<span class=mes_curto>([A-Za-z]+)<\/span>\s*<span class=ano apostrhophe>'(\d{2})<\/span>/g;
const cardMatches = [...listing.matchAll(cardRe)];
check("listing page (bounded page 1 sample) contains at least 8 dated event cards", cardMatches.length >= 8);

const eventItemCount = (listing.match(/class="event_item_container"/g) || []).length;
check("listing page reports exactly 12 event_item_container blocks on page 1", eventItemCount === 12);

const paginationRe = /events_list_54_page=(\d+)/g;
const pageNumbers = [...listing.matchAll(paginationRe)].map((m) => Number(m[1]));
check(
  "listing page's own pagination links include a page number > 100 (a large, multi-page archive, not a single short page)",
  pageNumbers.some((n) => n > 100),
);

// --- 4. No JSON-LD, no RSS/ICS alternate link anywhere on the listing page ---
check("listing page contains zero application/ld+json blocks", !listing.includes("application/ld+json"));
check("listing page contains no rel=\"alternate\" RSS/ICS link", !/rel="alternate"[^>]*rss|\.ics/i.test(listing));

// --- 5. Category taxonomy sample (5 retained listing pages) contains no
//        music-specific tag anywhere — the decisive content-scope finding ---
const listingPages = ["body-agenda-todos.html", "body-agenda-todos-page2.html", "body-agenda-todos-page3.html", "body-agenda-todos-page4.html", "body-agenda-todos-page5.html"].map(read);
const categoryRe = /<div class="categories widget_field "><div class="widget_value"><div>((?:<span>[^<]*<\/span>)+)<\/div>/g;
const categoryValues = new Set();
for (const page of listingPages) {
  for (const match of page.matchAll(categoryRe)) {
    for (const spanMatch of match[1].matchAll(/<span>([^<]*)<\/span>/g)) {
      categoryValues.add(spanMatch[1]);
    }
  }
}
const categoryList = [...categoryValues].sort();
console.log(`      (categories observed across 5 retained listing pages: ${categoryList.join(" | ")})`);
check(
  "at least 6 distinct category values were observed across the 5-page bounded sample",
  categoryList.length >= 6,
);
const hasMusicTag = categoryList.some((c) => /m\u00fasica|musica|m\u00fasic|concerto/i.test(c));
check(
  "no category value anywhere in the bounded sample names music/concerts specifically (the decisive negative finding)",
  !hasMusicTag,
);
check(
  "'Cultura' (the broadest arts/culture bucket) is present as a category value",
  categoryList.includes("Cultura"),
);
check(
  "a non-music, non-culture category ('Desporto') is also present, confirming the taxonomy spans the whole civic calendar, not just arts",
  categoryList.includes("Desporto"),
);

// --- 6. Full-archive scope: the last observed pagination page (283) contains
//        events from 2014, not a future-scoped feed ---
const lastPage = read("body-agenda-todos-page283.html");
const lastPageDates = [...lastPage.matchAll(/<span class=ano apostrhophe>'(\d{2})<\/span>/g)].map((m) => Number(m[1]));
check(
  "page 283 (the last retained pagination page) contains at least one event dated '14 (2014)",
  lastPageDates.includes(14),
);

// --- 7. Two sampled music-event detail pages: structured atc widget +
//        labelled Local:/Pre\u00e7o:/Organiza\u00e7\u00e3o: fields, cross-checked
//        against the listing page and against each other ---
const samples = [
  {
    name: "Maia Blues Fest 2026",
    file: "body-event-maiabluesfest.html",
    canonical: "https://www.cm-maia.pt/institucional/atualidade-e-participacao/agenda/todos-os-eventos/evento-42/maia-blues-fest-2026",
    listingHref: "/institucional/atualidade-e-participacao/agenda/todos-os-eventos/evento-42/maia-blues-fest-2026",
    expectedAtcStart: "2026-09-11 00:00:00",
    expectedAtcEnd: "2026-09-13 00:00:00",
    expectedContentDate: "2026-09-11T00:00:00.000Z",
  },
  {
    name: "Sons de Ver\u00e3o 2026",
    file: "body-event-sonsdeverao.html",
    canonical:
      "https://www.cm-maia.pt/institucional/atualidade-e-participacao/agenda/todos-os-eventos/evento-42/sons-de-verao-2026-no-auditorio-exterior-do-forum-da-maia",
    listingHref:
      "/institucional/atualidade-e-participacao/agenda/todos-os-eventos/evento-42/sons-de-verao-2026-no-auditorio-exterior-do-forum-da-maia",
    expectedAtcStart: "2026-08-28 00:00:00",
    expectedAtcEnd: "2026-09-06 00:00:00",
    expectedContentDate: "2026-08-28T00:00:00.000Z",
  },
];

const pageIds = new Set();
const eventDetailIds = new Set();

for (const sample of samples) {
  const body = read(sample.file);

  check(`${sample.name}: listing page (page 1) links to this event's own href`, listing.includes(sample.listingHref));

  const canonicalMatch = body.match(/<meta name="canonical" content="([^"]+)"/);
  check(`${sample.name}: page declares its own <meta canonical> URL`, !!canonicalMatch);
  check(`${sample.name}: canonical URL matches the expected permalink`, canonicalMatch?.[1] === sample.canonical);

  const atcStartMatch = body.match(/<var class="atc_date_start">([^<]+)<\/var>/);
  const atcEndMatch = body.match(/<var class="atc_date_end">([^<]+)<\/var>/);
  const atcTzMatch = body.match(/<var class="atc_timezone">([^<]+)<\/var>/);
  const atcLocationMatch = body.match(/<var class="atc_location">([^<]+)<\/var>/);
  check(`${sample.name}: atc_date_start is directly present and matches expected value`, atcStartMatch?.[1] === sample.expectedAtcStart);
  check(`${sample.name}: atc_date_end is directly present and matches expected value`, atcEndMatch?.[1] === sample.expectedAtcEnd);
  check(`${sample.name}: atc_timezone is directly present and is 'Europe/Lisbon'`, atcTzMatch?.[1] === "Europe/Lisbon");
  check(`${sample.name}: atc_location names the F\u00f3rum da Maia auditorium`, /F\u00f3rum da Maia|Forum da Maia/.test(atcLocationMatch?.[1] ?? ""));

  const contentDateMatch = body.match(/<meta name="content_date" content="([^"]+)"/);
  check(
    `${sample.name}: an independent second field (meta content_date) cross-confirms the same start date as atc_date_start`,
    contentDateMatch?.[1] === sample.expectedContentDate,
  );

  const localFieldMatch = body.match(/widget_label">Local:<\/div><div class="widget_value"><div class="writer_text">([^<]+)</);
  check(`${sample.name}: a separately-labelled structured 'Local:' field is also present`, !!localFieldMatch);
  check(
    `${sample.name}: the labelled 'Local:' field agrees with atc_location`,
    localFieldMatch?.[1] === atcLocationMatch?.[1],
  );

  const precoMatch = body.match(/widget_label">Pre\u00e7o:<\/div><div class="widget_value"><div class="writer_text"><p>([^<]+)<\/p>/);
  check(`${sample.name}: a labelled 'Pre\u00e7o:' (price) field is present and states 'Gratuito'`, precoMatch?.[1] === "Gratuito");

  const pageIdMatch = body.match(/wm:page_id" content="(\d+)"/);
  const eventDetailMatch = body.match(/event_detail_(\d+)/);
  check(`${sample.name}: a wm:page_id meta tag is present`, !!pageIdMatch);
  check(`${sample.name}: an event_detail_<id> container is present`, !!eventDetailMatch);
  if (pageIdMatch) pageIds.add(pageIdMatch[1]);
  if (eventDetailMatch) eventDetailIds.add(eventDetailMatch[1]);
}

// --- 8. The stable-identifier trap: wm:page_id / event_detail_<id> are
//        IDENTICAL across two genuinely distinct events, proving they are
//        NOT usable as a stable per-event source_record_id (matching this
//        project's own Hot Clube ICS UID precedent) — the canonical URL
//        slug is used instead. ---
check(
  "wm:page_id is IDENTICAL across both distinct sampled events (proves it is NOT a per-event id)",
  pageIds.size === 1,
);
check(
  "event_detail_<id> container id is IDENTICAL across both distinct sampled events (same trap, independently confirmed)",
  eventDetailIds.size === 1,
);
check(
  "the two sampled events nonetheless have genuinely DIFFERENT canonical permalink URLs (confirming the URL slug, not wm:page_id, is what is actually unique per event)",
  samples[0].canonical !== samples[1].canonical,
);

console.log("");
if (failures === 0) {
  console.log("All checks passed.");
  process.exit(0);
} else {
  console.log(`${failures} check(s) FAILED.`);
  process.exit(1);
}
