import assert from "node:assert/strict";
import test from "node:test";

import { operatorWritesAllowed, operatorWriteDeniedReason } from "../ingestion/geocoding/operator-write-gate.mjs";

// VENUE-MANUAL-COORDINATES-DASHBOARD-01, tests 22/39/40: production and
// Vercel must always fail closed for manual-coordinate writes; ordinary
// local `next dev` must be writable. VENUE-MANUAL-COORDINATES-DASHBOARD-01B
// extends the same absolute, no-override fail-closed rule to Netlify —
// this repo's real deployment surface (see netlify.toml) — since a hosted
// deployment's filesystem is ephemeral and is never the canonical,
// Git-tracked venues/manual-coordinates.json. Every case here passes a
// synthetic env object — this test never mutates the real process.env.

test("22/40. a Vercel environment never allows writes, with or without the operator flag", () => {
  assert.equal(operatorWritesAllowed({ VERCEL: "1" }), false);
  assert.equal(operatorWritesAllowed({ VERCEL: "1", BOTM_OPERATOR_MODE: "1" }), false);
  assert.equal(operatorWriteDeniedReason({ VERCEL: "1" }), "VERCEL_HOSTED_WRITES_DISABLED");
});

// 1/2. VERCEL=true / NETLIFY=true, each WITH BOTM_OPERATOR_MODE=1 => DENIED.
// There is no override for either hosted platform.
test("1. Vercel + BOTM_OPERATOR_MODE=1 is still denied — no override exists", () => {
  assert.equal(operatorWritesAllowed({ VERCEL: "1", BOTM_OPERATOR_MODE: "1" }), false);
  assert.equal(operatorWriteDeniedReason({ VERCEL: "1", BOTM_OPERATOR_MODE: "1" }), "VERCEL_HOSTED_WRITES_DISABLED");
});

test("2. Netlify + BOTM_OPERATOR_MODE=1 is still denied — no override exists", () => {
  assert.equal(operatorWritesAllowed({ NETLIFY: "true", BOTM_OPERATOR_MODE: "1" }), false);
  assert.equal(operatorWriteDeniedReason({ NETLIFY: "true", BOTM_OPERATOR_MODE: "1" }), "NETLIFY_HOSTED_WRITES_DISABLED");
});

// 3. NETLIFY=true + NODE_ENV=development => DENIED (hosted status alone is
// disqualifying, regardless of NODE_ENV — Netlify's own build environment
// commonly runs with NODE_ENV=production, but this must not depend on that).
test("3. Netlify + NODE_ENV=development is still denied", () => {
  assert.equal(operatorWritesAllowed({ NETLIFY: "true", NODE_ENV: "development" }), false);
  assert.equal(operatorWriteDeniedReason({ NETLIFY: "true", NODE_ENV: "development" }), "NETLIFY_HOSTED_WRITES_DISABLED");
});

test("a Netlify environment never allows writes under any NODE_ENV/BOTM_OPERATOR_MODE combination", () => {
  for (const netlifyValue of ["true", "1"]) {
    for (const extra of [{}, { NODE_ENV: "production" }, { NODE_ENV: "development" }, { BOTM_OPERATOR_MODE: "1" }]) {
      assert.equal(operatorWritesAllowed({ NETLIFY: netlifyValue, ...extra }), false);
    }
  }
});

// 4. ordinary local development => ALLOWED.
test("4. ordinary local `next dev` (NODE_ENV=development, no hosted platform) is writable by default", () => {
  assert.equal(operatorWritesAllowed({ NODE_ENV: "development" }), true);
  assert.equal(operatorWritesAllowed({}), true);
});

// 5/6. local NODE_ENV=production, no hosted platform: requires the
// explicit BOTM_OPERATOR_MODE=1 opt-in — and only then.
test("5. a local production build without BOTM_OPERATOR_MODE is denied", () => {
  assert.equal(operatorWritesAllowed({ NODE_ENV: "production" }), false);
  assert.equal(operatorWritesAllowed({ NODE_ENV: "production", BOTM_OPERATOR_MODE: "0" }), false);
  assert.equal(operatorWriteDeniedReason({ NODE_ENV: "production" }), "PRODUCTION_WRITES_REQUIRE_BOTM_OPERATOR_MODE");
});

test("6. a local production build WITH BOTM_OPERATOR_MODE=1 (and no hosted platform) is allowed", () => {
  assert.equal(operatorWritesAllowed({ NODE_ENV: "production", BOTM_OPERATOR_MODE: "1" }), true);
  assert.equal(operatorWriteDeniedReason({ NODE_ENV: "production", BOTM_OPERATOR_MODE: "1" }), null);
});

test("39. a request never carries/needs a filesystem path in its own shape — the gate itself takes only an (optional) env object", () => {
  // A default-valued parameter does not count toward Function.length; this
  // asserts the gate accepts no other/second argument of any kind.
  assert.equal(operatorWritesAllowed.length, 0);
  assert.equal(operatorWritesAllowed(), true);
});
