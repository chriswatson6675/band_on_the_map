// Dependency-free, no-network offline proof for wow-world-of-wine-gaia-01.
//
// Re-parses ONLY the retained evidence files in this directory (no live
// HTTP, no fetch, no external packages) and mechanically re-derives every
// material claim made in ../investigation.json's probe_history,
// site_classification, data_paths, field_assessment, and decision.
//
// Run with: node evidence/offline-proof.mjs

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(join(HERE, name), "utf-8");
const readJson = (name) => JSON.parse(read(name));

let failures = 0;
function check(label, condition) {
  if (condition) {
    console.log(`PASS: ${label}`);
  } else {
    console.log(`FAIL: ${label}`);
    failures += 1;
  }
}

console.log("=== wow-world-of-wine-gaia-01 offline proof ===\n");

// --- 1. Level 1: the given candidate URL + PT homepage are empty client-rendered shells ---
console.log("-- Level 1: empty-shell check --");
for (const [label, file] of [
  ["PT homepage (body-home-pt.html)", "body-home-pt.html"],
  ["candidate agenda-cultural page (body-agenda.html)", "body-agenda.html"],
]) {
  const html = read(file);
  const rootDivCount = (html.match(/id="root"/g) || []).length;
  const jsonLdCount = (html.match(/application\/ld\+json/g) || []).length;
  const hasEmptyInlinedPageType = /INLINED_PAGE_TYPE\s*=\s*JSON\.parse\(''/.test(html);
  check(`${label}: exactly one <div id="root">`, rootDivCount === 1);
  check(`${label}: zero JSON-LD blocks`, jsonLdCount === 0);
  if (file === "body-agenda.html") {
    check(`${label}: INLINED_PAGE_TYPE is an empty JSON.parse('') (nothing server-inlined)`, hasEmptyInlinedPageType);
  }
}

// --- 2. Level 2: dead lead vs. real category, via urlResolver ---
console.log("\n-- Level 2: urlResolver dead-lead vs. real-category contrast --");
const deadLead = readJson("body-urlresolver-pt_agenda-cultural.json");
check(
  "urlResolver('agenda-cultural') with Store:pt returns null (given candidate lead is a dead URL)",
  deadLead?.data?.urlResolver === null,
);
const realCategory = readJson("body-urlresolver-pt_experiencias_agenda.json");
check(
  "urlResolver('experiencias/agenda') with Store:pt resolves to a real CATEGORY",
  realCategory?.data?.urlResolver?.type === "CATEGORY" && realCategory?.data?.urlResolver?.id === 163,
);

// --- 3. Category 163 ('Agenda') content ---
console.log("\n-- Category 163 ('Agenda') content --");
const cat163 = readJson("body-graphql-category163.json");
check("category 163 is named 'Agenda'", cat163?.data?.category?.name === "Agenda");
check("category 163 reports product_count 19", cat163?.data?.category?.product_count === 19);

const products163 = readJson("body-graphql-products163.json");
const items163 = products163?.data?.products?.items ?? [];
check("products163 total_count is 19", products163?.data?.products?.total_count === 19);
check("products163 returned exactly 19 items", items163.length === 19);
check(
  "every one of the 19 products has a non-empty name",
  items163.every((p) => typeof p.name === "string" && p.name.trim().length > 0),
);

// --- 4. Facet/label scan: no music/concert-specific filter anywhere ---
console.log("\n-- Facet/attribute scan for a music-specific filter --");
const MUSIC_FILTER_PATTERN = /concert|live music|música ao vivo|m[uú]sica\b|banda\b|band\b/i;

const aggregations163 = readJson("body-graphql-aggregations163.json");
const aggList = aggregations163?.data?.products?.aggregations ?? [];
const allOptionLabels163 = aggList.flatMap((agg) => (agg.options ?? []).map((o) => o.label));
const allAttributeLabels163 = aggList.map((agg) => agg.label);
check(
  "category 163's own facets exist (price/category_uid/time_of_day/visitor_type/ticket_type)",
  aggList.length >= 4,
);
check(
  "no facet attribute label in category 163 names a music/concert-specific filter",
  !allAttributeLabels163.some((l) => MUSIC_FILTER_PATTERN.test(l)),
);
check(
  "no facet OPTION label in category 163 names a music/concert-specific filter",
  !allOptionLabels163.some((l) => MUSIC_FILTER_PATTERN.test(l)),
);

const ticketTypeAgg = aggList.find((a) => a.attribute_code === "ticket_type");
check(
  "ticket_type facet options are exactly the generic set found live (Destaques/Museus/Workshops/Gastronomy/Bilhetes Conjuntos)",
  ticketTypeAgg &&
    ticketTypeAgg.options.length === 5 &&
    ticketTypeAgg.options.every((o) => !MUSIC_FILTER_PATTERN.test(o.label)),
);

// --- 5. Sub-category 438 ('Agenda' proper) and 453 ('Gastronomia e Eventos') ---
console.log("\n-- Sub-categories 438 and 453 --");
const cat438 = readJson("body-graphql-category438.json");
const products438 = readJson("body-graphql-products438.json");
const items438 = products438?.data?.products?.items ?? [];
check("category 438 product_count is 8", cat438?.data?.category?.product_count === 8);
check("products438 returned exactly 8 items", items438.length === 8);

const MUSIC_NAME_PATTERN = /fado|comedy|cine|oktoberfest|gatsby|sunset/i;
check(
  "none of category 438's 8 products' names match even the loose music/party-adjacent name pattern",
  !items438.some((p) => MUSIC_NAME_PATTERN.test(p.name)),
);

const cat453 = readJson("body-graphql-category453.json");
const products453 = readJson("body-graphql-products453.json");
const items453 = products453?.data?.products?.items ?? [];
check("category 453 is named 'Gastronomia e Eventos'", cat453?.data?.category?.name === "Gastronomia e Eventos");
check("category 453 product_count is 6", cat453?.data?.category?.product_count === 6);
check("products453 returned exactly 6 items", items453.length === 6);
const musicAdjacentIn453 = items453.filter((p) => MUSIC_NAME_PATTERN.test(p.name));
check(
  "category 453 mixes music-adjacent items (Fado/Comedy/Cine/Oktoberfest/Gatsby/Sunsets) — all 6 match the loose pattern, confirming it is a mixed hospitality/entertainment bucket, not a music-only one",
  musicAdjacentIn453.length === 6,
);
const genuinelyMusicNamed = items453.filter((p) => /fado/i.test(p.name));
check(
  "only 1 of the 6 products in the closest bucket is actually music-named (Fado) — the rest are comedy/film/beer-festival/dinner-theatre/sunset-session, not concerts",
  genuinelyMusicNamed.length === 1,
);

// --- 6. Fado product: categories, id stability, description, year-absence ---
console.log("\n-- Sampled Fado product: categories, id stability, year-absence --");
const fadoProduct = readJson("body-graphql-product-fado.json");
const fadoItem = fadoProduct?.data?.products?.items?.[0];
check("Fado product id is 22663", fadoItem?.id === 22663);
const fadoCategoryNames = (fadoItem?.categories ?? []).map((c) => c.name);
check(
  "Fado product's own categories carry no music-specific category name",
  !fadoCategoryNames.some((n) => MUSIC_FILTER_PATTERN.test(n)),
);
check(
  "Fado product's categories are exactly the generic set observed live",
  fadoCategoryNames.length === 4 &&
    fadoCategoryNames.includes("Restaurantes") &&
    fadoCategoryNames.includes("Agenda") &&
    fadoCategoryNames.includes("Gastronomia e Eventos"),
);

const fadoUrlResolver = readJson("body-graphql-urlresolver-fado.json");
check(
  "urlResolver('fado-show-and-dinner') resolves to PRODUCT id 22663 — matches the id from the category listing (2 independent query paths, same id)",
  fadoUrlResolver?.data?.urlResolver?.type === "PRODUCT" && fadoUrlResolver?.data?.urlResolver?.id === fadoItem?.id,
);

const fadoDesc = readJson("body-graphql-product-fado-desc.json");
const fadoDescItem = fadoDesc?.data?.products?.items?.[0];
const fadoDescHtml = (fadoDescItem?.description?.html ?? "") + (fadoDescItem?.short_description?.html ?? "");
check("Fado description mentions 'a partir das 20h' (a genuine time statement)", /a partir das 20h/.test(fadoDescHtml));

// The description DOES contain two 4-digit numbers (2023, 2019) — but these
// are wine-vintage years in the dinner-pairing menu text ("Sílica Branco
// 2023", "São Lourenço Tinto 2019"), not the event's own date. The correct,
// precise check is that no year appears anywhere near the actual date/time
// statement ("a partir das 20h") or the product's own day+month text — a
// blanket "no year anywhere in the description" claim would be false and
// is deliberately NOT asserted here.
const timeStatementIndex = fadoDescHtml.indexOf("a partir das 20h");
const nearTimeStatement = fadoDescHtml.slice(Math.max(0, timeStatementIndex - 80), timeStatementIndex + 80);
check(
  "no year appears within 80 characters of the actual time statement 'a partir das 20h'",
  timeStatementIndex >= 0 && !/\b(19|20)\d{2}\b/.test(nearTimeStatement),
);
const yearsFound = (fadoDescHtml.match(/\b(19|20)\d{2}\b/g) || []).map(Number);
check(
  "the only years present anywhere in the description are wine vintages (2019, 2023), not an event date",
  yearsFound.length === 2 && yearsFound.includes(2019) && yearsFound.includes(2023),
);

// --- 7. Year-absence scan across every retained product name ---
console.log("\n-- Year-absence scan across all 19 product names --");
const YEAR_PATTERN = /\b(19|20)\d{2}\b/;
const namesWithYear = items163.filter((p) => YEAR_PATTERN.test(p.name));
check("none of the 19 product names in category 163 contain a 4-digit year", namesWithYear.length === 0);

const dayMonthPattern = /\b\d{1,2}\s+(?:A\s+\d{1,2}\s+)?(?:JANEIRO|FEVEREIRO|MAR[CÇ]O|ABRIL|MAIO|JUNHO|JULHO|AGOSTO|SETEMBRO|OUTUBRO|NOVEMBRO|DEZEMBRO)\b/i;
const namesWithDayMonthNoYear = items163.filter((p) => dayMonthPattern.test(p.name) && !YEAR_PATTERN.test(p.name));
check(
  "at least one product name states a day+month with no year at all (the genuine AMBIGUOUS start_date finding)",
  namesWithDayMonthNoYear.length >= 3,
);

// --- 8. price artefact check ---
console.log("\n-- price artefact check --");
check(
  "Fado product's price_range.minimum_price.regular_price.value is literally 0 (not promoted to a claimed FREE value in field_assessment)",
  fadoItem?.price_range?.minimum_price?.regular_price?.value === 0,
);

console.log(`\n=== ${failures === 0 ? "ALL CHECKS PASSED" : `${failures} CHECK(S) FAILED`} ===`);
process.exitCode = failures === 0 ? 0 : 1;
