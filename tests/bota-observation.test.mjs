import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { parseBotaDiscovery } from "../ingestion/bota/discovery.mjs";
import { SOURCE_ID, stableIdFromUid, toObservation, toObservations } from "../ingestion/bota/observation-adapter.mjs";
import { resolveBotaObservation, resolveObservation } from "../ingestion/venue/resolver.mjs";

const EVENTS_DIR = new URL("../fixtures/bota/events/", import.meta.url);

async function loadEntries() {
  const metadata = JSON.parse(await readFile(new URL("../fixtures/bota/metadata.json", import.meta.url), "utf8"));
  const names = (await readdir(EVENTS_DIR)).filter((f) => f.endsWith(".ics")).sort();
  const entries = [];
  for (const name of names) {
    const slug = name.replace(/\.ics$/, "");
    const request = metadata.requests_made.find((r) => r.slug === slug);
    entries.push({
      slug,
      eventUrl: `https://www.botaanjos.com/programacao/${slug}`,
      icsUrl: request?.url ?? null,
      icsText: await readFile(new URL(name, EVENTS_DIR), "utf8"),
      fixturePath: `fixtures/bota/events/${name}`,
    });
  }
  return { entries, metadata };
}

// 2. BOTA source discovery/ICS -> Observation.

test("discovery: real retained programme-index excerpt yields real slugs with matching ics/event URLs", async () => {
  const html = await readFile(new URL("../fixtures/bota/discovery/programacao-excerpt.html", import.meta.url), "utf8");
  const records = parseBotaDiscovery(html);
  assert.ok(records.length >= 3);
  for (const record of records) {
    assert.equal(record.event_url, `https://www.botaanjos.com/programacao/${record.slug}`);
    assert.equal(record.ics_url, `https://www.botaanjos.com/programacao/${record.slug}?format=ical`);
  }
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseBotaDiscovery(""), /non-empty/);
});

test("all retained ICS fixtures adapt to Observations, one per file", async () => {
  const { entries, metadata } = await loadEntries();
  assert.ok(entries.length >= 3);
  const observations = toObservations(entries, { retrievedAt: metadata.retrieved_at });
  assert.equal(observations.length, entries.length);
  for (const o of observations) {
    assert.equal(o.source_id, SOURCE_ID);
    assert.equal(o.source_id, "bota-anjos");
  }
});

test("location_text carries the exact retained LOCATION string, consistently across events", async () => {
  const { entries, metadata } = await loadEntries();
  const observations = toObservations(entries, { retrievedAt: metadata.retrieved_at });
  const expected = "BOTA, Largo de Santa Barbara, 3D, Lisboa, Portugal"; // the ICS's own exact spelling — no accent
  for (const o of observations) {
    assert.equal(o.location_text, expected);
    assert.equal(o.venue_name, null, "combined address string is never split into a guessed venue name");
  }
});

// 6. null source facts remain null; GEO must never leak into coordinates.

test("the ICS GEO field is retained only as ics_geo_untrusted, never as a usable coordinate anywhere", async () => {
  const { entries, metadata } = await loadEntries();
  const observations = toObservations(entries, { retrievedAt: metadata.retrieved_at });
  for (const o of observations) {
    assert.equal(typeof o.source_fields.ics_geo_untrusted, "string");
    assert.ok(o.source_fields.ics_geo_untrusted.includes(";"));
    const keys = Object.keys(o);
    for (const forbidden of ["latitude", "longitude", "coordinates", "geo"]) {
      assert.equal(keys.includes(forbidden), false);
    }
    assert.equal(o.price_text, null);
  }
});

// 7. venue resolution fails closed for unknown/ambiguous venue data.

test("resolveBotaObservation resolves the exact known location_text; an unmapped one fails closed", async () => {
  const { entries, metadata } = await loadEntries();
  const [observation] = toObservations(entries, { retrievedAt: metadata.retrieved_at });
  const resolved = resolveBotaObservation(observation);
  assert.equal(resolved.resolution_status, "RESOLVED");
  assert.equal(resolved.venue_id, "venue-lisboa-bota-anjos");
  assert.equal(resolveObservation(observation).venue_id, "venue-lisboa-bota-anjos");

  const unknown = resolveBotaObservation({ source_id: "bota-anjos", location_text: "Somewhere Else Entirely" });
  assert.equal(unknown.resolution_status, "UNRESOLVED");
  assert.equal(unknown.venue_id, null);
});

test("BOTA resolves to a venue that is ADDRESS_ONLY — never a map marker without evidenced coordinates", async () => {
  const registry = JSON.parse(await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"));
  const venue = registry.venues.find((v) => v.venue_id === "venue-lisboa-bota-anjos");
  assert.equal(venue.location_status, "ADDRESS_ONLY");
  assert.equal(venue.latitude, null);
  assert.equal(venue.longitude, null);
});

test("toObservation throws if more or less than one VEVENT is present", async () => {
  const { entries } = await loadEntries();
  assert.throws(() => toObservation({ ...entries[0], icsText: "BEGIN:VCALENDAR\nEND:VCALENDAR" }), /VEVENT/);
});

test("stableIdFromUid: same helper contract as Village Underground's", () => {
  assert.equal(stableIdFromUid("69fcd3b59be3aa15781fea66@squarespace.com"), "69fcd3b59be3aa15781fea66");
  assert.throws(() => stableIdFromUid(""), /non-empty/);
});

test("adaptation is deterministic against the same retained fixtures", async () => {
  const { entries, metadata } = await loadEntries();
  assert.deepEqual(
    toObservations(entries, { retrievedAt: metadata.retrieved_at }),
    toObservations(entries, { retrievedAt: metadata.retrieved_at }),
  );
});
