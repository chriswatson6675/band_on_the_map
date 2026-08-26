import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseAnellaOlimpicaListingLinks, parseAnellaOlimpicaEventPage } from "../ingestion/anella-olimpica/discovery.mjs";
import { toObservation, toObservations } from "../ingestion/anella-olimpica/observation-adapter.mjs";

async function loadFixture(relativePath) {
  return readFile(new URL(`../research/source-investigations/${relativePath}`, import.meta.url), "utf8");
}

test("parseAnellaOlimpicaListingLinks extracts real, deduplicated candidate links from the retained listing", async () => {
  const html = await loadFixture("palau-sant-jordi-barcelona-01/evidence/listing.html");
  const links = parseAnellaOlimpicaListingLinks(html);
  assert.ok(links.length > 0);
  assert.ok(links.some((l) => l.slug === "aitana-september-4th-5th-7th-8th"));
  assert.ok(!links.some((l) => l.slug === "accessibility"));
});

test("parseAnellaOlimpicaListingLinks rejects empty input", () => {
  assert.throws(() => parseAnellaOlimpicaListingLinks(""), /non-empty/);
});

test("parseAnellaOlimpicaEventPage is hall-agnostic: retains a Palau Sant Jordi event", async () => {
  const html = await loadFixture("palau-sant-jordi-barcelona-01/evidence/event-aitana.html");
  const record = parseAnellaOlimpicaEventPage(html, { slug: "aitana-september-4th-5th-7th-8th", url: "https://palausantjordi.barcelona/en/aitana-september-4th-5th-7th-8th" });
  assert.ok(record);
  assert.equal(record.hall, "Palau Sant Jordi");
  assert.equal(record.start_local, "2026-09-04T19:00:00");
  assert.match(record.title, /Aitana/);
});

test("parseAnellaOlimpicaEventPage decodes a \\uXXXX-escaped hall name (Estadi Olímpic, real retained evidence)", async () => {
  const html = await loadFixture("estadi-olimpic-lluis-companys-barcelona-01/evidence/event-weeknd.html");
  const record = parseAnellaOlimpicaEventPage(html, { slug: "weeknd-0", url: "https://palausantjordi.barcelona/en/weeknd-0" });
  assert.ok(record);
  assert.equal(record.hall, "Estadi Olímpic");
  assert.equal(record.start_local, "2026-09-01T18:00:00");
});

test("parseAnellaOlimpicaEventPage returns null (never throws) for a non-event page with no address/startDate", () => {
  assert.equal(parseAnellaOlimpicaEventPage("<html><body>no data here</body></html>", { slug: "visit", url: "x" }), null);
  assert.equal(parseAnellaOlimpicaEventPage("", {}), null);
});

test("toObservation resolves by source_id, is generic over config.source_id, and requires it", () => {
  const record = { source_record_id: "s1", title: "T", start_local: "2026-09-04T19:00:00", hall: "Palau Sant Jordi" };
  const observation = toObservation(record, { source_id: "palau-sant-jordi-barcelona" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(observation.source_id, "palau-sant-jordi-barcelona");
  assert.equal(observation.venue_name, null);
  assert.equal(observation.source_fields.hall, "Palau Sant Jordi");
  assert.throws(() => toObservation(record, {}), /config.source_id/);
  assert.throws(() => toObservation({}, { source_id: "x" }), /non-empty source_record_id/);
});

test("toObservations maps real retained Estadi Olímpic + Palau Sant Jordi records independently", async () => {
  const psjHtml = await loadFixture("palau-sant-jordi-barcelona-01/evidence/event-aitana.html");
  const psjRecord = parseAnellaOlimpicaEventPage(psjHtml, { slug: "aitana-september-4th-5th-7th-8th", url: "https://palausantjordi.barcelona/en/aitana-september-4th-5th-7th-8th" });
  const psjObservations = toObservations([psjRecord], { source_id: "palau-sant-jordi-barcelona" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(psjObservations.length, 1);
  assert.equal(psjObservations[0].source_id, "palau-sant-jordi-barcelona");

  const eoHtml = await loadFixture("estadi-olimpic-lluis-companys-barcelona-01/evidence/event-weeknd.html");
  const eoRecord = parseAnellaOlimpicaEventPage(eoHtml, { slug: "weeknd-0", url: "https://palausantjordi.barcelona/en/weeknd-0" });
  const eoObservations = toObservations([eoRecord], { source_id: "estadi-olimpic-lluis-companys-barcelona" }, { retrievedAt: "2026-08-26T00:00:00.000Z" });
  assert.equal(eoObservations.length, 1);
  assert.equal(eoObservations[0].source_id, "estadi-olimpic-lluis-companys-barcelona");
});
