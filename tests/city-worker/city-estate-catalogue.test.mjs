// BEATMAPPED-MAINLINE-CITY-JOB-OPERATOR-CONTROL-01 — estate governance.
//
// The operator control's whole safety argument is that a dispatch cannot
// name anything except a reviewed catalogue key. These tests prove that
// claim against the real module, using a synthetic repository root so no
// real sources/*.json registry is read or written (a separate block at
// the end checks the REAL committed catalogue's own integrity, read-only).

import test from "node:test";
import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CITY_ESTATE_CATALOGUE_PATH,
  UnknownCityEstateError,
  describeCityEstates,
  listCityEstateKeys,
  materialiseJobEstate,
  resolveCityEstate,
  resolveJobEstateSnapshotRef,
} from "../../ingestion/city-worker/city-estate-catalogue.mjs";
import { resolveSourceTasks } from "../../ingestion/city-worker/resolvers/programme-acquisition-resolver.mjs";

const REPO_ROOT = fileURLToPath(new URL("../..", import.meta.url));

async function freshRoot() {
  return mkdtemp(join(tmpdir(), "city-estate-catalogue-test-"));
}

async function writeJson(root, relative, value) {
  const path = join(root, relative);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return path;
}

function registryEntry(id, activeStatus = "ACTIVE") {
  return {
    id,
    name: `Venue ${id}`,
    official_website: `https://${id}.example/`,
    events_url: `https://${id}.example/events`,
    active_status: activeStatus,
  };
}

/** A synthetic repository root: a catalogue, a registry with a deliberate non-ACTIVE entry, and a bounded explicit estate file. */
async function synthesiseRoot() {
  const root = await freshRoot();
  await writeJson(root, "sources/synthetic-city.json", {
    country_code: "ZZ",
    entries: [
      registryEntry("alpha-venue"),
      registryEntry("beta-venue"),
      registryEntry("dormant-venue", "DORMANT"),
      registryEntry("gamma-venue"),
      registryEntry("unknown-venue", "UNKNOWN"),
    ],
  });
  await writeJson(root, "fixtures/city-worker/real-estates/synthetic-bounded.json", {
    registry: "sources/synthetic-city.json",
    source_ids: ["alpha-venue", "gamma-venue"],
  });
  await writeJson(root, CITY_ESTATE_CATALOGUE_PATH, {
    entries: [
      { key: "synthetic-all-active", country: "ZZ", city: "Synthetica", label: "Synthetica — all active", selection: "ALL_ACTIVE", registry: "sources/synthetic-city.json" },
      { key: "synthetic-bounded", country: "ZZ", city: "Synthetica", label: "Synthetica — bounded", selection: "EXPLICIT_ESTATE_FILE", estate_file: "fixtures/city-worker/real-estates/synthetic-bounded.json" },
    ],
  });
  return root;
}

// ---------------------------------------------------------------------------
// A. only governed catalogue entries are enqueueable
// ---------------------------------------------------------------------------

test("A: every governed catalogue key resolves; nothing outside the catalogue does", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const keys = await listCityEstateKeys({ root });
  assert.deepEqual(keys, ["synthetic-all-active", "synthetic-bounded"]);
  for (const key of keys) {
    const estate = await resolveCityEstate(key, { root });
    assert.equal(estate.key, key);
    assert.ok(estate.source_ids.length > 0);
  }

  await assert.rejects(() => resolveCityEstate("synthetic-not-in-catalogue", { root }), UnknownCityEstateError);
});

test("A: the rejection names the governed keys, so an operator is never left guessing", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const error = await resolveCityEstate("nope", { root }).then(
    () => null,
    (caught) => caught,
  );
  assert.equal(error.code, "UNKNOWN_CITY_ESTATE_KEY");
  assert.deepEqual(error.available_keys, ["synthetic-all-active", "synthetic-bounded"]);
});

// ---------------------------------------------------------------------------
// B. arbitrary city text is rejected
// ---------------------------------------------------------------------------

test("B: arbitrary free-text city names are rejected — a city is a catalogue key, never a typed string", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const attempt of ["Synthetica", "synthetica", "SYNTHETIC-ALL-ACTIVE", "Berlin", "London", "greater porto", "synthetic all active", ""]) {
    await assert.rejects(() => resolveCityEstate(attempt, { root }), UnknownCityEstateError, `free text ${JSON.stringify(attempt)} must never resolve`);
  }
});

test("B: non-string and structured inputs are rejected rather than coerced", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const attempt of [null, undefined, 42, ["synthetic-bounded"], { key: "synthetic-bounded" }]) {
    await assert.rejects(() => resolveCityEstate(attempt, { root }), UnknownCityEstateError);
  }
});

