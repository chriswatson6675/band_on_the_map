import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseLavAgendaJsonLd } from "../ingestion/lav/discovery.mjs";
import { SOURCE_ID, parseLavUtcInstant, toObservation, toObservations } from "../ingestion/lav/observation-adapter.mjs";
import { resolveObservation } from "../ingestion/venue/resolver.mjs";

async function loadFixtureRecords() {
  const html = await readFile(new URL("../fixtures/lav/agenda-excerpt.html", import.meta.url), "utf8");
  return parseLavAgendaJsonLd(html);
}

// 1. fixture acquisition/parsing

test("discovery extracts every real Event on the retained JSON-LD excerpt", async () => {
  const records = await loadFixtureRecords();
  assert.equal(records.length, 10);
  assert.deepEqual(
    records.map((r) => r.source_record_id),
    [
      "lun8",
      "bees-honey",
      "anette-olzon",
      "festa-das-redes-sociais",
      "sina-bathaie",
      "rb-lovers-2",
      "kard-europe-tour-2026",
      "the-living-tombstone-multiplayer-tour",
      "100-rap-kriolo",
      "the-biggest-erasmus-welcome-party-2",
    ],
  );
});

test("discovery rejects empty input", () => {
  assert.throws(() => parseLavAgendaJsonLd(""), /non-empty/);
});

test("discovery throws when no JSON-LD Event script block is present, never guesses", () => {
  assert.throws(() => parseLavAgendaJsonLd("<html><body>no listing here</body></html>"), /application\/ld\+json/);
});

test("discovery throws on a malformed (non-JSON) ld+json block", () => {
  assert.throws(
    () => parseLavAgendaJsonLd('<script type="application/ld+json">[{not: valid}]</script>'),
    /did not parse as valid JSON/,
  );
});

test("discovery returns an empty array for a genuinely empty JSON-LD array, without throwing", () => {
  assert.deepEqual(parseLavAgendaJsonLd('<script type="application/ld+json">[]</script>'), []);
});

// 2. stable ID derivation

test("source_record_id is the permalink slug from each Event's own url", async () => {
  const records = await loadFixtureRecords();
  for (const record of records) {
    assert.ok(record.source_record_id);
    assert.equal(record.event_url, `https://lisboaaovivo.com/evento/${record.source_record_id}/`);
  }
});

test("discovery deduplicates by slug (first occurrence order kept)", () => {
  const html = `<script type="application/ld+json">[
    {"@type":"Event","name":"First","url":"https://lisboaaovivo.com/evento/dup/","startDate":"2026-09-01T21:00:00+00:00","endDate":"2026-09-01T23:00:00+00:00","location":{"name":"LAV","address":{}}},
    {"@type":"Event","name":"Second","url":"https://lisboaaovivo.com/evento/dup/","startDate":"2026-09-02T21:00:00+00:00","endDate":"2026-09-02T23:00:00+00:00","location":{"name":"LAV","address":{}}}
  ]</script>`;
  const records = parseLavAgendaJsonLd(html);
  assert.equal(records.length, 1);
  assert.equal(records[0].title, "First");
});

// 3. full date derivation

test("parseLavUtcInstant reads a confirmed +00:00 UTC instant", () => {
  assert.deepEqual(parseLavUtcInstant("2026-09-04T19:30:00+00:00"), { date: "2026-09-04", iso: "2026-09-04T19:30:00+00:00" });
});

test("parseLavUtcInstant fails closed on a non-UTC-offset instant, never guesses", () => {
  assert.equal(parseLavUtcInstant("2026-09-04T19:30:00+01:00"), null);
  assert.equal(parseLavUtcInstant("2026-09-04"), null);
  assert.equal(parseLavUtcInstant(null), null);
});

test("start/end are derived as confirmed UTC_INSTANT end-to-end for a real record", async () => {
  const records = await loadFixtureRecords();
  const [obs] = toObservations(
    records.filter((r) => r.source_record_id === "lun8"),
    { retrievedAt: "2026-08-24T00:00:00.000Z" },
  );
  assert.equal(obs.start.date, "2026-08-25");
  assert.equal(obs.start.iso, "2026-08-25T19:30:00+00:00");
  assert.equal(obs.start.is_utc, true);
  assert.equal(obs.start.certainty, "UTC_INSTANT");
  assert.equal(obs.end.date, "2026-08-25");
  assert.equal(obs.end.certainty, "UTC_INSTANT");
});

