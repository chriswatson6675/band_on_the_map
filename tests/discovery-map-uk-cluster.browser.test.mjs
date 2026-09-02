// BEATMAPPED-LONDON-MAP-CLUSTER-VISIBILITY-01 — a real-browser regression
// proof for the exact defect this package fixed: the committed bundled
// fallback (data/public/lisbon-porto-map.json) genuinely has NO
// `countries.UnitedKingdom` bucket, so on every real page load the
// client-side runtime fetch (ingestion/map/runtime-publication.mjs's
// resolveMapData(), wired into app/page.tsx) is the ONLY way London ever
// reaches DiscoveryMap. This test reproduces that exact bundled -> runtime
// transition against a real, running `next dev` instance and a real
// MapLibre GL JS map in a real (headless) Chromium browser, then queries
// the live map source directly — proving, not merely asserting, that
// every London venue actually reaches the rendered MapLibre source AND
// forms its own distinguishable cluster/point group, never silently
// dropped (the stale-ref race this package fixed in
// components/DiscoveryMap.tsx) and never invisibly merged into a
// different country's cluster circle (the CLUSTER_RADIUS finding fixed in
// ingestion/map/cluster-geojson.mjs).
//
// Opt-in / environment-dependent: skips gracefully (not a failure) when no
// system Chromium/Chrome executable is available, since `npm test` must
// stay hermetic and fast in every environment (CI included) that doesn't
// have a browser installed. Set BOTM_TEST_CHROME_PATH to point at a
// specific executable explicitly; otherwise a handful of common install
// locations are tried.
//
// Uses the project's own real `next dev` server and its own real
// `ingestion/publication-server/run.mjs` (imported in-process, exactly
// like tests/runtime-publication.test.mjs and
// tests/deploy-github-workflow.test.mjs already do) — never a second,
// hand-rolled mock of either.

import assert from "node:assert/strict";
import test from "node:test";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { startServer } from "../ingestion/publication-server/run.mjs";

const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

function findChrome() {
  if (process.env.BOTM_TEST_CHROME_PATH && existsSync(process.env.BOTM_TEST_CHROME_PATH)) {
    return process.env.BOTM_TEST_CHROME_PATH;
  }
  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

// A realistic-spread synthetic runtime artifact: one venue per non-UK
// country, positioned at that country's own real venue-cluster coordinates
// (see components/DiscoveryMap.tsx's COUNTRY_MAP_VIEWS), plus 8 London
// venues clustered tightly together — mirroring the real production shape
// (8 London venues within ~0.07 degrees of each other) without depending
// on live production data that can naturally drift over time.
function syntheticRuntimeArtifact() {
  const marker = (venueId, lat, lon, listingCount) => ({
    venue_id: venueId,
    canonical_name: venueId,
    latitude: lat,
    longitude: lon,
    address: "Test Address",
    display_listings: Array.from({ length: listingCount }, (_, i) => ({
      kind: "SINGLE",
      source_id: "test-source",
      source_record_id: `${venueId}-${i}`,
      source_name: "Test",
      title: "Test Gig",
      start: { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" },
      end: { raw: null, date: null, iso: null, is_utc: null, tzid: null, certainty: "UNKNOWN" },
      event_url: null,
    })),
  });

  const portugal = [marker("venue-test-lisbon-1", 38.72, -9.14, 5)];
  const spain = [marker("venue-test-barcelona-1", 41.39, 2.17, 5)];
  const germany = [marker("venue-test-berlin-1", 52.5, 13.4, 5)];
  const france = [marker("venue-test-paris-1", 48.87, 2.35, 5)];
  const unitedKingdom = [
    marker("venue-test-london-1", 51.5573, -0.1384, 3),
    marker("venue-test-london-2", 51.5375, -0.0578, 3),
    marker("venue-test-london-3", 51.5166, -0.1331, 3),
    marker("venue-test-london-4", 51.5161, -0.1354, 3),
    marker("venue-test-london-5", 51.5392, -0.1422, 3),
    marker("venue-test-london-6", 51.4936, -0.2373, 3),
    marker("venue-test-london-7", 51.4907, -0.2245, 3),
    marker("venue-test-london-8", 51.5306, -0.1197, 3),
  ];
  const all = [...portugal, ...spain, ...germany, ...france, ...unitedKingdom];
  const totalListings = all.reduce((sum, m) => sum + m.display_listings.length, 0);

  return {
    generated_at: "2026-09-02T00:00:00.000Z",
    window: { from: null, to: null },
    source_report: { success_count: 1, failure_count: 0, sources: [{ source_id: "test-source", success: true, raw_record_count: all.length, observation_count: all.length }] },
    counts: { observation_count: all.length, display_listing_count: totalListings, map_marker_count: all.length },
    countries: {
      Portugal: { markers: portugal },
      Croatia: { markers: [] },
      Spain: { markers: spain },
      Germany: { markers: germany },
      France: { markers: france },
      UnitedKingdom: { markers: unitedKingdom },
    },
  };
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) return true;
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

function spawnNextDev(port, runtimeUrl) {
  // `shell: true` is required on Windows for `npm`/`npm.cmd` — spawning a
  // .cmd shim directly (without a shell) fails with `spawn EINVAL`. Passing
  // a single, fully-formed command string (rather than an args array,
  // which Node warns can be unsafely concatenated under `shell: true`) —
  // safe here since `port` is validated as a plain integer below.
  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`spawnNextDev: port must be a positive integer, got ${port}`);
  }
  const child = spawn(`npm run dev -- -p ${port}`, {
    cwd: REPO_ROOT,
    env: { ...process.env, NEXT_PUBLIC_BOTM_MAP_DATA_URL: runtimeUrl },
    stdio: "ignore",
    shell: true,
  });
  return child;
}

