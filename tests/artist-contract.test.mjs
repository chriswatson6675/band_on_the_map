import assert from "node:assert/strict";
import test from "node:test";

import { createArtist, createArtistId, createGenreClaim, validateArtist, validateGenreClaim } from "../ingestion/artist/contract.mjs";

// BEATMAPPED-ENRICHMENT-PILOT-01 — mirrors tests/venue-contract.test.mjs's
// own conventions (deterministic id derivation, createX()/validateX() pair,
// fail-closed validation) for the new canonical Artist contract.

test("createArtistId is deterministic: same canonical_name always produces the same ID", () => {
  const a = createArtistId("Evanescence");
  const b = createArtistId("Evanescence");
  assert.equal(a, b);
  assert.equal(a, "artist-evanescence");
});

test("createArtistId produces different IDs for different names", () => {
  assert.notEqual(createArtistId("Evanescence"), createArtistId("Jungle"));
});

test("createArtist defaults artist_id to createArtistId(canonical_name)", () => {
  const artist = createArtist({ canonical_name: "Duran Duran" });
  assert.equal(artist.artist_id, createArtistId("Duran Duran"));
});

test("createArtist defaults aliases/genres to empty arrays — an Artist may legitimately have zero genres", () => {
  const artist = createArtist({ canonical_name: "Some New Act" });
  assert.deepEqual(artist.aliases, []);
  assert.deepEqual(artist.genres, []);
  assert.deepEqual(validateArtist(artist), []);
});

test("an Artist may carry MULTIPLE genres (product decision #4)", () => {
  const artist = createArtist({
    canonical_name: "Evanescence",
    genres: [
      { family: "Rock", tag: "Alternative Metal", confidence: "HIGH", method: "AI_ASSESSED_PUBLIC_KNOWLEDGE", basis: "long-standing public discography classification", asserted_at: "2026-08-25" },
      { family: "Metal", tag: "Gothic Metal", confidence: "MODERATE", method: "AI_ASSESSED_PUBLIC_KNOWLEDGE", basis: "also routinely described as gothic metal", asserted_at: "2026-08-25" },
    ],
  });
  assert.equal(artist.genres.length, 2);
  assert.deepEqual(artist.genres.map((g) => g.family), ["Rock", "Metal"]);
});

test("aliases hold observed performance-wording variants, never the canonical identity itself", () => {
  const artist = createArtist({ canonical_name: "Duran Duran", aliases: ["DURAN DURAN - FREE TO LOVE TOUR"] });
  assert.equal(artist.canonical_name, "Duran Duran");
  assert.deepEqual(artist.aliases, ["DURAN DURAN - FREE TO LOVE TOUR"]);
});

test("createArtist throws when canonical_name is missing", () => {
  assert.throws(() => createArtist({}), /canonical_name/);
});

test("createArtist throws when a genre claim is missing required provenance fields", () => {
  assert.throws(
    () => createArtist({ canonical_name: "Test Act", genres: [{ family: "Rock" }] }),
    /confidence|method|basis|asserted_at/,
  );
});

test("validateGenreClaim rejects an unknown confidence level (no false numeric precision)", () => {
  const errors = validateGenreClaim(
    createGenreClaim({ family: "Rock", confidence: "99.7%", method: "AI_ASSESSED_PUBLIC_KNOWLEDGE", basis: "x", asserted_at: "2026-08-25" }),
  );
  assert.ok(errors.some((e) => e.includes("confidence")));
});

test("validateGenreClaim requires a non-empty basis — provenance must answer 'why does BeatMapped believe this?'", () => {
  const errors = validateGenreClaim(
    createGenreClaim({ family: "Rock", confidence: "HIGH", method: "AI_ASSESSED_PUBLIC_KNOWLEDGE", basis: "", asserted_at: "2026-08-25" }),
  );
  assert.ok(errors.some((e) => e.includes("basis")));
});

test("validateArtist rejects a non-array genres field", () => {
  const errors = validateArtist({ artist_id: "artist-x", canonical_name: "X", aliases: [], genres: "Rock" });
  assert.ok(errors.some((e) => e.includes("genres")));
});
