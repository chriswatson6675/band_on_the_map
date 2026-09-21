// BEATMAPPED-UK-GC-FOOTBALL-CANONICAL-EVENT-IDENTITY-01 — unit tests for
// the domain-neutral identity core. Pure and offline.
//
// Nothing in this file mentions football. If the core ever needs to know
// about a sport to pass a test here, it has stopped being generic.

import assert from "node:assert/strict";
import test from "node:test";

import {
  IDENTITY_EXCLUSIONS,
  IDENTITY_INPUTS,
  IDENTITY_REFUSAL_CAUSES,
  IDENTITY_SCHEME,
  IDENTITY_VERSION,
  anchorString,
  buildIdentityAnchor,
  canonicalEventId,
  instantStamp,
  mintCanonicalEventIdentity,
  normaliseOccurrenceInstant,
  providerSlug,
} from "../ingestion/canonical-event-identity/contract.mjs";

const KEY = "013f5700-aaca-11f1-b783-1d1d94fe4064";
const INSTANT = "2026-11-04T14:00:00.000Z";

const mint = (overrides = {}) =>
  mintCanonicalEventIdentity({
    providerNamespace: "GC_FOOTBALL",
    providerEventKey: KEY,
    occurrenceInstants: [INSTANT],
    ...overrides,
  });

/* ---------------------------------------------------------------- */
/* THE CONTRACT ITSELF                                               */
/* ---------------------------------------------------------------- */

test("the identity is derived from the anchor inputs and nothing else", () => {
  assert.deepEqual(IDENTITY_INPUTS, [
    "identity_version",
    "provider_namespace",
    "provider_event_key",
    "occurrence_instant_utc",
  ]);

  // The anchor a mint produces carries exactly those four fields — so an
  // extra input could not reach the id even by accident.
  const minted = mint();
  assert.deepEqual(Object.keys(minted.anchor).sort(), [...IDENTITY_INPUTS].sort());
});

test("the scheme version is stated, and is part of both the anchor and the id", () => {
  const minted = mint();
  assert.equal(minted.identity_version, IDENTITY_VERSION);
  assert.equal(minted.identity_scheme, IDENTITY_SCHEME);
  assert.equal(minted.anchor.identity_version, IDENTITY_VERSION);
  assert.ok(minted.canonical_event_id.startsWith(`${IDENTITY_VERSION}-`));
  assert.ok(anchorString(minted.anchor).startsWith(`${IDENTITY_VERSION}|`));
});

test("mutable enrichment is named as excluded, so the exclusion is reviewable", () => {
  for (const excluded of ["governed venue id", "evidence class", "member count and member ordering"]) {
    assert.ok(IDENTITY_EXCLUSIONS.includes(excluded), `${excluded} must be listed as excluded`);
  }
});

/* ---------------------------------------------------------------- */
/* DETERMINISM AND STABILITY                                         */
/* ---------------------------------------------------------------- */

test("the same anchor always yields the same id", () => {
  assert.equal(mint().canonical_event_id, mint().canonical_event_id);

  // And across a fresh anchor object with keys inserted in another order:
  // the id digests an explicit field sequence, not an object's key order.
  const reordered = {
    occurrence_instant_utc: INSTANT,
    provider_event_key: KEY,
    provider_namespace: "GC_FOOTBALL",
    identity_version: IDENTITY_VERSION,
  };
  assert.equal(canonicalEventId(reordered), mint().canonical_event_id);
});

test("the id depends on no wall clock", () => {
  // The readable stamp is the OCCURRENCE instant. Nothing about when the
  // id was generated reaches it, so a rerun tomorrow mints the same id.
  const minted = mint();
  assert.ok(minted.canonical_event_id.includes(instantStamp(INSTANT)));
  assert.equal(minted.anchor.occurrence_instant_utc, INSTANT);

  const busy = Date.now();
  while (Date.now() === busy) { /* cross a clock tick */ }
  assert.equal(mint().canonical_event_id, minted.canonical_event_id);
});

test("the same instant written with different equivalent offsets is one identity", () => {
  const asUtc = mint({ occurrenceInstants: ["2026-11-04T14:00:00.000Z"] });
  const asOffset = mint({ occurrenceInstants: ["2026-11-04T15:00:00+01:00"] });
  const asSecondlessUtc = mint({ occurrenceInstants: ["2026-11-04T14:00Z"] });

  assert.equal(asOffset.canonical_event_id, asUtc.canonical_event_id);
  assert.equal(asSecondlessUtc.canonical_event_id, asUtc.canonical_event_id);
  assert.equal(normaliseOccurrenceInstant("2026-11-04T15:00:00+01:00"), "2026-11-04T14:00:00.000Z");
});

test("members asserting the same instant in any order agree", () => {
  const a = mint({ occurrenceInstants: [INSTANT, "2026-11-04T15:00:00+01:00", INSTANT] });
  const b = mint({ occurrenceInstants: ["2026-11-04T15:00:00+01:00", INSTANT] });
  assert.equal(a.canonical_event_id, b.canonical_event_id);
  assert.equal(a.canonical_event_id, mint().canonical_event_id);
});

/* ---------------------------------------------------------------- */
/* SEPARATION — different occurrences must stay different            */
/* ---------------------------------------------------------------- */

