import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { extractHydraMembers, buildEventPageUrl } from "../ingestion/theatre-de-la-ville/discovery.mjs";
import { toObservation, toObservations, deriveDateTimeFromIsoWithOffset } from "../ingestion/theatre-de-la-ville/observation-adapter.mjs";

async function realEventDatesResponse() {
  const text = await readFile(new URL("../fixtures/theatre-de-la-ville-paris/event-dates-abdullah-miniawy.json", import.meta.url), "utf8");
  return JSON.parse(text);
}

async function realEventResponse() {
  const text = await readFile(new URL("../fixtures/theatre-de-la-ville-paris/event-abdullah-miniawy.json", import.meta.url), "utf8");
  return JSON.parse(text);
}

test("extractHydraMembers unwraps a real retained event_dates collection", async () => {
  const json = await realEventDatesResponse();
  const members = extractHydraMembers(json);
  assert.equal(members.length, 1);
  assert.equal(members[0]["@id"], "/event_dates/9332");
});

test("extractHydraMembers unwraps a real retained events collection", async () => {
  const json = await realEventResponse();
  const members = extractHydraMembers(json);
  assert.equal(members.length, 1);
  assert.equal(members[0].slug, "abdullah-miniawy-1");
});

test("extractHydraMembers throws on a non-Hydra object", () => {
  assert.throws(() => extractHydraMembers({}), /hydra:member/);
});

test("buildEventPageUrl reproduces the site's own real, retained navigation link", () => {
  const url = buildEventPageUrl({
    baseUrl: "https://www.theatredelaville-paris.com",
    seasonSlug: "saison-26-27",
    mainCategorySlug: "musiques",
    slug: "abdullah-miniawy-1",
  });
  assert.equal(url, "https://www.theatredelaville-paris.com/fr/spectacles/saison-26-27/musiques/abdullah-miniawy-1");
});

test("deriveDateTimeFromIsoWithOffset marks a full ISO+offset instant UTC_INSTANT", () => {
  const dt = deriveDateTimeFromIsoWithOffset("2026-10-04T15:00:00+02:00");
  assert.equal(dt.certainty, "UTC_INSTANT");
  assert.equal(dt.iso, "2026-10-04T13:00:00.000Z");
  assert.equal(dt.is_utc, true);
  assert.equal(dt.date, "2026-10-04");
});

test("deriveDateTimeFromIsoWithOffset marks an unparseable/empty value honestly", () => {
  assert.equal(deriveDateTimeFromIsoWithOffset(null).certainty, "UNKNOWN");
  assert.equal(deriveDateTimeFromIsoWithOffset("17").certainty, "TEXT_ONLY");
});

test("a real, retained ABDULLAH MINIAWY event_date adapts correctly, matching the governed investigation's claimed field values", async () => {
  const json = await realEventDatesResponse();
  const [node] = extractHydraMembers(json);
  const obs = toObservation(node, { retrievedAt: "2026-08-26T22:46:00Z", fixturePath: "fixtures/theatre-de-la-ville-paris/event-dates-abdullah-miniawy.json" });

  assert.equal(obs.source_id, "theatre-de-la-ville-paris");
  assert.equal(obs.source_record_id, "/event_dates/9332");
  assert.equal(obs.title, "ABDULLAH MINIAWY");

  assert.equal(obs.start.certainty, "UTC_INSTANT");
  assert.equal(obs.start.iso, "2026-10-04T13:00:00.000Z"); // 2026-10-04T15:00:00+02:00
  assert.equal(obs.end.certainty, "UTC_INSTANT");
  assert.equal(obs.end.iso, "2026-10-04T14:30:00.000Z"); // 2026-10-04T16:30:00+02:00

  assert.equal(obs.venue_name, "TDV-Sarah Bernhardt_Grande salle");
  assert.equal(obs.price_text, "De 5 € à 25 €");
  assert.equal(obs.event_url, "https://www.theatredelaville-paris.com/fr/spectacles/saison-26-27/musiques/abdullah-miniawy-1");
  assert.equal(obs.source_fields.cancelled, false);
});

test("toObservations excludes cancelled event_dates", async () => {
  const json = await realEventDatesResponse();
  const members = extractHydraMembers(json);
  const cancelledNode = { ...members[0], "@id": "/event_dates/99999", cancelled: true };
  const observations = toObservations([...members, cancelledNode], { retrievedAt: "2026-08-26T22:46:00Z" });
  assert.equal(observations.length, 1);
  assert.equal(observations[0].source_record_id, "/event_dates/9332");
});

test("toObservation throws without an @id", () => {
  assert.throws(() => toObservation({}), /@id/);
});
