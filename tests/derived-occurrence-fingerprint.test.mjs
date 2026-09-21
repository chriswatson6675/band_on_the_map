// BEATMAPPED-UK-GC-FOOTBALL-CANONICAL-IDENTITY-ARCHITECTURE-CONFORMANCE-01
// — unit tests for the domain-neutral derived occurrence fingerprint
// core. Pure and offline.
//
// Nothing in this file mentions football. If the core ever needs to know
// about a sport to pass a test here, it has stopped being generic.
//
// Two of these tests exist to pin the ARCHITECTURAL boundary rather than
// the algorithm: the fingerprint is provider-dependent by construction
// (so it is not an application canonical identity under rule 6), and the
// core returns no application entity id at all.

import assert from "node:assert/strict";
import test from "node:test";

import {
  FINGERPRINT_EXCLUSIONS,
  FINGERPRINT_INPUTS,
  FINGERPRINT_REFUSAL_CAUSES,
  FINGERPRINT_SCHEME,
  FINGERPRINT_VERSION,
  anchorString,
  buildFingerprintAnchor,
  occurrenceFingerprint,
  instantStamp,
  deriveOccurrenceFingerprint,
  normaliseOccurrenceInstant,
  providerSlug,
} from "../ingestion/derived-occurrence-fingerprint/contract.mjs";

const KEY = "013f5700-aaca-11f1-b783-1d1d94fe4064";
const INSTANT = "2026-11-04T14:00:00.000Z";

const mint = (overrides = {}) =>
  deriveOccurrenceFingerprint({
    providerNamespace: "GC_FOOTBALL",
    providerEventKey: KEY,
    occurrenceInstants: [INSTANT],
    ...overrides,
  });

/* ---------------------------------------------------------------- */
/* THE CONTRACT ITSELF                                               */
/* ---------------------------------------------------------------- */

test("the identity is derived from the anchor inputs and nothing else", () => {
  assert.deepEqual(FINGERPRINT_INPUTS, [
    "fingerprint_version",
    "provider_namespace",
    "provider_event_key",
    "occurrence_instant_utc",
  ]);

  // The anchor a mint produces carries exactly those four fields — so an
  // extra input could not reach the id even by accident.
  const minted = mint();
  assert.deepEqual(Object.keys(minted.anchor).sort(), [...FINGERPRINT_INPUTS].sort());
});

test("the scheme version is stated, and is part of both the anchor and the id", () => {
  const minted = mint();
  assert.equal(minted.fingerprint_version, FINGERPRINT_VERSION);
  assert.equal(minted.fingerprint_scheme, FINGERPRINT_SCHEME);
  assert.equal(minted.anchor.fingerprint_version, FINGERPRINT_VERSION);
  assert.ok(minted.occurrence_fingerprint.startsWith(`${FINGERPRINT_VERSION}-`));
  assert.ok(anchorString(minted.anchor).startsWith(`${FINGERPRINT_VERSION}|`));
});

test("mutable enrichment is named as excluded, so the exclusion is reviewable", () => {
  for (const excluded of ["governed venue id", "evidence class", "member count and member ordering"]) {
    assert.ok(FINGERPRINT_EXCLUSIONS.includes(excluded), `${excluded} must be listed as excluded`);
  }
});

/* ---------------------------------------------------------------- */
/* DETERMINISM AND STABILITY                                         */
/* ---------------------------------------------------------------- */

test("the same anchor always yields the same id", () => {
  assert.equal(mint().occurrence_fingerprint, mint().occurrence_fingerprint);

  // And across a fresh anchor object with keys inserted in another order:
  // the id digests an explicit field sequence, not an object's key order.
  const reordered = {
    occurrence_instant_utc: INSTANT,
    provider_event_key: KEY,
    provider_namespace: "GC_FOOTBALL",
    fingerprint_version: FINGERPRINT_VERSION,
  };
  assert.equal(occurrenceFingerprint(reordered), mint().occurrence_fingerprint);
});

test("the id depends on no wall clock", () => {
  // The readable stamp is the OCCURRENCE instant. Nothing about when the
  // id was generated reaches it, so a rerun tomorrow mints the same id.
  const minted = mint();
  assert.ok(minted.occurrence_fingerprint.includes(instantStamp(INSTANT)));
  assert.equal(minted.anchor.occurrence_instant_utc, INSTANT);

  const busy = Date.now();
  while (Date.now() === busy) { /* cross a clock tick */ }
  assert.equal(mint().occurrence_fingerprint, minted.occurrence_fingerprint);
});