// ---------------------------------------------------------------------------
// C. arbitrary estate path is impossible/rejected
// ---------------------------------------------------------------------------

test("C: no path — absolute, relative, or traversing — can ever be used as an estate selector", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const paths = [
    "fixtures/city-worker/real-estates/synthetic-bounded.json",
    "./fixtures/city-worker/real-estates/synthetic-bounded.json",
    "../../etc/passwd",
    "/etc/passwd",
    "C:\\Windows\\System32\\drivers\\etc\\hosts",
    "sources/synthetic-city.json",
  ];
  for (const attempt of paths) {
    await assert.rejects(() => resolveCityEstate(attempt, { root }), UnknownCityEstateError, `path ${attempt} must never resolve`);
  }
});

test("C: the key pattern refuses shell fragments and separators outright, before any catalogue lookup", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  for (const attempt of ["synthetic-bounded; rm -rf /", "synthetic-bounded && whoami", "synthetic-bounded$(id)", "synthetic-bounded`id`", "synthetic-bounded|cat", "synthetic-bounded\nsynthetic-all-active", "synthetic bounded"]) {
    await assert.rejects(() => resolveCityEstate(attempt, { root }), UnknownCityEstateError, `${JSON.stringify(attempt)} must never resolve`);
  }
});

// ---------------------------------------------------------------------------
// D. arbitrary source IDs cannot be injected
// ---------------------------------------------------------------------------

test("D: a source id is never an input — an ALL_ACTIVE universe comes only from the registry's own ACTIVE entries", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const estate = await resolveCityEstate("synthetic-all-active", { root });
  assert.deepEqual(estate.source_ids, ["alpha-venue", "beta-venue", "gamma-venue"]);
  assert.ok(!estate.source_ids.includes("dormant-venue"), "DORMANT entries are excluded");
  assert.ok(!estate.source_ids.includes("unknown-venue"), "UNKNOWN entries are excluded");
});

test("D: a source id that is not in the registry cannot be smuggled in through the key", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  await assert.rejects(() => resolveCityEstate("alpha-venue", { root }), UnknownCityEstateError);
  await assert.rejects(() => resolveCityEstate("synthetic-all-active,injected-venue", { root }), UnknownCityEstateError);
});

test("D: the CLI's governed entry point accepts exactly one key and refuses extra arguments", async () => {
  const cli = await readFile(join(REPO_ROOT, "ingestion/city-worker/cli.mjs"), "utf8");
  const body = cli.slice(cli.indexOf("async function cmdEnqueueCityEstate"), cli.indexOf("async function cmdCityJobsStatus"));
  assert.match(body, /refusing unexpected argument/, "extra positionals must be refused, never silently ignored");
  assert.doesNotMatch(body, /flags\.config|flags\["job-id"\]|flags\.estate/, "the governed entry point must expose no estate/config/job-id input surface at all");
});

// ---------------------------------------------------------------------------
// E. catalogue entries resolve deterministically
// ---------------------------------------------------------------------------

test("E: resolving the same key twice yields byte-identical estates, in registry file order", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await resolveCityEstate("synthetic-all-active", { root });
  const second = await resolveCityEstate("synthetic-all-active", { root });
  assert.deepEqual(first, second);
  // File order, not sorted order — proving the result is derived, not re-ordered.
  assert.deepEqual(first.source_ids, ["alpha-venue", "beta-venue", "gamma-venue"]);
});

test("E: an EXPLICIT_ESTATE_FILE entry resolves to exactly that file's own universe", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const estate = await resolveCityEstate("synthetic-bounded", { root });
  assert.equal(estate.selection, "EXPLICIT_ESTATE_FILE");
  assert.equal(estate.registry, "sources/synthetic-city.json");
  assert.deepEqual(estate.source_ids, ["alpha-venue", "gamma-venue"]);
});

test("E: a catalogue entry that resolves to zero sources is refused at resolve time, never enqueued to fail", async (t) => {
  const root = await freshRoot();
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeJson(root, "sources/empty-city.json", { entries: [registryEntry("only-dormant", "DORMANT")] });
  await writeJson(root, CITY_ESTATE_CATALOGUE_PATH, {
    entries: [{ key: "empty-all-active", country: "ZZ", city: "Empty", selection: "ALL_ACTIVE", registry: "sources/empty-city.json" }],
  });

  await assert.rejects(() => resolveCityEstate("empty-all-active", { root }), /EMPTY_CITY_ESTATE/);
});

// ---------------------------------------------------------------------------
// F. duplicate source-universe copying is avoided where designed
// ---------------------------------------------------------------------------

