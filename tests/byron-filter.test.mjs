import assert from "node:assert/strict";
import test from "node:test";
import { filterByronMusicRecords } from "../ingestion/byron/filter.mjs";

test("keeps titles with an explicit music-series keyword", () => {
  const records = [
    { title: "Yurii Kartuzov – Byron Piano" },
    { title: "Cantoría – Byron Música Antiga" },
    { title: "Haro & Galiana – Byron Jazz & Flamenco" },
  ];
  assert.equal(filterByronMusicRecords(records).length, 3);
});

test("rejects non-music literary/games programming", () => {
  const records = [
    { title: "V Byron Chess Open" },
    { title: "“Destellos de la nada”, de Alba Irene González" },
  ];
  assert.equal(filterByronMusicRecords(records).length, 0);
});

test("an ambiguous title with no explicit music keyword is excluded, never guessed", () => {
  assert.equal(filterByronMusicRecords([{ title: "Joanna D'arc – Byron Experience" }]).length, 0);
});

test("handles an empty/missing list", () => {
  assert.deepEqual(filterByronMusicRecords([]), []);
  assert.deepEqual(filterByronMusicRecords(null), []);
});

test("is diacritic- and case-insensitive", () => {
  assert.equal(filterByronMusicRecords([{ title: "PIANO NIGHT" }]).length, 1);
});