test("the same instant written with different equivalent offsets is one identity", () => {
  const asUtc = mint({ occurrenceInstants: ["2026-11-04T14:00:00.000Z"] });
  const asOffset = mint({ occurrenceInstants: ["2026-11-04T15:00:00+01:00"] });
  const asSecondlessUtc = mint({ occurrenceInstants: ["2026-11-04T14:00Z"] });

  assert.equal(asOffset.occurrence_fingerprint, asUtc.occurrence_fingerprint);
  assert.equal(asSecondlessUtc.occurrence_fingerprint, asUtc.occurrence_fingerprint);
  assert.equal(normaliseOccurrenceInstant("2026-11-04T15:00:00+01:00"), "2026-11-04T14:00:00.000Z");
});

test("members asserting the same instant in any order agree", () => {
  const a = mint({ occurrenceInstants: [INSTANT, "2026-11-04T15:00:00+01:00", INSTANT] });
  const b = mint({ occurrenceInstants: ["2026-11-04T15:00:00+01:00", INSTANT] });
  assert.equal(a.occurrence_fingerprint, b.occurrence_fingerprint);
  assert.equal(a.occurrence_fingerprint, mint().occurrence_fingerprint);
});

/* ---------------------------------------------------------------- */
/* THE RULE 6 BOUNDARY                                               */
/*                                                                   */
/* docs/ARCHITECTURE.md rule 6: "Source-specific identifiers must    */
/* never become the application's canonical identity scheme."        */
/*                                                                   */
/* These two tests exist so the provider dependency is a stated,     */
/* asserted property rather than an implementation detail someone    */
/* could later mistake for source independence. A value that moves   */
/* when a provider renumbers its own records is not an application   */
/* canonical identity, and this layer does not claim to be one.      */
/* ---------------------------------------------------------------- */

test("the fingerprint is provider-key dependent, so it is NOT application canonical identity", () => {
  const before = mint({ providerEventKey: "g2645238" });
  const after = mint({ providerEventKey: "g9999999" });

  // Same real occurrence, same instant, same provider — only the
  // provider's own key changed. The fingerprint moves anyway.
  assert.notEqual(after.occurrence_fingerprint, before.occurrence_fingerprint);
  assert.equal(before.anchor.occurrence_instant_utc, after.anchor.occurrence_instant_utc);

  // Digesting the anchor hides the key; it does not remove the
  // dependency, and the declared inputs say so plainly.
  assert.ok(FINGERPRINT_INPUTS.includes("provider_event_key"));
  assert.equal(before.occurrence_fingerprint.includes("g2645238"), false, "the raw key is not published");
});

test("the fingerprint is provider-namespace dependent, so it is provider-scoped", () => {
  const gc = mint({ providerNamespace: "GC_FOOTBALL" });
  const other = mint({ providerNamespace: "SOME_OTHER_PLATFORM" });

  // The same occurrence acquired from a different provider does not
  // arrive at the same value. Cross-provider continuity is exactly what
  // an application canonical entity id would have to provide, and this
  // layer does not.
  assert.notEqual(other.occurrence_fingerprint, gc.occurrence_fingerprint);
  assert.ok(FINGERPRINT_INPUTS.includes("provider_namespace"));
});

test("a postponed occurrence yields a DIFFERENT fingerprint, and nothing pretends otherwise", () => {
  // The instant is part of the anchor, so a rescheduled kickoff is a
  // different fingerprint. Under this terminology that is correct, not a
  // defect — but it is also the precise reason this value cannot serve
  // as permanent entity identity. No supersession is implemented, and
  // none is implied.
  const original = mint({ occurrenceInstants: ["2026-11-04T14:00:00.000Z"] });
  const postponed = mint({ occurrenceInstants: ["2026-11-11T14:00:00.000Z"] });

  assert.notEqual(postponed.occurrence_fingerprint, original.occurrence_fingerprint);

  // Nothing links the two. Carrying an entity across a reschedule is a
  // requirement for the later canonical-entity package.
  assert.equal("supersedes" in postponed, false);
  assert.equal("superseded_by" in original, false);
});

test("the core returns no application canonical entity id of any kind", () => {
  const minted = mint();
  for (const forbidden of ["canonical_event_id", "canonicalEventId", "event_id", "id"]) {
    assert.equal(forbidden in minted, false, `${forbidden} must not be returned by this core`);
    assert.equal(forbidden in minted.anchor, false, `${forbidden} must not appear on the anchor`);
  }
  assert.ok(minted.occurrence_fingerprint.startsWith("dof1-"), "the scheme names what it really is");
});