const chromePath = findChrome();

test("real-browser regression: London venues survive the bundled -> runtime transition and form their own distinguishable cluster (fails pre-fix, passes post-fix)", { timeout: 120000 }, async (t) => {
  if (!chromePath) {
    t.skip("no system Chrome/Chromium found (set BOTM_TEST_CHROME_PATH to run this test) — npm test must stay hermetic in environments without a browser");
    return;
  }

  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    t.skip("playwright-core not installed");
    return;
  }

  const artifactDir = await mkdtemp(join(tmpdir(), "botm-uk-cluster-artifact-"));
  const artifactPath = join(artifactDir, "runtime.json");
  await writeFile(artifactPath, JSON.stringify(syntheticRuntimeArtifact()));

  const pubServer = await startServer({ host: "127.0.0.1", port: 0, artifactPath });
  const pubPort = pubServer.address().port;
  const runtimeUrl = `http://127.0.0.1:${pubPort}/map-data`;

  const nextPort = 4174 + Math.floor(Math.random() * 200);
  const nextProcess = spawnNextDev(nextPort, runtimeUrl);

  const userDataDir = await mkdtemp(join(tmpdir(), "botm-uk-cluster-chrome-"));
  let context;

  t.after(async () => {
    await context?.close().catch(() => {});
    // `shell: true` (required for npm on Windows — see spawnNextDev above)
    // means `nextProcess` is the SHELL, not next-server itself; a plain
    // `.kill()` leaves the real dev server running as an orphan. On
    // Windows, kill the whole process tree explicitly; elsewhere the
    // simple kill is sufficient.
    if (process.platform === "win32" && nextProcess.pid) {
      await new Promise((resolvePromise) => {
        spawn("taskkill", ["/pid", String(nextProcess.pid), "/t", "/f"], { stdio: "ignore" })
          .on("exit", resolvePromise)
          .on("error", resolvePromise);
      });
    } else {
      nextProcess.kill();
    }
    pubServer.close();
    await rm(artifactDir, { recursive: true, force: true }).catch(() => {});
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {});
  });

  const nextUp = await waitForHttp(`http://localhost:${nextPort}`, 60000);
  assert.ok(nextUp, "local next dev server must come up within 60s");

  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: chromePath,
    headless: true,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  await page.goto(`http://localhost:${nextPort}`, { waitUntil: "domcontentloaded" });

  // Confirm the page really did start on the bundled fallback first (the
  // committed data/public/lisbon-porto-map.json has no UnitedKingdom
  // bucket at all — see docs/RUNTIME_PUBLICATION_BRIDGE.md), then genuinely
  // transitioned to the runtime artifact this test controls.
  const initialSource = await page.getAttribute("main", "data-map-data-source");
  assert.equal(initialSource, "bundled", "page must start on the bundled fallback, matching real visitor behaviour");

  const gotRuntime = await page.waitForFunction(
    () => document.querySelector("main")?.getAttribute("data-map-data-source") === "runtime",
    { timeout: 30000 },
  ).then(() => true).catch(() => false);
  assert.ok(gotRuntime, "page must transition to the runtime data source within 30s");

  const mapContainer = page.locator(".discovery-map-inner");
  await mapContainer.scrollIntoViewIfNeeded();

  // Wait for the map's own "load"-gated source to actually exist AND be
  // fully loaded, rather than a fixed sleep — MapLibre's "load" timing is
  // itself genuinely variable (this exact variability is what the
  // stale-ref race this package fixed depended on), so a fixed wait would
  // make this test flaky under system load rather than proving anything
  // about the real fix.
  await page.waitForFunction(
    () => {
      const map = (window).__botmMap;
      return !!map && !!map.getSource("botm-venues") && map.isSourceLoaded("botm-venues");
    },
    { timeout: 30000 },
  );

  // The core regression proof: query the REAL, live MapLibre source
  // directly (via the dev-only __botmMap hook — see
  // components/DiscoveryMap.tsx, never exposed in a production build)
  // for every London venue, and confirm they form a PURE London
  // cluster/point group — never missing (the stale-ref race) and never
  // merged into a different country's circle (the CLUSTER_RADIUS finding).
  const result = await page.evaluate(() => {
    const map = (window).__botmMap;
    if (!map) return { error: "no __botmMap on window" };
    const SOURCE_ID = "botm-venues";
    if (!map.getSource(SOURCE_ID)) return { error: "source not registered" };

    const clustered = map.querySourceFeatures(SOURCE_ID, { filter: ["has", "point_count"] });
    const unclustered = map.querySourceFeatures(SOURCE_ID, { filter: ["!", ["has", "point_count"]] });

    const seenClusterIds = new Set();
    const clusterInfos = [];
    for (const f of clustered) {
      if (seenClusterIds.has(f.properties.cluster_id)) continue;
      seenClusterIds.add(f.properties.cluster_id);
      clusterInfos.push({ clusterId: f.properties.cluster_id, pointCount: f.properties.point_count, coordinates: f.geometry.coordinates });
    }

    return {
      clusterInfos,
      unclusteredVenueIds: unclustered.map((f) => f.properties.venue_id),
      mapZoom: map.getZoom(),
      canvasWidth: map.getCanvas().width,
      canvasHeight: map.getCanvas().height,
    };
  });

  assert.ok(!result.error, `map introspection must succeed, got error: ${result.error}`);

  const LONDON_IDS = new Set([
    "venue-test-london-1", "venue-test-london-2", "venue-test-london-3", "venue-test-london-4",
    "venue-test-london-5", "venue-test-london-6", "venue-test-london-7", "venue-test-london-8",
  ]);

  // Gather every London venue via getClusterLeaves for each cluster found.
  const leavesByCluster = await page.evaluate(async (clusterInfos) => {
    const map = (window).__botmMap;
    const src = map.getSource("botm-venues");
    const out = {};
    for (const c of clusterInfos) {
      const leaves = await src.getClusterLeaves(c.clusterId, 200, 0);
      out[c.clusterId] = leaves.map((l) => l.properties.venue_id);
    }
    return out;
  }, result.clusterInfos);

  const allLondonIdsSeen = new Set([...result.unclusteredVenueIds.filter((id) => LONDON_IDS.has(id))]);
  let pureLondonGroupFound = false;
  for (const venueIds of Object.values(leavesByCluster)) {
    const londonMembers = venueIds.filter((id) => LONDON_IDS.has(id));
    for (const id of londonMembers) allLondonIdsSeen.add(id);
    if (londonMembers.length > 0) {
      const nonLondonMembers = venueIds.filter((id) => !LONDON_IDS.has(id));
      if (nonLondonMembers.length === 0 && londonMembers.length === LONDON_IDS.size) {
        pureLondonGroupFound = true;
      }
    }
  }
  // Individual unclustered London points also count as a "pure London
  // group" collectively, if every London venue ended up unclustered.
  if (!pureLondonGroupFound) {
    const unclusteredLondon = result.unclusteredVenueIds.filter((id) => LONDON_IDS.has(id));
    if (unclusteredLondon.length === LONDON_IDS.size) pureLondonGroupFound = true;
  }

  assert.equal(allLondonIdsSeen.size, LONDON_IDS.size, `all 8 London venues must reach the live MapLibre source — found ${allLondonIdsSeen.size}/${LONDON_IDS.size}: ${JSON.stringify([...allLondonIdsSeen])}`);
  assert.ok(pureLondonGroupFound, `London venues must form their OWN cluster/point group, never merged with another country's — clusters found: ${JSON.stringify(leavesByCluster)}`);
});
