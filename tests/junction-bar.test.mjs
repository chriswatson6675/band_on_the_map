import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractEventCards, toObservation, toObservations } from "../ingestion/junction-bar/observation-adapter.mjs";

async function augustHtml() {
  return readFile(new URL("../fixtures/junction-bar-berlin/august-program.html", import.meta.url), "utf8");
}

async function septemberHtml() {
  return readFile(new URL("../fixtures/junction-bar-berlin/september-program.html", import.meta.url), "utf8");
}

const AUGUST_URL = "https://junction-bar.de/program/08_2026/08_26.html";
const SEPTEMBER_URL = "https://junction-bar.de/program/09_2026/09_26.html";

test("extractEventCards: the real retained August page yields 10 real cards", async () => {
  const cards = extractEventCards(await augustHtml(), { sourceUrl: AUGUST_URL });
  assert.equal(cards.length, 10);

  const zora = cards.find((c) => c.title === "Zora y las Vampiras");
  assert.ok(zora);
  assert.equal(zora.date, "2026-08-05");
  assert.equal(zora.time, null); // no inline showtime stated on this specific row

  const replicat = cards.find((c) => c.title === "REPLICAT");
  assert.ok(replicat);
  assert.equal(replicat.date, "2026-08-14");
  assert.equal(replicat.time, "21:00"); // inline "---- 21:00 ----" split across nested tags
});

test("extractEventCards: 'PRIVAT PARTY' rows are correctly excluded (no real act name)", async () => {
  const cards = extractEventCards(await augustHtml(), { sourceUrl: AUGUST_URL });
  assert.ok(!cards.some((c) => c.date === "2026-08-21")); // PRIVAT PARTY
  assert.ok(!cards.some((c) => c.date === "2026-08-22")); // PRIVAT PARTY
  assert.ok(!cards.some((c) => c.date === "2026-08-29")); // PRIVAT PARTY
});

test("extractEventCards: the real retained September page yields 9 real cards, including a row that spills into October", async () => {
  const cards = extractEventCards(await septemberHtml(), { sourceUrl: SEPTEMBER_URL });
  assert.equal(cards.length, 9);

  // This physical page's own heading states only "September 2026 music
  // program", yet a real dated row states "2.10." (2 October) — the row's
  // own month digit governs, not the page heading's month, and the
  // resulting date must be the real October date, not silently forced
  // into September.
  const yellowSnow = cards.find((c) => c.title === "Tag der Gelben Einheit");
  assert.ok(yellowSnow);
  assert.equal(yellowSnow.date, "2026-10-02");

  const bonfi = cards.find((c) => c.title === "BONFI");
  assert.ok(bonfi);
  assert.equal(bonfi.date, "2026-09-18");
  assert.equal(bonfi.time, "21:30");
});

test("toObservation: real REPLICAT card adapts correctly, floating-local certainty when a showtime is present", async () => {
  const cards = extractEventCards(await augustHtml(), { sourceUrl: AUGUST_URL });
  const replicat = cards.find((c) => c.title === "REPLICAT");
  const obs = toObservation(replicat, {
    retrievedAt: "2026-08-26T12:23:00Z",
    fixturePath: "fixtures/junction-bar-berlin/august-program.html",
  });
  assert.equal(obs.source_id, "junction-bar-berlin");
  assert.equal(obs.source_record_id, "2026-08-14__replicat");
  assert.equal(obs.title, "REPLICAT");
  assert.equal(obs.start.date, "2026-08-14");
  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.venue_name, "Junction Bar");
  assert.equal(obs.source_url, AUGUST_URL);
});

test("toObservation: a card with no stated showtime gets DATE_ONLY certainty, never a fabricated time", async () => {
  const cards = extractEventCards(await augustHtml(), { sourceUrl: AUGUST_URL });
  const zora = cards.find((c) => c.title === "Zora y las Vampiras");
  const obs = toObservation(zora, { retrievedAt: "2026-08-26T12:23:00Z" });
  assert.equal(obs.start.date, "2026-08-05");
  assert.equal(obs.start.certainty, "DATE_ONLY");
  assert.equal(obs.start.raw, "2026-08-05");
});

test("toObservations: batch-adapts real cards across both retained months; every source_record_id is unique", async () => {
  const augustCards = extractEventCards(await augustHtml(), { sourceUrl: AUGUST_URL });
  const septemberCards = extractEventCards(await septemberHtml(), { sourceUrl: SEPTEMBER_URL });
  const allCards = [...augustCards, ...septemberCards];

  const observations = toObservations(allCards, { retrievedAt: "2026-08-26T13:00:00Z" });
  assert.equal(observations.length, 19);
  assert.equal(observations.length, allCards.length);
  assert.equal(
    new Set(observations.map((o) => o.source_record_id)).size,
    observations.length,
    "every source_record_id must be unique across both harvested months"
  );

  // Two acts on the same night correctly become two distinct observations,
  // not one invented combined title.
  const aug5 = observations.filter((o) => o.start.date === "2026-08-05");
  assert.equal(aug5.length, 2);
  assert.deepEqual(
    new Set(aug5.map((o) => o.title)),
    new Set(["Zora y las Vampiras", "Lemon Eye"])
  );
});

test("extractEventCards throws on malformed/empty input rather than silently returning nothing", async () => {
  assert.throws(() => extractEventCards(""), /non-empty/);
  assert.throws(() => extractEventCards("<html><body>no month heading here</body></html>"), /month-page heading/);
});

test("toObservation throws when required card fields are missing", async () => {
  assert.throws(() => toObservation({ title: "No Date" }), /requires card\.date/);
  assert.throws(() => toObservation({ date: "2026-08-05" }), /requires card\.date/);
});