/* ---------------------------------------------------------------- */
/* SEPARATION — different occurrences must stay different            */
/* ---------------------------------------------------------------- */

test("different provider keys at the same instant remain different events", () => {
  const first = mint({ providerEventKey: "match-a" });
  const second = mint({ providerEventKey: "match-b" });
  assert.notEqual(first.occurrence_fingerprint, second.occurrence_fingerprint);
});

test("the same provider key at different instants is a different event", () => {
  const first = mint();
  const second = mint({ occurrenceInstants: ["2026-11-04T16:00:00.000Z"] });
  assert.notEqual(first.occurrence_fingerprint, second.occurrence_fingerprint);
});

test("the same key and instant under different providers do not collide", () => {
  const first = mint({ providerNamespace: "GC_FOOTBALL" });
  const second = mint({ providerNamespace: "SOME_OTHER_PLATFORM" });
  assert.notEqual(first.occurrence_fingerprint, second.occurrence_fingerprint);
});

test("anchor serialisation is injective even when a key contains the separator", () => {
  // Without escaping, ("a|b", "c") and ("a", "b|c") would serialise alike
  // — the exact silent aliasing this layer exists to prevent.
  const first = mint({ providerNamespace: "prov|x", providerEventKey: "key" });
  const second = mint({ providerNamespace: "prov", providerEventKey: "x|key" });
  assert.notEqual(anchorString(first.anchor), anchorString(second.anchor));
  assert.notEqual(first.occurrence_fingerprint, second.occurrence_fingerprint);
});

/* ---------------------------------------------------------------- */
/* REFUSAL — a disagreement is never absorbed                        */
/* ---------------------------------------------------------------- */

test("conflicting instants for one provider key refuse, and never alias", () => {
  const result = buildFingerprintAnchor({
    providerNamespace: "GC_FOOTBALL",
    providerEventKey: KEY,
    occurrenceInstants: [INSTANT, "2026-11-04T16:00:00.000Z"],
  });
  assert.equal(result.ok, false);
  assert.equal(result.cause, "CONFLICTING_OCCURRENCE_INSTANTS");
  assert.deepEqual(result.conflicting_instants, ["2026-11-04T14:00:00.000Z", "2026-11-04T16:00:00.000Z"]);
  assert.equal(result.anchor, undefined, "a refusal must carry no anchor");
  assert.equal(result.occurrence_fingerprint, undefined, "a refusal must mint no id");
});

test("the conflict refusal does not depend on the order of the instants", () => {
  const forwards = buildFingerprintAnchor({ providerNamespace: "p", providerEventKey: "k", occurrenceInstants: [INSTANT, "2026-11-04T16:00:00.000Z"] });
  const backwards = buildFingerprintAnchor({ providerNamespace: "p", providerEventKey: "k", occurrenceInstants: ["2026-11-04T16:00:00.000Z", INSTANT] });
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
    const result = deriveOccurrenceFingerprint(input);
    assert.equal(result.ok, false);
    assert.equal(result.cause, expected);
    assert.ok(FINGERPRINT_REFUSAL_CAUSES.has(result.cause));
    assert.equal(result.occurrence_fingerprint, undefined);
  }
});

test("a partly-missing instant refuses rather than quietly keeping the ones it has", () => {
  const result = deriveOccurrenceFingerprint({
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
  const id = mint().occurrence_fingerprint;
  assert.equal(id, `dof1-gc-football-20261104T140000Z-${id.split("-").at(-1)}`);
  assert.match(id.split("-").at(-1), /^[0-9a-f]{24}$/, "a 96-bit hex digest");
  assert.equal(providerSlug("GC_FOOTBALL"), "gc-football");
});

test("distinct anchors do not collide across a large synthetic sweep", () => {
  const ids = new Set();
  let minted = 0;
  for (let key = 0; key < 400; key += 1) {
    for (let hour = 0; hour < 25; hour += 1) {
      const instant = new Date(Date.UTC(2026, 0, 1, hour)).toISOString();
      ids.add(mint({ providerEventKey: `match-${key}`, occurrenceInstants: [instant] }).occurrence_fingerprint);
      minted += 1;
    }
  }
  assert.equal(ids.size, minted, "every distinct anchor must have its own id");
});
