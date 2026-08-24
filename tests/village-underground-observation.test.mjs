import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";
import { parseVillageUndergroundDiscovery } from "../ingestion/village-underground/discovery.mjs";
import {
  SOURCE_ID,
  stableIdFromUid,
  toObservation,
  toObservations,
} from "../ingestion/village-underground/observation-adapter.mjs";
import { resolveObservation, resolveVillageUndergroundObservation } from "../ingestion/venue/resolver.mjs";

const EVENTS_DIR = new URL("../fixtures/village-underground/events/", import.meta.url);

async function loadEntries() {
  const metadata = JSON.parse(
    await readFile(new URL("../fixtures/village-underground/metadata.json", import.meta.url), "utf8"),
  );
  const names = (await readdir(EVENTS_DIR)).filter((f) => f.endsWith(".ics")).sort();
  const entries = [];
  for (const name of names) {
    const slug = name.replace(/\.ics$/, "");
    const request = metadata.requests_made.find((r) => r.slug === slug);
    entries.push({
      slug,
      eventUrl: `https://vulisboa.com/eventos/${slug}`,
      icsUrl: request?.url ?? null,
      icsText: await readFile(new URL(name, EVENTS_DIR), "utf8"),
      fixturePath: `fixtures/village-underground/events/${name}`,
    });
  }
  return { entries, metadata };
}

// 1. Village Underground source discovery/ICS -> Observation.

test("discovery: real retained events-index excerpt yields real slugs with matching ics/event URLs", async () => {
  const html = await readFile(
    new URL("../fixtures/village-underground/discovery/events-index-excerpt.html", import.meta.url),
    "utf8",
  );
  const records = parseVillageUndergroundDiscovery(html);
  assert.ok(records.length >= 3);
  for (const record of records) {
    assert.equal(record.event_url, `https://vulisboa.com/eventos/${record.slug}`);
    assert.equal(record.ics_url, `https://vulisboa.com/eventos/${record.slug}?format=ical`);
  }
});

test("discovery deduplicates by slug and rejects empty input", async () => {
  assert.throws(() => parseVillageUndergroundDiscovery(""), /non-empty/);
  const html = `<a href="/eventos/x?format=ical">x</a><a href="/eventos/x?format=ical">x again</a>`;
  assert.equal(parseVillageUndergroundDiscovery(html).length, 1);
});

test("all retained ICS fixtures adapt to Observations, one per file", async () => {
  const { entries, metadata } = await loadEntries();
  assert.ok(entries.length >= 3);
  const observations = toObservations(entries, { retrievedAt: metadata.retrieved_at });
  assert.equal(observations.length, entries.length);
  for (const o of observations) {
    assert.equal(o.source_id, SOURCE_ID);
    assert.equal(o.source_id, "village-underground-lisboa");
  }
});

// 5. provenance/source identity survives adaptation.

test("source_record_id is the stable Squarespace UID local part, not the full UID", async () => {
  const { entries, metadata } = await loadEntries();
  const observations = toObservations(entries, { retrievedAt: metadata.retrieved_at });
  for (const [i, o] of observations.entries()) {
    assert.equal(typeof o.source_record_id, "string");
    assert.ok(o.source_record_id.length > 0);
    assert.equal(o.source_record_id, stableIdFromUid(o.source_fields.ics_uid));
    assert.notEqual(o.source_record_id, o.source_fields.ics_uid, "must be the local part, not the full UID");
    assert.equal(o.source_fields.slug, entries[i].slug);
    assert.equal(o.event_url, entries[i].eventUrl);
  }
});

test("stableIdFromUid strips the @squarespace.com suffix; throws on empty input", () => {
  assert.equal(stableIdFromUid("6a60b47982c93f6404454bfe@squarespace.com"), "6a60b47982c93f6404454bfe");
  assert.equal(stableIdFromUid("no-at-sign"), "no-at-sign");
  assert.throws(() => stableIdFromUid(""), /non-empty/);
  assert.throws(() => stableIdFromUid(null), /non-empty/);
});

// 6. null source facts remain null rather than being filled from another source.

test("venue_name/location_text/price_text/description are honestly null when the ICS carries none", async () => {
  const { entries, metadata } = await loadEntries();
  const observations = toObservations(entries, { retrievedAt: metadata.retrieved_at });
  for (const o of observations) {
    assert.equal(o.venue_name, null);
    assert.equal(o.location_text, null);
    assert.equal(o.price_text, null);
  }
});

test("no top-level canonical Event identity field is ever produced", async () => {
  const { entries, metadata } = await loadEntries();
  const observations = toObservations(entries, { retrievedAt: metadata.retrieved_at });
  for (const o of observations) {
    const keys = Object.keys(o);
    for (const forbidden of ["event_id", "canonical_event_id", "canonicalEventId"]) {
      assert.equal(keys.includes(forbidden), false);
    }
  }
});

test("toObservation throws if more or less than one VEVENT is present", async () => {
  const { entries } = await loadEntries();
  assert.throws(() => toObservation({ ...entries[0], icsText: "BEGIN:VCALENDAR\nEND:VCALENDAR" }), /VEVENT/);
});

// 7. venue resolution: fixed single-venue source, resolved by source_id
// (this source's own ICS never carries a location field at all).

test("every Village Underground Observation resolves to the canonical Village Underground venue", async () => {
  const { entries, metadata } = await loadEntries();
  const observations = toObservations(entries, { retrievedAt: metadata.retrieved_at });
  for (const o of observations) {
    const result = resolveVillageUndergroundObservation(o);
    assert.equal(result.resolution_status, "RESOLVED");
    assert.equal(result.venue_id, "venue-lisboa-village-underground-lisboa");
    assert.deepEqual(resolveObservation(o), result);
  }
});

test("a different source_id never resolves via the Village Underground fixed-venue mapping", () => {
  const result = resolveVillageUndergroundObservation({ source_id: "some-other-source" });
  assert.equal(result.resolution_status, "UNRESOLVED");
  assert.equal(result.venue_id, null);
});

test("Village Underground resolves to a venue that is ADDRESS_ONLY — never a map marker without evidenced coordinates", async () => {
  const registry = JSON.parse(await readFile(new URL("../venues/lisbon.json", import.meta.url), "utf8"));
  const venue = registry.venues.find((v) => v.venue_id === "venue-lisboa-village-underground-lisboa");
  assert.equal(venue.location_status, "ADDRESS_ONLY");
  assert.equal(venue.latitude, null);
  assert.equal(venue.longitude, null);
});

// 12. rerunning generation against the same retained fixtures is deterministic.

test("adaptation is deterministic against the same retained fixtures", async () => {
  const { entries, metadata } = await loadEntries();
  assert.deepEqual(
    toObservations(entries, { retrievedAt: metadata.retrieved_at }),
    toObservations(entries, { retrievedAt: metadata.retrieved_at }),
  );
});