// 4. ambiguous/missing dates fail closed

test("an unparseable start_iso never fabricates a UTC instant", () => {
  const obs = toObservation(
    { source_record_id: "x", title: "t", event_url: "https://lisboaaovivo.com/evento/x/", start_iso: "sometime in September" },
    { retrievedAt: "2026-08-24T00:00:00.000Z" },
  );
  assert.equal(obs.start.date, null);
  assert.equal(obs.start.is_utc, null);
  assert.equal(obs.start.certainty, "TEXT_ONLY");
});

test("a genuinely absent start_iso never fabricates a date", () => {
  const obs = toObservation(
    { source_record_id: "x", title: "t", event_url: "https://lisboaaovivo.com/evento/x/", start_iso: null },
    { retrievedAt: "2026-08-24T00:00:00.000Z" },
  );
  assert.equal(obs.start.date, null);
  assert.equal(obs.start.certainty, "UNKNOWN");
});

// 5. music filtering — this source has no first-party per-event category at
// all (see observation-adapter.mjs's own doc comment); every record from
// this single music/nightlife VENUE-type source is retained, matching the
// existing MEO Arena/Village Underground precedent for a source with no
// per-event taxonomy.

test("every record on this single-venue source becomes an Observation (no per-event category exists to filter on)", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" });
  assert.equal(observations.length, records.length);
});

// 6/7. event URL and source URL retained

test("event_url and source_url are retained on every Observation", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, {
    retrievedAt: "2026-08-24T00:00:00.000Z",
    sourceUrl: "https://lisboaaovivo.com/agenda/",
  });
  for (const o of observations) {
    assert.ok(o.event_url.startsWith("https://lisboaaovivo.com/evento/"));
    assert.equal(o.source_url, "https://lisboaaovivo.com/agenda/");
  }
});

// 8. venue evidence retained (fixed single venue — resolved by source_id; room/address evidence retained in source_fields)

test("venue_name/location_text are honestly null; room and first-party address evidence are retained in source_fields", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" });
  for (const o of observations) {
    assert.equal(o.venue_name, null);
    assert.equal(o.location_text, null);
  }
  const sala2 = observations.find((o) => o.source_record_id === "sina-bathaie");
  assert.equal(sala2.source_fields.room, "LAV – Sala 2");
  assert.equal(sala2.source_fields.location_address.streetAddress, "Av. Marechal Gomes da Costa, 29B1");
  assert.equal(sala2.source_fields.location_address.postalCode, "1800-255");

  const noAddress = observations.find((o) => o.source_record_id === "lun8");
  assert.equal(noAddress.source_fields.room, "LAV");
  assert.equal(noAddress.source_fields.location_address, null);
});

// 9. Observation contract valid / no direct Event writes

test("every Observation is a valid Observation, never a canonical Event field", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" });
  for (const o of observations) {
    assert.equal(o.source_id, SOURCE_ID);
    assert.equal(o.source_id, "lav-lisboa-ao-vivo");
    assert.equal("event_id" in o, false);
    assert.equal("canonical_event_id" in o, false);
    assert.equal(typeof o.raw_evidence.byte_faithful, "boolean");
  }
});

test("toObservation throws without a source_record_id", () => {
  assert.throws(() => toObservation({ title: "x" }), /source_record_id/);
});

// 10. deterministic rerun

test("adaptation is deterministic against the same retained fixture", async () => {
  const records = await loadFixtureRecords();
  assert.deepEqual(
    toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" }),
    toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" }),
  );
});

// 12/13. venue resolution is data-driven, admitted via the venue-onboarding pipeline — no new hardcoded resolver branch

test("lav-lisboa-ao-vivo Observations resolve to the newly-admitted ADDRESS_ONLY venue via the DATA-DRIVEN mapping", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-24T00:00:00.000Z" });
  for (const o of observations) {
    const resolution = resolveObservation(o);
    assert.equal(resolution.resolution_status, "RESOLVED");
    assert.equal(resolution.venue_id, "venue-lisboa-lav-lisboa-ao-vivo");
    assert.equal(resolution.resolution_method, "DATA_DRIVEN_MAPPING:SOURCE_ID");
  }
});
