#!/usr/bin/env node
// Dependency-free, no-network offline proof for culturgest-porto-01.
//
// Re-parses ONLY the retained fixture files in this evidence/ directory
// (no network access, no live requests) and mechanically re-derives every
// quantitative claim this investigation's field_assessment/decision relies
// on:
//
//   1. The unfiltered agenda (body-events-xhr.html) contains exactly 35
//      event cards.
//   2. place=1 (Lisboa) + place=2 (Porto) + place=3 (Fora de Portas) event
//      counts sum to exactly that total (32 + 1 + 2 = 35) — proving the
//      source's own "place" taxonomy is a complete partition of the
//      current agenda, not a lossy/overlapping filter.
//   3. place=2 (Porto) AND typology=8 (Música) together return exactly 0
//      events — the central finding behind this investigation's DEFER
//      decision.
//   4. typology=8 (Música, all places) returns exactly 11 events, and the
//      one real Porto-tagged event (place=2, unfiltered) is typology=4
//      (Artes Visuais), not typology=8 — i.e. Porto's only current event
//      is definitely not music.
//   5. Field extraction works mechanically on two real retained detail
//      pages: the one genuine Porto event (an exhibition) and one Lisboa
//      music event (Kali Malone) — title, full date, venue name, and
//      price are each read directly from a single static DOM node
//      (DIRECT_SOURCE — no context combination needed on this source).
//
// Exits 0 and prints "OFFLINE PROOF: PASSED" only if every check holds.
// Exits 1 and prints the specific failing check otherwise.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (name) => readFileSync(path.join(here, name), "utf-8");

const failures = [];
function check(label, condition) {
  if (!condition) failures.push(label);
  console.log(`[${condition ? "PASS" : "FAIL"}] ${label}`);
}

function countEventCards(html) {
  const matches = html.match(/events-item js-masonryItem/g);
  return matches ? matches.length : 0;
}

// --- Fixture loads ---
const unfiltered = read("body-events-xhr.html");
const place1 = read("body-events-place1.html"); // Lisboa
const place2 = read("body-events-place2.html"); // Porto
const place3 = read("body-events-place3.html"); // Fora de Portas
const place2music = read("body-events-place2-music.html"); // Porto + Musica
const musicAll = read("body-events-music-all.html"); // Musica, all places
const shell = read("body-programacao.html"); // raw page shell (Level 1)
const detailOrmsson = read("body-detail-ormsson.html"); // the one Porto event
const detailKaliMalone = read("body-detail-kalimalone.html"); // a Lisboa music event

// --- Check 1: Level 1 raw shell has an empty event container ---
check(
  "raw page shell's own event container (js-eventContainer) is present but empty (client/AJAX-populated, matching the existing sources/porto.json note)",
  /class="events-section js-eventContainer[^"]*"><\/div>/.test(shell),
);

// --- Check 2: total counts ---
const totalCount = countEventCards(unfiltered);
const lisboaCount = countEventCards(place1);
const portoCount = countEventCards(place2);
const foraCount = countEventCards(place3);
check("unfiltered agenda contains exactly 35 event cards", totalCount === 35);
check("place=1 (Lisboa) contains exactly 32 event cards", lisboaCount === 32);
check("place=2 (Porto) contains exactly 1 event card", portoCount === 1);
check("place=3 (Fora de Portas) contains exactly 2 event cards", foraCount === 2);
check(
  "place partition sums to the unfiltered total (32 + 1 + 2 = 35) — the source's own place taxonomy is a complete, non-overlapping partition of the current agenda",
  lisboaCount + portoCount + foraCount === totalCount,
);

// --- Check 3: the central finding — Porto has zero music events ---
const portoMusicCount = countEventCards(place2music);
check("place=2 AND typology=8 (Porto + Música) returns exactly 0 event cards", portoMusicCount === 0);

// --- Check 4: music (all places) count, and the one Porto event's typology ---
const musicAllCount = countEventCards(musicAll);
check("typology=8 (Música, all places) returns exactly 11 event cards", musicAllCount === 11);

const portoEventIsVisualArts = /data-property="typology" data-id="4" class="type js-Filter">Artes Visuais</.test(place2);
const portoEventIsNotMusic = !/data-property="typology" data-id="8" class="type js-Filter">Música</.test(place2);
check(
  "the one Porto-tagged event's own typology tag is 'Artes Visuais' (id=4), not 'Música' (id=8)",
  portoEventIsVisualArts && portoEventIsNotMusic,
);

// --- Check 5: field extraction on the real retained detail pages (DIRECT_SOURCE) ---

// 5a. The one Porto event (an exhibition, not music) — title/date/venue/price
const ormssonTitle = detailOrmsson.match(/<h1>([^<]+)<\/h1>/)?.[1] ?? null;
const ormssonDate = detailOrmsson.match(/event-info-block date"><p>([^<]+)<br \/>\s*[–-]\s*([^<]+)<\/p>/)?.slice(1, 3) ?? null;
const ormssonVenue = /event-info-block highlight">\s*Culturgest Porto<br/.test(detailOrmsson);
const ormssonPrice = /Entrada gratuita/.test(detailOrmsson);

check('Porto event title extracted directly from <h1>: "A Colecção Ormsson apresentada por João Penalva"', ormssonTitle === "A Colecção Ormsson apresentada por João Penalva");
check("Porto event date range extracted directly from event-info-block: starts '3 OUT 2026'", ormssonDate?.[0]?.trim() === "3 OUT 2026");
check("Porto event date range extracted directly from event-info-block: ends '10 JAN 2027'", ormssonDate?.[1]?.trim() === "10 JAN 2027");
check('Porto event venue name "Culturgest Porto" stated directly in event-info-block highlight', ormssonVenue);
check('Porto event price "Entrada gratuita" stated directly in the same highlight block', ormssonPrice);

// 5b. A Lisboa music event (Kali Malone) — same template, full date + time + venue + price
const kaliDate = detailKaliMalone.match(/event-info-block date"><p>([^<]+)<br \/>([^<]+)<\/p>/)?.slice(1, 3) ?? null;
const kaliVenue = /event-info-block highlight">\s*Auditório Emílio Rui Vilar<br/.test(detailKaliMalone);
const kaliPrice = /18&euro;/.test(detailKaliMalone);

check("Lisboa music event (Kali Malone) date extracted directly: '23 SET 2026'", kaliDate?.[0]?.trim() === "23 SET 2026");
check("Lisboa music event (Kali Malone) time extracted directly: 'QUA 21:00'", kaliDate?.[1]?.trim() === "QUA 21:00");
check('Lisboa music event venue "Auditório Emílio Rui Vilar" stated directly', kaliVenue);
check("Lisboa music event price '18€' stated directly", kaliPrice);

console.log("");
if (failures.length === 0) {
  console.log("OFFLINE PROOF: PASSED");
  process.exit(0);
} else {
  console.log(`OFFLINE PROOF: FAILED (${failures.length} check(s))`);
  for (const f of failures) console.log(` - ${f}`);
  process.exit(1);
}
