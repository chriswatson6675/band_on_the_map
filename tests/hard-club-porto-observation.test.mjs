import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseHardClubAgendaFragment, parseHardClubEventPrice } from "../ingestion/hard-club-porto/discovery.mjs";
import { SOURCE_ID, toObservation, toObservations } from "../ingestion/hard-club-porto/observation-adapter.mjs";

async function loadFixtureRecords() {
  const html = await readFile(new URL("../fixtures/hard-club-porto/agenda-warm-excerpt.html", import.meta.url), "utf8");
  return parseHardClubAgendaFragment(html);
}

async function loadPrice(fixtureName) {
  const html = await readFile(new URL(`../fixtures/hard-club-porto/${fixtureName}`, import.meta.url), "utf8");
  return parseHardClubEventPrice(html);
}

// 1. source_id

test("SOURCE_ID matches the existing sources/porto.json registry id exactly", () => {
  assert.equal(SOURCE_ID, "hard-club-porto");
});

// 2. date/certainty mapping — DATE_ONLY, never fabricated to UTC_INSTANT/FLOATING_LOCAL

test("start.date/certainty are derived correctly end-to-end for the representative Johnny Hooker record", async () => {
  const records = await loadFixtureRecords();
  const [obs] = toObservations(
    records.filter((r) => r.source_record_id === "johnny-hooker-euro-tour-2026-2026"),
    { retrievedAt: "2026-08-25T09:39:00.000Z" },
  );
  assert.equal(obs.start.date, "2026-09-12");
  assert.equal(obs.start.certainty, "DATE_ONLY");
  assert.equal(obs.start.is_utc, null);
  assert.equal(obs.start.iso, null);
});

// 3. the year-boundary must survive all the way through Observation construction

test("start.date crosses the real 2026/2027 year boundary correctly end-to-end for both real 2027-slug events", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-25T09:39:00.000Z" });
  const byId = Object.fromEntries(observations.map((o) => [o.source_record_id, o]));

  assert.equal(byId["johnny-hooker-euro-tour-2026-2026"].start.date, "2026-09-12");
  // Both of the following are genuine 2027-slug events retained verbatim in
  // fixtures/hard-club-porto/agenda-warm-excerpt.html (itself extracted
  // byte-identically from research/source-investigations/hard-club-porto-02/
  // evidence/ajax-agenda-warm.html) — not synthetic test data.
  assert.equal(byId["u-d-o-porto-hard-club-2027"].start.date, "2027-01-29");
  assert.equal(byId["fresno-eurotour-2027-carta-de-adeus-2027"].start.date, "2027-02-12");
});

// 4. end is always honestly absent

test("end is always emptyDateTime — end/end-time is NOT_PRESENT anywhere for this source", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-25T09:39:00.000Z" });
  for (const o of observations) {
    assert.equal(o.end.date, null);
    assert.equal(o.end.iso, null);
    assert.equal(o.end.certainty, "UNKNOWN");
  }
});

// 5. venue/room mapping

test("venue_name is honestly null (fixed single venue, resolved by source_id); location_text carries the room label", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-25T09:39:00.000Z" });
  const johnny = observations.find((o) => o.source_record_id === "johnny-hooker-euro-tour-2026-2026");
  assert.equal(johnny.venue_name, null);
  assert.equal(johnny.location_text, "Sala 2");
  assert.equal(johnny.source_fields.room_label, "Sala 2");
  assert.equal(johnny.source_fields.local_time_text, "20H00");
});

// 6. title combines the <h3> title and <p class="demi"> subtitle, matching investigation.json's own representative value

test("title combines title and subtitle with \" | \", matching investigation.json's own PROVEN representative value", async () => {
  const records = await loadFixtureRecords();
  const [obs] = toObservations(
    records.filter((r) => r.source_record_id === "johnny-hooker-euro-tour-2026-2026"),
    { retrievedAt: "2026-08-25T09:39:00.000Z" },
  );
  assert.equal(obs.title, "JOHNNY HOOKER | EURO TOUR 2026");
});

test("title is the bare title text when a record has no subtitle", async () => {
  const records = await loadFixtureRecords();
  const [obs] = toObservations(
    records.filter((r) => r.source_record_id === "u-d-o-porto-hard-club-2027"),
    { retrievedAt: "2026-08-25T09:39:00.000Z" },
  );
  assert.equal(obs.title, "U.D.O. PORTO. HARD CLUB.");
});

// 7. price — a separate per-event AJAX call, merged in via priceBySlug

test("price_text is honestly null when no price has been fetched for a record", async () => {
  const records = await loadFixtureRecords();
  const [obs] = toObservations(
    records.filter((r) => r.source_record_id === "moonspell-invicta-halloween-2026"),
    { retrievedAt: "2026-08-25T09:39:00.000Z" },
  );
  assert.equal(obs.price_text, null);
});

test("price_text is populated end-to-end from the separate real loadevent price fragments, keyed by slug", async () => {
  const records = await loadFixtureRecords();
  const johnnyPrice = await loadPrice("loadevent-johnny-hooker-euro-tour-2026-2026.html");
  const fresnoPrice = await loadPrice("loadevent-fresno-eurotour-2027-carta-de-adeus-2027.html");

  const observations = toObservations(records, {
    retrievedAt: "2026-08-25T09:39:00.000Z",
    priceBySlug: {
      "johnny-hooker-euro-tour-2026-2026": johnnyPrice,
      "fresno-eurotour-2027-carta-de-adeus-2027": fresnoPrice,
    },
  });

  const byId = Object.fromEntries(observations.map((o) => [o.source_record_id, o]));
  assert.equal(byId["johnny-hooker-euro-tour-2026-2026"].price_text, "25€- 55€");
  assert.equal(byId["fresno-eurotour-2027-carta-de-adeus-2027"].price_text, "30€-120€");
  assert.equal(byId["moonspell-invicta-halloween-2026"].price_text, null);
});

// 8. event_url / source_url retained

test("event_url and source_url are retained on every Observation", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, {
    retrievedAt: "2026-08-25T09:39:00.000Z",
    sourceUrl: "https://www.hardclubporto.com/include/ajax_functions.php?action=load-agenda&start=0&langid=1&passo=30&evento=",
  });
  for (const o of observations) {
    assert.ok(o.event_url.startsWith("https://www.hardclubporto.com/PT/evento/"));
    assert.equal(
      o.source_url,
      "https://www.hardclubporto.com/include/ajax_functions.php?action=load-agenda&start=0&langid=1&passo=30&evento=",
    );
  }
});

// 9. Observation contract valid / no direct Event writes

test("every Observation is a valid Observation, never a canonical Event field", async () => {
  const records = await loadFixtureRecords();
  const observations = toObservations(records, { retrievedAt: "2026-08-25T09:39:00.000Z" });
  for (const o of observations) {
    assert.equal(o.source_id, SOURCE_ID);
    assert.equal(o.source_id, "hard-club-porto");
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
    toObservations(records, { retrievedAt: "2026-08-25T09:39:00.000Z" }),
    toObservations(records, { retrievedAt: "2026-08-25T09:39:00.000Z" }),
  );
});