test("different provider keys at the same instant remain different events", () => {
  const first = mint({ providerEventKey: "match-a" });
  const second = mint({ providerEventKey: "match-b" });
  assert.notEqual(first.canonical_event_id, second.canonical_event_id);
});

test("the same provider key at different instants is a different event", () => {
  const first = mint();
  const second = mint({ occurrenceInstants: ["2026-11-04T16:00:00.000Z"] });
  assert.notEqual(first.canonical_event_id, second.canonical_event_id);
});

test("the same key and instant under different providers do not collide", () => {
  const first = mint({ providerNamespace: "GC_FOOTBALL" });
  const second = mint({ providerNamespace: "SOME_OTHER_PLATFORM" });
  assert.notEqual(first.canonical_event_id, second.canonical_event_id);
});

test("anchor serialisation is injective even when a key contains the separator", () => {
  // Without escaping, ("a|b", "c") and ("a", "b|c") would serialise alike
  // — the exact silent aliasing this layer exists to prevent.
  const first = mint({ providerNamespace: "prov|x", providerEventKey: "key" });
  const second = mint({ providerNamespace: "prov", providerEventKey: "x|key" });
  assert.notEqual(anchorString(first.anchor), anchorString(second.anchor));
  assert.notEqual(first.canonical_event_id, second.canonical_event_id);
});

/* ---------------------------------------------------------------- */
/* REFUSAL — a disagreement is never absorbed                        */
/* ---------------------------------------------------------------- */

test("conflicting instants for one provider key refuse, and never alias", () => {
  const result = buildIdentityAnchor({
    providerNamespace: "GC_FOOTBALL",
    providerEventKey: KEY,
    occurrenceInstants: [INSTANT, "2026-11-04T16:00:00.000Z"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.cause, "CONFLICTING_OCCURRENCE_INSTANTS");
  assert.deepEqual(result.conflicting_instants, ["2026-11-04T14:00:00.000Z", "2026-11-04T16:00:00.000Z"]);
  assert.equal(result.anchor, undefined, "a refusal must carry no anchor");
  assert.equal(result.canonical_event_id, undefined, "a refusal must mint no id");
});

test("the conflict refusal does not depend on the order of the instants", () => {
  const forwards = buildIdentityAnchor({ providerNamespace: "p", providerEventKey: "k", occurrenceInstants: [INSTANT, "2026-11-04T16:00:00.000Z"] });
  const backwards = buildIdentityAnchor({ providerNamespace: "p", providerEventKey: "k", occurrenceInstants: ["2026-11-04T16:00:00.000Z", INSTANT] });
  assert.deepEqual(forwards, backwards);
});

test("missing or unusable inputs refuse with a stated cause, never a default", () => {
  const cases = [
    [{ providerNamespace: "", providerEventKey: KEY, occurrenceInstants: [INSTANT] }, "MISSING_PROVIDER_NAMESPACE"],
    [{ providerNamespace: "p", providerEventKey: "", occurrenceInstants: [INSTANT] }, "MISSING_PROVIDER_EVENT_KEY"],
    [{ providerNamespace: "p", providerEventKey: KEY, occurrenceInstants: [] }, "MISSING_OCCURRENCE_INSTANT"],
    [{ providerNamespace: "p", providerEventKey: KEY, occurrenceInstants: [null] }, "MISSING_OCCURRENCE_INSTANT"],
    [{ providerNamespace: "p", providerEventKey: KEY, occurrenceInstants: ["not a date"] }, "INVALID_OCCURRENCE_INSTANT"],
  ];
  for (const [input, expected] of cases) {
    const result = mintCanonicalEventIdentity(input);
    assert.equal(result.ok, false);
    assert.equal(result.cause, expected);
    assert.ok(IDENTITY_REFUSAL_CAUSES.has(result.cause));
    assert.equal(result.canonical_event_id, undefined);
  }
});

test("a partly-missing instant refuses rather than quietly keeping the ones it has", () => {
  const result = mintCanonicalEventIdentity({
    providerNamespace: "p",
    providerEventKey: KEY,
    occurrenceInstants: [INSTANT, null],
  });
  assert.equal(result.ok, false);
  assert.equal(result.cause, "MISSING_OCCURRENCE_INSTANT");
});

/* ---------------------------------------------------------------- */
/* FORM                                                              */
/* ---------------------------------------------------------------- */

test("the id is readable enough to diagnose, and digest-guarded", () => {
  const id = mint().canonical_event_id;
  assert.equal(id, `cev1-gc-football-20261104T140000Z-${id.split("-").at(-1)}`);
  assert.match(id.split("-").at(-1), /^[0-9a-f]{24}$/, "a 96-bit hex digest");
  assert.equal(providerSlug("GC_FOOTBALL"), "gc-football");
});

test("distinct anchors do not collide across a large synthetic sweep", () => {
  const ids = new Set();
  let minted = 0;
  for (let key = 0; key < 400; key += 1) {
    for (let hour = 0; hour < 25; hour += 1) {
      const instant = new Date(Date.UTC(2026, 0, 1, hour)).toISOString();
      ids.add(mint({ providerEventKey: `match-${key}`, occurrenceInstants: [instant] }).canonical_event_id);
      minted += 1;
    }
  }
  assert.equal(ids.size, minted, "every distinct anchor must have its own id");
});
