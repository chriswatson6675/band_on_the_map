import assert from "node:assert/strict";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadAreaConfig, listAreaConfigs } from "../ingestion/area/registry.mjs";

test("loadAreaConfig loads and validates the real committed barcelona-es area", async () => {
  const area = await loadAreaConfig("barcelona-es");
  assert.equal(area.area_id, "barcelona-es");
  assert.equal(area.country_code, "ES");
  assert.equal(area.radius_km, 25);
  assert.ok(area.discovery_sources.some((s) => s.source_kind === "OSM_OVERPASS"));
});

test("loadAreaConfig throws for an area_id with no config file", async () => {
  await assert.rejects(() => loadAreaConfig("nowhere-zz"), /No area config found/);
});

test("loadAreaConfig throws when the file's area_id does not match the requested id", async () => {
  const dir = await mkdtemp(join(tmpdir(), "botm-area-"));
  try {
    await writeFile(
      join(dir, "mismatch-xx.json"),
      JSON.stringify({
        area_id: "other-xx",
        country: "Testland",
        country_code: "XX",
        city: "Testville",
        centre: { latitude: 1, longitude: 1 },
        radius_km: 10,
        languages: ["en"],
        discovery_keywords: {},
        discovery_sources: [],
        active_status: "ACTIVE",
        created_at: "2026-08-25",
      }),
    );
    await assert.rejects(() => loadAreaConfig("mismatch-xx", { areasDir: dir }), /expected "mismatch-xx"/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("listAreaConfigs never treats registry.schema.json as an area", async () => {
  const areas = await listAreaConfigs();
  assert.ok(areas.every((a) => a.area_id !== "registry.schema"));
  assert.ok(areas.some((a) => a.area_id === "barcelona-es"));
});