test("F: the committed catalogue never copies a source universe — ALL_ACTIVE entries name a registry, never source ids", async () => {
  const catalogue = JSON.parse(await readFile(join(REPO_ROOT, CITY_ESTATE_CATALOGUE_PATH), "utf8"));
  for (const entry of catalogue.entries) {
    assert.ok(!("source_ids" in entry), `catalogue entry ${entry.key} must never carry its own source_ids — that would duplicate sources/*.json`);
    if (entry.selection === "ALL_ACTIVE") {
      assert.match(entry.registry, /^sources\/[a-z-]+\.json$/, `${entry.key} must derive its universe from a canonical registry`);
    }
  }
});

test("F: an ALL_ACTIVE universe tracks a registry correction automatically — no stale copy can contradict it", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const before = await resolveCityEstate("synthetic-all-active", { root });
  assert.deepEqual(before.source_ids, ["alpha-venue", "beta-venue", "gamma-venue"]);

  // The registry — the single source of truth — retires one venue and adds another.
  await writeJson(root, "sources/synthetic-city.json", {
    country_code: "ZZ",
    entries: [registryEntry("alpha-venue"), registryEntry("beta-venue", "DORMANT"), registryEntry("delta-venue")],
  });

  const after = await resolveCityEstate("synthetic-all-active", { root });
  assert.deepEqual(after.source_ids, ["alpha-venue", "delta-venue"], "the catalogue itself needed no edit");
});

test("F: registries and the bounded estate file are never mutated by resolving an estate", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const registryPath = join(root, "sources/synthetic-city.json");
  const estatePath = join(root, "fixtures/city-worker/real-estates/synthetic-bounded.json");
  const registryBefore = await readFile(registryPath, "utf8");
  const estateBefore = await readFile(estatePath, "utf8");

  await resolveCityEstate("synthetic-all-active", { root });
  await resolveCityEstate("synthetic-bounded", { root });

  assert.equal(await readFile(registryPath, "utf8"), registryBefore);
  assert.equal(await readFile(estatePath, "utf8"), estateBefore);
});

// ---------------------------------------------------------------------------
// G. durable job retains sufficient estate identity for restart
// ---------------------------------------------------------------------------

test("G: enqueue freezes the resolved universe into the job's own directory, in the existing durable estate format", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const estate = await resolveCityEstate("synthetic-all-active", { root });
  const ref = await materialiseJobEstate({ jobId: "job-aaa", estate, materialisedAt: "2026-08-30T00:00:00.000Z", root });

  assert.equal(ref, resolveJobEstateSnapshotRef("job-aaa"));
  assert.equal(ref, "runtime/city-jobs/job-aaa/estate.json");
  const snapshot = JSON.parse(await readFile(join(root, ref), "utf8"));
  assert.equal(snapshot.city_estate_key, "synthetic-all-active");
  assert.equal(snapshot.selection, "ALL_ACTIVE");
  assert.equal(snapshot.registry, "sources/synthetic-city.json");
  assert.deepEqual(snapshot.source_ids, ["alpha-venue", "beta-venue", "gamma-venue"]);
  assert.equal(snapshot.materialised_at, "2026-08-30T00:00:00.000Z");
});

test("G: a job resumed after the registry changed reconstructs the IDENTICAL source set — membership is frozen, not re-derived", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const estate = await resolveCityEstate("synthetic-all-active", { root });
  const estateRef = await materialiseJobEstate({ jobId: "job-bbb", estate, materialisedAt: "2026-08-30T00:00:00.000Z", root });

  // Between enqueue and resume, the registry is edited: one member retired,
  // a brand-new venue activated. Without a frozen snapshot this job would
  // silently resume against a different estate under the same job id.
  await writeJson(root, "sources/synthetic-city.json", {
    country_code: "ZZ",
    entries: [registryEntry("alpha-venue"), registryEntry("beta-venue"), registryEntry("gamma-venue", "DORMANT"), registryEntry("epsilon-venue")],
  });

  const tasks = await resolveSourceTasks({ estate_ref: estateRef }, { root, fetchDocument: async () => ({ url: "https://x.example/", at: "2026-08-30T00:00:00.000Z", status: 200, content_type: "text/html", body: "" }) });
  assert.deepEqual(
    tasks.map((task) => task.source_id),
    ["alpha-venue", "beta-venue", "gamma-venue"],
    "the newly-activated venue must NOT join an in-flight job, and the retired one must NOT vanish from it",
  );
});

