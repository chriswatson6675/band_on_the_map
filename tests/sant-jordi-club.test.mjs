import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseSantJordiListingLinks, parseSantJordiEventPage } from "../ingestion/sant-jordi-club/discovery.mjs";
import { toObservation } from "../ingestion/sant-jordi-club/observation-adapter.mjs";

async function loadFixture(name) {
  return readFile(new URL(`../fixtures/sant-jordi-club/${name}`, import.meta.url), "utf8");
}

test("parseSantJordiListingLinks extracts candidate links and excludes known navigation pages", async () => {
  const links = parseSantJordiListingLinks(await loadFixture("listing.html"));
  const slugs = links.map((l) => l.slug);
  assert.ok(slugs.includes("airbag"));
  assert.ok(slugs.includes("placebo"));
  assert.ok(!slugs.includes("accessibility"));
  assert.ok(!slugs.includes("history"));
  assert.ok(!slugs.includes("sant-jordi-club"));
  assert.equal(new Set(slugs).size, slugs.length, "no duplicates");
});

test("parseSantJordiListingLinks throws for empty input", () => {
  assert.throws(() => parseSantJordiListingLinks(""), /non-empty/);
});

test("parseSantJordiEventPage extracts address/startDate/title from the real retained Airbag event page", async () => {
  const html = await loadFixture("event-airbag.html");
  const record = parseSantJordiEventPage(html, { slug: "airbag", url: "https://palausantjordi.barcelona/en/airbag" });
  assert.ok(record);
  assert.equal(record.title, "Airbag");
  assert.equal(record.start_local, "2026-09-18T18:00:00");
  assert.equal(record.hall, "Sant Jordi Club");
  assert.equal(record.source_record_id, "airbag");
});

test("parseSantJordiEventPage returns null for a page naming a different hall", () => {
  const html = '<html><script>let address = "Palau Sant Jordi"; let startDate = "2026-10-01T20:00:00";</script></html>';
  assert.equal(parseSantJordiEventPage(html, { slug: "other" }), null);
});

test("parseSantJordiEventPage returns null (not throws) for a page with no address/startDate variables at all", () => {
  assert.equal(parseSantJordiEventPage("<html><body>a plain nav page</body></html>"), null);
});

test("parseSantJordiEventPage returns null for empty/missing input", () => {
  assert.equal(parseSantJordiEventPage(""), null);
  assert.equal(parseSantJordiEventPage(null), null);
});

test("toObservation maps a floating-local start/end and never invents a venue_name", () => {
  const observation = toObservation(
    { source_record_id: "airbag", title: "Airbag", event_url: "https://palausantjordi.barcelona/en/airbag", start_local: "2026-09-18T18:00:00", end_local: null, hall: "Sant Jordi Club" },
    { retrievedAt: "2026-08-26T00:00:00.000Z" },
  );
  assert.equal(observation.source_id, "sant-jordi-club-barcelona");
  assert.equal(observation.start.certainty, "FLOATING_LOCAL");
  assert.equal(observation.start.date, "2026-09-18");
  assert.equal(observation.venue_name, null);
  assert.equal(observation.source_fields.hall, "Sant Jordi Club");
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({}), /non-empty source_record_id/);
});
