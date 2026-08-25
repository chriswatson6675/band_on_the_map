import assert from "node:assert/strict";
import test from "node:test";
import { normaliseName, normaliseAddress, normaliseDomain, distanceMeters } from "../ingestion/venue-discovery/normalise.mjs";

test("normaliseName folds diacritics, case, and punctuation", () => {
  assert.equal(normaliseName("Heliogàbal"), "heliogabal");
  assert.equal(normaliseName("Bodega Saltó"), "bodega-salto");
});

test("normaliseName returns null for missing input", () => {
  assert.equal(normaliseName(null), null);
  assert.equal(normaliseName(""), null);
});

test("normaliseAddress collapses whitespace and strips punctuation, case, and diacritics", () => {
  assert.equal(normaliseAddress("C. Paradís, 4"), "c paradis 4");
  assert.equal(normaliseAddress("  C.  Paradís   4  "), "c paradis 4");
});

test("two addresses referring to the same place normalise identically", () => {
  assert.equal(normaliseAddress("Carrer Paradís, 4"), normaliseAddress("carrer paradís 4"));
});

test("normaliseDomain strips protocol, path, and www", () => {
  assert.equal(normaliseDomain("https://www.Example.cat/agenda?x=1"), "example.cat");
  assert.equal(normaliseDomain("example.cat"), "example.cat");
  assert.equal(normaliseDomain("http://sub.example.cat/"), "sub.example.cat");
});

test("normaliseDomain returns null for missing/invalid input", () => {
  assert.equal(normaliseDomain(null), null);
  assert.equal(normaliseDomain(""), null);
  assert.equal(normaliseDomain("   "), null);
});

test("distanceMeters returns ~0 for the same point and a plausible value for a known short distance", () => {
  assert.ok(distanceMeters(41.3851, 2.1734, 41.3851, 2.1734) < 1);
  // Roughly 1 degree of latitude ~= 111km.
  const oneDegreeLat = distanceMeters(0, 0, 1, 0);
  assert.ok(oneDegreeLat > 110_000 && oneDegreeLat < 112_000);
});
