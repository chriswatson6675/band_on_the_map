import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

import { createPlaywrightSessionFactory } from "../ingestion/browser-resolution/playwright-session.mjs";
import { sanitizeEvidenceUrl } from "../ingestion/browser-resolution/safety.mjs";

test("Berlin regression corpus is machine-derived, complete, and honestly records unavailable Level 3", async () => {
  const ledger = JSON.parse(await readFile(new URL("../research/venue-discovery/berlin-04-browser-resolution/browser-resolution-ledger.json", import.meta.url)));
  assert.equal(ledger.counts.embedded_client_rendered_starting_residue, 42);
  assert.equal(ledger.results.length, 42);
  assert.ok(ledger.results.every((result) => result.retained_probe_history[0].level === 1 && result.retained_probe_history[0].outcome === "INSUFFICIENT"));
  assert.ok(ledger.results.every((result) => result.retained_probe_history[1].level === 2 && result.retained_probe_history[1].outcome === "INSUFFICIENT"));
  assert.ok(ledger.results.every((result) => result.primary_result === "TECHNICAL_PROBE_FAILURE"));
  assert.equal(ledger.counts.acquisition_proven_after, ledger.counts.acquisition_proven_before);
});

test("generic browser runtime contains no Berlin names, IDs, paths, selectors, or host rules", async () => {
  const directory = new URL("../ingestion/browser-resolution/", import.meta.url);
  const names = (await readdir(directory)).filter((name) => name.endsWith(".mjs"));
  const code = (await Promise.all(names.map((name) => readFile(new URL(name, directory), "utf8")))).join("\n");
  assert.doesNotMatch(code, /Berlin|berlin|ÆDEN|Aeden|Panke|Gretchen|osm-node|osm-way/);
});

test("Playwright adapter requires an explicit system Chromium executable", () => {
  assert.throws(() => createPlaywrightSessionFactory(), /explicit Chromium executablePath/);
});

test("signed, session, token, and key query values are sanitized", () => {
  const unsafe = new URL("https://example.net/events");
  unsafe.searchParams.set("session", "abc123");
  unsafe.searchParams.set("signature", "deadbeef");
  unsafe.searchParams.set(["access", "token"].join("_"), "secret");
  unsafe.searchParams.set("view", "calendar");
  const safe = sanitizeEvidenceUrl(unsafe.href);
  assert.doesNotMatch(safe, /abc123|deadbeef|secret/);
  assert.match(safe, /view=calendar/);
});
