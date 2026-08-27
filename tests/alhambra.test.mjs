import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { discoverEventUrls } from "../ingestion/alhambra/discovery.mjs";
import { parseEventDetailPage, parseDateBadge, toObservation } from "../ingestion/alhambra/observation-adapter.mjs";

async function homepageHtml() {
  return readFile(new URL("../fixtures/alhambra-paris/homepage.html", import.meta.url), "utf8");
}
async function kaarijaHtml() {
  return readFile(new URL("../fixtures/alhambra-paris/event-kaarija.html", import.meta.url), "utf8");
}

const KAARIJA_URL = "https://www.alhambra-paris.com/kaarija-lo4380.html";

test("discoverEventUrls: the real retained homepage yields many real event links (title+href only, no dates)", async () => {
  const urls = discoverEventUrls(await homepageHtml());
  assert.ok(urls.length > 30, `expected >30 event links, got ${urls.length}`);
  assert.ok(urls.includes(KAARIJA_URL));
  assert.equal(new Set(urls).size, urls.length, "every discovered URL must be unique");
});

test("REGRESSION: the homepage's own card ordering would mislead a naive date/title extraction — proving the hazard this collector deliberately avoids", async () => {
  const html = await homepageHtml();
  // A NAIVE (and WRONG) extraction: pair each "<strong>WEEKDAY DD MONTH YYYY</strong>"
  // with the NEXT event link that follows it in raw document order — this
  // is exactly the mistake ingestion/alhambra/discovery.mjs deliberately
  // does NOT make (see its own doc comment).
  const naiveRe = /<strong>([A-ZÀ-Ü]+ \d{1,2} [A-ZÀ-Ü]+ \d{4})<\/strong>.*?<a href='([a-z0-9-]+-lo\d+\.html)'>/gs;
  let m;
  let naiveKaarijaDate = null;
  while ((m = naiveRe.exec(html)) !== null) {
    if (m[2] === "kaarija-lo4380.html") {
      naiveKaarijaDate = m[1];
      break;
    }
  }
  assert.ok(naiveKaarijaDate, "the naive pattern should still find SOME date paired with kaarija's link");

  const correctRecord = parseEventDetailPage(await kaarijaHtml(), KAARIJA_URL);

  // The naive homepage-order pairing gives the WRONG date for Kaarija; the
  // real per-event detail page (what this collector actually uses) gives
  // the correct one. Proving these differ is exactly proving the hazard
  // is real, and that the built collector avoids it by never trusting the
  // homepage for dates at all.
  assert.equal(correctRecord.date, "2026-10-16", "the collector's own per-detail-page date must be the correct one");
  assert.notEqual(
    naiveKaarijaDate.trim(),
    "VENDREDI 16 OCTOBRE 2026",
    "the naive homepage-order pairing must NOT already agree with the correct date — otherwise this isn't testing the hazard",
  );
});

test("parseDateBadge: parses this platform's own French weekday+date badge; rejects unrecognised shapes", () => {
  assert.equal(parseDateBadge("VENDREDI 16 OCTOBRE 2026"), "2026-10-16");
  assert.equal(parseDateBadge("not a date"), null);
  assert.equal(parseDateBadge("LUNDI 6 NOVEMBRE 2026"), "2026-11-06");
});

test("parseEventDetailPage: real Kaarija detail page yields correct title/date/hour/price/id", async () => {
  const record = parseEventDetailPage(await kaarijaHtml(), KAARIJA_URL);
  assert.equal(record.title, "KÄÄRIJÄ");
  assert.equal(record.date, "2026-10-16");
  assert.equal(record.startHour, 19);
  assert.equal(record.sourceRecordId, "4380");
  assert.match(record.priceText, /^30,65 EUR/);
});

test("toObservation: real Kaarija record adapts correctly, FLOATING_LOCAL certainty", async () => {
  const record = parseEventDetailPage(await kaarijaHtml(), KAARIJA_URL);
  const obs = toObservation(record, { retrievedAt: "2026-08-26T13:58:00Z" });
  assert.equal(obs.source_id, "alhambra-paris");
  assert.equal(obs.source_record_id, "4380");
  assert.equal(obs.start.date, "2026-10-16");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "Alhambra");
  assert.equal(obs.location_text, "21 rue Yves Toudic, 75010 Paris");
  assert.equal(obs.event_url, KAARIJA_URL);
  assert.match(obs.price_text, /EUR/);
});

test("parseEventDetailPage throws on malformed input; discoverEventUrls throws on empty html", async () => {
  assert.throws(() => parseEventDetailPage("<html></html>", KAARIJA_URL), /own <h2> title/);
  const titleOnlyHtml = "<div class='categorie'>POP</div> <h2>TITLE</h2>";
  assert.throws(() => parseEventDetailPage(titleOnlyHtml, KAARIJA_URL), /date badge/);
  assert.throws(() => discoverEventUrls(""), /non-empty/);
});
