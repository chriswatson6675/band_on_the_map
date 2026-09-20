// BEATMAPPED-MANCHESTER-TIER1-CALIBRATION-CORRECTION-04 — direct,
// focused tests for fingerprintProgrammeSurface()'s STATIC_HTML_CARDS
// detection, specifically the whole-CSS-class-token "event" widening.
// Every positive fixture below is a REAL class-name shape found in this
// repository's own retained evidence corpus (cited per test) — see the
// corpus-validation research behind this package's own FINAL REPORT.
// Every negative fixture is a REAL near-miss found in that SAME corpus
// that the widening must not misclassify.

import assert from "node:assert/strict";
import test from "node:test";
import { fingerprintProgrammeSurface } from "../ingestion/venue-discovery/programme-fingerprint.mjs";

function detects(body) {
  return fingerprintProgrammeSurface({ body, url: "https://arbitrary.example/whats-on", content_type: "text/html", status: 200 }).detected_mechanisms;
}

test("RNCM's own real shape: 'event' as a whole class token, never fused with card/item, is recognised as STATIC_HTML_CARDS", () => {
  const body = '<div class="event tab-3 dts-3 cf"><a href="/performance/a">A</a><div class="event-date">Sep 20th</div></div>';
  assert.ok(detects(body).includes("STATIC_HTML_CARDS"));
});

test("Admiralspalast Berlin's real shape ('class=\"event first even\"') is recognised — the token shape is a common, real, cross-city pattern, not Manchester-specific", () => {
  const body = '<div class="event first even"><a href="/e/a">A</a></div>';
  assert.ok(detects(body).includes("STATIC_HTML_CARDS"));
});

test("Kater Blau Berlin's real shape mixes a bare 'event' token with a FUSED 'type-event' token in the same class attribute — still recognised via the bare token", () => {
  const body = '<div class="post-1777 event type-event status-publish hentry"><a href="/e/a">A</a></div>';
  assert.ok(detects(body).includes("STATIC_HTML_CARDS"));
});

test("a Tailwind utility class fusing 'event' with surrounding words ('pointer-events-none') is NOT mistaken for an event-card marker by the NEW whole-token check", () => {
  // Isolates the new whole-token addition specifically: this body has no
  // "card"/"item" word anywhere, so the PRE-EXISTING substring pattern
  // (unchanged, out of this package's scope) cannot contribute a match
  // either — a clean test of the new check alone.
  const body = '<div class="pointer-events-none flex gap-2"><a href="/x">X</a></div>';
  assert.ok(!detects(body).includes("STATIC_HTML_CARDS"));
});

test("WordPress/plugin field classes fusing 'event' with a field name ('eventtix', 'eventname', 'eventdate') are NOT mistaken for an event-card marker by the NEW whole-token check", () => {
  const body = '<div class="eventtix eventname eventdate"><a href="/x">X</a></div>';
  assert.ok(!detects(body).includes("STATIC_HTML_CARDS"));
});

// A genuine, PRE-EXISTING imprecision this package's own corpus research
// surfaced (not introduced by this package, and deliberately NOT fixed
// here — it belongs to the ORIGINAL substring pattern, out of Phase 5's
// narrow scope): the original "word ... card/item" pattern allows
// anything at all between the two words, so a class value containing
// BOTH "event" (fused, e.g. "pointer-events-none") AND, entirely
// separately, "item" (fused, e.g. "items-center") anywhere later in the
// SAME class attribute is wrongly treated as one combined marker, even
// though neither fragment is a real event-card class on its own. This is
// retained as a documented, known, out-of-scope finding, not silently
// papered over by a convenient test fixture.
test("KNOWN PRE-EXISTING GAP (not fixed by this package): the original substring pattern can be fooled by two UNRELATED fused words appearing anywhere in the same class value", () => {
  const body = '<div class="pointer-events-none flex items-center"><a href="/x">X</a></div>';
  assert.ok(detects(body).includes("STATIC_HTML_CARDS"), "documents the current (imprecise) behaviour of the pre-existing pattern this package did not touch");
});

test("a bare 'programme' class token on a single, non-repeated section wrapper (the real Le Trabendo Paris shape) is deliberately NOT widened — only 'event' is", () => {
  const body = '<div class="wrap programme" id="scroll-container"><a href="/x">X</a></div>';
  assert.ok(!detects(body).includes("STATIC_HTML_CARDS"));
});

test("the original substring 'word + card/item suffix' pattern still matches unchanged (e.g. 'event-card', 'calendar-item')", () => {
  assert.ok(detects('<article class="event-card"><a href="/x">X</a></article>').includes("STATIC_HTML_CARDS"));
  assert.ok(detects('<article class="calendar-item"><a href="/x">X</a></article>').includes("STATIC_HTML_CARDS"));
});

test("ordinary, unrelated markup with no event/card/item marker at all is not misclassified as STATIC_HTML_CARDS", () => {
  const body = '<div class="footer-links"><a href="/about">About</a><a href="/contact">Contact</a></div>';
  assert.ok(!detects(body).includes("STATIC_HTML_CARDS"));
});

// A real Manchester venue (Band on the Wall) was misclassified as
// OTHER_EMBEDDED_APP_STATE purely because of WordPress's own
// near-universal wp-emoji-settings default script, which every
// WordPress site carries regardless of whether it has any real
// embedded event data at all.
test("WordPress's own near-universal wp-emoji-settings script alone does NOT trigger OTHER_EMBEDDED_APP_STATE", () => {
  const body = '<html><head><script id="wp-emoji-settings" type="application/json">{"baseUrl":"https:\\/\\/s.w.org\\/images\\/core\\/emoji\\/"}</script></head><body><p>Ordinary page content, no real event data here.</p></body></html>';
  assert.ok(!detects(body).includes("OTHER_EMBEDDED_APP_STATE"));
});

test("a REAL embedded application/json data script (not wp-emoji-settings) still triggers OTHER_EMBEDDED_APP_STATE unchanged", () => {
  const body = '<script id="store" type="application/json">{"events":[{"id":1}]}</script>';
  assert.ok(detects(body).includes("OTHER_EMBEDDED_APP_STATE"));
});
