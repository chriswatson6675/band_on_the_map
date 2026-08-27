import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
  extractEscaleCards,
  parseFrenchFullDate,
  extractDatesHorairesText,
  extractLocationText,
  parseFrenchTimeOfDay,
  parseFrenchDurationMinutes,
} from "../ingestion/institut-du-monde-arabe/discovery.mjs";
import { toObservation, toObservations, buildStart, deriveEndFromDuration } from "../ingestion/institut-du-monde-arabe/observation-adapter.mjs";

async function listingHtml() {
  return readFile(new URL("../fixtures/institut-du-monde-arabe-paris/escales-listing.html", import.meta.url), "utf8");
}

async function detailHtml() {
  return readFile(new URL("../fixtures/institut-du-monde-arabe-paris/escales-detail-chants-mariage.html", import.meta.url), "utf8");
}

test("extractEscaleCards finds all 4 real, retained upcoming Escales musicales cards", async () => {
  const cards = await extractEscaleCards(await listingHtml());
  assert.equal(cards.length, 4);
  assert.deepEqual(
    cards.map((c) => c.dateText),
    ["16 septembre 2026", "07 octobre 2026", "18 novembre 2026", "16 décembre 2026"],
  );
  assert.equal(cards[0].title, "Les Escales musicales | Chants de mariage du Maghreb vus par les musiques actuelles");
  assert.equal(cards[0].href, "/fr/agenda/spectacles/les-escales-musicales-chants-mariage-du-maghreb-vus-par-les-musiques-actuelles");
});

test("parseFrenchFullDate parses this source's own directly-stated full date", () => {
  assert.equal(parseFrenchFullDate("16 septembre 2026"), "2026-09-16");
  assert.equal(parseFrenchFullDate("07 octobre 2026"), "2026-10-07");
  assert.equal(parseFrenchFullDate("not a date"), null);
});

test("extractDatesHorairesText finds this event's own real, retained time+duration text", async () => {
  const { dateTimeText, durationText } = extractDatesHorairesText(await detailHtml());
  assert.equal(dateTimeText, "Mercredi 16 septembre à 19h");
  assert.equal(durationText, "Durée : 1h");
});

test("extractLocationText finds this event's own real, retained location text", async () => {
  const location = extractLocationText(await detailHtml());
  assert.match(location, /Musée \(niveau 6\)/);
  assert.match(location, /7e étage/);
});

test("parseFrenchTimeOfDay and parseFrenchDurationMinutes parse this source's own real text", () => {
  assert.deepEqual(parseFrenchTimeOfDay("Mercredi 16 septembre à 19h"), { hour: "19", minute: "00" });
  assert.equal(parseFrenchDurationMinutes("Durée : 1h"), 60);
  assert.equal(parseFrenchTimeOfDay("no time here"), null);
});

test("buildStart combines the card's own full date with the detail page's own time into one FLOATING_LOCAL instant", () => {
  const start = buildStart("16 septembre 2026", "Mercredi 16 septembre à 19h");
  assert.equal(start.certainty, "FLOATING_LOCAL");
  assert.equal(start.date, "2026-09-16");
  assert.equal(start.iso, "2026-09-16T19:00:00");
  assert.equal(start.is_utc, false);
});

test("deriveEndFromDuration mechanically adds the source's own stated duration", () => {
  const start = buildStart("16 septembre 2026", "Mercredi 16 septembre à 19h");
  const end = deriveEndFromDuration(start, 60);
  assert.equal(end.certainty, "FLOATING_LOCAL");
  assert.equal(end.iso, "2026-09-16T20:00:00");
});

test("a real, retained Escales musicales card+detail pair adapts correctly, matching the governed investigation's claimed field values", async () => {
  const cards = await extractEscaleCards(await listingHtml());
  const card = cards[0];
  const html = await detailHtml();
  const detail = {
    ...extractDatesHorairesText(html),
    locationText: extractLocationText(html),
  };

  const obs = toObservation(card, detail, {
    retrievedAt: "2026-08-26T22:42:00Z",
    fixturePath: "fixtures/institut-du-monde-arabe-paris/escales-detail-chants-mariage.html",
  });

  assert.equal(obs.source_id, "institut-du-monde-arabe-paris");
  assert.equal(obs.source_record_id, "les-escales-musicales-chants-mariage-du-maghreb-vus-par-les-musiques-actuelles");
  assert.equal(obs.title, "Les Escales musicales | Chants de mariage du Maghreb vus par les musiques actuelles");

  assert.equal(obs.start.certainty, "FLOATING_LOCAL");
  assert.equal(obs.start.iso, "2026-09-16T19:00:00");
  assert.equal(obs.end.certainty, "FLOATING_LOCAL");
  assert.equal(obs.end.iso, "2026-09-16T20:00:00");

  assert.equal(obs.venue_name, "Institut du Monde Arabe");
  assert.match(obs.location_text, /Musée \(niveau 6\)/);
  assert.equal(
    obs.event_url,
    "https://www.imarabe.org/fr/agenda/spectacles/les-escales-musicales-chants-mariage-du-maghreb-vus-par-les-musiques-actuelles",
  );
});

test("toObservations pairs every card with its own detail fields, skipping any card with none supplied", async () => {
  const cards = await extractEscaleCards(await listingHtml());
  const html = await detailHtml();
  const detail = { ...extractDatesHorairesText(html), locationText: extractLocationText(html) };
  const detailsByHref = { [cards[0].href]: detail };

  const observations = toObservations(cards, detailsByHref, { retrievedAt: "2026-08-26T22:42:00Z" });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].source_record_id, "les-escales-musicales-chants-mariage-du-maghreb-vus-par-les-musiques-actuelles");
});

test("toObservation throws without card.href", () => {
  assert.throws(() => toObservation({}, {}), /card.href/);
});