test("G: the frozen snapshot is self-contained — it survives the catalogue entry itself being removed", async (t) => {
  const root = await synthesiseRoot();
  t.after(() => rm(root, { recursive: true, force: true }));

  const estate = await resolveCityEstate("synthetic-bounded", { root });
  const estateRef = await materialiseJobEstate({ jobId: "job-ccc", estate, materialisedAt: "2026-08-30T00:00:00.000Z", root });

  await writeJson(root, CITY_ESTATE_CATALOGUE_PATH, { entries: [] });
  await assert.rejects(() => resolveCityEstate("synthetic-bounded", { root }), UnknownCityEstateError);

  const tasks = await resolveSourceTasks({ estate_ref: estateRef }, { root, fetchDocument: async () => ({ url: "https://x.example/", at: "2026-08-30T00:00:00.000Z", status: 200, content_type: "text/html", body: "" }) });
  assert.deepEqual(
    tasks.map((task) => task.source_id),
    ["alpha-venue", "gamma-venue"],
  );
});

// ---------------------------------------------------------------------------
// The REAL committed catalogue's own integrity (read-only against this
// repository's real registries — nothing here writes anything).
// ---------------------------------------------------------------------------

test("the committed catalogue's keys are unique, well-formed, and every referenced file exists", async () => {
  const catalogue = JSON.parse(await readFile(join(REPO_ROOT, CITY_ESTATE_CATALOGUE_PATH), "utf8"));
  const keys = catalogue.entries.map((entry) => entry.key);
  assert.equal(new Set(keys).size, keys.length, "catalogue keys must be unique");

  for (const entry of catalogue.entries) {
    assert.match(entry.key, /^[a-z0-9]+(?:-[a-z0-9]+)*$/, `${entry.key} must be a bare lowercase key`);
    assert.match(entry.country, /^[A-Z]{2}$/, `${entry.key} must carry an ISO country code`);
    assert.ok(entry.city && typeof entry.city === "string", `${entry.key} must name a city/area`);
    assert.ok(["ALL_ACTIVE", "EXPLICIT_ESTATE_FILE"].includes(entry.selection), `${entry.key} has an unsupported selection`);
    const referenced = entry.registry ?? entry.estate_file;
    await readFile(join(REPO_ROOT, referenced), "utf8"); // throws if the referenced governed file is missing
  }
});

test("every committed catalogue entry resolves against this repository's real registries, and agrees with them on country", async () => {
  const keys = await listCityEstateKeys({ root: REPO_ROOT });
  assert.ok(keys.length > 0);

  for (const key of keys) {
    const estate = await resolveCityEstate(key, { root: REPO_ROOT });
    assert.ok(estate.source_ids.length > 0, `${key} must resolve to at least one source`);
    const registry = JSON.parse(await readFile(join(REPO_ROOT, estate.registry), "utf8"));
    assert.equal(estate.country, registry.country_code, `${key}'s catalogue country must match its registry's own country_code`);

    // Every resolved id must genuinely exist in that registry and be ACTIVE
    // — the catalogue can never point a job at an unregistered or retired source.
    const byId = new Map(registry.entries.map((entry) => [entry.id, entry]));
    for (const sourceId of estate.source_ids) {
      const entry = byId.get(sourceId);
      assert.ok(entry, `${key} resolves ${sourceId}, which is not in ${estate.registry}`);
      assert.equal(entry.active_status, "ACTIVE", `${key} resolves ${sourceId}, which is not ACTIVE`);
    }
  }
});

test("the committed catalogue exposes the bounded Berlin proof estate unchanged, and a derived full-Berlin estate that is genuinely larger", async () => {
  const bounded = await resolveCityEstate("berlin-proof-5", { root: REPO_ROOT });
  const full = await resolveCityEstate("berlin-all-active", { root: REPO_ROOT });

  const committed = JSON.parse(await readFile(join(REPO_ROOT, "fixtures/city-worker/real-estates/berlin-sample-01.json"), "utf8"));
  assert.deepEqual(bounded.source_ids, committed.source_ids, "the bounded proof estate must be exactly the already-reviewed file");
  assert.ok(full.source_ids.length > bounded.source_ids.length, "the full-city estate must be a genuinely wider universe");
  for (const sourceId of bounded.source_ids) {
    assert.ok(full.source_ids.includes(sourceId), `${sourceId} is ACTIVE, so full Berlin must also cover it`);
  }
});

test("describeCityEstates is operator-facing metadata only — it never leaks a source universe", async () => {
  const described = await describeCityEstates({ root: REPO_ROOT });
  for (const entry of described) {
    assert.ok(!("source_ids" in entry));
    assert.deepEqual(Object.keys(entry).sort(), ["city", "country", "estate_file", "key", "label", "registry", "selection"]);
  }
});
