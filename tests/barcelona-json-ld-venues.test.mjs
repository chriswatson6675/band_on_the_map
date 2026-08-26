// BARCELONA-30-VENUE-POPULATION-01 — end-to-end proofs that the generic
// ingestion/json-ld/ family (built for this package) correctly parses
// each real, retained JSON-LD-based Barcelona venue page into
// Observations, with zero venue-specific parsing code required.

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { extractEventNodes, normaliseJsonLdEvent } from "../ingestion/json-ld/parse.mjs";
import { toObservations } from "../ingestion/json-ld/observation-adapter.mjs";

async function loadFixture(dir, name) {
  return readFile(new URL(`../fixtures/${dir}/${name}`, import.meta.url), "utf8");
}

function lastPathSegment(url) {
  const trimmed = (url ?? "").replace(/\/+$/, "");
  return trimmed.slice(trimmed.lastIndexOf("/") + 1) || null;
}

test("Moog Barcelona: the full agenda-page JSON-LD array parses into real, dated Observations", async () => {
  const html = await loadFixture("moog", "agenda.html");
  const nodes = extractEventNodes(html);
  assert.ok(nodes.length >= 30, "expected the real ~37-event array");

  const records = nodes.map((node) => normaliseJsonLdEvent(node, { deriveId: (n) => lastPathSegment(n.url) }));
  const observations = toObservations(records, { source_id: "moog-barcelona" }, { retrievedAt: "2026-08-26T00:00:00.000Z", sourceUrl: "https://moogbarcelona.com/agenda/" });

  const first = observations.find((o) => o.title === "Rubén Seoane");
  assert.ok(first);
  assert.equal(first.venue_name, "Moog Barcelona");
  assert.equal(first.start.certainty, "UTC_INSTANT");
  assert.equal(first.price_text, "8 USD");
  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, observations.length, "every id is unique");
});

test("Harlem Jazz Club: 3 of 4 retained JSON-LD blocks parse (1 is malformed and skipped), non-zero-padded offsets resolve", async () => {
  const html = await loadFixture("harlem-jazz-club", "homepage.html");
  const nodes = extractEventNodes(html);
  assert.equal(nodes.length, 3);

  const records = nodes.map((node) => normaliseJsonLdEvent(node, { deriveId: (n) => lastPathSegment(n.url) }));
  const observations = toObservations(records, { source_id: "harlem-jazz-club-barcelona" }, { retrievedAt: "2026-08-26T00:00:00.000Z", sourceUrl: "https://www.harlemjazzclub.es/en/" });

  assert.ok(observations.every((o) => o.start.certainty === "UTC_INSTANT"), "the non-standard offset shape must still resolve to a confirmed instant");
  assert.ok(observations.every((o) => o.venue_name === null), "this source's own JSON-LD carries no location field — never fabricated");
});

test("Antilla BCN: an ItemList of 2 events parses via the generic ItemList-unwrapping support, deriving a stable id from name+date", async () => {
  const html = await loadFixture("antilla-bcn", "homepage.html");
  const nodes = extractEventNodes(html);
  assert.equal(nodes.length, 2);

  function slugify(value) {
    return String(value ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }
  const records = nodes.map((node) => normaliseJsonLdEvent(node, { deriveId: (n) => `${slugify(n.name)}-${slugify(n.startDate)}` }));
  const observations = toObservations(records, { source_id: "antilla-bcn-barcelona" }, { retrievedAt: "2026-08-26T00:00:00.000Z", sourceUrl: "https://antillasalsa.com/en/" });

  assert.equal(new Set(observations.map((o) => o.source_record_id)).size, 2, "deterministic ids remain distinct across the 2 real events");
  assert.ok(observations.some((o) => o.title.includes("Antilla School Party")));
  assert.ok(observations.every((o) => o.venue_name === "Antilla Salsa Barcelona"));
});
