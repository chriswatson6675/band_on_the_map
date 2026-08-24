import assert from "node:assert/strict";
import test from "node:test";

import { operatorWritesAllowed, operatorWriteDeniedReason } from "../ingestion/geocoding/operator-write-gate.mjs";

// VENUE-MANUAL-COORDINATES-DASHBOARD-01, tests 22/39/40: production and
// Vercel must always fail closed for manual-coordinate writes; ordinary
// local `next dev` must be writable. Every case here passes a synthetic
// env object — this test never mutates the real process.env.

test("22/40. a Vercel environment never allows writes, with or without the operator flag", () => {
  assert.equal(operatorWritesAllowed({ VERCEL: "1" }), false);
  assert.equal(operatorWritesAllowed({ VERCEL: "1", BOTM_OPERATOR_MODE: "1" }), false);
  assert.equal(operatorWriteDeniedReason({ VERCEL: "1" }), "VERCEL_PRODUCTION_WRITES_DISABLED");
});

test("a local production build (NODE_ENV=production, no Vercel) requires the explicit BOTM_OPERATOR_MODE=1 opt-in", () => {
  assert.equal(operatorWritesAllowed({ NODE_ENV: "production" }), false);
  assert.equal(operatorWritesAllowed({ NODE_ENV: "production", BOTM_OPERATOR_MODE: "0" }), false);
  assert.equal(operatorWritesAllowed({ NODE_ENV: "production", BOTM_OPERATOR_MODE: "1" }), true);
});

test("ordinary local `next dev` (NODE_ENV=development, no Vercel) is writable by default", () => {
  assert.equal(operatorWritesAllowed({ NODE_ENV: "development" }), true);
  assert.equal(operatorWritesAllowed({}), true);
});

test("39. a request never carries/needs a filesystem path in its own shape — the gate itself takes only an (optional) env object", () => {
  // A default-valued parameter does not count toward Function.length; this
  // asserts the gate accepts no other/second argument of any kind.
  assert.equal(operatorWritesAllowed.length, 0);
  assert.equal(operatorWritesAllowed(), true);
});
